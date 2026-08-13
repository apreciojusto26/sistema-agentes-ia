// GET /api/jobs/:id/events — SSE (spec R4 "SSE Event Stream"; design §3;
// task E7/E8). registry.subscribe(jobId, cb) (D15) delivers LIVE SseFrame
// objects; this route owns the HTTP/SSE wire-format layer (reply.hijack +
// writeHead) and the Last-Event-ID replay from log.ndjson — registry does
// NOT replay, its fan-out is fire-and-forget to CURRENT subscribers only
// (design's explicit "registry owns live fan-out, routes own
// replay+wire-format" split).
//
// Connect sequence (design §3 "Ordering" — load-bearing, do not simplify):
//   1. Register the subscriber immediately, in PENDING mode (buffers frames).
//   2. Read log.ndjson, replaying every line with seq > Last-Event-ID.
//   3. Send a fresh full `job` snapshot.
//   4. Flush `pending`, filtered to seq > lastReplayedSeq (de-dupes the
//      overlap window between steps 2-3 and whatever arrived live in the
//      meantime).
//   5. Switch the subscriber to DIRECT mode.
// If the job is already terminal and step 4 didn't already deliver a live
// `end` frame, send one now and close — terminal jobs get replay + end +
// close, never a hanging keepalive.
import type { FastifyInstance } from 'fastify';
import type { JobRegistry } from '../jobs/registry';
import { readLogLines } from '../jobs/store';
import { parseLine } from '../jobs/ndjson';
import { stageFrameForEvent } from '../jobs/registry';
import type { SseFrame } from '../../shared/api';
import type { JobStatus } from '../../shared/jobs';

/** Structural subset actually used by this route — lets tests spy without a full JobRegistry. */
export type RegistryLike = Pick<JobRegistry, 'get' | 'subscribe'>;

const PING_INTERVAL_MS = 15_000;
const MAX_DROPPED_WRITES = 1000;

const TERMINAL_STATUSES: ReadonlySet<JobStatus> = new Set([
  'succeeded',
  'failed',
  'cancelled',
  'timed-out',
  'interrupted',
]);

type LogNdjsonEntry = {
  seq: number;
  ts: string;
  ch: 'stdout' | 'stderr' | 'meta';
  line?: string;
  [key: string]: unknown;
};

/** Best-effort human-readable line for admin-generated `ch:"meta"` entries that have no `line` field. */
function metaLine(entry: LogNdjsonEntry): string {
  const { seq: _seq, ts: _ts, ch: _ch, line: _line, ...rest } = entry;
  return `[admin] ${JSON.stringify(rest)}`;
}

/**
 * Re-derives replay-time SseFrame objects from log.ndjson (design §3
 * "Reconnection"). Mirrors registry.ts's #ingest() exactly: a single
 * ch:'stderr' entry that parses as an LgEvent produces BOTH a `log` frame
 * (the raw line) and a `stage` frame (if applicable) sharing the same seq —
 * so a reconnecting client sees the identical frame shape a client who was
 * connected throughout would have seen.
 */
export function buildReplayFrames(jobId: string, afterSeq: number | null): SseFrame[] {
  const frames: SseFrame[] = [];

  for (const raw of readLogLines(jobId)) {
    let entry: LogNdjsonEntry;
    try {
      entry = JSON.parse(raw) as LogNdjsonEntry;
    } catch {
      continue; // a corrupt log.ndjson line must not break replay for every other line
    }
    if (typeof entry.seq !== 'number') continue;
    if (afterSeq !== null && entry.seq <= afterSeq) continue;

    if (entry.ch === 'stdout' || entry.ch === 'stderr' || entry.ch === 'meta') {
      const line = typeof entry.line === 'string' ? entry.line : metaLine(entry);
      frames.push({ type: 'log', seq: entry.seq, ts: entry.ts, ch: entry.ch, line });
    }

    if (entry.ch === 'stderr' && typeof entry.line === 'string') {
      const parsed = parseLine(entry.line);
      if (parsed.kind === 'event') {
        const stageFrame = stageFrameForEvent(parsed.event, entry.seq, entry.ts);
        if (stageFrame) frames.push(stageFrame);
      }
    }
  }

  return frames;
}

function idFor(frame: SseFrame): number | null {
  if (frame.type === 'log' || frame.type === 'stage') return frame.seq;
  if (frame.type === 'job') return frame.job.lastSeq;
  return null; // end / overflow / ping never advance Last-Event-ID
}

export function registerEventsRoutes(app: FastifyInstance, registry: RegistryLike): void {
  app.get('/api/jobs/:id/events', async (request, reply) => {
    const { id: jobId } = request.params as { id: string };
    const initialJob = registry.get(jobId);
    if (!initialJob) {
      reply.code(404);
      return { error: 'job not found' };
    }

    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    let ended = false;
    let droppedWrites = 0;
    let pingTimer: NodeJS.Timeout | undefined;

    function writeRaw(text: string): void {
      if (ended) return;
      const ok = reply.raw.write(text);
      if (!ok) {
        droppedWrites += 1;
        if (droppedWrites > MAX_DROPPED_WRITES) {
          const overflow: SseFrame = { type: 'overflow', dropped: droppedWrites };
          reply.raw.write(`event: overflow\ndata: ${JSON.stringify(overflow)}\n\n`);
          endConnection();
        }
      }
    }

    function writeFrame(frame: SseFrame): void {
      const id = idFor(frame);
      let out = '';
      if (id !== null) out += `id: ${id}\n`;
      out += `event: ${frame.type}\ndata: ${JSON.stringify(frame)}\n\n`;
      writeRaw(out);
    }

    function endConnection(): void {
      if (ended) return;
      ended = true;
      if (pingTimer) clearInterval(pingTimer);
      unsubscribe();
      request.raw.off('close', endConnection);
      reply.raw.end();
    }

    function deliverLive(frame: SseFrame): void {
      writeFrame(frame);
      if (frame.type === 'end') endConnection();
    }

    // Step 1: register the subscriber immediately, in PENDING mode.
    let mode: 'pending' | 'direct' = 'pending';
    let pending: SseFrame[] = [];
    const unsubscribe = registry.subscribe(jobId, (frame) => {
      if (mode === 'pending') pending.push(frame);
      else deliverLive(frame);
    });

    request.raw.on('close', endConnection);

    // Step 2: replay log.ndjson filtered by Last-Event-ID.
    const rawLastEventId = request.headers['last-event-id'];
    const headerValue = Array.isArray(rawLastEventId) ? rawLastEventId[0] : rawLastEventId;
    const afterSeq = headerValue && /^\d+$/.test(headerValue) ? Number(headerValue) : null;

    const replayed = buildReplayFrames(jobId, afterSeq);
    let lastReplayedSeq = afterSeq ?? 0;
    for (const frame of replayed) {
      writeFrame(frame);
      if (frame.type === 'log' || frame.type === 'stage') {
        lastReplayedSeq = Math.max(lastReplayedSeq, frame.seq);
      }
    }

    // Step 3: send a fresh full job snapshot.
    const freshJob = registry.get(jobId);
    if (freshJob) writeFrame({ type: 'job', job: freshJob });

    // Step 4: flush pending, de-duped against the replay window.
    mode = 'direct';
    const toFlush = pending;
    pending = [];
    for (const frame of toFlush) {
      if ((frame.type === 'log' || frame.type === 'stage') && frame.seq <= lastReplayedSeq) continue;
      deliverLive(frame);
    }

    // Terminal jobs get replay + end + close, never a hanging keepalive. If
    // a live `end` frame already closed us during the flush above, this is a
    // no-op (endConnection() is idempotent).
    if (freshJob && TERMINAL_STATUSES.has(freshJob.status) && !ended) {
      deliverLive({ type: 'end', status: freshJob.status, exitCode: freshJob.exitCode });
    }

    if (!ended) {
      pingTimer = setInterval(() => writeRaw('event: ping\ndata: {}\n\n'), PING_INTERVAL_MS);
    }
  });
}

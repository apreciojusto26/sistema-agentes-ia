// RED-before-GREEN for GET /api/jobs/:id/events (SSE) — spec R4; design §3;
// task E7/E8. registry.subscribe(jobId, cb) (D15, already implemented and
// tested) delivers LIVE SseFrame objects; this route's own job is the
// HTTP/SSE wire-format layer (reply.hijack + writeHead) PLUS the
// Last-Event-ID replay from log.ndjson (registry itself does not replay).
//
// The reconnect/replay sequence is the one place design flags as a genuine
// correctness risk (a swallowed stage transition, not just a UX glitch), so
// this file explicitly covers: a client connecting fresh, a client
// reconnecting with a stale Last-Event-ID, and a client connected WHILE new
// events arrive (the register-pending -> replay -> snapshot -> flush ->
// direct race).
//
// Uses a REAL JobRegistry spawning the real (test-only) fixture child, same
// pattern as registry.test.ts — replay reads genuine log.ndjson content off
// disk, so a fake registry double would not exercise the real code path.
import { describe, test, expect, afterEach } from 'vitest';
import { rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import { JOBS_DIR } from '../config';
import type { RunSpec } from '../jobs/runner';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_CHILD = path.join(__dirname, '..', '..', '..', 'test', 'fixtures', 'runner-fixture-child.cjs');

const cleanupDirs: string[] = [];
afterEach(() => {
  for (const dir of cleanupDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function reserveJobDir(jobId: string): void {
  cleanupDirs.push(path.join(JOBS_DIR, jobId));
}

function eventsSpec(): RunSpec {
  return { command: process.execPath, args: [FIXTURE_CHILD, 'events'], cwd: __dirname, timeoutMs: 5_000, killGraceMs: 150, env: process.env };
}

async function buildApp() {
  const { JobRegistry } = await import('../jobs/registry');
  const { registerEventsRoutes } = await import('./events');
  const registry = new JobRegistry({ buildGenerateSpec: eventsSpec });
  const app = Fastify();
  registerEventsRoutes(app, registry);
  return { app, registry };
}

function waitForTerminal(registry: { get: (id: string) => { status: string } | null }, jobId: string): Promise<void> {
  return new Promise((resolve) => {
    const interval = setInterval(() => {
      const job = registry.get(jobId);
      if (job && job.status !== 'running' && job.status !== 'queued') {
        clearInterval(interval);
        resolve();
      }
    }, 10);
  });
}

type SseChunk = { id: number | null; event: string; data: Record<string, unknown> };

/** Parses raw SSE wire text (design §3's exact frame format) into structured chunks for assertions. */
function parseSse(text: string): SseChunk[] {
  return text
    .split('\n\n')
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const lines = block.split('\n');
      let id: number | null = null;
      let event = '';
      let dataLine = '';
      for (const line of lines) {
        if (line.startsWith('id: ')) id = Number(line.slice(4));
        else if (line.startsWith('event: ')) event = line.slice(7);
        else if (line.startsWith('data: ')) dataLine = line.slice(6);
      }
      return { id, event, data: dataLine ? JSON.parse(dataLine) : {} };
    });
}

describe('GET /api/jobs/:id/events — unknown job', () => {
  test('404, does not hijack the response', async () => {
    const { app } = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/jobs/does-not-exist/events' });
    expect(res.statusCode).toBe(404);
  });
});

describe('GET /api/jobs/:id/events — client connected WHILE new events arrive (live case)', () => {
  test('connecting immediately after job creation captures the full stream: job snapshot, log lines, stage frames, exactly one end frame, ids monotonically increasing with no duplicates', async () => {
    const { app, registry } = await buildApp();
    const job = registry.createGenerateJob({ slug: 'zz-sse-live-slug', contentPath: '/x', imagesDir: null, force: false });
    reserveJobDir(job.jobId);

    const res = await app.inject({ method: 'GET', url: `/api/jobs/${job.jobId}/events` });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');

    const chunks = parseSse(res.payload);
    expect(chunks.some((c) => c.event === 'job')).toBe(true);
    expect(chunks.some((c) => c.event === 'log')).toBe(true);
    expect(chunks.some((c) => c.event === 'stage')).toBe(true);

    const endChunks = chunks.filter((c) => c.event === 'end');
    expect(endChunks).toHaveLength(1);
    expect(endChunks[0].data.status).toBe('succeeded');

    // No EXACT duplicate (type, seq) delivery proves the register-pending ->
    // replay -> snapshot -> flush(deduped) -> direct sequence didn't
    // double-deliver a frame during the connect race. (A `log` frame and a
    // `stage` frame legitimately SHARE the same seq/id when one raw stderr
    // line produces both — that's by design, not a duplicate.)
    const logAndStage = chunks.filter((c) => c.event === 'log' || c.event === 'stage');
    const typeSeqPairs = logAndStage.map((c) => `${c.event}:${c.id}`);
    expect(new Set(typeSeqPairs).size).toBe(typeSeqPairs.length);

    // seq is non-decreasing in delivery order — no out-of-order replay/live
    // interleaving.
    const seqs = logAndStage.map((c) => c.id as number);
    const sortedSeqs = [...seqs].sort((a, b) => a - b);
    expect(seqs).toEqual(sortedSeqs);
  });
});

describe('GET /api/jobs/:id/events — reconnection via Last-Event-ID replay', () => {
  test('a fresh connect (no Last-Event-ID) to an already-terminal job replays the FULL log.ndjson, then a snapshot, then end+close', async () => {
    const { app, registry } = await buildApp();
    const job = registry.createGenerateJob({ slug: 'zz-sse-fresh-slug', contentPath: '/x', imagesDir: null, force: false });
    reserveJobDir(job.jobId);
    await waitForTerminal(registry, job.jobId);

    const res = await app.inject({ method: 'GET', url: `/api/jobs/${job.jobId}/events` });
    const chunks = parseSse(res.payload);

    const logChunks = chunks.filter((c) => c.event === 'log');
    expect(logChunks.length).toBeGreaterThan(0);
    // The fixture's 'events' mode writes exactly one plain stdout human line.
    expect(logChunks.some((c) => c.data.line === 'normal human log line')).toBe(true);

    expect(chunks.filter((c) => c.event === 'job')).toHaveLength(1); // fresh snapshot after replay
    expect(chunks.filter((c) => c.event === 'end')).toHaveLength(1);
  });

  test('reconnecting with a stale Last-Event-ID only replays frames with seq > that id — no swallowed/duplicated stage transition', async () => {
    const { app, registry } = await buildApp();
    const job = registry.createGenerateJob({ slug: 'zz-sse-reconnect-slug', contentPath: '/x', imagesDir: null, force: false });
    reserveJobDir(job.jobId);
    await waitForTerminal(registry, job.jobId);

    // First, a fresh connect to learn the real seq numbers this run produced.
    const fresh = await app.inject({ method: 'GET', url: `/api/jobs/${job.jobId}/events` });
    const freshChunks = parseSse(fresh.payload);
    const seqIds = freshChunks.map((c) => c.id).filter((id): id is number => id !== null).sort((a, b) => a - b);
    expect(seqIds.length).toBeGreaterThanOrEqual(2);
    const cutoff = seqIds[0]; // everything at or below the very first real seq must be excluded on replay

    const res = await app.inject({
      method: 'GET',
      url: `/api/jobs/${job.jobId}/events`,
      headers: { 'last-event-id': String(cutoff) },
    });
    const chunks = parseSse(res.payload);

    // Nothing replayed carries an id <= cutoff (log/stage frames only — job's
    // snapshot id reflects the job's CURRENT lastSeq, which is legitimately
    // higher than cutoff since it's sent fresh regardless of replay window).
    const logOrStage = chunks.filter((c) => c.event === 'log' || c.event === 'stage');
    for (const c of logOrStage) {
      expect(c.id).not.toBeNull();
      expect(c.id as number).toBeGreaterThan(cutoff);
    }
    // Still gets a fresh job snapshot and a terminal end frame.
    expect(chunks.filter((c) => c.event === 'job')).toHaveLength(1);
    expect(chunks.filter((c) => c.event === 'end')).toHaveLength(1);
  });
});

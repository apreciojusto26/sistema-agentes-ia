// The job registry: in-memory Map + disk mirror + restart recovery + the
// SSE subscriber fan-out plumbing (spec R1, R3, R4's non-HTTP half, R9,
// R11; design §2, §7). The biggest fan-in module in Batch D — later
// batches (E's routes/SSE, F's frontend) consume this directly.
//
// Scope note: this module owns the FULL backend-core job lifecycle
// (locking, spawning via runner.ts, ingesting stdout/stderr into JobRecord
// mutations + log.ndjson + SSE frames, archiving, restart recovery). It
// does NOT open an HTTP connection or write SSE wire bytes — that is
// Batch E's job (routes/events.ts), which will call `subscribe()` and get
// plain `SseFrame` objects to serialize onto the wire.
import { randomUUID } from 'node:crypto';
import type { WriteStream } from 'node:fs';
import {
  run,
  buildScrapeSpec as defaultBuildScrapeSpec,
  buildGenerateSpec as defaultBuildGenerateSpec,
  buildContentSpec as defaultBuildContentSpec,
  type RunHandle,
  type RunSpec,
} from './runner';
import { archiveScrape as defaultArchiveScrape, type ArchiveResult } from './archive';
import { writeJobRecord, readJobRecord, listJobIds, appendLogLine, openLogStream } from './store';
import { JobQueue, SCRAPE_LOCK_KEY, generateLockKey, CONTENT_LOCK_KEY } from './queue';
import { REPO_ROOT, SCRAPE_TIMEOUT_MS, GENERATE_TIMEOUT_MS, CONTENT_TIMEOUT_MS, KILL_GRACE_MS, MAX_JOBS_IN_MEMORY } from '../config';
import type {
  JobRecord,
  JobStatus,
  ScrapeParams,
  GenerateParams,
  ContentParams,
  StageProgress,
  ScrapeResult,
  GenerateResult,
  ContentResult,
} from '../../shared/jobs';
import type { LgEvent, ScrapeResultData, GenerateResultData, ContentResultData } from '../../shared/events';
import type { SseFrame, SseStageFrame } from '../../shared/api';
import type { ParsedLine } from './ndjson';
import { assertNever } from '../../shared/assert-never';

export type JobRegistryDeps = {
  repoRoot?: string;
  scrapeTimeoutMs?: number;
  generateTimeoutMs?: number;
  contentTimeoutMs?: number;
  killGraceMs?: number;
  /** DI seams for tests only — production callers should never override these. */
  buildScrapeSpec?: typeof defaultBuildScrapeSpec;
  buildGenerateSpec?: typeof defaultBuildGenerateSpec;
  buildContentSpec?: typeof defaultBuildContentSpec;
  archiveScrape?: (jobId: string) => ArchiveResult;
};

type LiveHandle = {
  runHandle: RunHandle;
  logStream: WriteStream;
  /** The CHILD's own event seq (distinct from job.lastSeq, the admin-side counter) — used for gap detection only, deliberately never persisted (design §2). */
  lastChildSeq: number;
  cancelRequested: boolean;
};

type IngestInput =
  | { ch: 'stdout'; line: string }
  | { ch: 'stderr'; line: string; parsed: ParsedLine }
  | { ch: 'meta'; meta: Record<string, unknown> };

export class JobRegistry {
  #jobs = new Map<string, JobRecord>();
  #live = new Map<string, LiveHandle>();
  #subs = new Map<string, Set<(frame: SseFrame) => void>>();
  #writeTimers = new Map<string, NodeJS.Timeout>();
  #queue = new JobQueue();

  #repoRoot: string;
  #scrapeTimeoutMs: number;
  #generateTimeoutMs: number;
  #contentTimeoutMs: number;
  #killGraceMs: number;
  #buildScrapeSpec: typeof defaultBuildScrapeSpec;
  #buildGenerateSpec: typeof defaultBuildGenerateSpec;
  #buildContentSpec: typeof defaultBuildContentSpec;
  #archiveScrape: (jobId: string) => ArchiveResult;

  constructor(deps: JobRegistryDeps = {}) {
    this.#repoRoot = deps.repoRoot ?? REPO_ROOT;
    this.#scrapeTimeoutMs = deps.scrapeTimeoutMs ?? SCRAPE_TIMEOUT_MS;
    this.#generateTimeoutMs = deps.generateTimeoutMs ?? GENERATE_TIMEOUT_MS;
    this.#contentTimeoutMs = deps.contentTimeoutMs ?? CONTENT_TIMEOUT_MS;
    this.#killGraceMs = deps.killGraceMs ?? KILL_GRACE_MS;
    this.#buildScrapeSpec = deps.buildScrapeSpec ?? defaultBuildScrapeSpec;
    this.#buildGenerateSpec = deps.buildGenerateSpec ?? defaultBuildGenerateSpec;
    this.#buildContentSpec = deps.buildContentSpec ?? defaultBuildContentSpec;
    this.#archiveScrape = deps.archiveScrape ?? ((jobId: string) => defaultArchiveScrape(jobId));
  }

  // -------------------------------------------------------------------
  // Restart recovery (design §2 "Restart recovery"). MUST run before the
  // HTTP server starts accepting connections (Batch E's main.ts calls
  // this). Synchronous and side-effecting on disk by design — recovery
  // must be durable immediately, not debounced.
  // -------------------------------------------------------------------
  recover(): { recovered: number; skipped: number } {
    let recovered = 0;
    let skipped = 0;

    for (const jobId of listJobIds()) {
      const result = readJobRecord(jobId);
      if (!result.ok) {
        // A missing/corrupt job.json is logged and skipped — never throws,
        // a single bad dir must not prevent boot.
        // eslint-disable-next-line no-console
        console.error(`[registry.recover] skipping ${jobId}: ${result.reason}`);
        skipped += 1;
        continue;
      }

      const job = result.job;

      if (job.status === 'running' || job.status === 'queued') {
        const openStage = job.stages.find((s) => s.status === 'running');

        job.status = 'interrupted';
        job.finishedAt = new Date().toISOString();
        // NEVER reattach by pid — a recycled pid would make the panel
        // stream a stranger's process. Explicit per design §2 rule 3.
        job.pid = null;
        job.error = {
          message:
            'Admin server restarted while this job was running; the child process was not reattachable.',
          stage: openStage?.stage ?? null,
        };
        // No invented endedAt/ms — we genuinely do not know when/whether
        // the stage finished.
        job.stages = job.stages.map((s) => (s.status === 'running' ? { ...s, status: 'failed' } : s));

        job.lastSeq += 1;
        writeJobRecord(job);
        appendLogLine(jobId, {
          seq: job.lastSeq,
          ts: job.finishedAt,
          ch: 'meta',
          kind: 'interrupted',
        });
        recovered += 1;
      }

      this.#jobs.set(jobId, job);
    }

    this.#capInMemory();
    return { recovered, skipped };
  }

  #capInMemory(): void {
    if (this.#jobs.size <= MAX_JOBS_IN_MEMORY) return;
    const newestFirst = [...this.#jobs.values()].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    const toDrop = newestFirst.slice(MAX_JOBS_IN_MEMORY);
    for (const job of toDrop) this.#jobs.delete(job.jobId);
  }

  // -------------------------------------------------------------------
  // Read access
  // -------------------------------------------------------------------

  /** In-memory first, falls back to disk for jobs evicted by the 200-cap. */
  get(jobId: string): JobRecord | null {
    const inMemory = this.#jobs.get(jobId);
    if (inMemory) return structuredClone(inMemory);
    const result = readJobRecord(jobId);
    return result.ok ? result.job : null;
  }

  list(): JobRecord[] {
    return [...this.#jobs.values()]
      .map((j) => structuredClone(j))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  // -------------------------------------------------------------------
  // SSE subscriber plumbing (wire format is Batch E's concern — this is
  // just the fan-out list design §2's #subs Map describes).
  // -------------------------------------------------------------------

  subscribe(jobId: string, cb: (frame: SseFrame) => void): () => void {
    const set = this.#subs.get(jobId) ?? new Set();
    set.add(cb);
    this.#subs.set(jobId, set);
    return () => {
      set.delete(cb);
      if (set.size === 0) this.#subs.delete(jobId);
    };
  }

  #publish(jobId: string, frame: SseFrame): void {
    const set = this.#subs.get(jobId);
    if (!set) return;
    for (const cb of set) cb(frame);
  }

  // -------------------------------------------------------------------
  // Job creation (spec R3 "Concurrency Serialization", R9, R12's caller
  // contract — callers MUST validate URL/slug/content BEFORE calling these;
  // that HTTP-facing validation is Batch E's job).
  // -------------------------------------------------------------------

  createScrapeJob(params: ScrapeParams): JobRecord {
    return structuredClone(
      this.#createJob('scrape', params, SCRAPE_LOCK_KEY, () =>
        this.#buildScrapeSpec(params, { repoRoot: this.#repoRoot, timeoutMs: this.#scrapeTimeoutMs }),
      ),
    );
  }

  createGenerateJob(params: GenerateParams): JobRecord {
    const key = generateLockKey(params.slug);
    return structuredClone(
      this.#createJob('generate', params, key, () =>
        this.#buildGenerateSpec(params, { repoRoot: this.#repoRoot, timeoutMs: this.#generateTimeoutMs }),
      ),
    );
  }

  createContentJob(params: ContentParams): JobRecord {
    return structuredClone(
      this.#createJob('content', params, CONTENT_LOCK_KEY, (jobId) =>
        this.#buildContentSpec(params, { repoRoot: this.#repoRoot, timeoutMs: this.#contentTimeoutMs, jobId }),
      ),
    );
  }

  #createJob(
    kind: JobRecord['kind'],
    params: ScrapeParams | GenerateParams | ContentParams,
    lockKey: string,
    buildSpec: (jobId: string) => RunSpec,
  ): JobRecord {
    const jobId = newJobId();
    const spec = buildSpec(jobId);
    const now = new Date().toISOString();
    const acquired = this.#queue.tryAcquire(lockKey, jobId);

    const job: JobRecord = {
      schema: 1,
      jobId,
      kind,
      status: acquired ? 'running' : 'queued',
      params,
      argv: [spec.command, ...spec.args],
      cwd: spec.cwd,
      pid: null,
      createdAt: now,
      startedAt: acquired ? now : null,
      finishedAt: null,
      exitCode: null,
      signal: null,
      stages: [],
      result: null,
      error: null,
      eventSchemaVersion: null,
      malformedEventCount: 0,
      eventGaps: [],
      lastSeq: 0,
      logPath: `.jobs/${jobId}/log.ndjson`,
      archivePath: null,
      archiveError: null,
    };

    this.#jobs.set(jobId, job);
    writeJobRecord(job);
    this.#publish(jobId, { type: 'job', job: structuredClone(job) });

    if (acquired) {
      this.#start(jobId, spec, lockKey);
    } else {
      this.#awaitAndStart(jobId, lockKey, spec);
    }

    return job;
  }

  #awaitAndStart(jobId: string, lockKey: string, spec: RunSpec): void {
    this.#queue.onNextRelease(lockKey).then(() => {
      const job = this.#jobs.get(jobId);
      if (!job || job.status !== 'queued') return; // cancelled while waiting

      if (this.#queue.tryAcquire(lockKey, jobId)) {
        job.status = 'running';
        job.startedAt = new Date().toISOString();
        writeJobRecord(job);
        this.#publish(jobId, { type: 'job', job: structuredClone(job) });
        this.#start(jobId, spec, lockKey);
      } else {
        this.#awaitAndStart(jobId, lockKey, spec); // lost the race to another waiter; wait for the next release
      }
    });
  }

  #start(jobId: string, spec: RunSpec, lockKey: string): void {
    const job = this.#jobs.get(jobId);
    if (!job) return;

    const logStream = openLogStream(jobId);
    // Defensive: without this, an ENOENT (e.g. the job's .jobs dir vanishing
    // out from under an open stream — should never happen in production,
    // where job dirs are never deleted while live) would be an UNHANDLED
    // 'error' event and crash the process. Swallow-and-log instead.
    logStream.on('error', (err) => {
      // eslint-disable-next-line no-console
      console.error(`[registry] log stream error for ${jobId}:`, err);
    });
    const live: LiveHandle = {
      runHandle: undefined as unknown as RunHandle,
      logStream,
      lastChildSeq: 0,
      cancelRequested: false,
    };

    const runHandle = run(spec, {
      onStdoutLine: (line) => this.#ingest(jobId, { ch: 'stdout', line }),
      onStderrLine: (line, parsed) => this.#ingest(jobId, { ch: 'stderr', line, parsed }),
      onExit: ({ code, signal, timedOut }) => this.#onChildExit(jobId, lockKey, code, signal, timedOut),
    });
    live.runHandle = runHandle;

    this.#live.set(jobId, live);
    job.pid = runHandle.pid;
    writeJobRecord(job);
    this.#publish(jobId, { type: 'job', job: structuredClone(job) });
  }

  // -------------------------------------------------------------------
  // ingest() — synchronous fan-out: assign admin-side seq, append
  // log.ndjson, mutate the JobRecord, push SSE frames (design §2/§3).
  // stderr is parsed as NDJSON (design §4 rule 7 — stdout never is).
  // -------------------------------------------------------------------
  #ingest(jobId: string, input: IngestInput): void {
    const job = this.#jobs.get(jobId);
    if (!job) return;

    const seq = ++job.lastSeq;
    const ts = new Date().toISOString();
    const live = this.#live.get(jobId);
    const frames: SseFrame[] = [];

    let logEntry: Record<string, unknown>;

    if (input.ch === 'stdout') {
      logEntry = { seq, ts, ch: 'stdout', line: input.line };
      frames.push({ type: 'log', seq, ts, ch: 'stdout', line: input.line });
    } else if (input.ch === 'stderr') {
      logEntry = { seq, ts, ch: 'stderr', line: input.line };
      frames.push({ type: 'log', seq, ts, ch: 'stderr', line: input.line });

      if (input.parsed.kind === 'event') {
        const event = input.parsed.event;
        if (live) {
          if (live.lastChildSeq > 0 && event.seq !== live.lastChildSeq + 1) {
            job.eventGaps.push({ expected: live.lastChildSeq + 1, got: event.seq });
          }
          live.lastChildSeq = event.seq;
        }
        applyEventToJob(job, event);
        const stageFrame = stageFrameForEvent(event, seq, ts);
        if (stageFrame) frames.push(stageFrame);
      } else if (input.parsed.kind === 'malformed') {
        job.malformedEventCount += 1;
      }
    } else {
      logEntry = { seq, ts, ch: 'meta', ...input.meta };
    }

    if (live) live.logStream.write(JSON.stringify(logEntry) + '\n');
    else appendLogLine(jobId, logEntry);

    this.#scheduleWrite(job);
    for (const frame of frames) this.#publish(jobId, frame);
  }

  #onChildExit(
    jobId: string,
    lockKey: string,
    code: number | null,
    signal: NodeJS.Signals | null,
    timedOut: boolean,
  ): void {
    const job = this.#jobs.get(jobId);
    const live = this.#live.get(jobId);

    if (job) {
      job.exitCode = code;
      job.signal = signal;
      job.finishedAt = new Date().toISOString();
      job.pid = null;

      let status: JobStatus;
      if (live?.cancelRequested) status = 'cancelled';
      else if (timedOut) status = 'timed-out';
      else status = code === 0 ? 'succeeded' : 'failed';
      job.status = status;

      if (job.kind === 'scrape' && status === 'succeeded') {
        const archiveResult = this.#archiveScrape(jobId);
        if (archiveResult.ok) {
          job.archivePath = archiveResult.destDir;
          if (job.result) (job.result as ScrapeResult).archivedFiles = archiveResult.files;
          this.#ingest(jobId, { ch: 'meta', meta: { kind: 'archived', files: archiveResult.files } });
        } else {
          job.archiveError = archiveResult.error;
        }
      }

      job.lastSeq += 1;
      writeJobRecord(job);
      const exitTs = job.finishedAt;
      if (live) live.logStream.write(JSON.stringify({ seq: job.lastSeq, ts: exitTs, ch: 'meta', kind: 'exit', code, signal }) + '\n');
      else appendLogLine(jobId, { seq: job.lastSeq, ts: exitTs, ch: 'meta', kind: 'exit', code, signal });

      // Terminal transitions are one of the "status/result/error change"
      // triggers for a full job snapshot (design §3), same as any other
      // mutation — not just the dedicated 'end' frame.
      this.#publish(jobId, { type: 'job', job: structuredClone(job) });
      this.#publish(jobId, { type: 'end', status: job.status, exitCode: code });
    }

    if (live) live.logStream.end();
    this.#live.delete(jobId);
    const timer = this.#writeTimers.get(jobId);
    if (timer) {
      clearTimeout(timer);
      this.#writeTimers.delete(jobId);
    }
    this.#queue.release(lockKey);
  }

  cancel(jobId: string): boolean {
    const job = this.#jobs.get(jobId);
    if (!job) return false;

    if (job.status === 'queued') {
      job.status = 'cancelled';
      job.finishedAt = new Date().toISOString();
      writeJobRecord(job);
      this.#publish(jobId, { type: 'end', status: 'cancelled', exitCode: null });
      return true;
    }

    const live = this.#live.get(jobId);
    if (live && job.status === 'running') {
      live.cancelRequested = true;
      live.runHandle.cancel();
      return true;
    }

    return false;
  }

  /** 250ms-debounced job.json rewrite for per-line mutations; terminal/create writes go through writeJobRecord directly instead (design §2). */
  #scheduleWrite(job: JobRecord): void {
    if (this.#writeTimers.has(job.jobId)) return;
    const timer = setTimeout(() => {
      this.#writeTimers.delete(job.jobId);
      writeJobRecord(job);
    }, 250);
    this.#writeTimers.set(job.jobId, timer);
  }
}

function newJobId(): string {
  return `${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
}

function applyEventToJob(job: JobRecord, event: LgEvent): void {
  if (job.eventSchemaVersion === null) job.eventSchemaVersion = event.v;

  switch (event.type) {
    case 'stage.start': {
      const stage: StageProgress = {
        stage: String(event.stage),
        status: 'running',
        startedAt: new Date().toISOString(),
        endedAt: null,
        ms: null,
        progress: null,
        warnings: [],
      };
      job.stages.push(stage);
      break;
    }
    case 'stage.end': {
      const stage = findLastRunningStage(job, String(event.stage));
      if (stage) {
        stage.status = 'done';
        stage.endedAt = new Date().toISOString();
        const data = event.data as { ms: number } | null;
        stage.ms = data?.ms ?? null;
      }
      break;
    }
    case 'progress': {
      const stage = findLastRunningStage(job, event.stage ? String(event.stage) : undefined);
      const data = event.data as { done: number; total: number; label?: string } | null;
      if (stage && data) stage.progress = { done: data.done, total: data.total, label: data.label };
      break;
    }
    case 'warn': {
      const stage = findLastRunningStage(job, event.stage ? String(event.stage) : undefined);
      const data = event.data as { message: string } | null;
      if (stage && data) stage.warnings.push(data.message);
      break;
    }
    case 'error': {
      const data = event.data as { message: string; code?: string } | null;
      job.error = {
        message: data?.message ?? 'unknown error',
        stage: event.stage ? String(event.stage) : null,
        code: data?.code,
      };
      const stage = findLastRunningStage(job, event.stage ? String(event.stage) : undefined);
      if (stage) {
        stage.status = 'failed';
        stage.endedAt = new Date().toISOString();
      }
      break;
    }
    case 'result': {
      switch (job.kind) {
        case 'scrape': {
          const data = event.data as ScrapeResultData;
          job.result = { ...data, archivedFiles: 0 } satisfies ScrapeResult;
          break;
        }
        case 'generate':
          job.result = event.data as GenerateResultData satisfies GenerateResult;
          break;
        case 'content':
          job.result = event.data as ContentResultData satisfies ContentResult;
          break;
        default:
          assertNever(job.kind);
      }
      break;
    }
  }
}

function findLastRunningStage(job: JobRecord, stageName?: string): StageProgress | undefined {
  for (let i = job.stages.length - 1; i >= 0; i -= 1) {
    const s = job.stages[i];
    if (s.status !== 'running') continue;
    if (stageName && s.stage !== stageName) continue;
    return s;
  }
  return undefined;
}

// Exported for Batch E's events.ts route — replay from log.ndjson must
// derive the exact same stage frames from a re-parsed stderr line that live
// ingestion did, so a reconnecting client cannot see a different frame shape
// than one who was connected the whole time (design §3's "registry owns live
// fan-out, routes own replay+wire-format" split still holds: this stays a
// pure function with no registry state).
export function stageFrameForEvent(event: LgEvent, seq: number, ts: string): SseStageFrame | null {
  switch (event.type) {
    case 'stage.start':
      return { type: 'stage', seq, ts, stage: String(event.stage), status: 'running', progress: null };
    case 'stage.end':
      return { type: 'stage', seq, ts, stage: String(event.stage), status: 'done', progress: null };
    case 'progress': {
      const data = event.data as { done: number; total: number; label?: string } | null;
      return {
        type: 'stage',
        seq,
        ts,
        stage: event.stage ? String(event.stage) : '',
        status: 'running',
        progress: data ? { done: data.done, total: data.total, label: data.label } : null,
      };
    }
    case 'error':
      return { type: 'stage', seq, ts, stage: event.stage ? String(event.stage) : '', status: 'failed', progress: null };
    default:
      return null;
  }
}

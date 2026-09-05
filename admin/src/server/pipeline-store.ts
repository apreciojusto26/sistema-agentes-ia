// Store for pipeline runs plus its subscriber fan-out — now with a disk mirror.
//
// Deliberately NOT a second JobRegistry. Each STAGE already becomes a real
// JobRecord with its own log, events and disk mirror; what is missing is a
// handle on the run that ties those jobs together. This holds exactly that —
// the PipelineRecord — and nothing else. No spawning, no locking, no
// persistence: a pipeline is a view over jobs that are themselves durable.
//
// One run at a time, on purpose. The stages share the scrape and Gemini locks
// anyway, so a second concurrent pipeline would immediately queue behind the
// first while making the UI's "what is happening right now" ambiguous.
//
// ─── AND IT IS NOT ONLY IN MEMORY ANY MORE ─────────────────────────────────
//
// It was, and that was the gap. Each stage's per-step detail is parsed from
// the child's NDJSON and persisted by the registry into admin/.jobs/<id>/job
// .json — durable. What was NOT durable was the record that ties those jobs
// into one run, so closing the Admin lost every report: the work was on disk
// and unreachable.
//
// A RUN IS A FILE, keyed by pipelineId, so a landing can have as many as it
// has been generated times. Nothing here is a secret: it is stage names,
// statuses, durations and the sanitised errors the pipeline already produced.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { PIPELINES_DIR } from './config';
import type { PipelineRecord } from './pipeline';

type Subscriber = (record: PipelineRecord) => void;

const records = new Map<string, PipelineRecord>();
const subscribers = new Map<string, Set<Subscriber>>();
let activeId: string | null = null;

const file = (pipelineId: string) => path.join(PIPELINES_DIR, `${pipelineId}.json`);

/**
 * Ids THIS process wrote, so the test seam can clean up after itself.
 *
 * Tracked rather than globbing the directory: `__reset()` deleting every file
 * it found would erase a developer's real reports the first time a suite ran
 * against the real Admin root, which is a bad trade for tidiness.
 */
const written = new Set<string>();

/**
 * Writes the run to disk.
 *
 * DEBOUNCED WHILE RUNNING, immediate once terminal. A run emits on every
 * 250ms poll of every child; writing each frame would turn a progress update
 * into a synchronous disk write. The terminal frame is the one that must not
 * be lost, so it is never debounced.
 */
let pending: NodeJS.Timeout | null = null;
function persist(record: PipelineRecord): void {
  const write = () => {
    try {
      mkdirSync(PIPELINES_DIR, { recursive: true });
      writeFileSync(file(record.pipelineId), `${JSON.stringify(record, null, 2)}\n`);
      written.add(record.pipelineId);
    } catch {
      // A run whose report cannot be written must not take the run down with
      // it. The generation is the product; the report is the record of it.
    }
  };
  if (record.status === 'running') {
    if (pending) return;
    pending = setTimeout(() => {
      pending = null;
      write();
    }, 400);
    return;
  }
  if (pending) {
    clearTimeout(pending);
    pending = null;
  }
  write();
}

/**
 * Reads every persisted run back. Called once at boot.
 *
 * A RUN LEFT `running` BY A RESTART IS NOT RUNNING. Its child processes died
 * with the server, so it is recovered as `failed` — the same rule the job
 * registry applies to an interrupted job. Reporting it as in-flight forever
 * would block the next generation on a run nobody can finish.
 */
export function recover(): number {
  if (!existsSync(PIPELINES_DIR)) return 0;
  let count = 0;
  for (const entry of readdirSync(PIPELINES_DIR)) {
    if (!entry.endsWith('.json')) continue;
    try {
      const record = JSON.parse(readFileSync(path.join(PIPELINES_DIR, entry), 'utf-8')) as PipelineRecord;
      if (!record?.pipelineId) continue;
      if (record.status === 'running') {
        record.status = 'failed';
        record.error = record.error ?? 'el Admin se reinició mientras esta generación estaba en curso';
        record.currentStage = null;
        for (const stage of record.stages) {
          if (stage.status === 'running') stage.status = 'failed';
        }
      }
      records.set(record.pipelineId, record);
      count += 1;
    } catch {
      // A corrupt report is skipped, never fatal — same rule as a corrupt
      // job.json in the registry.
    }
  }
  return count;
}

/** Every run that produced (or tried to produce) this slug, newest first. */
export function forSlug(slug: string): PipelineRecord[] {
  return list().filter((r) => r.slug === slug);
}

/** Drops a run's report. Used when its landing is deleted. */
export function forget(pipelineId: string): void {
  records.delete(pipelineId);
  try {
    rmSync(file(pipelineId), { force: true });
  } catch {
    /* a report that cannot be removed is not worth failing a delete over */
  }
}

export function put(record: PipelineRecord): void {
  records.set(record.pipelineId, record);
  if (record.status === 'running') activeId = record.pipelineId;
  else if (activeId === record.pipelineId) activeId = null;
  persist(record);

  for (const cb of subscribers.get(record.pipelineId) ?? []) {
    try {
      cb(record);
    } catch {
      // A broken subscriber must never take the pipeline down with it.
    }
  }
}

export function get(pipelineId: string): PipelineRecord | null {
  return records.get(pipelineId) ?? null;
}

export function list(): PipelineRecord[] {
  return [...records.values()].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

/** The run currently in flight, or null. Used to refuse a concurrent start. */
export function active(): PipelineRecord | null {
  return activeId ? (records.get(activeId) ?? null) : null;
}

export function subscribe(pipelineId: string, cb: Subscriber): () => void {
  const set = subscribers.get(pipelineId) ?? new Set<Subscriber>();
  set.add(cb);
  subscribers.set(pipelineId, set);
  return () => {
    set.delete(cb);
    if (set.size === 0) subscribers.delete(pipelineId);
  };
}

/** Test seam only — production never resets a live store. */
export function __reset(): void {
  records.clear();
  subscribers.clear();
  activeId = null;
  if (pending) {
    clearTimeout(pending);
    pending = null;
  }
  // Only what this process wrote. A suite that puts records into the store
  // would otherwise leave them in the operator's own report directory.
  for (const id of written) {
    try {
      rmSync(file(id), { force: true });
    } catch {
      /* best effort — a leftover test report is untidy, not harmful */
    }
  }
  written.clear();
}

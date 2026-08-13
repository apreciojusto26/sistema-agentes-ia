// Pure disk IO for admin/.jobs/{jobId}/{job.json,log.ndjson} (design §2 "On-
// disk mirror"). No process/child/timer concerns live here — registry.ts
// (D15) owns the 250ms debounce and the "write on create + terminal
// transition" policy on top of these primitives.
import fs from 'node:fs';
import path from 'node:path';
import { JOBS_DIR } from '../config';
import type { JobRecord } from '../../shared/jobs';

export function jobDir(jobId: string): string {
  return path.join(JOBS_DIR, jobId);
}

export function jobJsonPath(jobId: string): string {
  return path.join(jobDir(jobId), 'job.json');
}

export function logNdjsonPath(jobId: string): string {
  return path.join(jobDir(jobId), 'log.ndjson');
}

export function ensureJobDir(jobId: string): void {
  fs.mkdirSync(jobDir(jobId), { recursive: true });
}

/**
 * Atomic write: job.json.tmp + renameSync. A crash mid-write never leaves a
 * partially-written job.json behind — readers either see the old complete
 * file or the new complete file, never a torn one.
 */
export function writeJobRecord(job: JobRecord): void {
  ensureJobDir(job.jobId);
  const target = jobJsonPath(job.jobId);
  const tmp = `${target}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(job, null, 2));
  fs.renameSync(tmp, target);
}

export type ReadJobResult = { ok: true; job: JobRecord } | { ok: false; reason: string };

/** Never throws. A missing or corrupt job.json is reported, not thrown — a bad dir must not crash a caller iterating many jobs (design §2 recover() rule 1). */
export function readJobRecord(jobId: string): ReadJobResult {
  let raw: string;
  try {
    raw = fs.readFileSync(jobJsonPath(jobId), 'utf8');
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : 'read failed' };
  }

  try {
    return { ok: true, job: JSON.parse(raw) as JobRecord };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : 'JSON.parse failed' };
  }
}

/** Job ids present on disk (each a directory under JOBS_DIR). Never throws — a missing JOBS_DIR yields []. */
export function listJobIds(): string[] {
  try {
    return fs
      .readdirSync(JOBS_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    return [];
  }
}

/** Appends one JSON-serializable entry as an NDJSON line to log.ndjson. */
export function appendLogLine(jobId: string, entry: unknown): void {
  ensureJobDir(jobId);
  fs.appendFileSync(logNdjsonPath(jobId), JSON.stringify(entry) + '\n');
}

/** Append-mode write stream, meant to stay open for a live job's lifetime (design §2 LiveHandle.logStream). */
export function openLogStream(jobId: string): fs.WriteStream {
  ensureJobDir(jobId);
  return fs.createWriteStream(logNdjsonPath(jobId), { flags: 'a' });
}

/**
 * Reads every line of log.ndjson for a job (Batch E's SSE replay, design §3
 * "replay from log.ndjson via Last-Event-ID"). Never throws — a missing file
 * (job never started ingesting, or evicted) yields []. Read-side counterpart
 * to appendLogLine/openLogStream; volume is bounded (~40 lines for a scrape,
 * ~15 for a generate — design §3), so a single synchronous-style read is
 * deliberately simple rather than a streaming parse.
 */
export function readLogLines(jobId: string): string[] {
  let raw: string;
  try {
    raw = fs.readFileSync(logNdjsonPath(jobId), 'utf8');
  } catch {
    return [];
  }
  return raw.split('\n').filter((line) => line.length > 0);
}

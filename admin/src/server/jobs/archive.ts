// Post-scrape artifact archiving (spec R11 "Scrape Artifact Archiving";
// design §7 "Post-scrape archiving"). Runs only on a successful scrape
// (exitCode 0). COPIES scraper/output/ -> admin/.jobs/{jobId}/scrape/ —
// NEVER moves (design §10 judgment call #9): scrape.js's contract is that
// it always writes ./output relative to its cwd, and a developer may still
// be running it manually from the CLI; moving would break that workflow.
//
// An archiving failure does NOT fail the job — the scrape itself genuinely
// succeeded. Callers get `{ ok: false, error }` and are expected to set
// `job.archiveError` rather than propagate a thrown exception.
import fs, { cpSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { SCRAPER_OUTPUT_DIR, JOBS_DIR } from '../config';

export type ArchiveOpts = {
  /** Defaults to SCRAPER_OUTPUT_DIR (REPO_ROOT/scraper/output). Overridable for tests. */
  srcDir?: string;
  /** Defaults to JOBS_DIR (admin/.jobs). Overridable for tests. */
  jobsDir?: string;
};

export type ArchiveResult =
  | { ok: true; destDir: string; productJson: boolean; files: number }
  | { ok: false; error: string };

/**
 * Copies `{srcDir}/product.json` and `{srcDir}/images/` into
 * `{jobsDir}/{jobId}/scrape/`. Never throws — a missing source directory (a
 * scrape that produced nothing, or was never run) is reported as
 * `{ ok:false, error }`, not an exception.
 */
export function archiveScrape(jobId: string, opts: ArchiveOpts = {}): ArchiveResult {
  const srcDir = opts.srcDir ?? SCRAPER_OUTPUT_DIR;
  const jobsDir = opts.jobsDir ?? JOBS_DIR;
  const destDir = path.join(jobsDir, jobId, 'scrape');

  if (!existsSync(srcDir)) {
    return { ok: false, error: `scrape output directory not found: ${srcDir}` };
  }

  try {
    mkdirSync(destDir, { recursive: true });
    cpSync(srcDir, destDir, { recursive: true });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'archive copy failed' };
  }

  const productJson = existsSync(path.join(destDir, 'product.json'));
  const files = countFiles(destDir);

  return { ok: true, destDir, productJson, files };
}

function countFiles(dir: string): number {
  let count = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      count += countFiles(full);
    } else {
      count += 1;
    }
  }
  return count;
}

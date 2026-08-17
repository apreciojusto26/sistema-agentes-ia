// Post-scrape artifact archiving (spec R11 "Scrape Artifact Archiving";
// design §7 "Post-scrape archiving"; design "product-identity-generation-
// isolation" D3 "Vector #1 fail-closed archive gate"). Runs only on a
// successful scrape (exitCode 0). COPIES scraper/output/ ->
// admin/.jobs/{jobId}/scrape/ — NEVER moves (design §10 judgment call #9):
// scrape.js's contract is that it always writes ./output relative to its
// cwd, and a developer may still be running it manually from the CLI;
// moving would break that workflow.
//
// Two DIFFERENT failure semantics live in this module, and they must never
// be conflated:
//
//   1. IO failures (missing srcDir, cpSync EACCES/ENOSPC/etc) — NON-FATAL.
//      An archiving failure of this kind does NOT fail the job — the scrape
//      itself genuinely succeeded. Callers get `{ ok:false, error }` (no
//      `fatal` field, or `fatal:false`) and are expected to set
//      `job.archiveError` rather than propagate a thrown exception. This
//      shape/behavior is UNCHANGED from the original R11 implementation.
//
//   2. Ownership mismatch (the archived product.json's productId differs
//      from the caller's `expectedProductId`) — FATAL. This is a
//      correctness violation, not infrastructure noise: it means the
//      archived bytes describe a different product than the job lineage
//      claims. Callers get `{ ok:false, fatal:true,
//      code:'archive-ownership-mismatch', expected, found }` and MUST fail
//      the job — see registry.ts `#onChildExit`. The partially-copied
//      destDir is removed before returning. A missing/absent id on either
//      side is NOT a mismatch (legacy scrapes predate productId) — that
//      case warns implicitly (via `productId: null`) and proceeds `ok:true`.
import fs, { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { SCRAPER_OUTPUT_DIR, JOBS_DIR } from '../config';

export type ArchiveOpts = {
  /** Defaults to SCRAPER_OUTPUT_DIR (REPO_ROOT/scraper/output). Overridable for tests. */
  srcDir?: string;
  /** Defaults to JOBS_DIR (admin/.jobs). Overridable for tests. */
  jobsDir?: string;
  /** When set, the archived product.json MUST carry this id (or none). */
  expectedProductId?: string | null;
};

export type ArchiveResult =
  // success — two additive fields (productId, pruned), existing ones untouched.
  | { ok: true; destDir: string; productJson: boolean; files: number; productId: string | null; pruned: number }
  // soft failure — UNCHANGED shape/semantics (missing srcDir, cpSync EACCES).
  // `fatal` is absent/optional so existing object literals and
  // `toEqual({ ok:false, error })`-style assertions still pass.
  | { ok: false; fatal?: false; error: string }
  // NEW hard failure — correctness violation, fails the job.
  | {
      ok: false;
      fatal: true;
      code: 'archive-ownership-mismatch';
      error: string;
      expected: string;
      found: string | null;
    };

/**
 * Copies `{srcDir}/product.json`, `{srcDir}/images/`, and
 * `{srcDir}/.scrape-run.json` (when present) into `{jobsDir}/{jobId}/scrape/`.
 * Never throws — a missing source directory (a scrape that produced
 * nothing, or was never run) is reported as `{ ok:false, error }`, not an
 * exception.
 *
 * After copying: (1) prunes any ghost image not listed in the copied
 * `.scrape-run.json`'s `images[]` (non-fatal cleanup — absent for
 * pre-change/legacy scrapes, in which case nothing is pruned); (2) when
 * `opts.expectedProductId` is given and the archived `product.json` carries
 * a DIFFERENT productId, fails closed with the `fatal:true` variant and
 * removes the partially-copied destDir.
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
  const pruned = pruneGhostImages(destDir);
  const foundProductId = readProductId(destDir);

  if (opts.expectedProductId && foundProductId && foundProductId !== opts.expectedProductId) {
    // Correctness violation, not an IO hiccup — remove the partially-copied
    // destDir so no downstream stage can accidentally read it, and fail closed.
    rmSync(destDir, { recursive: true, force: true });
    return {
      ok: false,
      fatal: true,
      code: 'archive-ownership-mismatch',
      error: `archived product.json belongs to productId "${foundProductId}", expected "${opts.expectedProductId}"`,
      expected: opts.expectedProductId,
      found: foundProductId,
    };
  }

  const files = countFiles(destDir);

  return { ok: true, destDir, productJson, files, productId: foundProductId, pruned };
}

function readProductId(destDir: string): string | null {
  const productJsonPath = path.join(destDir, 'product.json');
  if (!existsSync(productJsonPath)) return null;
  try {
    const parsed = JSON.parse(readFileSync(productJsonPath, 'utf8')) as { productId?: unknown };
    return typeof parsed.productId === 'string' ? parsed.productId : null;
  } catch {
    return null;
  }
}

/**
 * Non-fatal cleanup (D3 Layer 2 #1): deletes any file under
 * `{destDir}/images` not listed in `{destDir}/.scrape-run.json`'s
 * `images[]` array. Ghost images are leftovers from a pre-change or
 * interrupted run that `cpSync` copies in alongside the real ones —
 * removing them is cleanup, never a correctness/ownership verdict. A
 * missing manifest (legacy scrape, predates this change) means nothing is
 * pruned — the previous "copy everything, prune nothing" behavior is
 * preserved for those runs.
 */
function pruneGhostImages(destDir: string): number {
  const manifestPath = path.join(destDir, '.scrape-run.json');
  const imagesDir = path.join(destDir, 'images');
  if (!existsSync(manifestPath) || !existsSync(imagesDir)) return 0;

  let manifest: { images?: unknown };
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { images?: unknown };
  } catch {
    return 0;
  }

  if (!Array.isArray(manifest.images)) return 0;
  const keep = new Set(manifest.images.filter((v): v is string => typeof v === 'string'));

  let pruned = 0;
  for (const entry of readdirSync(imagesDir, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    if (!keep.has(entry.name)) {
      unlinkSync(path.join(imagesDir, entry.name));
      pruned += 1;
    }
  }
  return pruned;
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

// outputs/{slug}/.generation.json — what a previous run left behind.
//
// ONE READER, because two of them were about to exist. routes/jobs.ts already
// read this file to decide whether an overwrite needs confirming, and the
// pipeline now reads it to explain a product conflict. A second copy of "parse
// it, tolerate its absence, never throw" is how the two ends of one feature
// start disagreeing about what a missing manifest means.
//
// ABSENCE IS SILENT AND NORMAL. The file is written by generate-landing.mjs's
// write-manifest stage, so it simply does not exist for a slug nothing has
// generated yet — and a corrupt one is treated as absent rather than crashing
// a route or a pipeline that only wanted to look.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { SourceProductIdentity } from '../../../scripts/lib/source-identity.mjs';

export type GenerationManifest = {
  /** RUN identity: minted once per scrape job, new on every execution. */
  productId?: string | null;
  /** PRODUCT identity: stable across runs. Absent on manifests written before it existed. */
  source?: SourceProductIdentity | null;
  /** The link the scrape actually followed, recommendation context and all. */
  sourceUrl?: string | null;
};

export function readGenerationManifest(outDir: string): GenerationManifest | null {
  const manifestPath = path.join(outDir, '.generation.json');
  if (!existsSync(manifestPath)) return null;
  try {
    const parsed = JSON.parse(readFileSync(manifestPath, 'utf8')) as GenerationManifest;
    return typeof parsed === 'object' && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}

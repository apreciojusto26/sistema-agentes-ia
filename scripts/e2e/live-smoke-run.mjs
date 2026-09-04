#!/usr/bin/env node
// The child half of the live smoke: it runs the REAL pipeline once and prints a
// single JSON line on stdout for the parent to read.
//
// Split into its own process so the parent can impose a timeout and kill a hung
// scraper or a wedged model call without leaving anything detached. It is not
// meant to be run directly — admin-live-smoke.mjs owns the opt-in gate, the URL
// validation and the reporting.
//
// EVERY BOUNDARY HERE IS REAL: the scraper, the normalizer, the Content Agent
// over Gemini, the asset producer, the theme resolver, the favicon resolver,
// the assembler, the generator, astro build and the structural validator. The
// only thing the hermetic E2E replaces — the scrape and the model — is exactly
// what this exists to exercise.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const slug = process.env.SMOKE_SLUG;
const url = process.env.SMOKE_URL;
if (!slug || !url) {
  process.stdout.write(JSON.stringify({ status: 'failed', error: 'SMOKE_SLUG and SMOKE_URL are required' }));
  process.exit(2);
}

const { JobRegistry } = await import(path.join(ROOT, 'admin/src/server/jobs/registry.ts'));
const { runPipeline } = await import(path.join(ROOT, 'admin/src/server/pipeline.ts'));

const started = new Map();
const stages = [];

let record;
try {
  record = await runPipeline(
    {
      url,
      slug,
      force: true,
      // Merchant and palette are operator configuration. A smoke run supplies
      // neither, so the landing falls back to canonical colours and reports its
      // missing bundles — which is itself worth seeing on a real product.
      merchantPath: process.env.SMOKE_MERCHANT ?? null,
      themePath: process.env.SMOKE_THEME ?? null,
      faviconPath: process.env.SMOKE_FAVICON ?? null,
    },
    {
      // THE REAL REGISTRY. No buildScrapeSpec override, no buildContentSpec
      // override, no injected archive — every seam the hermetic E2E fills is
      // left empty here on purpose.
      registry: new JobRegistry(),
      // NO generateFavicon: no image provider exists, so the mark falls through
      // to the deterministic monogram. Wiring a fake here would defeat the point.
      onUpdate: (r) => {
        for (const s of r.stages) {
          if (s.status === 'running' && !started.has(s.name)) started.set(s.name, Date.now());
        }
      },
    },
  );
} catch (err) {
  process.stdout.write(
    JSON.stringify({
      status: 'failed',
      error: err instanceof Error ? err.message : String(err),
      stages: [],
    }),
  );
  process.exit(1);
}

for (const s of record.stages) {
  const startedAt = started.get(s.name);
  stages.push({
    name: s.name,
    status: s.status,
    ms: startedAt && s.endedAt ? `${Date.parse(s.endedAt) - startedAt}ms` : null,
    // The pipeline already sanitises stage errors against known secrets before
    // they reach a record, so this carries no credential.
    error: s.error ?? null,
    detail: s.detail ?? null,
  });
}

process.stdout.write(
  `\n${JSON.stringify({
    status: record.status,
    error: record.error ?? null,
    productId: record.productId ?? null,
    commerceMode: record.commerceMode,
    stages,
  })}`,
);
process.exit(record.status === 'succeeded' ? 0 : 1);

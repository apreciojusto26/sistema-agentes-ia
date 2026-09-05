#!/usr/bin/env node
// Builds the artifacts contract.fixed-grammar-v3.test.ts measures.
//
// Structural Grammar V2 declared the comparison shapes that HAPPENED to occur
// in the fixtures. This renders the ones the template can actually PRODUCE:
// nine reachable row states, each one built for real and each one placed in
// the closing position, where the row carries `rounded-b-card`.
//
// NINE REAL BUILDS, NOT ONE BUILD AND EIGHT COMPOSITIONS. Assembling a closing
// row by gluing a real `ours` cell to a real `rival` cell would be asserting
// the very independence the shapes are supposed to prove — and it would be a
// test of this script's string handling rather than of Astro's output. One
// landing is generated and installed once; only the data module and the build
// are repeated, so the cost is nine `astro build`s and not nine installs.
//
//   node scripts/e2e/comparison-states.mjs
//
// Leaves outputs/zz-cmp/states/<ours>-<rival>.html, one per closing state.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync, cpSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROW_STATES, tableEndingIn, REPORTED_FAILURE } from '../lib/comparison-states.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'outputs/zz-cmp');
const STATES = path.join(OUT, 'states');
const FIX = path.join(ROOT, 'admin/test/fixtures/fixed');
const SCRAPE = path.join(ROOT, 'admin/test/fixtures/e2e/scrape');

const run = (bin, args, cwd = ROOT) =>
  execFileSync(bin, args, { cwd, stdio: 'inherit', env: { ...process.env, NODE_ENV: 'production' } });

// The canonical product is derived rather than committed — same as
// fixed-profile.sh, and for the same reason: it is the normalizer's output.
const canonical = path.join(SCRAPE, 'canonical-product.json');
if (!existsSync(canonical)) {
  const { normalizeProduct } = await import('../lib/product-normalizer.mjs');
  const raw = JSON.parse(readFileSync(path.join(SCRAPE, 'product.json'), 'utf-8'));
  writeFileSync(canonical, `${JSON.stringify(normalizeProduct(raw), null, 2)}\n`);
}

console.log('==> generate');
run('node', [
  'scripts/generate-landing.mjs',
  '--slug', 'zz-cmp',
  '--content', path.join(FIX, 'content.json'),
  '--product', canonical,
  '--images', path.join(SCRAPE, 'images'),
  '--merchant', path.join(FIX, 'merchant.json'),
  '--force',
]);

console.log('==> install (once)');
run('pnpm', ['install', '--silent'], OUT);

mkdirSync(STATES, { recursive: true });
const productTs = path.join(OUT, 'src/data/product.ts');
const original = readFileSync(productTs, 'utf-8');

// The emitter writes `comparison: [ … ],` as one serialized block. Replacing
// it in place keeps every other field — and therefore every other region of
// the page — byte-identical across the nine builds, so a shape that differs
// can only have come from the comparison table.
const COMPARISON = /^ {2}comparison: [\s\S]*?\n {2}\],$/m;
if (!COMPARISON.test(original)) {
  throw new Error('could not find the comparison block in the generated product.ts');
}

for (const state of ROW_STATES) {
  const rows = JSON.stringify(tableEndingIn(state), null, 2)
    .split('\n')
    .map((l, i) => (i === 0 ? l : `  ${l}`))
    .join('\n');
  writeFileSync(productTs, original.replace(COMPARISON, `  comparison: ${rows},`));

  console.log(`==> build  last=${state.id}`);
  run(path.join(OUT, 'node_modules/.bin/astro'), ['build'], OUT);
  cpSync(path.join(OUT, 'dist/client/index.html'), path.join(STATES, `${state.id}.html`));
}

// AND THE REPORTED FAILURE ITSELF. Every other page above carries all nine
// states in its body, so under V2 none of them collapses and the closing-row
// defect cannot be told apart from the body one. This table is the four rows
// Gemini actually wrote: three legal body rows, and a closing row V2 had no
// shape for.
{
  const rows = JSON.stringify(REPORTED_FAILURE, null, 2)
    .split('\n')
    .map((l, i) => (i === 0 ? l : `  ${l}`))
    .join('\n');
  writeFileSync(productTs, original.replace(COMPARISON, `  comparison: ${rows},`));
  console.log('==> build  reported-failure');
  run(path.join(OUT, 'node_modules/.bin/astro'), ['build'], OUT);
  cpSync(path.join(OUT, 'dist/client/index.html'), path.join(STATES, 'reported-failure.html'));
}

writeFileSync(productTs, original);
console.log(`\n✓ ${ROW_STATES.length} closing states + the reported failure in outputs/zz-cmp/states/`);

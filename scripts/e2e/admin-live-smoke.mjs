#!/usr/bin/env node
// THE LIVE SMOKE — the real boundaries, on a real URL, by hand.
//
//   LIVE_SMOKE=1 SOURCE_URL=https://… node scripts/e2e/admin-live-smoke.mjs
//
// IT IS NOT THE REGRESSION SUITE, and it must never become one. It depends on a
// third party's markup, on a paid model, on credit and on a network — and none
// of those failing is a regression in this repository. A suite that cannot tell
// those apart from real breakage is a suite people learn to ignore, which is
// why admin/test/contract.admin-e2e.test.ts exists and is hermetic.
//
// This answers a different question: does the system work against the world?
//
// ─── OPT-IN, TWICE ────────────────────────────────────────────────────────
//
// LIVE_SMOKE=1 must be set AND a SOURCE_URL given. No default URL exists — a
// hardcoded one would be someone's page being scraped by anyone who runs the
// file by accident. Nothing here runs in CI.
//
// ─── SECRETS ──────────────────────────────────────────────────────────────
//
// Credentials are read by the pipeline from the environment, are never printed,
// never written to the report, and never passed on the command line where a
// process list would show them. The report records WHETHER a key was present,
// never its value.
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const STAGES = ['scrape', 'normalize', 'content', 'assets', 'generate', 'build', 'validate'];

const die = (message, code = 2) => {
  console.error(`✗ ${message}`);
  process.exit(code);
};

if (process.env.LIVE_SMOKE !== '1') {
  die(
    'refusing to run without LIVE_SMOKE=1.\n' +
      '  This calls a real scraper, a real model and a real network. Set it deliberately:\n' +
      '    LIVE_SMOKE=1 SOURCE_URL=https://… node scripts/e2e/admin-live-smoke.mjs',
  );
}

const sourceUrl = process.env.SOURCE_URL;
if (!sourceUrl) {
  // NO DEFAULT. A URL baked in here is someone's page being fetched by whoever
  // runs this file without reading it.
  die('SOURCE_URL is required. There is no default: pick the product yourself.');
}
try {
  const parsed = new URL(sourceUrl);
  if (parsed.protocol !== 'https:') die(`SOURCE_URL must be https, got ${parsed.protocol}`);
} catch {
  die(`SOURCE_URL is not a URL: ${sourceUrl}`);
}

const slug = process.env.SMOKE_SLUG ?? `live-smoke-${Date.now().toString(36)}`;
if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) die(`SMOKE_SLUG must be kebab-case, got ${slug}`);

const outDir = path.join(ROOT, 'outputs', slug);
const reportDir = path.join(ROOT, 'outputs', '.smoke');
const reportPath = path.join(reportDir, `${slug}.json`);

/** Present-or-absent only. A value here would end up in a report file. */
const credentials = {
  GEMINI_API_KEY: Boolean(process.env.GEMINI_API_KEY),
  PUBLIC_SHOPIFY_STORE_DOMAIN: Boolean(process.env.PUBLIC_SHOPIFY_STORE_DOMAIN),
  PUBLIC_SHOPIFY_STOREFRONT_TOKEN: Boolean(process.env.PUBLIC_SHOPIFY_STOREFRONT_TOKEN),
};

if (!credentials.GEMINI_API_KEY) {
  die('GEMINI_API_KEY is not set — the Content Agent boundary is one of the things this exercises.');
}

console.log(`▶ live smoke`);
console.log(`  url    ${sourceUrl}`);
console.log(`  slug   ${slug}`);
console.log(`  keys   ${Object.entries(credentials).map(([k, v]) => `${k}=${v ? 'set' : 'absent'}`).join(', ')}`);
console.log('');

const report = {
  schema: 1,
  slug,
  sourceUrl,
  startedAt: new Date().toISOString(),
  finishedAt: null,
  status: 'running',
  failedStage: null,
  credentialsPresent: credentials,
  stages: [],
  outputPath: null,
  grammar: null,
  readiness: null,
};

const persist = () => {
  mkdirSync(reportDir, { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
};

/**
 * Runs the pipeline in a CHILD so a hung scraper or a wedged model call cannot
 * leave this process waiting forever. The child is killed on timeout, and
 * `spawnSync` does not leave a detached server behind — there is no broad
 * pkill anywhere in here.
 */
const runner = path.join(ROOT, 'scripts/e2e/live-smoke-run.mjs');

// SPAWNED THROUGH tsx, not plain node. The child imports the Admin's
// orchestrator and registry, which are TypeScript — and this Node cannot load a
// .ts file, so a plain spawn died with ERR_UNKNOWN_FILE_EXTENSION before the
// first stage. tsx is already an Admin dependency; nothing new is installed.
const TSX = path.join(ROOT, 'admin/node_modules/.bin/tsx');
if (!existsSync(TSX)) {
  die('tsx is missing — run `pnpm install` in admin/. The harness loads the Admin TypeScript through it.');
}

const started = Date.now();
const child = spawnSync(TSX, [runner], {
  cwd: ROOT,
  encoding: 'utf-8',
  timeout: Number(process.env.SMOKE_TIMEOUT_MS ?? 20 * 60 * 1000),
  killSignal: 'SIGTERM',
  env: { ...process.env, SMOKE_SLUG: slug, SMOKE_URL: sourceUrl },
  stdio: ['ignore', 'pipe', 'inherit'],
});

report.finishedAt = new Date().toISOString();
report.durationMs = Date.now() - started;

if (child.error?.code === 'ETIMEDOUT' || child.signal) {
  report.status = 'timeout';
  report.failedStage = 'unknown (child killed)';
  persist();
  die(`the pipeline exceeded its timeout and was killed. Report: ${path.relative(ROOT, reportPath)}`, 1);
}

let childReport = null;
try {
  childReport = JSON.parse(child.stdout.trim().split('\n').at(-1) ?? '{}');
} catch {
  childReport = null;
}

if (!childReport || !childReport.stages) {
  report.status = 'failed';
  report.failedStage = 'harness';
  persist();
  die(`the run produced no readable result (exit ${child.status}). Report: ${path.relative(ROOT, reportPath)}`, 1);
}

Object.assign(report, childReport);

// ─── which boundary died ──────────────────────────────────────────────────
//
// A failed smoke has to name the stage. A 400-line stack as the primary
// interface tells an operator nothing about which of seven boundaries broke.
if (report.status !== 'succeeded') {
  const failed = report.stages.find((s) => s.status === 'failed');
  report.failedStage = failed?.name ?? 'unknown';
  persist();
  console.log('');
  for (const s of report.stages) {
    console.log(`  ${s.status === 'pass' ? '✓' : s.status === 'failed' ? '✗' : '·'} ${s.name.padEnd(10)} ${s.ms ?? ''}`);
  }
  die(
    `died at the ${report.failedStage} boundary: ${failed?.error ?? report.error ?? 'no message'}\n` +
      `  Report: ${path.relative(ROOT, reportPath)}`,
    1,
  );
}

// ─── grammar + readiness, measured on what was actually produced ──────────

if (existsSync(path.join(outDir, 'dist/client/index.html'))) {
  const { structuralFingerprint } = await import('../lib/fingerprint.mjs');
  // V3 — the current profile. V2 could not represent a comparison table whose
  // closing row pairs a tick with a value, which is what the first real landing
  // produced and what this smoke exists to catch.
  const { FIXED_GRAMMAR_V3: FIXED_GRAMMAR, FIXED_OPTIONAL_SLOTS_V3: FIXED_OPTIONAL_SLOTS } =
    await import('../lib/fixed-grammar-v3.mjs');
  const { readFileSync } = await import('node:fs');
  const fp = structuralFingerprint(
    readFileSync(path.join(outDir, 'dist/client/index.html'), 'utf-8'),
    FIXED_GRAMMAR,
    FIXED_OPTIONAL_SLOTS,
  );
  report.grammar = { hash: fp.hash, elements: fp.elements };
}

const readiness = spawnSync(process.execPath, [path.join(ROOT, 'scripts/check-readiness.mjs'), outDir], {
  cwd: ROOT,
  encoding: 'utf-8',
});
report.readiness = { ok: readiness.status === 0, output: readiness.stdout?.trim() ?? '' };
report.outputPath = path.relative(ROOT, outDir);
persist();

console.log('');
for (const s of report.stages) {
  console.log(`  ✓ ${s.name.padEnd(10)} ${s.ms ?? ''}`);
}
console.log('');
console.log(readiness.stdout?.trim() ?? '');
console.log('');
console.log(`  grammar  ${report.grammar ? `${report.grammar.hash.slice(0, 16)}… / ${report.grammar.elements}` : 'not built'}`);
console.log(`  output   ${report.outputPath}`);
console.log(`  report   ${path.relative(ROOT, reportPath)}`);
console.log('');

// A NEW SHAPE IS A REPORT, NEVER AN UPDATE. If a real URL produces a structure
// no profile matches, that is a finding to look at — not a reason to move a
// seal, which is the one thing that would make every earlier phase meaningless.
if (report.grammar) {
  console.log('  NOTE: goldens are never updated from a live run. An unexpected hash is a finding.');
}

console.log(report.readiness.ok ? '✓ live smoke PASSED' : '✗ live smoke produced a landing that is NOT ready');
process.exit(report.readiness.ok ? 0 : 1);

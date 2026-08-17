// Contract test for the "Product Identity + Generation Isolation" change
// (spec #422 domains "product-identity" / "generation-isolation" /
// "content-contract" / "admin-jobs"; design #423 D1-D5; tasks 7.4).
//
// This is a FUNCTIONAL/CONTRACT test, not an anchor pin (spec "Product
// Identity Test Coverage" requirement, added after the owner explicitly
// rejected an anchor-only test during spec/design review). Every describe
// block below exercises REAL code — real spawned scripts, a real
// `archiveScrape()` call, real `collectContentErrors()` — never a mock of
// the behavior under test. It does not touch CLAUDE.md/agents.MD at all.
//
// Covers, end to end:
//   1. productId minting/format used by the real CLI pipeline (product-
//      id.cjs's exhaustive format/uniqueness coverage lives in
//      product-id.test.ts — not duplicated here).
//   2. Full propagation: product.json -> generate-content.mjs -> content.json
//      -> generate-landing.mjs -> .generation.json, same id throughout.
//   3. The D5 6-row ownership matrix at generate-landing.mjs's preflight,
//      including --force NOT bypassing a real mismatch.
//   4. The copy-images ownership gate (images-owner-mismatch).
//   5. The archive ownership gate (archive-ownership-mismatch), using the
//      owner-a/owner-b fixtures prepared for this task.
//   6. The full outputs/{slug}/.generation.json schema, incl. sha256
//      recomputation and the explicit absence of a `flags.reset` field.
//   7. content.json's optional top-level productId format check
//      (product-id-invalid).
//
// Uses real spawnSync/spawn against the real outputs/ dir with reserved
// `zz-pid-*` slugs (gitignored, cleaned in beforeAll/afterAll), mirroring
// contract.generate-landing.test.ts and contract.generate-content.test.ts's
// established style.

import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync, spawn } from 'node:child_process';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

const GEN = path.join(REPO_ROOT, 'scripts/generate-landing.mjs');
const CONTENT_SCRIPT = path.join(REPO_ROOT, 'scripts/generate-content.mjs');
const CONTRACT_MODULE_URL = pathToFileURL(path.join(REPO_ROOT, 'scripts/lib/content-contract.mjs')).href;
const PRODUCT_ID_MODULE_URL = pathToFileURL(path.join(REPO_ROOT, 'scripts/lib/product-id.cjs')).href;

const MINIMAL_CONTENT_PATH = path.join(__dirname, 'fixtures/minimal-content.json');
const minimalContent = JSON.parse(readFileSync(MINIMAL_CONTENT_PATH, 'utf-8'));

const FIXTURES_DIR = path.join(__dirname, 'fixtures/product-identity');
const OWNER_A_DIR = path.join(FIXTURES_DIR, 'owner-a');
const OWNER_B_DIR = path.join(FIXTURES_DIR, 'owner-b');
const OWNER_A_IMAGES = path.join(OWNER_A_DIR, 'images');
const OWNER_A_ID: string = JSON.parse(readFileSync(path.join(OWNER_A_DIR, 'product.json'), 'utf-8')).productId;
const OWNER_B_ID: string = JSON.parse(readFileSync(path.join(OWNER_B_DIR, 'product.json'), 'utf-8')).productId;

const DUMMY_GEMINI_KEY = 'zz-pid-test-dummy-gemini-key';

// --- reserved slugs (zz- prefix, gitignored outputs/*, cleaned below) -----

const SLUG_MALFORMED_ARG = 'zz-pid-malformed-arg';
const SLUG_MANUAL_LINEAGE = 'zz-pid-manual-lineage';
const SLUG_PROPAGATION = 'zz-pid-propagation';
const SLUG_ROW1_FRESH_SCRAPED = 'zz-pid-row1-fresh-scraped';
const SLUG_ROW2_FRESH_LEGACY = 'zz-pid-row2-fresh-legacy';
const SLUG_ROW3_ADOPT_UNMANAGED = 'zz-pid-row3-adopt-unmanaged';
const SLUG_ROW4_SAME_ID_REGEN = 'zz-pid-row4-same-id-regen';
const SLUG_ROW5_MISMATCH = 'zz-pid-row5-mismatch';
const SLUG_ROW6_PRESERVE_EXISTING = 'zz-pid-row6-preserve-existing';
const SLUG_IMAGES_MISMATCH = 'zz-pid-images-mismatch';
const SLUG_MANIFEST_SCHEMA = 'zz-pid-manifest-schema';

const ALL_SLUGS = [
  SLUG_MALFORMED_ARG,
  SLUG_MANUAL_LINEAGE,
  SLUG_PROPAGATION,
  SLUG_ROW1_FRESH_SCRAPED,
  SLUG_ROW2_FRESH_LEGACY,
  SLUG_ROW3_ADOPT_UNMANAGED,
  SLUG_ROW4_SAME_ID_REGEN,
  SLUG_ROW5_MISMATCH,
  SLUG_ROW6_PRESERVE_EXISTING,
  SLUG_IMAGES_MISMATCH,
  SLUG_MANIFEST_SCHEMA,
];

function cleanOutDirs() {
  for (const slug of ALL_SLUGS) {
    rmSync(path.join(REPO_ROOT, 'outputs', slug), { recursive: true, force: true });
  }
}

const tmpDirs: string[] = [];
function reserveTmpDir(prefix: string): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}

beforeAll(cleanOutDirs);
afterAll(() => {
  cleanOutDirs();
  for (const dir of tmpDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

// --- helpers ----------------------------------------------------------------

async function loadProductId() {
  return import(PRODUCT_ID_MODULE_URL);
}

async function loadContract() {
  return import(CONTRACT_MODULE_URL);
}

function writeContentFixture(overrides: Record<string, unknown> = {}): string {
  const dir = reserveTmpDir('lg-pid-content-');
  const contentPath = path.join(dir, 'content.json');
  const data = { ...JSON.parse(JSON.stringify(minimalContent)), ...overrides };
  writeFileSync(contentPath, JSON.stringify(data));
  return contentPath;
}

/** Always runs with LG_EVENTS=1 so stage/error codes are inspectable — Group
 * B of contract.generate-landing.test.ts already proves stdout stays
 * byte-identical with LG_EVENTS on, so this does not change what we assert
 * on stdout/manifest, only what we can additionally read from stderr. */
function runGen(slug: string, contentPath: string, extraArgs: string[] = []) {
  return spawnSync(
    process.execPath,
    [GEN, '--slug', slug, '--content', contentPath, ...extraArgs],
    { cwd: REPO_ROOT, encoding: 'utf8', env: { ...process.env, LG_EVENTS: '1' } },
  );
}

function extractEvents(stderr: string): Array<Record<string, any>> {
  return stderr
    .split('\n')
    .filter((l) => l.startsWith('{"lg":1,'))
    .map((l) => JSON.parse(l));
}

function readManifest(slug: string): Record<string, any> {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, 'outputs', slug, '.generation.json'), 'utf-8'));
}

// --- Gemini fixture server (mirrors contract.generate-content.test.ts) -----

type FixtureResponse = { status: number; body: unknown };

function startFixtureServer(responses: FixtureResponse[]): Promise<{ port: number; close: () => Promise<void> }> {
  let i = 0;
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const next = responses[Math.min(i, responses.length - 1)];
      i += 1;
      res.writeHead(next.status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(next.body));
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({ port, close: () => new Promise((r) => server.close(() => r())) });
    });
  });
}

function geminiOk(text: unknown): FixtureResponse {
  return {
    status: 200,
    body: {
      candidates: [{ content: { parts: [{ text: JSON.stringify(text) }] }, finishReason: 'STOP' }],
      usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 200, totalTokenCount: 300 },
    },
  };
}

type RunResult = { status: number | null; stdout: string; stderr: string };

function runContentScript(opts: {
  productPath: string;
  attemptsDir: string;
  stagedPath: string;
  baseUrl: string;
}): Promise<RunResult> {
  const args = [
    CONTENT_SCRIPT,
    '--product',
    opts.productPath,
    '--attempts-dir',
    opts.attemptsDir,
    '--staged',
    opts.stagedPath,
    '--model',
    'gemini-2.5-flash',
  ];
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    LG_EVENTS: '1',
    GEMINI_BASE_URL: opts.baseUrl,
    GEMINI_API_KEY: DUMMY_GEMINI_KEY,
  };
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { cwd: REPO_ROOT, env });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

// --- Group 1 — the real pipeline mints/validates productId ------------------
// (exhaustive format/sortability/uniqueness coverage lives in
// product-id.test.ts; here we confirm the REAL CLI enforces/propagates it.)

describe('Group 1 — real pipeline uses product-id.cjs correctly', () => {
  test('a malformed --product-id is rejected by the real CLI before any file is written', () => {
    const contentPath = writeContentFixture();
    const r = runGen(SLUG_MALFORMED_ARG, contentPath, ['--product-id', 'not-a-valid-id']);

    expect(r.status).toBe(1);
    expect(r.stderr).toContain('is not a valid productId');
    expect(existsSync(path.join(REPO_ROOT, 'outputs', SLUG_MALFORMED_ARG))).toBe(false);
  });

  test('a well-formed --product-id, with no content.json productId, propagates into .generation.json as lineage "manual"', async () => {
    const { isProductId } = await loadProductId();
    const pinnedId = 'prd_manualpi-33333333';
    expect(isProductId(pinnedId)).toBe(true);

    const contentPath = writeContentFixture();
    const r = runGen(SLUG_MANUAL_LINEAGE, contentPath, ['--product-id', pinnedId]);

    expect(r.status).toBe(0);
    const manifest = readManifest(SLUG_MANUAL_LINEAGE);
    expect(manifest.productId).toBe(pinnedId);
    expect(manifest.lineage).toBe('manual');
  });
});

// --- Group 2 — end-to-end propagation via the real scripts -----------------

describe('Group 2 — end-to-end productId propagation (design "Full pipeline run" scenario)', () => {
  test('a minted productId survives product.json -> generate-content.mjs -> content.json -> generate-landing.mjs -> .generation.json unmodified', async () => {
    const { newProductId } = await loadProductId();
    const mintedId = newProductId();

    const productDir = reserveTmpDir('lg-pid-product-');
    const productPath = path.join(productDir, 'product.json');
    const productJson = {
      title: 'Propagation Fixture Product',
      description: 'A fixture product for end-to-end productId propagation (task 7.4).',
      productId: mintedId,
      sourceUrl: 'https://example.com/item/99999',
      itemId: '99999',
      scrapedAt: '2026-08-16T12:00:00.000Z',
      scrapeJobId: 'job-scrape-propagation-0001',
    };
    writeFileSync(productPath, JSON.stringify(productJson));

    const attemptsDir = reserveTmpDir('lg-pid-attempts-');
    const stagedPath = path.join(reserveTmpDir('lg-pid-staged-'), 'content.json');

    const fixture = await startFixtureServer([geminiOk(minimalContent)]);
    let contentRun: RunResult;
    try {
      contentRun = await runContentScript({
        productPath,
        attemptsDir,
        stagedPath,
        baseUrl: `http://127.0.0.1:${fixture.port}`,
      });
    } finally {
      await fixture.close();
    }
    expect(contentRun.status).toBe(0);

    expect(existsSync(stagedPath)).toBe(true);
    const stagedContent = JSON.parse(readFileSync(stagedPath, 'utf-8'));
    // productId never reaches the model, but IS re-stamped from product.json
    // after the retry loop (design D2) — same id, not re-derived.
    expect(stagedContent.productId).toBe(mintedId);
    expect(stagedContent.provenance).toMatchObject({
      sourceUrl: productJson.sourceUrl,
      itemId: productJson.itemId,
      scrapedAt: productJson.scrapedAt,
      scrapeJobId: productJson.scrapeJobId,
      contentModel: 'gemini-2.5-flash',
    });
    expect(typeof stagedContent.provenance.contentAt).toBe('string');

    const genResult = runGen(SLUG_PROPAGATION, stagedPath);
    expect(genResult.status).toBe(0);

    const manifest = readManifest(SLUG_PROPAGATION);
    expect(manifest.productId).toBe(mintedId);
    expect(manifest.sourceUrl).toBe(productJson.sourceUrl);
    expect(manifest.itemId).toBe(productJson.itemId);
    expect(manifest.jobs.scrape).toBe(productJson.scrapeJobId);
    expect(manifest.timestamps.scrapedAt).toBe(productJson.scrapedAt);
    expect(manifest.lineage).toBe('scraped');
  }, 15_000);
});

// --- Group 3 — D5 six-row ownership matrix at generate-landing.mjs preflight

describe('Group 3 — D5 preflight ownership matrix (design table, 6 rows)', () => {
  const ROW_PID_A = 'prd_row0001a-11111111';
  const ROW_PID_B = 'prd_row0002b-22222222';

  test('row 1: content.productId present, dir absent -> fresh; lineage "scraped"', () => {
    const contentPath = writeContentFixture({ productId: ROW_PID_A });
    const r = runGen(SLUG_ROW1_FRESH_SCRAPED, contentPath);

    expect(r.status).toBe(0);
    const manifest = readManifest(SLUG_ROW1_FRESH_SCRAPED);
    expect(manifest.productId).toBe(ROW_PID_A);
    expect(manifest.lineage).toBe('scraped');
  });

  test('row 2: content.productId absent, dir absent -> proceeds; productId:null, lineage "legacy"', () => {
    const contentPath = writeContentFixture();
    const r = runGen(SLUG_ROW2_FRESH_LEGACY, contentPath);

    expect(r.status).toBe(0);
    const manifest = readManifest(SLUG_ROW2_FRESH_LEGACY);
    expect(manifest.productId).toBeNull();
    expect(manifest.lineage).toBe('legacy');
  });

  test('row 3: content.productId present, dir exists, manifest absent -> warns "adopting unmanaged", --force still required, manifest written', () => {
    const outDir = path.join(REPO_ROOT, 'outputs', SLUG_ROW3_ADOPT_UNMANAGED);
    mkdirSync(outDir, { recursive: true });
    writeFileSync(path.join(outDir, 'unmanaged-marker.txt'), 'pre-existing, no .generation.json');

    const contentPath = writeContentFixture({ productId: ROW_PID_A });

    // without --force, the unchanged preflight dir-exists gate still blocks.
    const noForce = runGen(SLUG_ROW3_ADOPT_UNMANAGED, contentPath);
    expect(noForce.status).toBe(1);
    expect(noForce.stderr).toContain('already exists. Use --force to overwrite.');

    const withForce = runGen(SLUG_ROW3_ADOPT_UNMANAGED, contentPath, ['--force']);
    expect(withForce.status).toBe(0);
    expect(withForce.stderr).toContain(`adopting unmanaged outputs/${SLUG_ROW3_ADOPT_UNMANAGED}`);

    const manifest = readManifest(SLUG_ROW3_ADOPT_UNMANAGED);
    expect(manifest.productId).toBe(ROW_PID_A);
    expect(manifest.lineage).toBe('scraped');
  });

  test('row 4: content.productId present, dir exists, manifest has the SAME id -> unchanged --force regen semantics', () => {
    const contentPath = writeContentFixture({ productId: ROW_PID_A });
    const first = runGen(SLUG_ROW4_SAME_ID_REGEN, contentPath);
    expect(first.status).toBe(0);

    const second = runGen(SLUG_ROW4_SAME_ID_REGEN, contentPath, ['--force']);
    expect(second.status).toBe(0);

    const manifest = readManifest(SLUG_ROW4_SAME_ID_REGEN);
    expect(manifest.productId).toBe(ROW_PID_A);
    expect(manifest.lineage).toBe('scraped');
  });

  test('row 5: content.productId present, dir exists, manifest has a DIFFERENT id -> FAIL-CLOSED "generation-owner-mismatch", --force does NOT bypass, no file changes', () => {
    const firstContent = writeContentFixture({ productId: ROW_PID_A });
    const first = runGen(SLUG_ROW5_MISMATCH, firstContent);
    expect(first.status).toBe(0);
    const manifestBefore = readManifest(SLUG_ROW5_MISMATCH);

    const secondContent = writeContentFixture({ productId: ROW_PID_B });
    const second = runGen(SLUG_ROW5_MISMATCH, secondContent, ['--force']);

    expect(second.status).toBe(1);
    const events = extractEvents(second.stderr);
    const errorEvent = events.find((e) => e.type === 'error');
    expect(errorEvent?.data.code).toBe('generation-owner-mismatch');
    expect(second.stderr).toContain('This cannot be bypassed with --force.');

    // no partial overwrite — the manifest on disk is byte-identical to before
    // the blocked attempt.
    const manifestAfter = readManifest(SLUG_ROW5_MISMATCH);
    expect(manifestAfter).toEqual(manifestBefore);
    expect(manifestAfter.productId).toBe(ROW_PID_A);
  });

  test('row 6: content.productId absent, dir exists, manifest has a known id -> warns loudly, --force required, existing productId+lineage PRESERVED', () => {
    const firstContent = writeContentFixture({ productId: ROW_PID_A });
    const first = runGen(SLUG_ROW6_PRESERVE_EXISTING, firstContent);
    expect(first.status).toBe(0);

    const secondContent = writeContentFixture(); // no productId — untagged
    const second = runGen(SLUG_ROW6_PRESERVE_EXISTING, secondContent, ['--force']);

    expect(second.status).toBe(0);
    expect(second.stderr).toContain('the existing identity will be preserved');

    const manifest = readManifest(SLUG_ROW6_PRESERVE_EXISTING);
    expect(manifest.productId).toBe(ROW_PID_A);
    expect(manifest.lineage).toBe('scraped');
  });
});

// --- Group 4 — copy-images ownership gate (design D4 guard #1) -------------

describe('Group 4 — copy-images ownership gate (images-owner-mismatch)', () => {
  test('a foreign --images dir (owner-a fixture) is refused when content.json belongs to a different productId (owner-b)', () => {
    const contentPath = writeContentFixture({ productId: OWNER_B_ID });
    const r = runGen(SLUG_IMAGES_MISMATCH, contentPath, ['--images', OWNER_A_IMAGES]);

    expect(r.status).toBe(1);
    const events = extractEvents(r.stderr);
    const errorEvent = events.find((e) => e.type === 'error');
    expect(errorEvent?.stage).toBe('copy-images');
    expect(errorEvent?.data.code).toBe('images-owner-mismatch');

    // nothing from owner-a's images was copied in — the asset key still
    // holds the template's own stock photo, not the foreign fixture bytes.
    const destFile = path.join(REPO_ROOT, 'outputs', SLUG_IMAGES_MISMATCH, 'src/assets/product/gallery-01.jpg');
    const templateFile = path.join(REPO_ROOT, 'content/landing-base/src/assets/product/gallery-01.jpg');
    expect(readFileSync(destFile).equals(readFileSync(templateFile))).toBe(true);
    expect(readFileSync(destFile).equals(readFileSync(path.join(OWNER_A_IMAGES, 'gallery-01.jpg')))).toBe(false);
  });
});

// --- Group 5 — archive ownership gate (design D3 Layer 2), via the real ----
// archiveScrape(), using the owner-a/owner-b fixtures prepared for this task.

describe('Group 5 — archiveScrape() ownership gate, exercised via the owner-a/owner-b fixtures', () => {
  test('FAIL-CLOSED: archiving owner-b\'s output while expecting owner-a\'s productId returns archive-ownership-mismatch', async () => {
    const { archiveScrape } = await import('../src/server/jobs/archive');
    const jobsDir = reserveTmpDir('lg-pid-archive-jobs-');

    const result = archiveScrape('zz-pid-archive-mismatch', {
      srcDir: OWNER_B_DIR,
      jobsDir,
      expectedProductId: OWNER_A_ID,
    });

    expect(result.ok).toBe(false);
    if (!result.ok && result.fatal) {
      expect(result.code).toBe('archive-ownership-mismatch');
      expect(result.expected).toBe(OWNER_A_ID);
      expect(result.found).toBe(OWNER_B_ID);
    } else {
      throw new Error('expected a fatal ownership-mismatch result');
    }
    expect(existsSync(path.join(jobsDir, 'zz-pid-archive-mismatch', 'scrape'))).toBe(false);
  });

  test('ok path: archiving owner-a\'s own output while expecting owner-a\'s productId succeeds and copies its images', async () => {
    const { archiveScrape } = await import('../src/server/jobs/archive');
    const jobsDir = reserveTmpDir('lg-pid-archive-jobs-');

    const result = archiveScrape('zz-pid-archive-match', {
      srcDir: OWNER_A_DIR,
      jobsDir,
      expectedProductId: OWNER_A_ID,
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.productId).toBe(OWNER_A_ID);
    expect(existsSync(path.join(jobsDir, 'zz-pid-archive-match', 'scrape', 'images', 'gallery-01.jpg'))).toBe(true);
  });
});

// --- Group 6 — full .generation.json schema, incl. sha256 recomputation ----

describe('Group 6 — outputs/{slug}/.generation.json full schema (design #423 Interfaces)', () => {
  test('every documented field is present with the correct shape, assets[] sha256 recomputes, and flags has NO reset key', () => {
    const contentPath = writeContentFixture({
      productId: OWNER_A_ID,
      provenance: {
        sourceUrl: 'https://example.com/item/owner-a',
        itemId: 'owner-a-item',
        scrapedAt: '2026-08-16T10:00:00.000Z',
        scrapeJobId: 'job-scrape-owner-a-0001',
        contentModel: 'gemini-2.5-flash',
        contentAt: '2026-08-16T10:05:00.000Z',
      },
    });

    const r = runGen(SLUG_MANIFEST_SCHEMA, contentPath, ['--images', OWNER_A_IMAGES]);
    expect(r.status).toBe(0);

    const manifest = readManifest(SLUG_MANIFEST_SCHEMA);

    expect(manifest.schema).toBe(1);
    expect(manifest.productId).toBe(OWNER_A_ID);
    expect(manifest.slug).toBe(SLUG_MANIFEST_SCHEMA);
    expect(manifest.lineage).toBe('scraped');
    expect(manifest.sourceUrl).toBe('https://example.com/item/owner-a');
    expect(manifest.itemId).toBe('owner-a-item');
    expect(manifest.productName).toBe(minimalContent.product.name);

    expect(manifest.jobs).toEqual({ scrape: 'job-scrape-owner-a-0001', content: null, generate: null });

    expect(manifest.timestamps.scrapedAt).toBe('2026-08-16T10:00:00.000Z');
    expect(manifest.timestamps.contentAt).toBe('2026-08-16T10:05:00.000Z');
    expect(typeof manifest.timestamps.generatedAt).toBe('string');
    expect(new Date(manifest.timestamps.generatedAt).toISOString()).toBe(manifest.timestamps.generatedAt);

    expect(Array.isArray(manifest.assets)).toBe(true);
    expect(manifest.assets.length).toBe(1);
    const asset = manifest.assets[0];
    expect(asset.src).toBe('gallery-01.jpg');
    expect(asset.dest).toBe('gallery-01.jpg');
    const realBytes = readFileSync(path.join(OWNER_A_IMAGES, 'gallery-01.jpg'));
    expect(asset.bytes).toBe(realBytes.length);
    expect(asset.sha256).toBe(createHash('sha256').update(realBytes).digest('hex'));

    expect(manifest.assetsSourceDir).toBe(path.resolve(OWNER_A_IMAGES));
    expect(manifest.assetsUnmatched).toEqual([]);

    expect(manifest.template).toMatchObject({ dir: 'content/landing-base' });
    expect(manifest.template.commit === null || typeof manifest.template.commit === 'string').toBe(true);

    expect(manifest.generator).toEqual({ script: 'scripts/generate-landing.mjs', schema: 1 });

    // Design D4/Open Questions: no `--reset` flag exists in this phase, and
    // `flags` therefore has EXACTLY `{force}` — no `reset` key anywhere.
    expect(Object.keys(manifest.flags).sort()).toEqual(['force']);
    expect(manifest.flags.force).toBe(false);
    expect(manifest.flags).not.toHaveProperty('reset');
  });
});

// --- Group 7 — content.json optional top-level productId format check -----

describe('Group 7 — content-contract.mjs productId format check (product-id-invalid)', () => {
  test('absent productId is never an error', async () => {
    const { collectContentErrors } = await loadContract();
    expect(collectContentErrors(minimalContent)).toEqual([]);
  });

  test('a well-formed top-level productId passes validation unchanged', async () => {
    const { collectContentErrors } = await loadContract();
    const withId = { ...minimalContent, productId: OWNER_A_ID };
    expect(collectContentErrors(withId)).toEqual([]);
  });

  test('a malformed top-level productId is rejected with code product-id-invalid, byte-identical message', async () => {
    const { collectContentErrors } = await loadContract();
    const malformed = { ...minimalContent, productId: 'not-a-valid-id' };
    const issues = collectContentErrors(malformed);
    expect(issues[0]).toMatchObject({
      code: 'product-id-invalid',
      path: 'productId',
      message:
        'content.json "productId" is present but invalid: expected format prd_{base36ts}-{rand8}, got "not-a-valid-id"',
    });
  });
});

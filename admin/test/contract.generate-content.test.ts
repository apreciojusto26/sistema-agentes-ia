// Contract test for scripts/generate-content.mjs (spec "Self-Correction
// Retry Loop", "Daily Quota Exhaustion", "Output Parsing", "Attempt
// Persistence", "Gemini API Key Transport Hygiene", "Content Job Kind and
// Process Topology"; design addendum §6 T2, §7 J3).
//
// Mirrors contract.generate-landing.test.ts's real-spawnSync pattern.
// Gemini is replaced by a local node:http fixture server, wired in via the
// GEMINI_BASE_URL env override (accepted risk, design J3 — production
// callers, i.e. buildContentSpec, never set this env var).
import { describe, test, expect, afterAll } from 'vitest';
import { spawn } from 'node:child_process';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// Named ESM export of the script under test (product-normalizer-wiring design
// ADR-4) — safe to import directly: generate-content.mjs only ever runs
// main() when `import.meta.url === pathToFileURL(process.argv[1]).href`,
// which is never true when imported by vitest.
import { stripProvenance } from '../../scripts/generate-content.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts/generate-content.mjs');
const MINIMAL_CONTENT_PATH = path.join(__dirname, 'fixtures/minimal-content.json');
const minimalContent = JSON.parse(readFileSync(MINIMAL_CONTENT_PATH, 'utf8'));

const DUMMY_KEY = 'zz-test-dummy-gemini-key-12345';
// Matches scripts/lib/product-id.cjs's PRODUCT_ID_RE
// (/^prd_[0-9a-z]{6,12}-[0-9a-f]{8}$/) — a literal fixture value, not minted
// via newProductId(), since these tests only need a format-valid id, not a
// freshly-minted one.
const FIXTURE_PRODUCT_ID = 'prd_lz1x9k2-a1b2c3d4';

const tmpDirs: string[] = [];
afterAll(() => {
  for (const dir of tmpDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function reserveTmpDir(prefix: string): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}

type CanonicalProductFixtureOverrides = {
  productId?: string | null;
  sourceUrl?: string | null;
  sourceItemId?: string | null;
  scrapedAt?: string | null;
  scrapeJobId?: string | null;
};

// Canonical Product shape (scripts/lib/product-normalizer.mjs, frozen #436),
// the input contract generate-content.mjs now consumes per the
// product-normalizer-wiring rewrite (design "Rewrite of
// scripts/generate-content.mjs"). Identity/provenance ids default to `null`
// (the D2 "normalizer always nulls sourceItemId/scrapeJobId" case) but are
// overridable per-test to exercise the re-stamp/strip paths explicitly.
function buildCanonicalProductFixture(overrides: CanonicalProductFixtureOverrides = {}) {
  return {
    identity: {
      productId: overrides.productId ?? null,
      sourceUrl: overrides.sourceUrl ?? 'https://example.com/products/fixture',
      sourceItemId: overrides.sourceItemId ?? null,
      name: 'Fixture Product',
      brand: 'Fixture Brand',
    },
    commerceFacts: { variantOptions: [] },
    socialProof: { rating: null, reviewCount: null, reviews: [] },
    media: { images: [], videos: [] },
    specifications: [],
    description: { raw: 'A fixture product for testing.' },
    provenance: {
      scrapedAt: overrides.scrapedAt ?? '2026-08-01T00:00:00.000Z',
      scrapeJobId: overrides.scrapeJobId ?? null,
    },
  };
}

function writeProductFixture(overrides: CanonicalProductFixtureOverrides = {}): string {
  const dir = reserveTmpDir('lg-content-product-');
  const productPath = path.join(dir, 'product.json');
  writeFileSync(productPath, JSON.stringify(buildCanonicalProductFixture(overrides)));
  return productPath;
}

/** Pulls the JSON payload back out of the `<scraped-data id="...">...</scraped-data
 * id="...">` block built by wrapScrapedData() so a test can assert on the
 * actual structured object Gemini receives, not just raw substrings. */
function extractScrapedData(promptText: string): any {
  const match = promptText.match(/<scraped-data id="[0-9a-f]+">\n([\s\S]*?)\n<\/scraped-data/);
  if (!match) throw new Error('scraped-data block not found in prompt text');
  return JSON.parse(match[1]);
}

type FixtureResponse = { status: number; body: unknown; delayMs?: number };

/** Each POST consumes the next configured response (repeats the last one if
 * more requests arrive than configured — defensive, should not happen in a
 * well-formed test case). */
function startFixtureServer(responses: FixtureResponse[]): Promise<{ port: number; close: () => Promise<void>; requestBodies: string[] }> {
  const requestBodies: string[] = [];
  let i = 0;
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      requestBodies.push(Buffer.concat(chunks).toString('utf8'));
      const next = responses[Math.min(i, responses.length - 1)];
      i += 1;
      const send = () => {
        res.writeHead(next.status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(next.body));
      };
      if (next.delayMs) setTimeout(send, next.delayMs);
      else send();
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        port,
        requestBodies,
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}

function geminiOk(text: unknown, usage: Record<string, number> = {}): FixtureResponse {
  return {
    status: 200,
    body: {
      candidates: [{ content: { parts: [{ text: JSON.stringify(text) }] }, finishReason: 'STOP' }],
      usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 200, totalTokenCount: 300, ...usage },
    },
  };
}

type RunResult = { status: number | null; stdout: string; stderr: string; signal: NodeJS.Signals | null };

/**
 * Deliberately async `spawn`, NOT `spawnSync` — the fixture HTTP server runs
 * IN THIS SAME PROCESS (vitest worker). `spawnSync` blocks the entire event
 * loop until the child exits, which would starve the fixture server of the
 * chance to ever accept/answer the child's request — a real deadlock caught
 * during authoring (child hangs forever waiting on a server that can never
 * run). `contract.generate-landing.test.ts` can safely use `spawnSync`
 * because it depends on no concurrently-running in-process server.
 */
function runScript(opts: {
  attemptsDir: string;
  stagedPath: string;
  baseUrl: string;
  productPath?: string;
  apiKey?: string | null;
}): Promise<RunResult> {
  const productPath = opts.productPath ?? writeProductFixture();
  const args = [
    SCRIPT,
    '--product',
    productPath,
    '--attempts-dir',
    opts.attemptsDir,
    '--staged',
    opts.stagedPath,
    '--model',
    'gemini-2.5-flash',
  ];
  const env: NodeJS.ProcessEnv = { ...process.env, LG_EVENTS: '1', GEMINI_BASE_URL: opts.baseUrl };
  if (opts.apiKey !== null) env.GEMINI_API_KEY = opts.apiKey ?? DUMMY_KEY;
  else delete env.GEMINI_API_KEY;

  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { cwd: REPO_ROOT, env });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('close', (status, signal) => resolve({ status, stdout, stderr, signal }));
  });
}

function parseEvents(stderr: string): Array<Record<string, any>> {
  return stderr
    .split('\n')
    .filter((l) => l.startsWith('{"lg":1,'))
    .map((l) => JSON.parse(l));
}

function grepFilesForSecret(dir: string, secret: string): string[] {
  if (!existsSync(dir)) return [];
  const offenders: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (readFileSync(full, 'utf8').includes(secret)) offenders.push(entry);
  }
  return offenders;
}

describe('Group 1 — successful first attempt', () => {
  test('exactly 1 Gemini call, stage sequence is prepare -> generate -> save, .staged/content.json written', async () => {
    const fixture = await startFixtureServer([geminiOk(minimalContent)]);
    const attemptsDir = reserveTmpDir('lg-content-attempts-');
    const stagedPath = path.join(reserveTmpDir('lg-content-staged-'), 'content.json');

    try {
      const r = await runScript({ attemptsDir, stagedPath, baseUrl: `http://127.0.0.1:${fixture.port}` });

      expect(r.status).toBe(0);
      const events = parseEvents(r.stderr);
      expect(events.filter((e) => e.type === 'stage.start').map((e) => e.stage)).toEqual(['prepare', 'generate', 'save']);
      expect(events.filter((e) => e.type === 'stage.end').map((e) => e.stage)).toEqual(['prepare', 'generate', 'save']);

      expect(fixture.requestBodies.length).toBe(1);
      expect(existsSync(stagedPath)).toBe(true);
      // The staged file is the model's output with the PROJECTED facts stamped
      // over it, so it is no longer byte-equal to what the fixture returned.
      // ratingAverage / ratingCount come from the canonical product's
      // socialProof, not from Gemini — it is not asked for them and its values
      // are overwritten if it writes any.
      const staged = JSON.parse(readFileSync(stagedPath, 'utf8'));
      const canonical = buildCanonicalProductFixture();
      expect(staged.product.ratingAverage).toBe(canonical.socialProof?.rating ?? null);
      expect(staged.product.ratingCount).toBe(canonical.socialProof?.reviewCount ?? null);
      expect(staged).toEqual({
        ...minimalContent,
        product: {
          ...minimalContent.product,
          ratingAverage: staged.product.ratingAverage,
          ratingCount: staged.product.ratingCount,
        },
      });

      const resultEvent = events.find((e) => e.type === 'result');
      expect(resultEvent).toBeDefined();
      expect(resultEvent!.data.turns).toBe(1);
      expect(resultEvent!.data.totalTokenCount).toBe(300);
      expect(resultEvent!.data).not.toHaveProperty('costUsd');
      expect(resultEvent!.data).not.toHaveProperty('quotaRemaining');

      expect(existsSync(path.join(attemptsDir, 'attempt-1.json'))).toBe(true);
      expect(existsSync(path.join(attemptsDir, 'attempt-2.json'))).toBe(false);
    } finally {
      await fixture.close();
    }
  });
});

describe('Group 2 — correction converges within the 3-call cap', () => {
  test('attempt 1 invalid (missing required field), attempt 2 valid -> succeeds with turns=2, "2 de 3" progress emitted', async () => {
    const { brand: _brand, ...productWithoutBrand } = minimalContent.product;
    const invalidPayload = { ...minimalContent, product: productWithoutBrand };

    const fixture = await startFixtureServer([geminiOk(invalidPayload), geminiOk(minimalContent)]);
    const attemptsDir = reserveTmpDir('lg-content-attempts-');
    const stagedPath = path.join(reserveTmpDir('lg-content-staged-'), 'content.json');

    try {
      const r = await runScript({ attemptsDir, stagedPath, baseUrl: `http://127.0.0.1:${fixture.port}` });

      expect(r.status).toBe(0);
      const events = parseEvents(r.stderr);
      const resultEvent = events.find((e) => e.type === 'result');
      expect(resultEvent!.data.turns).toBe(2);
      expect(fixture.requestBodies.length).toBe(2);

      const progressEvents = events.filter((e) => e.type === 'progress');
      expect(progressEvents.some((e) => e.data.done === 2 && e.data.total === 3)).toBe(true);

      const attempt1 = JSON.parse(readFileSync(path.join(attemptsDir, 'attempt-1.json'), 'utf8'));
      expect(attempt1.diagnosis).toBe('invalid');
      expect(attempt1.issues.length).toBeGreaterThan(0);

      expect(existsSync(stagedPath)).toBe(true);
    } finally {
      await fixture.close();
    }
  });
});

describe('Group 3 — cap exhausted fails honestly', () => {
  test('3 consecutive invalid attempts -> exit 1, code content-cap-exhausted, .staged/content.json NOT written', async () => {
    const { brand: _brand, ...productWithoutBrand } = minimalContent.product;
    const invalidPayload = { ...minimalContent, product: productWithoutBrand };
    const fixture = await startFixtureServer([geminiOk(invalidPayload), geminiOk(invalidPayload), geminiOk(invalidPayload)]);
    const attemptsDir = reserveTmpDir('lg-content-attempts-');
    const stagedPath = path.join(reserveTmpDir('lg-content-staged-'), 'content.json');

    try {
      const r = await runScript({ attemptsDir, stagedPath, baseUrl: `http://127.0.0.1:${fixture.port}` });

      expect(r.status).toBe(1);
      expect(fixture.requestBodies.length).toBe(3);
      const events = parseEvents(r.stderr);
      const errorEvent = events.find((e) => e.type === 'error');
      expect(errorEvent?.data.code).toBe('content-cap-exhausted');
      expect(existsSync(stagedPath)).toBe(false);

      expect(existsSync(path.join(attemptsDir, 'attempt-1.json'))).toBe(true);
      expect(existsSync(path.join(attemptsDir, 'attempt-2.json'))).toBe(true);
      expect(existsSync(path.join(attemptsDir, 'attempt-3.json'))).toBe(true);
    } finally {
      await fixture.close();
    }
  });
});

describe('Group 4 — distinct failure diagnoses', () => {
  test('non-2xx HTTP transport failure is diagnosed distinctly, exits 1 on attempt 1, no correction attempted', async () => {
    const fixture = await startFixtureServer([{ status: 500, body: { error: { message: 'internal boom' } } }]);
    const attemptsDir = reserveTmpDir('lg-content-attempts-');
    const stagedPath = path.join(reserveTmpDir('lg-content-staged-'), 'content.json');

    try {
      const r = await runScript({ attemptsDir, stagedPath, baseUrl: `http://127.0.0.1:${fixture.port}` });
      expect(r.status).toBe(1);
      expect(fixture.requestBodies.length).toBe(1);
      const events = parseEvents(r.stderr);
      const errorEvent = events.find((e) => e.type === 'error');
      expect(errorEvent?.data.code).toBe('gemini-transport');
      expect(existsSync(stagedPath)).toBe(false);
    } finally {
      await fixture.close();
    }
  });

  test('refusal (blocked, no candidates) is diagnosed distinctly from a transport failure', async () => {
    const fixture = await startFixtureServer([{ status: 200, body: { candidates: [], promptFeedback: { blockReason: 'SAFETY' } } }]);
    const attemptsDir = reserveTmpDir('lg-content-attempts-');
    const stagedPath = path.join(reserveTmpDir('lg-content-staged-'), 'content.json');

    try {
      const r = await runScript({ attemptsDir, stagedPath, baseUrl: `http://127.0.0.1:${fixture.port}` });
      expect(r.status).toBe(1);
      const events = parseEvents(r.stderr);
      const errorEvent = events.find((e) => e.type === 'error');
      expect(errorEvent?.data.code).toBe('gemini-refusal');
    } finally {
      await fixture.close();
    }
  });

  test('malformed (non-JSON) model text is diagnosed as unparseable and is correctable, distinct from refusal/transport', async () => {
    const malformed: FixtureResponse = {
      status: 200,
      body: {
        candidates: [{ content: { parts: [{ text: 'this is not json at all' }] }, finishReason: 'STOP' }],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
      },
    };
    const fixture = await startFixtureServer([malformed, geminiOk(minimalContent)]);
    const attemptsDir = reserveTmpDir('lg-content-attempts-');
    const stagedPath = path.join(reserveTmpDir('lg-content-staged-'), 'content.json');

    try {
      const r = await runScript({ attemptsDir, stagedPath, baseUrl: `http://127.0.0.1:${fixture.port}` });
      expect(r.status).toBe(0);
      const attempt1 = JSON.parse(readFileSync(path.join(attemptsDir, 'attempt-1.json'), 'utf8'));
      expect(attempt1.diagnosis).toBe('unparseable');
    } finally {
      await fixture.close();
    }
  });
});

describe('Group 5 — quota exhaustion (429 RESOURCE_EXHAUSTED)', () => {
  test('diagnosed distinctly from transport/validation, does NOT consume a correction attempt, fails immediately', async () => {
    const fixture = await startFixtureServer([{ status: 429, body: { error: { status: 'RESOURCE_EXHAUSTED', message: 'quota' } } }]);
    const attemptsDir = reserveTmpDir('lg-content-attempts-');
    const stagedPath = path.join(reserveTmpDir('lg-content-staged-'), 'content.json');

    try {
      const r = await runScript({ attemptsDir, stagedPath, baseUrl: `http://127.0.0.1:${fixture.port}` });
      expect(r.status).toBe(1);
      expect(fixture.requestBodies.length).toBe(1); // never advanced to attempt 2
      const events = parseEvents(r.stderr);
      const errorEvent = events.find((e) => e.type === 'error');
      expect(errorEvent?.data.code).toBe('gemini-quota-exhausted');
      expect(existsSync(path.join(attemptsDir, 'attempt-2.json'))).toBe(false);
    } finally {
      await fixture.close();
    }
  });
});

describe('Group 6 — key hygiene', () => {
  test('the API key never appears in log.ndjson-equivalent stderr, attempt files, or stdout', async () => {
    const fixture = await startFixtureServer([geminiOk(minimalContent)]);
    const attemptsDir = reserveTmpDir('lg-content-attempts-');
    const stagedPath = path.join(reserveTmpDir('lg-content-staged-'), 'content.json');

    try {
      const r = await runScript({ attemptsDir, stagedPath, baseUrl: `http://127.0.0.1:${fixture.port}` });
      expect(r.status).toBe(0);
      expect(r.stderr.includes(DUMMY_KEY)).toBe(false);
      expect(r.stdout.includes(DUMMY_KEY)).toBe(false);
      expect(grepFilesForSecret(attemptsDir, DUMMY_KEY)).toEqual([]);
      // The header carrying the key was sent, but never logged anywhere the
      // script itself writes to.
      expect(fixture.requestBodies.join('\n').includes(DUMMY_KEY)).toBe(false);
    } finally {
      await fixture.close();
    }
  });

  test('a missing GEMINI_API_KEY fails loud with the exact repo-convention message, before any Gemini call', async () => {
    const fixture = await startFixtureServer([geminiOk(minimalContent)]);
    const attemptsDir = reserveTmpDir('lg-content-attempts-');
    const stagedPath = path.join(reserveTmpDir('lg-content-staged-'), 'content.json');

    try {
      const r = await runScript({ attemptsDir, stagedPath, baseUrl: `http://127.0.0.1:${fixture.port}`, apiKey: null });
      expect(r.status).toBe(1);
      expect(r.stderr).toContain('Missing GEMINI_API_KEY — server misconfigured');
      expect(fixture.requestBodies.length).toBe(0);
    } finally {
      await fixture.close();
    }
  });
});

describe('Group 7 — cancellation aborts the in-flight fetch', () => {
  test('SIGTERM during a slow Gemini call aborts cleanly, exit code non-zero, no grandchild left behind', async () => {
    const fixture = await startFixtureServer([{ ...geminiOk(minimalContent), delayMs: 2_000 }]);
    const attemptsDir = reserveTmpDir('lg-content-attempts-');
    const stagedPath = path.join(reserveTmpDir('lg-content-staged-'), 'content.json');
    const productPath = writeProductFixture();

    try {
      const args = [
        SCRIPT,
        '--product',
        productPath,
        '--attempts-dir',
        attemptsDir,
        '--staged',
        stagedPath,
        '--model',
        'gemini-2.5-flash',
      ];
      const { spawn } = await import('node:child_process');
      const child = spawn(process.execPath, args, {
        cwd: REPO_ROOT,
        env: { ...process.env, LG_EVENTS: '1', GEMINI_BASE_URL: `http://127.0.0.1:${fixture.port}`, GEMINI_API_KEY: DUMMY_KEY },
      });

      let stderr = '';
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', (d) => (stderr += d));

      const exit = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
        setTimeout(() => child.kill('SIGTERM'), 200);
        child.on('close', (code, signal) => resolve({ code, signal }));
      });

      expect(exit.code === 0).toBe(false);
      const events = parseEvents(stderr);
      const errorEvent = events.find((e) => e.type === 'error');
      expect(errorEvent?.data?.code === 'aborted' || exit.signal !== null).toBe(true);
      expect(existsSync(stagedPath)).toBe(false);
    } finally {
      await fixture.close();
    }
  }, 10_000);
});

describe('Group 8 — canonical product contract (product-normalizer-wiring)', () => {
  test('prompt payload includes identity.name/brand, excludes identity ids and the entire provenance object', async () => {
    const fixture = await startFixtureServer([geminiOk(minimalContent)]);
    const attemptsDir = reserveTmpDir('lg-content-attempts-');
    const stagedPath = path.join(reserveTmpDir('lg-content-staged-'), 'content.json');
    const productPath = writeProductFixture({
      productId: FIXTURE_PRODUCT_ID,
      sourceUrl: 'https://example.com/products/secret-source',
      sourceItemId: 'secret-item-id',
      scrapedAt: '2026-01-01T00:00:00.000Z',
      scrapeJobId: 'secret-scrape-job',
    });

    try {
      const r = await runScript({ attemptsDir, stagedPath, baseUrl: `http://127.0.0.1:${fixture.port}`, productPath });
      expect(r.status).toBe(0);
      expect(fixture.requestBodies.length).toBe(1);

      const requestBody = JSON.parse(fixture.requestBodies[0]);
      const promptText: string = requestBody.contents[0].parts[0].text;
      const scrapedData = extractScrapedData(promptText);

      // identity.name/brand are marketing data — kept.
      expect(scrapedData.identity).toMatchObject({ name: 'Fixture Product', brand: 'Fixture Brand' });

      // identity ids removed as OBJECT KEYS, not merely falsy — `delete`
      // removes the property entirely (ADR-4).
      expect(scrapedData.identity).not.toHaveProperty('productId');
      expect(scrapedData.identity).not.toHaveProperty('sourceUrl');
      expect(scrapedData.identity).not.toHaveProperty('sourceItemId');

      // The entire top-level provenance object is discarded, not just its
      // sub-fields.
      expect(scrapedData).not.toHaveProperty('provenance');

      // Belt-and-braces: none of the stripped VALUES leak anywhere in the
      // raw request body, and the string "provenance" never appears at all.
      expect(promptText).not.toContain(FIXTURE_PRODUCT_ID);
      expect(promptText).not.toContain('secret-source');
      expect(promptText).not.toContain('secret-item-id');
      expect(promptText).not.toContain('secret-scrape-job');
      expect(promptText).not.toContain('provenance');
    } finally {
      await fixture.close();
    }
  });

  test('a valid identity.productId yields content.json.productId + full nested re-stamp; a null one yields neither productId nor provenance', async () => {
    const fixtureA = await startFixtureServer([geminiOk(minimalContent)]);
    const attemptsDirA = reserveTmpDir('lg-content-attempts-');
    const stagedPathA = path.join(reserveTmpDir('lg-content-staged-'), 'content.json');
    const productPathA = writeProductFixture({ productId: FIXTURE_PRODUCT_ID });

    try {
      const rA = await runScript({
        attemptsDir: attemptsDirA,
        stagedPath: stagedPathA,
        baseUrl: `http://127.0.0.1:${fixtureA.port}`,
        productPath: productPathA,
      });
      expect(rA.status).toBe(0);
      const contentA = JSON.parse(readFileSync(stagedPathA, 'utf8'));
      expect(contentA.productId).toBe(FIXTURE_PRODUCT_ID);
      expect(contentA.provenance).toBeDefined();
      expect(contentA.provenance).toMatchObject({
        sourceUrl: 'https://example.com/products/fixture',
        itemId: null,
        scrapedAt: '2026-08-01T00:00:00.000Z',
        scrapeJobId: null,
      });
    } finally {
      await fixtureA.close();
    }

    const fixtureB = await startFixtureServer([geminiOk(minimalContent)]);
    const attemptsDirB = reserveTmpDir('lg-content-attempts-');
    const stagedPathB = path.join(reserveTmpDir('lg-content-staged-'), 'content.json');
    const productPathB = writeProductFixture({ productId: null });

    try {
      const rB = await runScript({
        attemptsDir: attemptsDirB,
        stagedPath: stagedPathB,
        baseUrl: `http://127.0.0.1:${fixtureB.port}`,
        productPath: productPathB,
      });
      expect(rB.status).toBe(0);
      const contentB = JSON.parse(readFileSync(stagedPathB, 'utf8'));
      expect(contentB).not.toHaveProperty('productId');
      expect(contentB).not.toHaveProperty('provenance');
    } finally {
      await fixtureB.close();
    }
  });

  test('D2: identity.sourceItemId / provenance.scrapeJobId are propagated faithfully when present — the script never hardcodes them null, it reads whatever the canonical input carries', async () => {
    const fixture = await startFixtureServer([geminiOk(minimalContent)]);
    const attemptsDir = reserveTmpDir('lg-content-attempts-');
    const stagedPath = path.join(reserveTmpDir('lg-content-staged-'), 'content.json');
    const productPath = writeProductFixture({
      productId: FIXTURE_PRODUCT_ID,
      sourceUrl: 'https://example.com/products/real-item',
      sourceItemId: 'real-item-99',
      scrapedAt: '2026-02-02T00:00:00.000Z',
      scrapeJobId: 'job-real-1',
    });

    try {
      const r = await runScript({ attemptsDir, stagedPath, baseUrl: `http://127.0.0.1:${fixture.port}`, productPath });
      expect(r.status).toBe(0);
      const content = JSON.parse(readFileSync(stagedPath, 'utf8'));
      expect(content.productId).toBe(FIXTURE_PRODUCT_ID);
      expect(content.provenance).toMatchObject({
        sourceUrl: 'https://example.com/products/real-item',
        itemId: 'real-item-99',
        scrapedAt: '2026-02-02T00:00:00.000Z',
        scrapeJobId: 'job-real-1',
      });
      expect(typeof content.provenance.contentModel).toBe('string');
      expect(typeof content.provenance.contentAt).toBe('string');
    } finally {
      await fixture.close();
    }
  });
});

describe('Group 9 — stripProvenance does not mutate its input (design ADR-4)', () => {
  test('the original canonical product object, including its nested identity, is untouched after stripProvenance', () => {
    const original = buildCanonicalProductFixture({
      productId: FIXTURE_PRODUCT_ID,
      sourceUrl: 'https://example.com/products/mutation-check',
      sourceItemId: 'mutation-item',
      scrapedAt: '2026-03-03T00:00:00.000Z',
      scrapeJobId: 'mutation-job',
    });
    const before = structuredClone(original);

    const stripped = stripProvenance(original);

    // The ORIGINAL object is byte-identical to a clone taken before the call
    // — no in-place `delete` on a shared nested reference (the ADR-4 bug).
    expect(original).toEqual(before);
    expect(original.identity).toHaveProperty('productId', FIXTURE_PRODUCT_ID);
    expect(original.identity).toHaveProperty('sourceItemId', 'mutation-item');
    expect(original).toHaveProperty('provenance');

    // The RETURNED value is a fresh object graph, not an alias of the input.
    expect(stripped).not.toBe(original);
    expect(stripped.identity).not.toBe(original.identity);
    expect(stripped.identity).not.toHaveProperty('productId');
    expect(stripped.identity).not.toHaveProperty('sourceUrl');
    expect(stripped.identity).not.toHaveProperty('sourceItemId');
    expect(stripped.identity).toMatchObject({ name: 'Fixture Product', brand: 'Fixture Brand' });
    expect(stripped).not.toHaveProperty('provenance');
  });
});

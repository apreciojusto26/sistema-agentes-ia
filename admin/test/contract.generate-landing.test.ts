// Contract test for scripts/generate-landing.mjs + scripts/lib/content-contract.mjs
// (spec R6 "Shared Content Contract Module").
//
// Group A — legacy CLI behavior with LG_EVENTS unset. This is the byte-for-byte
// regression baseline: it MUST pass unchanged before, during, and after the
// content-contract.mjs extraction (Batch B), and again after the LG_EVENTS
// instrumentation lands (Batch C). Never edit these assertions to make a
// refactor pass — if one of them needs to change, the refactor changed
// observable CLI behavior, which is out of scope.
//
// Group D — scripts/lib/content-contract.mjs unit tests (no spawn). During
// RED (before B2), the module does not exist yet and every Group D test is
// expected to fail — imported dynamically per-test so it never blocks
// Group A from running/passing independently.
//
// Group B — event schema with LG_EVENTS=1 (Batch C, design §4/§8). During
// RED (before C7), generate-landing.mjs is not instrumented yet, so these
// assertions are expected to fail against an unmodified script: stdout stays
// byte-identical to Group A (proven independently either way) but stderr is
// empty instead of carrying the NDJSON event stream.
//
// Group C — failure path. The LG_EVENTS-unset half already lives in Group A
// (invalid content.json). This file additionally covers the LG_EVENTS=1 half
// (Batch C task C6): a typed `error` event carrying ContentContractError's
// `.code`, alongside the UNCHANGED `✗ …` line still present on stderr.
//
// Real outputs/ dir is used (OUTPUTS_DIR is hardcoded in generate-landing.mjs,
// see design §8) with a reserved, gitignored slug; cleaned in beforeAll/afterAll
// so a crashed run self-heals.

import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const GEN = path.join(REPO_ROOT, 'scripts/generate-landing.mjs');
const CONTRACT_MODULE = path.join(REPO_ROOT, 'scripts/lib/content-contract.mjs');
const CONTRACT_MODULE_URL = pathToFileURL(CONTRACT_MODULE).href;

const SLUG = 'zz-contract-test-fixture';
const OUT_DIR = path.join(REPO_ROOT, 'outputs', SLUG);

// Batch C — dedicated slugs for the LG_EVENTS=1 runs so they never collide
// with Group A's run (which is asserted against WITHOUT --force) or with
// each other. All are reserved (`zz-` prefix), gitignored (outputs/*), and
// cleaned in beforeAll/afterAll.
const SLUG_EVENTS = 'zz-contract-test-fixture-events';
const OUT_DIR_EVENTS = path.join(REPO_ROOT, 'outputs', SLUG_EVENTS);
const SLUG_EVENTS_IMAGES = 'zz-contract-test-fixture-events-images';
const OUT_DIR_EVENTS_IMAGES = path.join(REPO_ROOT, 'outputs', SLUG_EVENTS_IMAGES);
// Dedicated slug for the LG_EVENTS-unset "legacy" half of Group B's diff —
// separate from SLUG (Group A's slug, already created without --force by
// the time Group B runs) so this can run fresh with no --force needed.
const SLUG_EVENTS_LEGACY = 'zz-contract-test-fixture-events-legacy';
const OUT_DIR_EVENTS_LEGACY = path.join(REPO_ROOT, 'outputs', SLUG_EVENTS_LEGACY);

const MINIMAL_CONTENT_PATH = path.join(__dirname, 'fixtures/minimal-content.json');
const INVALID_CONTENT_PATH = path.join(__dirname, 'fixtures/invalid-content.json');
const IMAGES_DIR = path.join(__dirname, 'fixtures/images');

const minimalContent = JSON.parse(readFileSync(MINIMAL_CONTENT_PATH, 'utf-8'));
const invalidContent = JSON.parse(readFileSync(INVALID_CONTENT_PATH, 'utf-8'));

function cleanOutDir() {
  rmSync(OUT_DIR, { recursive: true, force: true });
  rmSync(OUT_DIR_EVENTS, { recursive: true, force: true });
  rmSync(OUT_DIR_EVENTS_IMAGES, { recursive: true, force: true });
  rmSync(OUT_DIR_EVENTS_LEGACY, { recursive: true, force: true });
}

beforeAll(cleanOutDir);
afterAll(cleanOutDir);

function runGenerateForSlug(
  slug: string,
  contentPath: string,
  extraArgs: string[] = [],
  envOverride: NodeJS.ProcessEnv = process.env,
) {
  return spawnSync(
    process.execPath,
    [GEN, '--slug', slug, '--content', contentPath, ...extraArgs],
    { cwd: REPO_ROOT, encoding: 'utf8', env: envOverride },
  );
}

function runGenerateWithEvents(slug: string, contentPath: string, extraArgs: string[] = []) {
  return runGenerateForSlug(slug, contentPath, extraArgs, { ...process.env, LG_EVENTS: '1' });
}

/** Parses the "  - {line}" TODO block out of stdout, welding the machine
 * channel (result.data.todos) to the human channel (printed TODO list). */
function parseTodoLinesFromStdout(stdout: string): string[] {
  const marker = '\nTODO before this landing is production-ready:\n';
  const idx = stdout.indexOf(marker);
  if (idx === -1) return [];
  return stdout
    .slice(idx + marker.length)
    .split('\n')
    .filter((l) => l.startsWith('  - '))
    .map((l) => l.slice(4));
}

/** Success path: stderr must be a PURE event stream — asserts the sentinel
 * prefix on every single line before parsing. */
function parseEvents(stderr: string): Array<Record<string, any>> {
  return stderr
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      expect(l.startsWith('{"lg":1,')).toBe(true);
      return JSON.parse(l);
    });
}

/** Error path: stderr is a MIX of NDJSON events and the legacy human `✗ …`
 * line (design §8 Group C — proves the parser must tolerate non-sentinel
 * lines interleaved with events). Only sentinel-prefixed lines are parsed. */
function extractEvents(stderr: string): Array<Record<string, any>> {
  return stderr
    .split('\n')
    .filter((l) => l.startsWith('{"lg":1,'))
    .map((l) => JSON.parse(l));
}

function runGenerate(contentPath: string, extraArgs: string[] = []) {
  return spawnSync(
    process.execPath,
    [GEN, '--slug', SLUG, '--content', contentPath, ...extraArgs],
    { cwd: REPO_ROOT, encoding: 'utf8' },
  );
}

// --- Group A ---------------------------------------------------------------

describe('Group A — legacy CLI behavior (LG_EVENTS unset, byte-for-byte baseline)', () => {
  test('valid content.json creates the landing and prints the unchanged human output', () => {
    const r = runGenerate(MINIMAL_CONTENT_PATH);

    expect(r.status).toBe(0);
    expect(r.stderr).toBe(''); // proves events (once added in Batch C) stay opt-in
    expect(r.stdout).toContain(`✓ outputs/${SLUG} created from content/landing-base`);
    expect(r.stdout).toContain('\nTODO before this landing is production-ready:');
    expect(r.stdout).toContain('  - commerce.shopifyHandle is a placeholder');
    expect(r.stdout).toContain(
      "  - No --images passed — src/assets/product/* still has the base template's stock photos.",
    );

    expect(existsSync(OUT_DIR)).toBe(true);
    const productTs = readFileSync(path.join(OUT_DIR, 'src/data/product.ts'), 'utf-8');
    expect(productTs).toContain("shopifyHandle: 'TODO-provision-in-shared-store'");
    expect(productTs).toContain('as const satisfies Product;');
  });

  test('invalid content.json (unknown product field) fails with the unchanged ✗ message and exit 1', () => {
    const r = runGenerate(INVALID_CONTENT_PATH);

    expect(r.status).toBe(1);
    expect(r.stderr.trim()).toBe(
      '✗ content.json product has fields outside the agent-writable contract: bogusField',
    );
    expect(r.stdout).not.toContain(`✓ outputs/${SLUG} created`);
  });
});

// --- Group B -----------------------------------------------------------------

describe('Group B — event schema (LG_EVENTS=1, Batch C)', () => {
  test('stdout stays byte-identical to the LG_EVENTS-unset run; stderr is a gapless v1 NDJSON stream with the exact stage sequence', () => {
    // Dedicated fresh slug for the "legacy" comparison run (Group A's own
    // slug already has a directory from its own test by the time this
    // runs, and re-running it without --force would fail preflight).
    const legacy = runGenerateForSlug(SLUG_EVENTS_LEGACY, MINIMAL_CONTENT_PATH);
    const withEvents = runGenerateWithEvents(SLUG_EVENTS, MINIMAL_CONTENT_PATH);

    expect(legacy.status).toBe(0);
    expect(withEvents.status).toBe(0);
    // The only textual difference allowed between the two stdout streams is
    // the slug name itself — normalize it away before comparing.
    expect(withEvents.stdout.split(SLUG_EVENTS).join('SLUG')).toBe(
      legacy.stdout.split(SLUG_EVENTS_LEGACY).join('SLUG'),
    );

    const events = parseEvents(withEvents.stderr);
    expect(events.length).toBeGreaterThan(0);

    expect(events.map((e) => e.seq)).toEqual(events.map((_, i) => i + 1));
    expect(new Set(events.map((e) => e.v))).toEqual(new Set([1]));
    expect(new Set(events.map((e) => e.agent))).toEqual(new Set(['generate']));

    expect(events.filter((e) => e.type === 'stage.start').map((e) => e.stage)).toEqual([
      'args',
      'validate',
      'preflight',
      'copy-template',
      'write-data',
      'patch-theme',
      'todos',
    ]);
    // Every stage.start has a matching stage.end (no dangling stage).
    expect(events.filter((e) => e.type === 'stage.end').map((e) => e.stage)).toEqual(
      events.filter((e) => e.type === 'stage.start').map((e) => e.stage),
    );

    const last = events.at(-1);
    expect(last.type).toBe('result');
    expect(last.data.slug).toBe(SLUG_EVENTS);
    expect(last.data.todos).toEqual(parseTodoLinesFromStdout(withEvents.stdout));
  });

  test('--images run additionally emits the copy-images stage', () => {
    const r = runGenerateWithEvents(SLUG_EVENTS_IMAGES, MINIMAL_CONTENT_PATH, ['--images', IMAGES_DIR]);

    expect(r.status).toBe(0);
    const events = parseEvents(r.stderr);
    expect(events.filter((e) => e.type === 'stage.start').map((e) => e.stage)).toEqual([
      'args',
      'validate',
      'preflight',
      'copy-template',
      'write-data',
      'patch-theme',
      'copy-images',
      'todos',
    ]);
  });
});

// --- Group C (events half) ----------------------------------------------------

describe('Group C — failure path with LG_EVENTS=1', () => {
  test('emits a typed error event carrying ContentContractError.code, AND the unchanged ✗ line is still on stderr', () => {
    const r = runGenerateWithEvents(SLUG_EVENTS, INVALID_CONTENT_PATH);

    expect(r.status).toBe(1);
    // The legacy human line must still be present, byte-identical, even
    // though stderr is no longer purely human text — this is the load-
    // bearing proof that the parser must tolerate interleaved text lines.
    expect(r.stderr).toContain(
      '✗ content.json product has fields outside the agent-writable contract: bogusField',
    );

    const events = extractEvents(r.stderr);
    expect(events.length).toBeGreaterThan(0);
    const errorEvent = events.find((e) => e.type === 'error');
    expect(errorEvent).toBeDefined();
    expect(errorEvent.stage).toBe('validate');
    expect(errorEvent.data.code).toBe('product-unknown-fields');
    expect(errorEvent.data.message).toBe(
      'content.json product has fields outside the agent-writable contract: bogusField',
    );
  });
});

// --- Group D -----------------------------------------------------------------

describe('Group D — scripts/lib/content-contract.mjs unit tests (no spawn)', () => {
  async function loadContract() {
    return import(CONTRACT_MODULE_URL);
  }

  test('collectContentErrors returns [] for a valid content.json', async () => {
    const { collectContentErrors } = await loadContract();
    expect(collectContentErrors(minimalContent)).toEqual([]);
  });

  test('validateContent does not throw for a valid content.json', async () => {
    const { validateContent } = await loadContract();
    expect(() => validateContent(minimalContent)).not.toThrow();
  });

  test('collectContentErrors reports the unknown-field issue for the invalid fixture, byte-identical to the legacy message', async () => {
    const { collectContentErrors } = await loadContract();
    const issues = collectContentErrors(invalidContent);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0]).toMatchObject({
      code: 'product-unknown-fields',
      message: 'content.json product has fields outside the agent-writable contract: bogusField',
    });
  });

  test('validateProduct throws ContentContractError with the byte-identical unknown-field message', async () => {
    const { validateProduct, ContentContractError } = await loadContract();
    expect(() => validateProduct(invalidContent.product)).toThrow(ContentContractError);
    try {
      validateProduct(invalidContent.product);
      throw new Error('expected validateProduct to throw');
    } catch (err) {
      expect((err as Error).message).toBe(
        'content.json product has fields outside the agent-writable contract: bogusField',
      );
    }
  });

  test('validateProduct throws the byte-identical commerce-forbidden message', async () => {
    const { validateProduct } = await loadContract();
    const withCommerce = {
      ...minimalContent.product,
      commerce: { shopifyHandle: 'x', bundleOfferActive: false },
    };
    expect(() => validateProduct(withCommerce)).toThrowError(
      'content.json product includes "commerce" — this field is NEVER agent-generated ' +
        '(agents.MD §1: shopifyHandle/bundleOfferActive are provisioned outside the Content Agent). ' +
        'Remove it; the script always injects a placeholder that must be filled in manually.',
    );
  });

  test('validateProduct throws the byte-identical missing-required-fields message', async () => {
    const { validateProduct } = await loadContract();
    const { brand, ...withoutBrand } = minimalContent.product;
    expect(() => validateProduct(withoutBrand)).toThrowError(
      'content.json product is missing required fields: brand',
    );
  });

  test('validateFaq throws the byte-identical not-an-array message', async () => {
    const { validateFaq } = await loadContract();
    expect(() => validateFaq([])).toThrowError('content.json "faq" must be a non-empty array');
  });

  test('validateFaq throws the byte-identical missing-fields message', async () => {
    const { validateFaq } = await loadContract();
    expect(() => validateFaq([{ id: 'x', question: 'q?' }])).toThrowError(
      'faq[0] is missing fields: answer',
    );
  });

  test('validateTestimonials throws the byte-identical not-an-array message', async () => {
    const { validateTestimonials } = await loadContract();
    expect(() => validateTestimonials([])).toThrowError(
      'content.json "testimonials" must be a non-empty array',
    );
  });

  test('validateTestimonials throws the byte-identical missing-fields message', async () => {
    const { validateTestimonials } = await loadContract();
    expect(() =>
      validateTestimonials([{ id: 't1', author: 'A', rating: 5, date: '2026-01-01', body: 'x', verified: true }]),
    ).toThrowError('testimonials[0] is missing fields: variant');
  });

  test('validateTestimonials throws the byte-identical unknown-fields message', async () => {
    const { validateTestimonials } = await loadContract();
    const item = { ...minimalContent.testimonials[1], bogus: true };
    expect(() => validateTestimonials([item])).toThrowError(
      'testimonials[0] has fields outside the contract: bogus',
    );
  });

  test('validateTestimonials throws the byte-identical bad-variant message', async () => {
    const { validateTestimonials } = await loadContract();
    const item = { ...minimalContent.testimonials[1], variant: 'bad' };
    expect(() => validateTestimonials([item])).toThrowError(
      'testimonials[0].variant must be \'quote\' | \'card\' | \'reel\', got "bad"',
    );
  });

  test('validateContent throws the byte-identical missing-top-level message', async () => {
    const { validateContent } = await loadContract();
    expect(() => validateContent({ faq: [], testimonials: [] })).toThrowError(
      'content.json is missing top-level "product"',
    );
  });

  test('ALLOWED_PRODUCT_FIELDS is exported and matches the CLI whitelist length', async () => {
    const { ALLOWED_PRODUCT_FIELDS } = await loadContract();
    expect(ALLOWED_PRODUCT_FIELDS).toContain('ratingBreakdown');
    expect(ALLOWED_PRODUCT_FIELDS.length).toBe(23);
  });
});

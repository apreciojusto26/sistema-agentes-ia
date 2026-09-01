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
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
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
// Design System Fase 2 — explicit design mode (--design). Separate slugs so
// the legacy-mode assertions above are never contaminated by a design run.
const SLUG_DESIGN = 'zz-contract-test-fixture-design';
const OUT_DIR_DESIGN = path.join(REPO_ROOT, 'outputs', SLUG_DESIGN);
const SLUG_DESIGN_INVALID = 'zz-contract-test-fixture-design-invalid';
const OUT_DIR_DESIGN_INVALID = path.join(REPO_ROOT, 'outputs', SLUG_DESIGN_INVALID);
const SLUG_DESIGN_MISSING_VALUE = 'zz-contract-test-fixture-design-missing-value';
const OUT_DIR_DESIGN_MISSING_VALUE = path.join(REPO_ROOT, 'outputs', SLUG_DESIGN_MISSING_VALUE);
const SLUG_DESIGN_ID_MISMATCH = 'zz-contract-test-fixture-design-id-mismatch';
const OUT_DIR_DESIGN_ID_MISMATCH = path.join(REPO_ROOT, 'outputs', SLUG_DESIGN_ID_MISMATCH);

const MINIMAL_CONTENT_PATH = path.join(__dirname, 'fixtures/minimal-content.json');
const INVALID_CONTENT_PATH = path.join(__dirname, 'fixtures/invalid-content.json');
// Nine 1x1 JPEGs, one per template asset slot minimal-content.json references.
// This directory was asserted by the test below since c8a15aa but NEVER
// committed — verified against history, not just HEAD — so the test failed with
// `--images directory not found` on every clean checkout. See
// fixtures/images-fixture.md for why these filenames and why real JPEGs.
const IMAGES_DIR = path.join(__dirname, 'fixtures/images');

const minimalContent = JSON.parse(readFileSync(MINIMAL_CONTENT_PATH, 'utf-8'));
const invalidContent = JSON.parse(readFileSync(INVALID_CONTENT_PATH, 'utf-8'));

function cleanOutDir() {
  rmSync(OUT_DIR, { recursive: true, force: true });
  rmSync(OUT_DIR_EVENTS, { recursive: true, force: true });
  rmSync(OUT_DIR_EVENTS_IMAGES, { recursive: true, force: true });
  rmSync(OUT_DIR_EVENTS_LEGACY, { recursive: true, force: true });
  rmSync(OUT_DIR_DESIGN, { recursive: true, force: true });
  rmSync(OUT_DIR_DESIGN_INVALID, { recursive: true, force: true });
  rmSync(OUT_DIR_DESIGN_MISSING_VALUE, { recursive: true, force: true });
  rmSync(OUT_DIR_DESIGN_ID_MISMATCH, { recursive: true, force: true });
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
    // Fase 5 replaced the old "shopifyHandle is a placeholder" TODO. A run
    // without --shopify-handle is now explicitly PREVIEW mode: the handle is
    // no longer a placeholder to be filled in later, it is absent, and
    // catalog.ts fails closed rather than inheriting another product's.
    expect(r.stdout).toContain('  - PREVIEW MODE');
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

    // Product Identity + Generation Isolation (design D5, task 5.4): a new
    // `write-manifest` stage was added between `patch-theme` and `todos` —
    // this pinned sequence updated deliberately to match, per the SDD
    // apply 4-step deviation process (design's data-flow diagram + task
    // 5.4 explicitly require this stage; see
    // sdd/product-identity-generation-isolation/apply-progress, Batch 5).
    //
    // Design System Fase 2 (OQ-1, owner-authorized): a `write-design` stage
    // exists between `write-data` and `patch-theme`, but is emitted ONLY when
    // --design is passed. This run passes none, so the legacy sequence below
    // is UNCHANGED — that is the point of the decision, not an oversight. The
    // explicit-mode sequence is pinned separately in Group D.
    expect(events.filter((e) => e.type === 'stage.start').map((e) => e.stage)).toEqual([
      'args',
      'validate',
      'preflight',
      'copy-template',
      'write-data',
      'patch-theme',
      'write-favicon',
      'write-manifest',
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
    // Same task-5.4 pin update as the test above, with `copy-images` still
    // preceding `write-manifest` (design data-flow: copy-images → write-
    // manifest → result).
    expect(events.filter((e) => e.type === 'stage.start').map((e) => e.stage)).toEqual([
      'args',
      'validate',
      'preflight',
      'copy-template',
      'write-data',
      'patch-theme',
      'write-favicon',
      'copy-images',
      'write-manifest',
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
    // 'card' left the vocabulary in the Design integrity phase: nothing in the
    // template or in any generated landing ever selected it, so it was data
    // the system accepted and could never display. The message is now built
    // from TESTIMONIAL_VARIANTS, which is also what the enum check, the
    // coverage rule and the Content Agent's prompt read — so this assertion is
    // written against that constant rather than re-typing the list, which
    // would put the drift right back.
    const { validateTestimonials, TESTIMONIAL_VARIANTS } = await loadContract();
    expect(TESTIMONIAL_VARIANTS).toEqual(['quote', 'reel']);

    const item = { ...minimalContent.testimonials[1], variant: 'bad' };
    const expected = `testimonials[0].variant must be ${TESTIMONIAL_VARIANTS.map((v: string) => `'${v}'`).join(' | ')}, got "bad"`;
    expect(expected).toBe('testimonials[0].variant must be \'quote\' | \'reel\', got "bad"');
    expect(() => validateTestimonials([item])).toThrowError(expected);
  });

  test('validateContent throws the byte-identical missing-top-level message', async () => {
    const { validateContent } = await loadContract();
    expect(() => validateContent({ faq: [], testimonials: [] })).toThrowError(
      'content.json is missing top-level "product"',
    );
  });

  test('ALLOWED_PRODUCT_FIELDS is exported and matches the CLI whitelist length', async () => {
    const { ALLOWED_PRODUCT_FIELDS } = await loadContract();
    // 23 -> 24: `comparisonRival` joined the whitelist so the Comparison
    // heading could stop being a template literal about decorative lamps.
    expect(ALLOWED_PRODUCT_FIELDS).toContain('comparisonRival');
    // 24 -> 22: `guarantee` and `shipping` LEFT. Neither was a product fact —
    // CanonicalProduct carries no guarantee and no shipping signal, so both were
    // the model writing the merchant's commercial policy for it, contradicting
    // merchant config on every landing. They are merchant fields now.
    expect(ALLOWED_PRODUCT_FIELDS).not.toContain('guarantee');
    expect(ALLOWED_PRODUCT_FIELDS).not.toContain('shipping');
    // 22 -> 21: `ratingBreakdown` LEFT too, and for the sharpest version of the
    // same reason. It drew a five-bar histogram and had NO canonical source at
    // all — an invented statistic rendered as a chart. It was not replaced by a
    // distribution derived from the average, because an average does not
    // determine one.
    expect(ALLOWED_PRODUCT_FIELDS).not.toContain('ratingBreakdown');
    expect(ALLOWED_PRODUCT_FIELDS.length).toBe(21);

    // ratingAverage and ratingCount STAY in content.json but leave the model's
    // authority: they are projected from CanonicalProduct.socialProof by
    // generate-content.mjs, so they are accepted but never requested.
    const { REQUIRED_PRODUCT_FIELDS } = await loadContract();
    expect(ALLOWED_PRODUCT_FIELDS).toContain('ratingAverage');
    expect(REQUIRED_PRODUCT_FIELDS).not.toContain('ratingAverage');
    expect(REQUIRED_PRODUCT_FIELDS).not.toContain('ratingCount');
  });
});

// --- Group D — explicit design mode (--design, Design System Fase 2) --------
//
// OQ-1 (owner-authorized): `write-design` ships as its OWN stage rather than
// being folded into `write-data`, for observability and separation of
// responsibilities. These pins are the contract for that decision.

describe('Group D — --design explicit generation mode', () => {
  const DESIGN_DIR = path.join(REPO_ROOT, 'admin/test/fixtures/design-spec');
  const VALID_DESIGN = path.join(DESIGN_DIR, 'valid.json');
  const UNSUPPORTED_DESIGN = path.join(DESIGN_DIR, 'unsupported-capability.json');

  test('emits write-design between write-data and patch-theme', () => {
    const r = runGenerateWithEvents(SLUG_DESIGN, MINIMAL_CONTENT_PATH, ['--design', VALID_DESIGN]);

    expect(r.status).toBe(0);
    const events = parseEvents(r.stderr);
    expect(events.filter((e) => e.type === 'stage.start').map((e) => e.stage)).toEqual([
      'args',
      'validate',
      'preflight',
      'copy-template',
      'write-data',
      'write-design',
      'patch-theme',
      'write-favicon',
      'write-manifest',
      'todos',
    ]);
  });

  test('writes the resolved DesignSpec into the generated src/data/design.ts', () => {
    expect(existsSync(path.join(OUT_DIR_DESIGN, 'src/data/design.ts'))).toBe(true);
    const written = readFileSync(path.join(OUT_DIR_DESIGN, 'src/data/design.ts'), 'utf-8');
    const spec = JSON.parse(readFileSync(VALID_DESIGN, 'utf-8'));

    expect(written).toContain("import type { DesignSpec } from '@/types/design'");
    expect(written).toContain('export const design: DesignSpec =');
    // The spec's identity and its sections really landed, not a default.
    expect(written).toContain(spec.productId);
    for (const section of spec.sections) {
      expect(written).toContain(`"${section.type}"`);
    }

    // minimal-content.json is intentionally legacy and has no productId. In
    // explicit mode the required DesignSpec id becomes the single canonical
    // identity and must propagate to the manifest rather than leaving it null.
    const manifest = JSON.parse(readFileSync(path.join(OUT_DIR_DESIGN, '.generation.json'), 'utf-8'));
    expect(manifest.productId).toBe(spec.productId);
  });

  test('DECISION 1 — DesignSpec.theme patches the @theme block', () => {
    const css = readFileSync(path.join(OUT_DIR_DESIGN, 'src/styles/global.css'), 'utf-8');
    const spec = JSON.parse(readFileSync(VALID_DESIGN, 'utf-8'));

    // patchThemeBlock preserves the template's original whitespace (the regex
    // captures `name:\s*` as $1), so the declarations stay column-aligned —
    // match on that rather than assuming a single space.
    for (const [key, value] of Object.entries(spec.theme.colors ?? {})) {
      expect(css).toMatch(new RegExp(`--color-${key}:\\s*${value};`));
    }
  });

  test('an unsupported DesignSpec fails closed and writes NOTHING', () => {
    expect(existsSync(OUT_DIR_DESIGN_INVALID)).toBe(false);

    const r = runGenerateWithEvents(SLUG_DESIGN_INVALID, MINIMAL_CONTENT_PATH, [
      '--design',
      UNSUPPORTED_DESIGN,
    ]);

    expect(r.status).not.toBe(0);
    // The whole point of validating inside `validate`, before copy-template:
    // a rejected spec leaves no partial directory behind.
    expect(existsSync(OUT_DIR_DESIGN_INVALID)).toBe(false);

    // Failure path: stderr MIXES events with the legacy human `✗ …` line, so
    // this must use extractEvents (tolerant) rather than parseEvents (which
    // asserts every line is an event).
    const events = extractEvents(r.stderr);
    const stages = events.filter((e) => e.type === 'stage.start').map((e) => e.stage);
    expect(stages).not.toContain('copy-template');
    expect(stages).not.toContain('write-design');
    expect(r.stderr + r.stdout).toContain('unsupported_design');
  });

  test('a nonexistent --design path fails closed', () => {
    const r = runGenerateWithEvents(SLUG_DESIGN_INVALID, MINIMAL_CONTENT_PATH, [
      '--design',
      path.join(DESIGN_DIR, 'does-not-exist.json'),
    ]);

    expect(r.status).not.toBe(0);
    expect(existsSync(OUT_DIR_DESIGN_INVALID)).toBe(false);
    expect(r.stderr + r.stdout).toContain('Design file not found');
  });

  test('--design present without a value is an argument error before copy-template', () => {
    const r = runGenerateWithEvents(SLUG_DESIGN_MISSING_VALUE, MINIMAL_CONTENT_PATH, ['--design']);

    expect(r.status).not.toBe(0);
    expect(existsSync(OUT_DIR_DESIGN_MISSING_VALUE)).toBe(false);
    expect(r.stderr + r.stdout).toContain('Missing --design <path-to-json>');

    const stages = extractEvents(r.stderr)
      .filter((event) => event.type === 'stage.start')
      .map((event) => event.stage);
    expect(stages).toEqual(['args']);
  });

  test('a DesignSpec productId that diverges from content fails before any output is written', () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), 'lg-design-product-id-'));
    const contentPath = path.join(tempDir, 'content.json');

    try {
      writeFileSync(
        contentPath,
        JSON.stringify({ ...minimalContent, productId: 'prd_verify01-aabbccdd' }),
      );

      const r = runGenerateWithEvents(SLUG_DESIGN_ID_MISMATCH, contentPath, ['--design', VALID_DESIGN]);

      expect(r.status).not.toBe(0);
      expect(existsSync(OUT_DIR_DESIGN_ID_MISMATCH)).toBe(false);
      expect(r.stderr + r.stdout).toContain('generation-owner-mismatch');
      expect(r.stderr + r.stdout).toContain('mixed-product artifacts');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('a contract-valid but unpatchable strict token leaves no final output', () => {
    const tempRoot = mkdtempSync(path.join(tmpdir(), 'lg-strict-theme-'));
    const isolatedGenerator = path.join(tempRoot, 'scripts/generate-landing.mjs');
    const isolatedCssDir = path.join(tempRoot, 'content/landing-base/src/styles');
    const isolatedDataDir = path.join(tempRoot, 'content/landing-base/src/data');
    const isolatedOut = path.join(tempRoot, 'outputs/strict-token-drift');

    try {
      // Isolated mutation control: simulate drift where THEME_TOKENS still
      // permits colors.rust but the copied template no longer declares it.
      // The real working tree is never modified.
      cpSync(path.join(REPO_ROOT, 'scripts'), path.join(tempRoot, 'scripts'), { recursive: true });
      mkdirSync(isolatedCssDir, { recursive: true });
      mkdirSync(isolatedDataDir, { recursive: true });
      const css = readFileSync(
        path.join(REPO_ROOT, 'content/landing-base/src/styles/global.css'),
        'utf-8',
      );
      writeFileSync(
        path.join(isolatedCssDir, 'global.css'),
        css.replace(/^\s*--color-rust:\s*[^;]+;\s*$/m, ''),
      );

      const r = spawnSync(
        process.execPath,
        [
          isolatedGenerator,
          '--slug',
          'strict-token-drift',
          '--content',
          MINIMAL_CONTENT_PATH,
          '--design',
          VALID_DESIGN,
        ],
        { cwd: tempRoot, encoding: 'utf8', env: { ...process.env, LG_EVENTS: '1' } },
      );

      expect(r.status).not.toBe(0);
      expect(r.stderr + r.stdout).toContain('design-token-unknown');
      expect(existsSync(isolatedOut)).toBe(false);
      const stages = extractEvents(r.stderr)
        .filter((event) => event.type === 'stage.start')
        .map((event) => event.stage);
      expect(stages).not.toContain('copy-template');
      expect(stages).not.toContain('write-design');
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});

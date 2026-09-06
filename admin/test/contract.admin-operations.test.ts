// THE THREE STAGES THAT DELEGATE TO NO CHILD, AND WHAT THEY REPORT.
//
// ─── THE GAP THIS CLOSES ───────────────────────────────────────────────────
//
// scrape, content and generate all run a child script that announces its own
// `withStage` blocks over NDJSON, so their agents already had operations to
// show. normalize, assets and validate run INSIDE the Admin — no child, no
// NDJSON — and showed one stage-level tick each. An operator could click the
// Asset Agent and find nothing to read.
//
// ─── AND WHAT MUST STAY TRUE WHILE IT IS CLOSED ────────────────────────────
//
// Instrumentation must not become fake progress, and it must not become a
// gate. Every assertion below is made against a REAL `runPipeline` run over a
// real temporary archive, never against a hand-built record: the counts are
// the counts the producer computed, the statuses are the outcomes the calls
// had, and a stage that used to succeed still succeeds.
import { afterEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  runPipeline,
  ADMIN_OPERATIONS,
  NORMALIZE_OPERATIONS,
  ASSET_OPERATIONS,
  VALIDATE_OPERATIONS,
  type PipelineRecord,
  type PipelineStep,
} from '../src/server/pipeline';
import { FIXED_ASSET_OPERATIONS } from '../../scripts/lib/fixed-asset-producer.mjs';
import type { JobRecord } from '../src/shared/jobs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

const temps: string[] = [];
afterEach(() => {
  while (temps.length) rmSync(temps.pop()!, { recursive: true, force: true });
});

const tempDir = (prefix: string) => {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  temps.push(dir);
  return dir;
};

/**
 * An archive with media worth reporting ON.
 *
 * Four references, four different fates, all of them real:
 *   a.webp        accepted
 *   b.webp        accepted
 *   c.webp        REJECTED as a duplicate — same bytes as a.webp
 *   missing.webp  REJECTED as file-missing — named by the source, not on disk
 *
 * Two of the reviews are displayable and one is not, so the social-proof audit
 * has something to be right about.
 */
function archiveWithMedia(opts: { reviews?: unknown[] } = {}) {
  const dir = tempDir('lg-ops-');
  mkdirSync(path.join(dir, 'images'), { recursive: true });
  writeFileSync(path.join(dir, 'images', 'a.webp'), 'the-same-bytes');
  writeFileSync(path.join(dir, 'images', 'b.webp'), 'different-bytes');
  writeFileSync(path.join(dir, 'images', 'c.webp'), 'the-same-bytes');

  writeFileSync(path.join(dir, 'product.json'), JSON.stringify({ title: 'Lámpara' }));
  writeFileSync(
    path.join(dir, 'canonical-product.json'),
    JSON.stringify({
      identity: { productId: 'prd_x-1', name: 'Lámpara de galaxia', brand: 'Astra', sourceUrl: 'https://example.com/item/1' },
      commerceFacts: { variantOptions: [{ name: 'color', values: ['negro', 'blanco'] }] },
      media: {
        images: [
          { localPath: 'output/images/a.webp', order: 0 },
          { localPath: 'output/images/b.webp', order: 1 },
          { localPath: 'output/images/c.webp', order: 2 },
          { localPath: 'output/images/missing.webp', order: 3 },
        ],
        videos: [],
      },
      socialProof: {
        rating: 4.8,
        reviewCount: 120,
        reviews: opts.reviews ?? [
          { text: 'Preciosa, ilumina toda la habitación.', rating: 5, author: 'M***a', dateRaw: '25 AGO 2025' },
          { text: 'Cumple lo que promete.', rating: 4, author: 'J***n', dateRaw: '01 SEP 2025' },
          { text: '', rating: 5, author: 'sin cuerpo' },
        ],
      },
    }),
  );
  return dir;
}

/** An archive whose images/ exists and holds nothing usable. */
function archiveWithNoUsableMedia() {
  const dir = tempDir('lg-ops-empty-');
  mkdirSync(path.join(dir, 'images'), { recursive: true });
  writeFileSync(path.join(dir, 'product.json'), JSON.stringify({ title: 'Lámpara' }));
  writeFileSync(
    path.join(dir, 'canonical-product.json'),
    JSON.stringify({ identity: { productId: 'prd_x-1', name: 'Lámpara' }, media: { images: [], videos: [] } }),
  );
  return dir;
}

/** A generated landing that satisfies every structural guarantee. */
function fakeOutput() {
  const dir = tempDir('lg-ops-out-');
  mkdirSync(path.join(dir, '.git'), { recursive: true });
  mkdirSync(path.join(dir, 'src/data'), { recursive: true });
  writeFileSync(path.join(dir, '.gitignore'), 'node_modules/\n');
  writeFileSync(path.join(dir, 'src/data/product.ts'), '');
  // The real generator emits three key families; the canonical `product-NN`
  // ones are what the Fixed asset output actually references.
  writeFileSync(
    path.join(dir, 'src/data/images.ts'),
    ["export const images = {", "  'product-01': a,", "  'product-02': b,", '};', ''].join('\n'),
  );
  writeFileSync(path.join(dir, '.generation.json'), JSON.stringify({ productId: 'prd_x-1' }));
  return dir;
}

function job(over: Partial<JobRecord>): JobRecord {
  return {
    schema: 1,
    jobId: 'j1',
    kind: 'scrape',
    status: 'succeeded',
    params: {},
    argv: [],
    cwd: '',
    pid: null,
    createdAt: '',
    startedAt: null,
    finishedAt: null,
    exitCode: 0,
    signal: null,
    stages: [],
    result: null,
    error: null,
    eventSchemaVersion: 1,
    malformedEventCount: 0,
    eventGaps: [],
    lastSeq: 0,
    logPath: '',
    archivePath: null,
    archiveError: null,
    ...over,
  } as JobRecord;
}

/** The same fake registry shape the pipeline contract suite uses. */
function fakeRegistry(opts: { archive: string; outDir: string; steps?: number }) {
  const jobs = new Map<string, JobRecord>();
  let n = 0;
  const make = (kind: string, params: unknown, result: unknown): JobRecord => {
    n += 1;
    const id = `${kind}-${n}`;
    const rec = job({
      jobId: id,
      kind: kind as JobRecord['kind'],
      status: 'succeeded',
      params: params as JobRecord['params'],
      result: result as JobRecord['result'],
      archivePath: kind === 'scrape' ? opts.archive : null,
    });
    jobs.set(id, rec);
    return rec;
  };
  const contentPath = path.join(opts.archive, 'content.json');
  return {
    get: (id: string) => jobs.get(id) ?? null,
    createScrapeJob: (p: unknown) => make('scrape', p, { title: 'A product' }),
    createContentJob: (p: unknown) => {
      writeFileSync(
        contentPath,
        JSON.stringify({
          product: { steps: Array.from({ length: opts.steps ?? 3 }, (_, i) => ({ title: `paso ${i + 1}` })) },
        }),
      );
      return make('content', p, { stagedPath: contentPath, faqCount: 6 });
    },
    createGenerateJob: (p: { slug: string }) => make('generate', p, { outDir: opts.outDir, slug: p.slug }),
  } as never;
}

const okBuild = async () => ({ ok: true, message: null });

/** Runs the real pipeline over a real archive. */
async function run(overrides: { archive?: string; outDir?: string; steps?: number } = {}) {
  const archive = overrides.archive ?? archiveWithMedia();
  const outDir = overrides.outDir ?? fakeOutput();
  const record = await runPipeline(
    { url: 'https://example.com/item/1', slug: 'zz-operations' },
    { registry: fakeRegistry({ archive, outDir, steps: overrides.steps }), runBuild: okBuild },
  );
  return { record, archive, outDir };
}

const stageOf = (record: PipelineRecord, name: string) => record.stages.find((s) => s.name === name)!;
const namesOf = (steps: PipelineStep[]) => steps.map((s) => s.name);
const stepOf = (record: PipelineRecord, stage: string, step: string) =>
  stageOf(record, stage).steps.find((s) => s.name === step)!;

// ───────────────────────────────────────────────────────────────────────────
// EVERY DECLARED OPERATION HAS A FUNCTION BEHIND IT
// ───────────────────────────────────────────────────────────────────────────

describe('the declared operations are calls, not a wish list', () => {
  const src = readFileSync(path.join(REPO_ROOT, 'admin/src/server/pipeline.ts'), 'utf-8');
  const producer = readFileSync(path.join(REPO_ROOT, 'scripts/lib/fixed-asset-producer.mjs'), 'utf-8');

  it('each name is invoked, in the file that declares it', () => {
    // THE WHOLE DIFFERENCE between a report and a progress bar. A declared list
    // is only honest if every entry names work something performs — so each one
    // has to appear as a real call site, either in the pipeline (`run` /
    // `runAsync`) or in the producer, which owns the five middle asset
    // boundaries and exports their names.
    const called = new Set([
      ...[...src.matchAll(/\.run(?:Async)?\(\s*'([a-z-]+:[a-z-]+)'/g)].map((m) => m[1]!),
      ...[...producer.matchAll(/observer\.step\(\s*'([a-z-]+:[a-z-]+)'/g)].map((m) => m[1]!),
    ]);
    const uncalled = ADMIN_OPERATIONS.filter((name) => !called.has(name));
    expect(uncalled, 'these operations are declared but nothing runs them').toEqual([]);
  });

  it('the producer owns the asset boundaries it names', () => {
    // ONE AUTHORITY. If the Admin kept its own copy of these five they would
    // drift the first time a boundary moved, and the operator would be told a
    // stage skipped work that no longer exists.
    const declared = [...producer.matchAll(/observer\.step\(\s*'([a-z-]+:[a-z-]+)'/g)].map((m) => m[1]!);
    expect(declared).toEqual([...FIXED_ASSET_OPERATIONS]);
    expect(ASSET_OPERATIONS).toEqual([
      'assets:inputs',
      ...FIXED_ASSET_OPERATIONS,
      'assets:refs',
      'assets:persist',
      'assets:favicon',
    ]);
  });

  it('running an operation out of the declared order is an error, not a silent slip', () => {
    // The declaration is what makes `skipped` meaningful. A plan that had
    // drifted from the code would put the WRONG names under it — a confident
    // wrong answer, which is worse than no answer at all.
    expect(src).toMatch(/the declared plan and the code have drifted/);
    expect(src).toMatch(/if \(name !== expected\) \{/);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 1. PRODUCT AGENT — THE NORMALIZER'S REAL OPERATIONS
// ───────────────────────────────────────────────────────────────────────────

describe('the Product Agent reports the normalizer, not only the scraper', () => {
  it('normalize reports one operation per section the normalizer projects', async () => {
    const { record } = await run();
    expect(namesOf(stageOf(record, 'normalize').steps)).toEqual([...NORMALIZE_OPERATIONS]);
  });

  it('and NOT one for `specifications`, which the normalizer writes as a literal []', async () => {
    // DECISION-3: no structured source for specifications exists anywhere, so
    // there is no operation to name. A line here would sound like work and
    // describe none.
    const { record } = await run();
    expect(namesOf(stageOf(record, 'normalize').steps)).not.toContain('normalize:specifications');
  });

  it('the scraper keeps ALL ten of its own operations in the same agent', async () => {
    // The Product Agent is Extractor + Normalizer, and gaining the second must
    // not cost the first. The scrape stage mirrors whatever the child reported;
    // the grouping into one agent is the client's, over both stages.
    const blocks = readFileSync(
      path.join(REPO_ROOT, 'admin/src/client/components/pipeline-blocks.ts'),
      'utf-8',
    );
    expect(blocks).toMatch(/scrape: 'producto',\s*\n\s*normalize: 'producto',/);
    expect(blocks).toContain("scrape: 'Extractor'");
    expect(blocks).toContain("normalize: 'Normalizer'");
  });

  it('the counts are the artefact\'s own', async () => {
    const { record, archive } = await run();
    const canonical = JSON.parse(readFileSync(path.join(archive, 'canonical-product.json'), 'utf-8'));

    // COUNTS, NOT RATIOS. Four images is four images; printing it as `4/4`
    // would put a fraction on screen whose denominator means nothing, and once
    // some of the fractions are real an operator cannot tell which is which.
    expect(stepOf(record, 'normalize', 'normalize:media').note).toBe(
      `${canonical.media.images.length} imágenes`,
    );
    expect(stepOf(record, 'normalize', 'normalize:media').progress).toBeNull();
    expect(stepOf(record, 'normalize', 'normalize:social-proof').note).toBe(
      `${canonical.socialProof.reviews.length} reseñas · ${canonical.socialProof.rating} ★ de ${canonical.socialProof.reviewCount} en origen`,
    );
    expect(stepOf(record, 'normalize', 'normalize:variants').note).toBe(
      `${canonical.commerceFacts.variantOptions.length} opciones de variante`,
    );

    // The identity note is the SYSTEM'S OWN narrowing of the real title — the
    // same function that writes `productDisplayName` into .generation.json, so
    // the report and the landing call this product the same thing.
    const { deriveDisplayName } = await import('../../scripts/lib/display-name.mjs');
    expect(stepOf(record, 'normalize', 'normalize:identity').note).toBe(
      deriveDisplayName(canonical.identity.name),
    );
  });

  it('instrumenting the stage did not turn reporting into gating', async () => {
    // A canonical product with no name, no brand, no media and no reviews is a
    // real product from a real listing that published none. It used to reach
    // the end of the pipeline and it still must: the stage's ONLY failure
    // condition is the one it has always had.
    const bare = tempDir('lg-ops-bare-');
    mkdirSync(path.join(bare, 'images'), { recursive: true });
    writeFileSync(path.join(bare, 'images', 'img_0.webp'), 'bytes');
    writeFileSync(path.join(bare, 'canonical-product.json'), JSON.stringify({ identity: { productId: 'prd_x-1' } }));

    const { record } = await run({ archive: bare });
    expect(record.status).toBe('succeeded');
    expect(stageOf(record, 'normalize').status).toBe('pass');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 2. ASSET AGENT — MORE THAN ONE STAGE-LEVEL TICK
// ───────────────────────────────────────────────────────────────────────────

describe('the Asset Agent reports the operations F4 actually runs', () => {
  it('reports all nine, not a single pass', async () => {
    const { record } = await run();
    const steps = stageOf(record, 'assets').steps;
    expect(steps.length).toBeGreaterThan(1);
    expect(namesOf(steps)).toEqual([...ASSET_OPERATIONS]);
  });

  it('the plan\'s counts are the plan\'s, recomputed nowhere', async () => {
    const { record, archive } = await run();
    const manifest = JSON.parse(readFileSync(path.join(archive, 'fixed-assets.manifest.json'), 'utf-8'));
    const plan = stepOf(record, 'assets', 'assets:plan');

    // a.webp and b.webp accepted; c.webp deduped; missing.webp not on disk.
    // A REAL RATIO — accepted out of considered — so the fraction on screen is
    // a proportion and not a total dressed up as one.
    expect(plan.progress).toEqual({ done: 2, total: 4, label: 'archivos aceptados' });
    expect(plan.progress!.done).toBe(manifest.assets.length);
    // The note carries what the ratio cannot: why the other two are missing.
    expect(plan.note).toBe('2 rechazados · 1 duplicados');

    // AND THE DEDUPE IS REAL, not asserted: the two accepted files have
    // different digests, and the rejected one matched the first.
    const digest = (f: string) =>
      createHash('sha256').update(readFileSync(path.join(archive, 'images', f))).digest('hex');
    expect(digest('a.webp')).toBe(digest('c.webp'));
    expect(digest('b.webp')).not.toBe(digest('a.webp'));
    expect(manifest.rejected.map((r: { reason: string }) => r.reason).sort()).toEqual([
      'duplicate',
      'file-missing',
    ]);
  });

  it('a deliberate rejection is COUNTED and a broken promise is WARNED', async () => {
    // Deduping is this pipeline working as designed. A file the canonical
    // product named and the disk does not have is the source failing its own
    // promise, and that is the operator's business.
    const plan = stepOf((await run()).record, 'assets', 'assets:plan');
    expect(plan.status).toBe('warning');
    expect(plan.warnings).toEqual(['imagen no materializada (file-missing): missing.webp']);
    expect(plan.warnings.join(' ')).not.toContain('duplicate');
  });

  it('each fixed region reports what was actually assigned to it', async () => {
    const { record, archive } = await run({ steps: 3 });
    const output = JSON.parse(readFileSync(path.join(archive, 'fixed-assets.json'), 'utf-8'));

    expect(stepOf(record, 'assets', 'assets:gallery').note).toBe(`${output.gallery.length} slots`);
    expect(stepOf(record, 'assets', 'assets:strip').note).toBe(`${output.productMediaStrip.length} slots`);
    // Steps ARE a ratio: how many the copy asked for against how many were
    // filled — the one place in this stage where the denominator means something.
    expect(stepOf(record, 'assets', 'assets:steps').progress).toEqual({
      done: Object.keys(output.stepMedia).length,
      total: 3,
      label: 'pasos',
    });
    // Two distinct photographs over three steps: the reuse is stated, not hidden.
    expect(stepOf(record, 'assets', 'assets:steps').note).toBe(
      '2 imagen(es) distintas para 3 pasos — la última se repite',
    );
    expect(stepOf(record, 'assets', 'assets:refs').note).toBe('0 referencias sin resolver');
  });

  it('the step count comes from the COPY, and says so', async () => {
    const { record } = await run({ steps: 5 });
    expect(stepOf(record, 'assets', 'assets:inputs').note).toBe('5 paso(s) en el copy');
    expect(stepOf(record, 'assets', 'assets:steps').progress!.total).toBe(5);
  });

  it('the producer behaves identically with nobody watching', async () => {
    // Instrumentation is a WRAPPER, never a branch. A producer that behaved
    // differently when observed is not one anyone can trust, so the observed
    // and unobserved outputs must be byte-identical.
    const { produceFixedAssets } = await import('../../scripts/lib/fixed-asset-producer.mjs');
    const archive = archiveWithMedia();
    const canonicalProduct = JSON.parse(readFileSync(path.join(archive, 'canonical-product.json'), 'utf-8'));
    const args = { canonicalProduct, imagesDir: path.join(archive, 'images'), destDir: null, stepCount: 3 };

    const seen: string[] = [];
    const watched = produceFixedAssets({
      ...args,
      observer: {
        step: (name: string, fn: (facts: unknown) => unknown) => {
          seen.push(name);
          return fn({ count: () => {}, note: () => {}, warn: () => {} });
        },
      },
    });
    expect(seen).toEqual([...FIXED_ASSET_OPERATIONS]);
    expect(JSON.stringify(watched.assetOutput)).toBe(JSON.stringify(produceFixedAssets(args).assetOutput));
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 3. VALIDATION AGENT — REAL CHECKS
// ───────────────────────────────────────────────────────────────────────────

describe('the Validation Agent reports checks that really ran', () => {
  it('reports all six', async () => {
    const { record } = await run();
    expect(namesOf(stageOf(record, 'validate').steps)).toEqual([...VALIDATE_OPERATIONS]);
  });

  it('readiness is the readiness authority itself, not a second opinion', async () => {
    const { record } = await run();
    const readiness = stepOf(record, 'validate', 'validate:readiness');
    // The real script reports 15 checks today. Asserting the SHAPE rather than
    // the number: a check added to check-readiness.mjs must not fail this.
    expect(readiness.progress!.total).toBeGreaterThan(0);
    expect(readiness.progress!.label).toBe('checks');
    const src = readFileSync(path.join(REPO_ROOT, 'admin/src/server/pipeline.ts'), 'utf-8');
    expect(src).toContain('scripts/check-readiness.mjs');
  });

  it('grammar reports the hash it measured, or says it had nothing to measure', async () => {
    // The fake build writes no dist/, which is a real state and a different
    // one from "never attempted" — so it warns rather than passing quietly or
    // being marked skipped.
    const { record } = await run();
    const grammar = stepOf(record, 'validate', 'validate:grammar');
    expect(grammar.status).toBe('warning');
    expect(grammar.warnings[0]).toMatch(/dist\/client\/index\.html/);
    expect(grammar.note).toBeNull();
  });

  it('the asset-ref ratio is refs over refs, never refs over keys', async () => {
    // TWO DIFFERENT POPULATIONS. A landing's images.ts offers more keys than
    // the page references — the canonical `product-NN` names, the original
    // scraped filenames and the template's own slots all resolve there — so
    // dividing refs by keys would print a fraction that moves for reasons
    // unrelated to anything being wrong.
    const { record, archive } = await run({ steps: 3 });
    const output = JSON.parse(readFileSync(path.join(archive, 'fixed-assets.json'), 'utf-8'));
    const refs =
      output.gallery.length +
      output.heroExtras.length +
      output.productMediaStrip.length +
      Object.keys(output.stepMedia).length;

    const step = stepOf(record, 'validate', 'validate:asset-refs');
    expect(step.progress).toEqual({ done: refs, total: refs, label: 'referencias resueltas' });
    // The key count is a fact beside it, not the denominator.
    expect(step.note).toBe('2 claves en images.ts');
    expect(refs).not.toBe(2);
  });

  it('ownership is read from the landing\'s own manifest', async () => {
    const { record, outDir } = await run();
    const manifest = JSON.parse(readFileSync(path.join(outDir, '.generation.json'), 'utf-8'));
    expect(manifest.productId).toBe('prd_x-1');
    expect(stepOf(record, 'validate', 'validate:ownership').status).not.toBe('failed');
  });

  it('social-proof provenance counts what the source supports', async () => {
    const { record } = await run();
    const proof = stepOf(record, 'validate', 'validate:social-proof');
    // Three reviews found, two of them renderable — the third has no body.
    expect(proof.progress).toEqual({ done: 2, total: 3, label: 'factuales' });
    expect(proof.status).toBe('warning');
    expect(proof.warnings).toEqual(['reseña descartada: no review text']);
  });

  it('the artefact gate is unchanged — a missing file still fails the stage', async () => {
    const bare = tempDir('lg-ops-nolanding-');
    const { record } = await run({ outDir: bare });
    expect(record.status).toBe('failed');
    expect(record.error).toContain('product.ts');
    expect(stageOf(record, 'validate').status).toBe('failed');
  });

  it('and the five checks after it never gate a run that used to pass', async () => {
    // They MEASURE. Turning one into a gate changes what the pipeline promises,
    // which is a decision for the operator to make on the evidence — and the
    // evidence is what this stage did not have until now.
    const { record } = await run();
    expect(record.status).toBe('succeeded');
    expect(stageOf(record, 'validate').status).toBe('pass');
    const measured = stageOf(record, 'validate').steps.filter((s) => s.name !== 'validate:artifact');
    expect(measured.every((s) => s.status === 'passed' || s.status === 'warning')).toBe(true);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 4. ORDER  ·  6. FAILURE AND SKIPPED  ·  7. WARNINGS
// ───────────────────────────────────────────────────────────────────────────

describe('the sequence a report shows is the sequence that happened', () => {
  it('operations arrive in declared order and are never reordered', async () => {
    const { record } = await run();
    for (const [stage, plan] of [
      ['normalize', NORMALIZE_OPERATIONS],
      ['assets', ASSET_OPERATIONS],
      ['validate', VALIDATE_OPERATIONS],
    ] as const) {
      expect(namesOf(stageOf(record, stage).steps)).toEqual([...plan]);
    }
  });

  it('every operation is timed across its own call, and none is timed by a clock', async () => {
    const { record } = await run();
    for (const stage of ['normalize', 'assets', 'validate']) {
      for (const step of stageOf(record, stage).steps) {
        if (step.status === 'skipped') {
          expect(step.ms, `${step.name} claims a duration for work never done`).toBeNull();
          expect(step.endedAt).toBeNull();
        } else {
          expect(typeof step.ms, `${step.name} was not measured`).toBe('number');
          expect(step.ms!).toBeGreaterThanOrEqual(0);
          expect(Date.parse(step.endedAt!)).toBeGreaterThanOrEqual(Date.parse(step.startedAt));
        }
      }
    }
  });

  it('a failed operation leaves the ones after it SKIPPED, never failed', async () => {
    // An images/ that exists and holds nothing usable: the producer throws
    // inside `assets:plan`, which is operation two of nine.
    const { record } = await run({ archive: archiveWithNoUsableMedia() });
    const steps = stageOf(record, 'assets').steps;

    expect(namesOf(steps)).toEqual([...ASSET_OPERATIONS]);
    expect(steps.map((s) => s.status)).toEqual([
      'passed', // assets:inputs
      'failed', // assets:plan
      'skipped', // gallery
      'skipped', // strip
      'skipped', // steps
      'skipped', // manifest
      'skipped', // refs
      'skipped', // persist
      'skipped', // favicon
    ]);
    // The later operations are absent from the record's TIMED work, and the
    // failure is what the stage reports.
    expect(record.status).toBe('failed');
    expect(stageOf(record, 'assets').status).toBe('failed');
    expect(steps.find((s) => s.name === 'assets:plan')!.warnings[0]).toMatch(/no usable media/);
  });

  it('a stage that fails leaves the LATER STAGES skipped too', async () => {
    const { record } = await run({ archive: archiveWithNoUsableMedia() });
    expect(stageOf(record, 'generate').status).toBe('skipped');
    expect(stageOf(record, 'build').status).toBe('skipped');
    expect(stageOf(record, 'validate').status).toBe('skipped');
    // And a skipped stage reports no operations at all — absence of steps is
    // not a step.
    expect(stageOf(record, 'validate').steps).toEqual([]);
  });

  it('an operation that finished WITH a warning is not flattened to a pass', async () => {
    const { record } = await run({ archive: archiveWithMedia({ reviews: [] }) });
    const proof = stepOf(record, 'normalize', 'normalize:social-proof');
    expect(proof.status).toBe('warning');
    expect(proof.warnings).toEqual(['la fuente no publicó reseñas — la landing no mostrará ninguna']);
    // It still finished: a warning is an outcome, not a failure.
    expect(typeof proof.ms).toBe('number');
    expect(record.status).toBe('succeeded');
  });

  it('a warning names a condition the system reported, never one invented for the UI', async () => {
    // Every warning in a clean run traces to a real absence in the artefact:
    // no brand on the listing, no reviews, no built HTML to fingerprint.
    const { record } = await run({ archive: archiveWithMedia({ reviews: [] }) });
    const warned = record.stages
      .flatMap((s) => s.steps)
      .filter((s) => s.status === 'warning')
      .flatMap((s) => s.warnings);
    expect(warned.length).toBeGreaterThan(0);
    for (const warning of warned) {
      expect(warning, 'a warning with no message is decoration').not.toBe('');
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 5. METADATA  ·  10. NO FAKE PROGRESS
// ───────────────────────────────────────────────────────────────────────────

describe('nothing here is a timer, an estimate or a second calculation', () => {
  const src = readFileSync(path.join(REPO_ROOT, 'admin/src/server/pipeline.ts'), 'utf-8');
  const producer = readFileSync(path.join(REPO_ROOT, 'scripts/lib/fixed-asset-producer.mjs'), 'utf-8');
  const steps = readFileSync(
    path.join(REPO_ROOT, 'admin/src/client/components/AgentSteps.tsx'),
    'utf-8',
  );

  it('no interval, no scheduled advance, in either the recorder or the producer', () => {
    const code = (s: string) => s.replace(/^\s*\/\/.*$/gm, '');
    expect(code(src)).not.toMatch(/setInterval\(/);
    expect(code(producer)).not.toMatch(/setInterval\(|setTimeout\(/);
    // The one setTimeout in the pipeline is the poll delay in awaitJob, which
    // waits for a child rather than advancing anything.
    expect([...code(src).matchAll(/setTimeout\(/g)]).toHaveLength(1);
    expect(src).toMatch(/await new Promise\(\(r\) => setTimeout\(r, pollMs\)\)/);
  });

  it('facts reach the step through a sink, so data can never be mistaken for one', () => {
    // An earlier draft read `progress` and `warnings` off whatever the
    // operation RETURNED, which meant a canonical product carrying a
    // `warnings` key would have had it rendered as an operation's warning.
    expect(src).toMatch(/export type StepFacts = \{/);
    expect(src).toMatch(/fn: \(facts: StepFacts\) => T/);
    expect(src, 'facts are read back off the return value').not.toMatch(/outcome\?\.\s*warnings/);
  });

  it('the client presents the backend\'s numbers and computes none of its own', () => {
    expect(steps).toMatch(/step\.progress\.done\}\/\{step\.progress\.total/);
    expect(steps).toMatch(/\{step\.note\}/);
    expect(steps, 'the component recomputes a count').not.toMatch(/\.length\s*\/\s*/);
    const code = steps.replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toMatch(/animate-/);
  });

  it('a skipped operation is excluded from the "done" summary', async () => {
    // "9 de 9 operaciones" for a stage that failed at two would be the exact
    // confident-and-wrong reporting this system keeps removing.
    expect(steps).toMatch(/s\.status !== 'running' && s\.status !== 'skipped'/);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 8. PERSISTENCE — THE NEW OPERATIONS SURVIVE A RESTART
// ───────────────────────────────────────────────────────────────────────────

describe('a restart does not lose the new operations', () => {
  it('a real run, serialised and recovered, still carries every substep', async () => {
    const { PIPELINES_DIR } = await import('../src/server/config');
    const store = await import('../src/server/pipeline-store');

    // A REAL RUN, not a hand-built record: the failing one, because that is
    // where the skipped operations are and where a report matters most.
    const { record } = await run({ archive: archiveWithNoUsableMedia() });
    const before = stageOf(record, 'assets').steps;

    // Written exactly as the store's own `persist()` writes it, then read back
    // the way main.ts reads at boot. No in-memory shortcut: this is the
    // kill/restart path.
    mkdirSync(PIPELINES_DIR, { recursive: true });
    const file = path.join(PIPELINES_DIR, 'pl_zzoperations.json');
    writeFileSync(file, `${JSON.stringify({ ...record, pipelineId: 'pl_zzoperations' }, null, 2)}\n`);

    try {
      expect(store.recover()).toBeGreaterThanOrEqual(1);
      const recovered = store.forSlug('zz-operations').find((r) => r.pipelineId === 'pl_zzoperations')!;
      const after = recovered.stages.find((s) => s.name === 'assets')!.steps;

      expect(namesOf(after)).toEqual(namesOf(before));
      expect(after.map((s) => s.status)).toEqual(before.map((s) => s.status));
      // The FACTS survive too — a report with its numbers stripped is a list.
      expect(after.map((s) => s.progress)).toEqual(before.map((s) => s.progress));
      expect(after.map((s) => s.note)).toEqual(before.map((s) => s.note));
      expect(after.map((s) => s.warnings)).toEqual(before.map((s) => s.warnings));
      expect(after.some((s) => s.status === 'skipped')).toBe(true);
    } finally {
      rmSync(file, { force: true });
    }
  });

  it('the operations go through the SAME record and file as the child-reported ones', async () => {
    // No agent-report-v2.json, no parallel store. A report is a report.
    const store = readFileSync(path.join(REPO_ROOT, 'admin/src/server/pipeline-store.ts'), 'utf-8');
    expect(store).toMatch(/const file = \(pipelineId: string\) =>/);
    expect(store).not.toMatch(/agent-report/);
    const src = readFileSync(path.join(REPO_ROOT, 'admin/src/server/pipeline.ts'), 'utf-8');
    // One step shape, used by the projection AND by the recorder.
    expect([...src.matchAll(/const step: PipelineStep = \{/g)]).toHaveLength(1);
    expect(src).toMatch(/function projectSteps\(job: JobRecord \| null\): PipelineStep\[\]/);
  });
});

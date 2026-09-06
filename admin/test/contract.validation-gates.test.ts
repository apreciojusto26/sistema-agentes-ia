// VALIDATION GATES — the six already-instrumented Validation checks, proven
// as REAL hard gates rather than mere reports.
//
// ─── THE PRINCIPLE UNDER TEST ───────────────────────────────────────────────
//
// If Validation can DEMONSTRATE a landing is invalid, the run cannot end
// `succeeded` — but a legitimate absence still can. Every `it.each` block
// below starts from ONE known-good fixture (`goldenFixture()`, proven to pass
// all six gates on its own — see 'the golden fixture passes clean') and
// applies exactly ONE deliberate mutation, so a failure can only be
// attributed to the thing that changed.
//
// This file is additive: it does not alter what contract.admin-operations.test.ts
// or contract.admin-pipeline.test.ts already established about these six
// checks — it exists to pin the GATE behaviour itself, permanently.
import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runPipeline, type PipelineRecord } from '../src/server/pipeline';
import type { JobRecord } from '../src/shared/jobs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const temps: string[] = [];
afterEach(() => {
  while (temps.length) rmSync(temps.pop()!, { recursive: true, force: true });
});

const tempDir = (prefix: string) => {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  temps.push(dir);
  return dir;
};

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

/**
 * A real archive with two accepted images and two displayable reviews, one
 * review missing a body (a LEGITIMATE data gap, never a defect).
 *
 * `scrapeProductId` lets a test simulate what a REAL scrape job reports back
 * on `job.params.productId` — the fake registry below never invents one on
 * its own, exactly like the real one never would.
 */
function goldenArchive(opts: { reviews?: unknown[]; brand?: string | null } = {}) {
  const dir = tempDir('lg-gate-arch-');
  mkdirSync(path.join(dir, 'images'), { recursive: true });
  writeFileSync(path.join(dir, 'images', 'a.webp'), 'bytes-a');
  writeFileSync(path.join(dir, 'images', 'b.webp'), 'bytes-b');
  writeFileSync(path.join(dir, 'product.json'), JSON.stringify({ title: 'Lámpara' }));
  writeFileSync(
    path.join(dir, 'canonical-product.json'),
    JSON.stringify({
      identity: {
        productId: 'prd_gate-1',
        name: 'Lámpara de galaxia',
        brand: opts.brand === undefined ? 'Astra' : opts.brand,
        sourceUrl: 'https://example.com/item/gate-1',
      },
      media: {
        images: [
          { localPath: 'output/images/a.webp', order: 0 },
          { localPath: 'output/images/b.webp', order: 1 },
        ],
        videos: [],
      },
      socialProof: {
        rating: 4.8,
        reviewCount: 2,
        reviews: opts.reviews ?? [
          { text: 'Preciosa, ilumina toda la habitación.', rating: 5, author: 'M***a', dateRaw: '25 AGO 2025' },
          { text: 'Cumple lo que promete.', rating: 4, author: 'J***n', dateRaw: '01 SEP 2025' },
        ],
      },
    }),
  );
  return dir;
}

/** A generated landing that satisfies every structural guarantee on its own. */
function goldenOutput(opts: { productId?: string; testimonialBodies?: string[] | null } = {}) {
  const dir = tempDir('lg-gate-out-');
  mkdirSync(path.join(dir, '.git'), { recursive: true });
  mkdirSync(path.join(dir, 'src/data'), { recursive: true });
  writeFileSync(path.join(dir, '.gitignore'), 'node_modules/\n');
  writeFileSync(path.join(dir, 'src/data/product.ts'), '');
  writeFileSync(
    path.join(dir, 'src/data/images.ts'),
    ["export const images = {", "  'product-01': a,", "  'product-02': b,", '};', ''].join('\n'),
  );
  writeFileSync(path.join(dir, '.generation.json'), JSON.stringify({ productId: opts.productId ?? 'prd_gate-1' }));
  const bodies = opts.testimonialBodies ?? [
    'Preciosa, ilumina toda la habitación.',
    'Cumple lo que promete.',
  ];
  if (bodies.length > 0) {
    writeFileSync(
      path.join(dir, 'src/data/testimonials.ts'),
      [
        'export const testimonials = [',
        ...bodies.map((b, i) => `  { id: "r${i + 1}", author: "A", rating: 5, date: "", body: ${JSON.stringify(b)}, variant: "reel" },`),
        '];',
        '',
      ].join('\n'),
    );
  }
  return dir;
}

function fakeRegistry(opts: { archive: string; outDir: string; scrapeProductId?: string }) {
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
    // REPORTS BACK A productId, exactly as a real scrape job's params would
    // once it identifies the source — the fake registries elsewhere in this
    // suite never set one, which is why they never exercise the mismatch arm
    // of validate:ownership. This one does, on purpose.
    createScrapeJob: (p: Record<string, unknown>) =>
      make('scrape', { ...p, productId: opts.scrapeProductId ?? 'prd_gate-1' }, { title: 'A product' }),
    createContentJob: (p: unknown) => {
      writeFileSync(contentPath, JSON.stringify({ product: { steps: [{ title: 'paso 1' }] } }));
      return make('content', p, { stagedPath: contentPath, faqCount: 6 });
    },
    createGenerateJob: (p: { slug: string }) => make('generate', p, { outDir: opts.outDir, slug: p.slug }),
  } as never;
}

const okBuild = async () => ({ ok: true, message: null });
const readyOk = async () => ({ ready: true, total: 15, results: [] });
const readyFail = async () => ({
  ready: false,
  total: 15,
  results: [{ name: 'Build present', ok: false, detail: 'dist/client/index.html not found' }],
});

async function runGolden(opts: {
  archive?: string;
  outDir?: string;
  scrapeProductId?: string;
  siteUrl?: string | null;
  readReadiness?: typeof readyOk;
} = {}) {
  const archive = opts.archive ?? goldenArchive();
  const outDir = opts.outDir ?? goldenOutput();
  const record = await runPipeline(
    { url: 'https://example.com/item/gate-1', slug: 'zz-gate', siteUrl: opts.siteUrl },
    {
      registry: fakeRegistry({ archive, outDir, scrapeProductId: opts.scrapeProductId }),
      runBuild: okBuild,
      readReadiness: opts.readReadiness ?? readyOk,
    },
  );
  return { record, archive, outDir };
}

const validateStep = (record: PipelineRecord, name: string) =>
  record.stages.find((s) => s.name === 'validate')!.steps.find((s) => s.name === name)!;

describe('the golden fixture passes clean', () => {
  it('all six gates pass and the pipeline succeeds', async () => {
    const { record } = await runGolden();
    expect(record.status, record.error ?? 'unexpected failure').toBe('succeeded');
    const validate = record.stages.find((s) => s.name === 'validate')!;
    expect(validate.status).toBe('pass');
    expect(validate.steps.every((s) => s.status === 'passed' || s.status === 'warning')).toBe(true);
  });
});

describe('VALIDATION GATES — a demonstrated defect fails the run', () => {
  it('1. Structural Grammar V3: an uncollapsed region fails, never a warning', async () => {
    const outDir = goldenOutput();
    // No astro build runs in this suite (runBuild is faked), so this test
    // supplies dist/client/index.html itself — a REAL, currently-verified
    // landing's REAL built page, read-only, with ONE review card's class list
    // mutated so its markup matches no shape FIXED_GRAMMAR_V3 declares for
    // reviews/cards — the exact technique used to design and verify
    // collectUncollapsedRegions() in the first place. The file on disk under
    // outputs/ is never written to.
    const REAL_LANDING = path.resolve(__dirname, '../../outputs/1005007345199501/dist/client/index.html');
    const original = readFileSync(REAL_LANDING, 'utf-8');
    const needle =
      '<article aria-label="1 de 29" class="flex w-[86%] shrink-0 snap-start flex-col rounded-card bg-white p-5 text-left shadow-lift sm:w-[48%] xl:w-[31%]">';
    expect(original).toContain(needle);
    const html = original.replace(needle, needle.replace('rounded-card', 'rounded-card mutated-extra-class'));
    expect(html).not.toBe(original);
    mkdirSync(path.join(outDir, 'dist/client'), { recursive: true });
    writeFileSync(path.join(outDir, 'dist/client/index.html'), html);

    const { record } = await runGolden({ outDir });
    expect(record.status).toBe('failed');
    const grammar = validateStep(record, 'validate:grammar');
    expect(grammar.status).toBe('failed');
    expect(grammar.code).toBe('validation-grammar-failed');
  });

  it('2. Asset references: unresolved refs > 0 fails — a broken image cannot stay green', async () => {
    const outDir = goldenOutput();
    // Drop one of the two keys the real Asset Producer will reference —
    // whichever gallery entry needs it now resolves to nothing.
    writeFileSync(
      path.join(outDir, 'src/data/images.ts'),
      ["export const images = {", "  'product-01': a,", '};', ''].join('\n'),
    );
    const { record } = await runGolden({ outDir });
    expect(record.status).toBe('failed');
    const assetRefs = validateStep(record, 'validate:asset-refs');
    expect(assetRefs.status).toBe('failed');
    expect(assetRefs.code).toBe('validation-assets-failed');
  });

  it('3. Product ownership: a productId mismatch fails closed', async () => {
    // The scrape reports back a DIFFERENT productId than the one the landing
    // folder's own .generation.json declares — the exact contamination the
    // isolation rule exists to catch.
    const { record } = await runGolden({ scrapeProductId: 'prd_someone-else' });
    expect(record.status).toBe('failed');
    const ownership = validateStep(record, 'validate:ownership');
    expect(ownership.status).toBe('failed');
    expect(ownership.code).toBe('validation-ownership-failed');
  });

  it('4. Social proof provenance: one rendered review with no CanonicalReview trace fails', async () => {
    const outDir = goldenOutput({
      // One of these two bodies is real; the other traces to no review this
      // canonical product's reviews produce — "29/30 factual" in miniature.
      testimonialBodies: ['Preciosa, ilumina toda la habitación.', 'Esta reseña no existe en ningún lado.'],
    });
    const { record } = await runGolden({ outDir });
    expect(record.status).toBe('failed');
    const proof = validateStep(record, 'validate:social-proof');
    expect(proof.status).toBe('failed');
    expect(proof.code).toBe('validation-social-proof-failed');
  });

  it('5. Production readiness: NOT READY fails Validation, never a reimplementation of its 15 checks', async () => {
    const { record } = await runGolden({ readReadiness: readyFail });
    expect(record.status).toBe('failed');
    const readiness = validateStep(record, 'validate:readiness');
    expect(readiness.status).toBe('failed');
    expect(readiness.code).toBe('validation-readiness-failed');
  });
});

describe('VALIDATION GATES — a legitimate absence still ends green', () => {
  it('6. zero real reviews (ReviewsSection absent) still passes', async () => {
    const archive = goldenArchive({ reviews: [] });
    const outDir = goldenOutput({ testimonialBodies: [] });
    const { record } = await runGolden({ archive, outDir });
    expect(record.status, record.error ?? 'unexpected failure').toBe('succeeded');
    expect(validateStep(record, 'validate:social-proof').status).not.toBe('failed');
  });

  it('7. brand = null (source published none) still passes', async () => {
    const archive = goldenArchive({ brand: null });
    const { record } = await runGolden({ archive });
    expect(record.status, record.error ?? 'unexpected failure').toBe('succeeded');
    // The warning lives on normalize:identity — brand is not a validate concern
    // at all, so none of the six gates so much as look at it.
    const normalizeStage = record.stages.find((s) => s.name === 'normalize')!;
    expect(normalizeStage.steps.find((s) => s.name === 'normalize:identity')!.status).toBe('warning');
  });

  it('8. SITE_URL absent in Preview still passes', async () => {
    // No shopifyHandle and no siteUrl — Preview mode, exactly as most of this
    // suite already runs. The readiness authority itself (unmodified by this
    // feature) is what decides Preview tolerates this; the gate only forwards
    // its verdict.
    const { record } = await runGolden({ siteUrl: null });
    expect(record.status, record.error ?? 'unexpected failure').toBe('succeeded');
    expect(record.commerceMode).toBe('preview-only');
  });

  it('9. Auto Accent canonical fallback (no derivable colour) still passes', async () => {
    // deriveProductAccent() returning `source: 'canonical'` changes nothing
    // about product data, structure, assets, ownership or social proof — none
    // of the six gates read theme provenance at all, so a fixture with no
    // theme.json (the canonical default) is the fallback case by construction.
    const { record } = await runGolden();
    expect(record.status, record.error ?? 'unexpected failure').toBe('succeeded');
    expect(validateStep(record, 'validate:grammar').status).not.toBe('failed');
    expect(validateStep(record, 'validate:readiness').status).not.toBe('failed');
  });
});

// THE ADMIN PIPELINE, END TO END, WITH NOTHING EXTERNAL.
//
// There was an end-to-end verification of this pipeline and it needed a live
// AliExpress page, a Gemini key and credit. That is a SMOKE TEST: it proves the
// integration works today, and it fails when a third party changes a selector,
// when a key expires, or when the machine is offline. None of those are
// regressions in this repository, and a suite that cannot tell them apart from
// real breakage is a suite people learn to ignore.
//
// So the regression E2E is hermetic, and the line is drawn at the EXTERNAL
// boundaries only:
//
//   MOCKED   the scrape (a fixture on disk instead of a live page)
//            the Content Agent (a deterministic writer instead of Gemini)
//
//   REAL     the orchestrator and every stage transition
//            the job registry, its child processes and its recorded state
//            archiveScrape and the normalizer -> canonical-product.json
//            THE ASSET PRODUCER — selection, dedupe, slot assignment
//            THE PALETTE RESOLVER — precedence, contrast, stylesheet write
//            THE BRAND-MARK RESOLVER — precedence, fingerprint, reuse
//            generate-landing.mjs and the assembler
//            content/landing-astravibe
//            astro build
//            the structural grammar validator
//
// THE MOCKS ARE PROCESSES, NOT STAGE STUBS. Both adapters are real child
// processes the registry spawns, waits on and records an exit code for. Stubbing
// the stages instead would have skipped the state machine, and the state machine
// is most of what this test exists to check.
import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { existsSync, readFileSync, writeFileSync, rmSync, mkdirSync, mkdtempSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JobRegistry } from '../src/server/jobs/registry';
import { archiveScrape } from '../src/server/jobs/archive';
import { runPipeline, defaultRunBuild, PIPELINE_STAGES, type PipelineRecord } from '../src/server/pipeline';
import { FIXED_TEMPLATE_NAME, FIXED_TEMPLATE_RELATIVE } from '../../scripts/lib/fixed-template.mjs';
import { structuralFingerprint } from '../../scripts/lib/fingerprint.mjs';
// V3 IS THE CURRENT PROFILE for generated output. It keeps V2's optional
// reviews section and adds the comparison row states V2 declared by accident
// of its fixtures rather than by what the template can render. V1 and V2 remain
// the sealed historical record and keep their own tests.
import { FIXED_GRAMMAR_V3 as FIXED_GRAMMAR, FIXED_OPTIONAL_SLOTS_V3 as FIXED_OPTIONAL_SLOTS } from '../../scripts/lib/fixed-grammar-v3.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ADMIN_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(ADMIN_ROOT, '..');
const E2E = path.join(ADMIN_ROOT, 'test/fixtures/e2e');

const SLUG = 'zz-admin-e2e';
const OUT_DIR = path.join(REPO_ROOT, 'outputs', SLUG);

/**
 * A registry whose only differences from production are the two external
 * boundaries. Everything else — the queue, the child spawning, the archive, the
 * normalizer — is the real implementation.
 */
function hermeticRegistry(scrapeOut: string) {
    // The scraper's job is turning a URL into files in its output directory.
    // The adapter writes the fixture there instead, stamped with the productId
    // the registry minted — LG_PRODUCT_ID, exactly as the real scraper reads it.
  return new JobRegistry({
    buildScrapeSpec: (params) => ({
      command: process.execPath,
      args: [path.join(E2E, 'fake-scraper.mjs')],
      cwd: REPO_ROOT,
      env: { ...process.env, E2E_SCRAPE_OUT: scrapeOut, LG_PRODUCT_ID: params.productId ?? '' },
      timeoutMs: 30_000,
    }),
    // REAL ARCHIVER, fixture source. Injecting srcDir keeps every ownership
    // gate, ghost-image prune and copy path under test; only where the bytes
    // come from changes. The gate is load-bearing here: it is what forces the
    // adapter above to honour the minted id rather than hardcode one.
    archiveScrape: (jobId, expectedProductId) =>
      archiveScrape(jobId, { expectedProductId, srcDir: scrapeOut }),
    // The LLM boundary. Same contract, same --staged path, no network.
    buildContentSpec: (params, opts) => ({
      command: process.execPath,
      args: [
        path.join(E2E, 'fake-content-agent.mjs'),
        '--product',
        params.scrapeProductPath,
        '--staged',
        path.join(ADMIN_ROOT, '.staged/content.json'),
        '--attempts-dir',
        path.join(ADMIN_ROOT, '.jobs', opts.jobId, 'content'),
      ],
      cwd: REPO_ROOT,
      env: { ...process.env, LG_EVENTS: '1' },
      timeoutMs: 30_000,
    }),
    // buildGenerateSpec is NOT overridden. The real generator runs.
  });
}

const clean = () => rmSync(OUT_DIR, { recursive: true, force: true });

// The install-and-build is the slow part and it is also the point: "build PASS"
// asserted against a stub is not an assertion. One run, shared by every test.
let record: PipelineRecord;
let scrapeOut: string;
/** How many times the fake provider was asked for a mark, across BOTH runs. */
let faviconCalls = 0;
/** The second run, used to prove an artefact is reused rather than remade. */
let secondRun: PipelineRecord;

// FILE-LEVEL, not per-describe. Three describes read the SAME generated
// landing, and a cleanup scoped to the first one deleted it out from under the
// other two — the install-and-build is far too slow to repeat per group.
beforeAll(async () => {
  clean();
  mkdirSync(path.join(ADMIN_ROOT, '.staged'), { recursive: true });
  scrapeOut = path.join(mkdtempSync(path.join(tmpdir(), 'admin-e2e-')), 'output');
  // A DETERMINISTIC FAKE AT THE PROVIDER BOUNDARY. No real image API is called
  // — none exists in this repo — and the count is what proves "generate once".
  const generateFavicon = () => {
    faviconCalls += 1;
    return readFileSync(path.join(REPO_ROOT, 'admin/test/fixtures/assets/a/images/img_2.png'));
  };

  record = await runPipeline(
    {
      url: 'https://fixture.invalid/product',
      slug: SLUG,
      force: true,
      merchantPath: path.join(E2E, 'merchant.json'),
      // NO assetsPath. The assets stage PRODUCES its own output now — that is
      // the whole point of F4, and passing a fixture here would test the
      // plumbing rather than the producer.
      //
      // The palette IS passed, because it is operator configuration: nothing in
      // any runtime can read a pixel, so there is no derived palette to produce.
      themePath: path.join(E2E, 'theme.json'),
    },
    { registry: hermeticRegistry(scrapeOut), generateFavicon },
  );

  // A SECOND RUN OVER THE SAME ARCHIVE. Same inputs, same fingerprint — the
  // provider must not be asked again. The build is skipped: what is under test
  // is the resolution, and repeating an astro build would double the runtime
  // for nothing.
  secondRun = await runPipeline(
    {
      scrapeJobId: record.stages.find((s) => s.name === 'scrape')!.jobId!,
      slug: `${SLUG}-again`,
      force: true,
      merchantPath: path.join(E2E, 'merchant.json'),
      themePath: path.join(E2E, 'theme.json'),
    },
    {
      registry: hermeticRegistry(scrapeOut),
      generateFavicon,
      runBuild: async () => ({ ok: true, message: null }),
    },
  );
}, 900_000);

afterAll(() => {
  rmSync(path.join(REPO_ROOT, 'outputs', `${SLUG}-again`), { recursive: true, force: true });
  // KEEP_E2E=1 leaves the generated landing on disk. The run takes a minute and
  // most of what can go wrong is only visible in the artefact it produces.
  if (process.env.KEEP_E2E !== '1') clean();
  rmSync(path.dirname(scrapeOut), { recursive: true, force: true });
});

describe('the Admin pipeline runs end to end with no external dependency', () => {
  test('the run succeeds', () => {
    expect(record.error, record.error ?? '').toBeNull();
    expect(record.status).toBe('succeeded');
  });

  test('every stage ran, in order, and all passed', () => {
    expect(record.stages.map((s) => s.name)).toEqual([
      'scrape',
      'normalize',
      'content',
      'assets',
      'generate',
      'build',
      'validate',
    ]);
    expect(record.stages.map((s) => s.status)).toEqual(PIPELINE_STAGES.map(() => 'pass'));
  });

  test('no stage is named design, and no design job was created', () => {
    // The Design Agent is not skipped, disabled or stubbed. It is not reachable:
    // the stage list has no slot for it and buildGenerateSpec no longer knows
    // how to append `--design`.
    expect(record.stages.some((s) => /design/i.test(s.name))).toBe(false);
    expect(existsSync(path.join(OUT_DIR, 'src/data/design.ts'))).toBe(false);
  });

  test('the landing came from the template authority, not a literal', () => {
    const manifest = JSON.parse(readFileSync(path.join(OUT_DIR, '.generation.json'), 'utf-8'));
    expect(manifest.template.dir).toBe(FIXED_TEMPLATE_RELATIVE);
    expect(manifest.template.dir).toContain(FIXED_TEMPLATE_NAME);
    expect(manifest.slug).toBe(SLUG);
    expect(manifest.commerce.mode).toBe('preview');
  });

  test('the real normalizer produced the canonical product', () => {
    // Not mocked: archiveScrape ran the actual normalizer over the fixture, and
    // the generator consumed its output through --product.
    const scrapeStage = record.stages.find((s) => s.name === 'scrape')!;
    const canonical = path.join(ADMIN_ROOT, '.jobs', scrapeStage.jobId!, 'scrape/canonical-product.json');
    expect(existsSync(canonical), 'the normalizer wrote no canonical-product.json').toBe(true);
    // The MINTED id, not the fixture's. archiveScrape's ownership gate refuses
    // an archive whose product.json disagrees with the id the registry minted,
    // so this equality is the gate having actually held.
    const product = JSON.parse(readFileSync(canonical, 'utf-8'));
    expect(product.identity.productId).toBe(record.productId);
    expect(record.productId).toMatch(/^prd_/);
  });

  test('the artefact is complete', () => {
    for (const rel of ['.git', '.gitignore', 'src/data/product.ts', 'src/data/images.ts', '.generation.json']) {
      expect(existsSync(path.join(OUT_DIR, rel)), `missing ${rel}`).toBe(true);
    }
  });
});

describe('the generated landing respects every Fixed authority', () => {
  const productTs = () => readFileSync(path.join(OUT_DIR, 'src/data/product.ts'), 'utf-8');

  test('packs came from the merchant config, not from the Content Agent', () => {
    // The adapter writes a packs decoy into content.json because the Version A
    // schema requires the key. If the projection ever stopped dropping it, this
    // is where it would surface.
    expect(productTs()).not.toContain('IGNORED-BY-FIXED');
    expect(productTs()).toMatch(/id: "x1"/);
    expect(productTs()).toMatch(/id: "x3"/);
  });

  test('the free-shipping threshold came from the merchant config', () => {
    expect(productTs()).toMatch(/freeOverCents:\s*4900/);
  });

  test('media came from the asset pipeline, and the template stock is gone', () => {
    const images = readFileSync(path.join(OUT_DIR, 'src/data/images.ts'), 'utf-8');
    expect(images).toMatch(/product-01/);
    expect(images).toContain('GENERATED by scripts/lib/asset-pipeline.mjs');
  });

  test('the assets stage PRODUCED an output and persisted it', () => {
    // F4's gate. Before this the stage only checked that an images/ directory
    // existed; the media authority had no runtime presence in the Admin at all.
    const scrapeStage = record.stages.find((s) => s.name === 'scrape')!;
    const archive = path.join(ADMIN_ROOT, '.jobs', scrapeStage.jobId!, 'scrape');
    const produced = JSON.parse(readFileSync(path.join(archive, 'fixed-assets.json'), 'utf-8'));
    const manifest = JSON.parse(readFileSync(path.join(archive, 'fixed-assets.manifest.json'), 'utf-8'));

    expect(produced.gallery.length).toBe(3);
    expect(produced.productMediaStrip.length).toBe(3);
    expect(Object.keys(produced.stepMedia)).toEqual(['step-0', 'step-1', 'step-2']);
    expect(record.stages.find((s) => s.name === 'assets')!.detail).toMatch(/3 asset\(s\)/);

    // PROVENANCE: every asset traceable to what the scrape recorded, with real
    // dimensions read from the file, and classified as listing media — never
    // as customer content, which no source in this pipeline supplies.
    for (const asset of manifest.assets) {
      expect(asset.sourceRef).toMatch(/^images\/img_\d\.png$/);
      expect(asset.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(asset.width).toBeGreaterThan(0);
      expect(asset.height).toBeGreaterThan(0);
      expect(asset.provenance).toBe('product/promotional');
    }
    expect(new Set(manifest.assets.map((a: { sha256: string }) => a.sha256)).size).toBe(3);
  });

  test('every produced ref resolves to a file the build actually copied', () => {
    // The F3 lesson: an unresolvable ref renders a blank frame behind a green
    // build. resolveMedia() answers an unknown key with an empty placeholder.
    const images = readFileSync(path.join(OUT_DIR, 'src/data/images.ts'), 'utf-8');
    const keys = new Set([...images.matchAll(/^\s*'([^']+)':/gm)].map((m) => m[1]!));
    const productTs = readFileSync(path.join(OUT_DIR, 'src/data/product.ts'), 'utf-8');
    const refs = [...productTs.matchAll(/asset: "([^"]+)"/g)].map((m) => m[1]!);
    expect(refs.length).toBeGreaterThan(0);
    expect(refs.filter((r) => !keys.has(r)), 'refs that resolve to an empty placeholder').toEqual([]);
  });

  test('the step photographs were assigned by the asset layer, not by the copy', () => {
    // The fake Content Agent writes `step.media` pointing at template slots
    // (step-01, ugc-01, ugc-02) because a Version A document carries it. The
    // projection drops those and the producer assigns product-NN instead.
    const productTs = readFileSync(path.join(OUT_DIR, 'src/data/product.ts'), 'utf-8');
    const stepsBlock = /steps: \[([\s\S]*?)\n  \],/.exec(productTs)?.[1] ?? '';
    expect(stepsBlock).toMatch(/product-0\d/);
    expect(stepsBlock, 'a content-chosen slot key survived into the steps').not.toMatch(/ugc-0\d|step-01/);
  });
});

describe('the palette is the operator\'s, and only colour moved', () => {
  const css = () => readFileSync(path.join(OUT_DIR, 'src/styles/global.css'), 'utf-8');

  test('the operator\'s colours reached the stylesheet', () => {
    expect(css()).toMatch(/--color-grape:\s*#0F766E;/);
    expect(css()).toMatch(/--color-grape-tint:\s*#E6FFFA;/);
  });

  test('tokens the operator did not state kept the canonical value', () => {
    // Precedence is per token: changing an accent must not blank the rest.
    expect(css()).toMatch(/--color-bone:\s*#F7F3EC;/);
    expect(css()).toMatch(/--color-steel:\s*#63686E;/);
  });

  test('nothing but colour values changed', () => {
    // A recolour rewrites numbers inside @theme. It never touches a class,
    // never adds a declaration and never makes markup depend on colour — which
    // is exactly why the structural fingerprint below does not move.
    const template = readFileSync(
      path.join(REPO_ROOT, 'content/landing-astravibe/src/styles/global.css'),
      'utf-8',
    );
    expect(css().split('\n')).toHaveLength(template.split('\n').length);
    const stripHex = (t: string) => t.replace(/#[0-9A-Fa-f]{6}/g, '#XXXXXX');
    expect(stripHex(css())).toBe(stripHex(template));
  });

  test('the theme manifest records where every token came from', () => {
    const manifest = JSON.parse(readFileSync(path.join(OUT_DIR, '.theme.json'), 'utf-8'));
    expect(manifest.sources.grape).toBe('override');
    expect(manifest.sources.bone).toBe('canonical');
    expect(manifest.adjustments).toEqual([]);
    expect(Math.min(...manifest.contrast.map((c: { ratio: number }) => c.ratio))).toBeGreaterThanOrEqual(4.5);
  });
});

describe('the built preview sells nothing', () => {
  const html = () => readFileSync(path.join(OUT_DIR, 'dist/client/index.html'), 'utf-8');

  test('astro build produced a page', () => {
    expect(existsSync(path.join(OUT_DIR, 'dist/client/index.html'))).toBe(true);
  });

  test('and the stage TYPE-CHECKED it first — both commands, neither mocked', () => {
    // THIS RUN USED THE REAL defaultRunBuild. No `runBuild` override is passed
    // for `record` (only the second, artefact-free run overrides it), so the
    // stage really spawned `astro check` and then `astro build` inside the
    // generated landing, against the landing's own node_modules.
    //
    // `astro build` DOES NOT TYPECHECK — it transpiles. A landing whose data
    // modules contradict their own types builds perfectly and fails at a
    // customer, which is exactly what nearly shipped when the emitter began
    // writing `brand: null` against a `brand: string` type.
    const build = record.stages.find((s) => s.name === 'build')!;
    expect(build.status).toBe('pass');
    expect(build.detail, 'the build stage did not report a type check').toBe(
      'type-checked and prerendered',
    );
    // The landing carries the checker it was checked with. Without it `astro
    // check` offers to install it, interactively, and the stage guards on this
    // rather than waiting on a prompt.
    expect(existsSync(path.join(OUT_DIR, 'node_modules/@astrojs/check'))).toBe(true);
    expect(existsSync(path.join(OUT_DIR, 'node_modules/typescript'))).toBe(true);
  });

  test('a landing that does not typecheck FAILS the stage, and is never built', async () => {
    // The gate, exercised for real: break a type in the generated landing and
    // run the SAME defaultRunBuild the pipeline uses — not a stub, not a
    // reimplementation. It must fail as a CHECK failure, and the build output
    // must be untouched, because building sources that are known to be wrong
    // produces an artefact that looks finished.
    const productTs = path.join(OUT_DIR, 'src/data/product.ts');
    const original = readFileSync(productTs, 'utf-8');
    const page = path.join(OUT_DIR, 'dist/client/index.html');
    // Untouched is measured, not assumed — and non-destructively, because the
    // rest of this suite reads the page this run produced.
    const before = statSync(page).mtimeMs;

    // `name` is typed `string`. A number is a contradiction `astro build`
    // transpiles without complaint, which is the whole reason check runs.
    writeFileSync(productTs, original.replace(/^ {2}name: ".*",$/m, '  name: 42,'));
    expect(readFileSync(productTs, 'utf-8'), 'the type-error probe is a no-op').not.toBe(original);
    try {
      const result = await defaultRunBuild(OUT_DIR);
      expect(result.ok, 'a landing with a type error was reported as built').toBe(false);
      expect(result.message).toMatch(/astro check failed/);
      expect(statSync(page).mtimeMs, 'it built anyway, after a fatal check').toBe(before);
    } finally {
      writeFileSync(productTs, original);
    }
  }, 300_000);

  test('no fabricated price, no Shopify identity, no real cart', () => {
    expect(html()).not.toMatch(/0,00\s*€/);
    expect(html()).not.toMatch(/gid:\/\/shopify/);
    expect(html()).toContain('data-preview-cta="true"');
    expect(html().replace(/props="[^"]*"/g, '')).not.toMatch(/Agregar al carrito|Añadir al carrito/);
  });

  test('it matches the sealed Preview structural profile', () => {
    // THE STRONGEST ASSERTION IN THIS FILE. A landing produced by the whole
    // Admin pipeline — a different product, different copy, three photographs
    // instead of seven — fingerprints identically to the sealed A/B preview
    // profile. Same page, different data, which is the entire premise of Fixed.
    const profile = structuralFingerprint(
      readFileSync(path.join(REPO_ROOT, 'content/landing-astravibe/dist-ab-a-preview/client/index.html'), 'utf-8'),
      FIXED_GRAMMAR,
      FIXED_OPTIONAL_SLOTS,
    );
    const built = structuralFingerprint(html(), FIXED_GRAMMAR, FIXED_OPTIONAL_SLOTS);
    expect(built.elements).toBe(profile.elements);
    expect(built.hash).toBe(profile.hash);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// THE BRAND MARK
// ───────────────────────────────────────────────────────────────────────────

describe('the mark is generated once and then reused', () => {
  const manifestPath = () => {
    const scrapeStage = record.stages.find((s) => s.name === 'scrape')!;
    return path.join(ADMIN_ROOT, '.jobs', scrapeStage.jobId!, 'scrape/fixed-favicon.json');
  };

  test('the fake provider was called EXACTLY once across two runs', () => {
    // The whole point of persisting the artefact. A provider is
    // non-deterministic, so calling it per build would ship a different icon
    // every time and cost an image call for a changed FAQ entry.
    expect(secondRun.status).toBe('succeeded');
    expect(faviconCalls).toBe(1);
  });

  test('the first run generated, the second reused', () => {
    const manifest = JSON.parse(readFileSync(manifestPath(), 'utf-8'));
    expect(manifest.source).toBe('generated');
    expect(manifest.reused).toBe(true);
    expect(manifest.fingerprint).toMatch(/^[0-9a-f]{64}$/);
  });

  test('the artefact records hashes, and no clock in the deterministic half', () => {
    const manifest = JSON.parse(readFileSync(manifestPath(), 'utf-8'));
    for (const file of manifest.files) expect(file.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(manifest.operational.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    const deterministic = { ...manifest, operational: undefined, reused: undefined };
    expect(JSON.stringify(deterministic)).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  test('the generated mark reached the landing, not just the archive', () => {
    // Asserting the file exists in public/ is not enough — the browser has to
    // reference it. This checks the artefact AND the head that points at it.
    const svg = readFileSync(path.join(OUT_DIR, 'public/favicon.svg'), 'utf-8');
    expect(svg).toContain('data:image/png;base64,');

    const landingManifest = JSON.parse(readFileSync(path.join(OUT_DIR, '.favicon.json'), 'utf-8'));
    expect(landingManifest.source).toBe('operator');
  });

  test('the built HTML really references it', () => {
    const html = readFileSync(path.join(OUT_DIR, 'dist/client/index.html'), 'utf-8');
    expect(html).toMatch(/<link[^>]*rel="icon"[^>]*href="\/favicon\.svg"/);
    expect(existsSync(path.join(OUT_DIR, 'dist/client/favicon.svg'))).toBe(true);
  });
});

// End-to-end pipeline orchestration.
//
// THE ADMIN ORCHESTRATES; IT DOES NOT REIMPLEMENT. Every stage below is an
// existing capability invoked through the existing JobRegistry:
//   scrape   -> scraper/scrape.js        (+ normalize, inside its archive step)
//   content  -> scripts/generate-content.mjs
//   generate -> scripts/generate-landing.mjs   (assets + handle; NO DesignSpec)
//   build    -> astro build inside outputs/<slug>
// scripts/generate-design.mjs is deliberately absent from this list — see
// PIPELINE_STAGES for why the Design Agent is not run at all.
// There is no second copy of any agent here. `contract.admin-pipeline.test.ts`
// asserts that structurally, by scanning this directory for the prompts and
// registries that belong to the scripts.
//
// STATE IS REAL, NEVER SIMULATED. A stage is `running` because a child process
// is running, and `pass` because that child exited 0 and emitted its result.
// Nothing here advances on a timer.
//
// A failed stage STOPS the pipeline: every later stage becomes `skipped`, not
// `failed`, because they never ran — reporting them as failures would invent a
// verdict about work that was never attempted.
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { produceFixedAssets } from '../../../scripts/lib/fixed-asset-producer.mjs';
import { collectAssetOutputIssues } from '../../../scripts/lib/fixed-asset-output.mjs';
import { resolveFixedFavicon, paletteFromCss } from '../../../scripts/lib/fixed-favicon.mjs';
import { FIXED_TEMPLATE_RELATIVE } from '../../../scripts/lib/fixed-template.mjs';
import path from 'node:path';
import type { JobRecord, JobStatus } from '../shared/jobs';
import type { JobRegistry } from './jobs/registry';
import { JOBS_DIR, OUTPUTS_DIR, REPO_ROOT, GEMINI_MODEL } from './config';

/**
 * The stages a Fixed generation actually runs. DEFINED IN src/shared/ and
 * re-exported here so existing server-side importers keep working — the client
 * needs the same list as a runtime value, and reaching into this module for it
 * would drag node:fs into the browser bundle.
 *
 * `design` USED TO BE IN IT, between content and assets, and it really ran: it
 * created a Gemini design job, waited for it, failed the pipeline if no
 * DesignSpec came back, handed the result to generate as `--design`, and made
 * validate require the resulting src/data/design.ts. That is the Version A
 * architecture, and this repo is not Version A.
 *
 * Fixed AstraVibe's premise is that every generated product is the SAME PAGE
 * with different data in it. A Design Agent choosing a composition is the one
 * thing that premise forbids, so the stage is REMOVED rather than stubbed. No
 * always-default DesignSpec, no fixed spec written to disk, no "run it and
 * ignore the output" — those all keep an LLM deciding layout and merely hide
 * the decision. The job is never created at all.
 *
 * The design CONTRACT modules (scripts/lib/design-contract.mjs, design-registry
 * .mjs, admin/src/server/validation/design.ts) deliberately stay in the tree.
 * They are still exercised by the Design System suites against
 * content/landing-base, which is experimental tooling that physically remains
 * here. Keeping them is not a contradiction: nothing in this list can reach
 * them, and admin/test/contract.design-bypass.test.ts proves it.
 */
export { PIPELINE_STAGES, type PipelineStageName } from '../shared/pipeline-stages';
import { PIPELINE_STAGES } from '../shared/pipeline-stages';
import type { PipelineStageName } from '../shared/pipeline-stages';

export type PipelineStageStatus = 'pending' | 'running' | 'pass' | 'failed' | 'skipped';

export type PipelineStage = {
  name: PipelineStageName;
  status: PipelineStageStatus;
  /** The JobRecord this stage delegated to, when it delegated to one. */
  jobId: string | null;
  startedAt: string | null;
  endedAt: string | null;
  /** Sanitised — never a raw stack, never a secret. */
  error: string | null;
  /** Short human-readable outcome, e.g. "family=tech · 9 sections". */
  detail: string | null;
};

/**
 * Commerce posture of the produced landing. THREE distinct states, because
 * collapsing them is how a landing gets called "ready to sell" when nothing
 * has ever talked to Shopify.
 */
export type CommerceMode = 'preview-only' | 'commerce-configured' | 'shopify-live-verified';

export type PipelineRecord = {
  pipelineId: string;
  slug: string;
  sourceUrl: string | null;
  productId: string | null;
  shopifyHandle: string | null;
  commerceMode: CommerceMode;
  status: 'running' | 'succeeded' | 'failed';
  currentStage: PipelineStageName | null;
  stages: PipelineStage[];
  outputPath: string | null;
  createdAt: string;
  finishedAt: string | null;
  error: string | null;
};

const TERMINAL: JobStatus[] = ['succeeded', 'failed', 'cancelled', 'timed-out', 'interrupted'];

/**
 * Strips anything that could carry a credential out of a message shown to the
 * operator. Applied to EVERY error that leaves this module.
 */
export function sanitiseError(message: string, secrets: (string | undefined)[] = []): string {
  let out = message;
  for (const secret of secrets) {
    if (secret && secret.length >= 8) out = out.split(secret).join('«REDACTED»');
  }
  // Common credential-shaped env assignments, whatever their value.
  out = out.replace(/\b([A-Z0-9_]*(?:TOKEN|KEY|SECRET|PASSWORD)[A-Z0-9_]*)\s*=\s*\S+/g, '$1=«REDACTED»');
  // A stack trace is noise for an operator when a real message exists.
  const firstFrame = out.indexOf('\n    at ');
  if (firstFrame > 0) out = out.slice(0, firstFrame);
  return out.trim();
}

function nowIso() {
  return new Date().toISOString();
}

function freshStages(): PipelineStage[] {
  return PIPELINE_STAGES.map((name) => ({
    name,
    status: 'pending' as PipelineStageStatus,
    jobId: null,
    startedAt: null,
    endedAt: null,
    error: null,
    detail: null,
  }));
}

/** Waits for a job to reach a genuinely terminal status. */
async function awaitJob(registry: JobRegistry, jobId: string, pollMs = 250): Promise<JobRecord> {
  for (;;) {
    const job = registry.get(jobId);
    if (job && TERMINAL.includes(job.status)) return job;
    await new Promise((r) => setTimeout(r, pollMs));
  }
}

export type PipelineInput = {
  /** AliExpress product URL to scrape. Mutually exclusive with scrapeJobId. */
  url?: string;
  /** Reuse an existing successful scrape instead of re-scraping. */
  scrapeJobId?: string;
  slug: string;
  /** Operator-supplied. Its PRESENCE selects commerce mode (Fase 5). */
  shopifyHandle?: string | null;
  /** F3: the operator's commercial configuration — identity, policy and packs. */
  merchantPath?: string | null;
  /** F3: an explicit asset-pipeline output. Absent = media derived from the scrape. */
  assetsPath?: string | null;
  /** F5: the operator's palette. Absent = the canonical AstraVibe colours. */
  themePath?: string | null;
  /** F6: an operator-supplied brand mark (PNG). Absent = generated or monogram. */
  faviconPath?: string | null;
  force?: boolean;
};

export type PipelineDeps = {
  registry: JobRegistry;
  /** Seam for tests: replaces the real `astro build` spawn. */
  runBuild?: (outDir: string) => Promise<{ ok: boolean; message: string | null }>;
  /**
   * The brand-mark provider. UNSET IN PRODUCTION, because none exists: there is
   * no image-generation SDK, API, model or credential anywhere in this repo —
   * audited, not assumed. The seam is here so a backend plugs in without
   * redesign, and so the hermetic E2E can prove the call-count rules without
   * touching a network.
   */
  generateFavicon?: (input: Record<string, unknown>) => Promise<Buffer | null> | Buffer | null;
  onUpdate?: (record: PipelineRecord) => void;
};

/**
 * Runs the whole pipeline. Returns the final record; `onUpdate` is called after
 * every stage transition so a caller can stream progress.
 */
export async function runPipeline(input: PipelineInput, deps: PipelineDeps): Promise<PipelineRecord> {
  const { registry, onUpdate } = deps;
  const runBuild = deps.runBuild ?? defaultRunBuild;

  const record: PipelineRecord = {
    pipelineId: `pl_${Date.now().toString(36)}`,
    slug: input.slug,
    sourceUrl: input.url ?? null,
    productId: null,
    shopifyHandle: input.shopifyHandle ?? null,
    // Fase 5's three states. `shopify-live-verified` is NEVER set here: only a
    // real run of scripts/verify-shopify-live.mjs against valid credentials
    // can justify it, and this pipeline never talks to Shopify.
    commerceMode: input.shopifyHandle ? 'commerce-configured' : 'preview-only',
    status: 'running',
    currentStage: null,
    stages: freshStages(),
    outputPath: null,
    createdAt: nowIso(),
    finishedAt: null,
    error: null,
  };

  const stage = (name: PipelineStageName) => record.stages.find((s) => s.name === name)!;
  const emit = () => onUpdate?.(structuredClone(record));

  const begin = (name: PipelineStageName) => {
    record.currentStage = name;
    const s = stage(name);
    s.status = 'running';
    s.startedAt = nowIso();
    emit();
    return s;
  };

  const pass = (name: PipelineStageName, detail?: string) => {
    const s = stage(name);
    s.status = 'pass';
    s.endedAt = nowIso();
    s.detail = detail ?? null;
    emit();
  };

  /** Marks the failure AND everything downstream as skipped, then stops. */
  const fail = (name: PipelineStageName, message: string): PipelineRecord => {
    const s = stage(name);
    s.status = 'failed';
    s.endedAt = nowIso();
    s.error = sanitiseError(message, [process.env.GEMINI_API_KEY, process.env.PUBLIC_SHOPIFY_STOREFRONT_TOKEN]);

    const from = PIPELINE_STAGES.indexOf(name);
    for (const later of PIPELINE_STAGES.slice(from + 1)) {
      const ls = stage(later);
      // `skipped`, not `failed`: they never ran, and claiming otherwise would
      // invent a verdict about work never attempted.
      if (ls.status === 'pending') ls.status = 'skipped';
    }

    record.status = 'failed';
    record.currentStage = name;
    record.error = s.error;
    record.finishedAt = nowIso();
    emit();
    return record;
  };

  const jobFailure = (job: JobRecord) =>
    job.error?.message ?? `${job.kind} job ended as ${job.status} (exit ${job.exitCode ?? 'n/a'})`;

  // ---- 1. scrape ---------------------------------------------------------
  let scrapeJobId: string;
  if (input.scrapeJobId) {
    const existing = registry.get(input.scrapeJobId);
    if (!existing || existing.kind !== 'scrape' || existing.status !== 'succeeded') {
      begin('scrape');
      return fail('scrape', `scrapeJobId "${input.scrapeJobId}" is not a successful scrape job`);
    }
    scrapeJobId = existing.jobId;
    const s = begin('scrape');
    s.jobId = scrapeJobId;
    pass('scrape', 'reused an existing successful scrape');
  } else {
    if (!input.url) {
      begin('scrape');
      return fail('scrape', 'no product input: pass either a url or an existing scrapeJobId');
    }
    const s = begin('scrape');
    const job = registry.createScrapeJob({ url: input.url, itemId: '', normalizedUrl: input.url });
    s.jobId = job.jobId;
    scrapeJobId = job.jobId;
    emit();
    const done = await awaitJob(registry, job.jobId);
    if (done.status !== 'succeeded') return fail('scrape', jobFailure(done));
    pass('scrape', (done.result as { title?: string } | null)?.title ?? undefined);
  }

  // ---- 2. normalize ------------------------------------------------------
  // Not a separate child process: registry.archiveScrape() runs the normalizer
  // as part of the scrape lifecycle. This stage REPORTS that real artefact
  // rather than re-running it — re-normalising would be the second
  // implementation this module exists to avoid.
  begin('normalize');
  const scrapeJob = registry.get(scrapeJobId)!;
  const canonicalPath = scrapeJob.archivePath
    ? path.join(scrapeJob.archivePath, 'canonical-product.json')
    : null;
  if (!canonicalPath || !existsSync(canonicalPath)) {
    return fail('normalize', 'the scrape produced no canonical-product.json — the normalizer did not run or failed');
  }
  record.productId = (scrapeJob.params as { productId?: string }).productId ?? null;
  pass('normalize', 'canonical-product.json ready');

  // ---- 3. Content Agent --------------------------------------------------
  const contentStage = begin('content');
  const contentJob = registry.createContentJob({
    scrapeJobId,
    scrapeProductPath: canonicalPath,
    instructionsPath: null,
    model: GEMINI_MODEL,
    productId: record.productId ?? undefined,
  });
  contentStage.jobId = contentJob.jobId;
  emit();
  const contentDone = await awaitJob(registry, contentJob.jobId);
  if (contentDone.status !== 'succeeded') return fail('content', jobFailure(contentDone));
  const contentPath = (contentDone.result as { stagedPath?: string } | null)?.stagedPath ?? null;
  if (!contentPath || !existsSync(contentPath)) {
    return fail('content', 'the Content Agent reported success but wrote no content.json');
  }
  pass('content', `${(contentDone.result as { faqCount?: number } | null)?.faqCount ?? 0} FAQ entries`);

  // ---- 4. assets ---------------------------------------------------------
  //
  // Content is followed directly by assets. There is no Design Agent step: see
  // PIPELINE_STAGES above for why it was removed rather than defaulted.
  // Like normalize, this stage does not run a separate process: the asset
  // pipeline lives inside generate-landing.mjs and is activated by --product.
  // What is checked here is that the inputs it needs genuinely exist, so a
  // missing image directory fails BEFORE the landing is written.
  const assetStage = begin('assets');
  const imagesDir = scrapeJob.archivePath ? path.join(scrapeJob.archivePath, 'images') : null;
  if (!imagesDir || !existsSync(imagesDir)) {
    return fail('assets', 'the scrape archived no images/ directory — there is no real media to materialise');
  }

  // THE STAGE PRODUCES, it no longer merely checks. Until F4 this only asserted
  // that an images/ directory existed and let the generator work out the rest,
  // which meant the media authority had no runtime presence in the Admin at
  // all: the only way to fill the Fixed slots was to hand a fixture in.
  //
  // It runs the SAME producer the generator would, writes the result beside the
  // archive, and passes the path down. Persisting it is the point — the asset
  // decisions become an inspectable artefact rather than something recomputed
  // and forgotten inside a child process.
  let assetsPath: string | null = null;
  let faviconPath: string | null = null;
  try {
    const canonicalProduct = JSON.parse(readFileSync(canonicalPath, 'utf-8'));
    const stagedContent = JSON.parse(readFileSync(contentPath, 'utf-8'));
    const stepCount = Array.isArray(stagedContent?.product?.steps) ? stagedContent.product.steps.length : 0;

    const produced = produceFixedAssets({ canonicalProduct, imagesDir, destDir: null, stepCount });

    // FAIL HERE, NOT IN ASTRO. A malformed media ref reaches the renderer as an
    // empty placeholder and a blank frame, with a green build and no error
    // anywhere — so the shape is checked while there is still a stage to blame.
    const issues = collectAssetOutputIssues(produced.assetOutput);
    if (issues.length) {
      return fail('assets', `the produced media is not renderable: ${issues.map((i) => i.message).join(' | ')}`);
    }

    assetsPath = path.join(scrapeJob.archivePath!, 'fixed-assets.json');
    writeFileSync(assetsPath, `${JSON.stringify(produced.assetOutput, null, 2)}\n`);
    writeFileSync(
      path.join(scrapeJob.archivePath!, 'fixed-assets.manifest.json'),
      `${JSON.stringify(produced.manifest, null, 2)}\n`,
    );
    assetStage.detail = `${produced.manifest.assets.length} asset(s), ${produced.rejected.length} rejected`;

    // THE BRAND MARK, resolved by the stage that already owns visual files.
    // Kept in its own module and its own artefact — no new top-level stage,
    // because the Admin's seven stages are a contract of their own.
    //
    // GENERATION IS NOT PART OF THE BUILD. A provider is non-deterministic, so
    // the mark is resolved once, persisted and reused while its fingerprint
    // holds. The palette it is drawn from is the one this landing will ship:
    // the operator's overrides on top of the template's canonical tokens.
    const templateCss = readFileSync(
      path.join(REPO_ROOT, FIXED_TEMPLATE_RELATIVE, 'src/styles/global.css'),
      'utf-8',
    );
    const palette = paletteFromCss(templateCss);
    if (input.themePath && existsSync(input.themePath)) {
      Object.assign(palette, JSON.parse(readFileSync(input.themePath, 'utf-8')));
    }

    const priorPath = path.join(scrapeJob.archivePath!, 'fixed-favicon.json');
    const prior = existsSync(priorPath) ? JSON.parse(readFileSync(priorPath, 'utf-8')) : null;

    const mark = await resolveFixedFavicon({
      operatorPath: input.faviconPath ?? null,
      previous: prior,
      generate: deps.generateFavicon ?? null,
      brand: canonicalProduct?.identity?.brand ?? null,
      productName: canonicalProduct?.identity?.name ?? null,
      palette,
    });

    writeFileSync(priorPath, `${JSON.stringify(mark.manifest, null, 2)}\n`);
    const png = mark.files.find((f: { name: string }) => f.name === 'favicon.png');
    if (png) {
      faviconPath = path.join(scrapeJob.archivePath!, 'favicon.png');
      writeFileSync(faviconPath, png.contents as Buffer);
    }
  } catch (err) {
    return fail('assets', err instanceof Error ? err.message : 'asset production failed');
  }

  pass('assets', assetStage.detail ?? 'scraped media ready');

  // ---- 5. generate -------------------------------------------------------
  const generateStage = begin('generate');
  const generateJob = registry.createGenerateJob({
    slug: input.slug,
    contentPath,
    imagesDir,
    force: input.force ?? false,
    productId: record.productId ?? undefined,
    // No design anything: buildGenerateSpec no longer knows how to append the
    // flag, so there is nothing here to omit.
    productJsonPath: canonicalPath,
    merchantPath: input.merchantPath ?? null,
    // The stage's own output takes precedence; an explicit input is the escape hatch.
    assetsPath: assetsPath ?? input.assetsPath ?? null,
    themePath: input.themePath ?? null,
    // The stage's resolution wins; an explicit input is the escape hatch.
    faviconPath: faviconPath ?? input.faviconPath ?? null,
    shopifyHandle: input.shopifyHandle ?? null,
  });
  generateStage.jobId = generateJob.jobId;
  emit();
  const generateDone = await awaitJob(registry, generateJob.jobId);
  if (generateDone.status !== 'succeeded') return fail('generate', jobFailure(generateDone));
  const outDir = (generateDone.result as { outDir?: string } | null)?.outDir ?? path.join(OUTPUTS_DIR, input.slug);
  record.outputPath = outDir;
  pass('generate', `outputs/${input.slug}`);

  // ---- 6. build ----------------------------------------------------------
  //
  // TYPE CHECK, THEN BUILD — one stage, two commands, in that order. `astro
  // check` is not a new top-level stage: it answers the same question the
  // build does ("does this landing actually compile?"), and a separate stage
  // would change the observable event sequence every existing generation emits.
  begin('build');
  const build = await runBuild(outDir);
  if (!build.ok) return fail('build', build.message ?? 'astro build failed');
  pass('build', build.message ?? 'prerendered');

  // ---- 7. final validation ----------------------------------------------
  // Structural checks on the artefact itself: the guarantees earlier phases
  // established must all still hold in the thing actually produced.
  //
  // `src/data/design.ts (DesignSpec)` LEFT THIS LIST. It was a Version A rule —
  // it asserted that a Design Agent had chosen a composition and written it
  // down. With the stage gone nothing produces that file, and the Fixed
  // template does not ship one, so keeping the check would have failed every
  // Fixed generation for missing an artefact the architecture no longer has.
  //
  // Deliberately NOT replaced with the full F3 validator. What stays is what
  // Fixed can honestly assert TODAY about the thing on disk: it is its own
  // repository, it carries its generated data and asset map, it records its
  // own provenance, and a commerce run wrote its handle.
  begin('validate');
  const missing: string[] = [];
  if (!existsSync(path.join(outDir, '.git'))) missing.push('.git (landing is not its own repository)');
  if (!existsSync(path.join(outDir, '.gitignore'))) missing.push('.gitignore');
  if (!existsSync(path.join(outDir, 'src/data/product.ts'))) missing.push('src/data/product.ts (product data)');
  if (!existsSync(path.join(outDir, 'src/data/images.ts'))) missing.push('src/data/images.ts (asset map)');
  if (!existsSync(path.join(outDir, '.generation.json'))) missing.push('.generation.json');
  if (input.shopifyHandle && !existsSync(path.join(outDir, '.env'))) missing.push('.env (commerce mode handle)');
  if (missing.length > 0) return fail('validate', `the generated landing is missing: ${missing.join(', ')}`);
  pass('validate', 'artefact complete');

  record.status = 'succeeded';
  record.currentStage = null;
  record.finishedAt = nowIso();
  emit();
  return record;
}

/**
 * Real `astro check` then `astro build` inside the generated landing.
 *
 * ─── WHY CHECK RUNS AT ALL, AND WHY IT RUNS FIRST ─────────────────────────
 *
 * `astro build` does not typecheck. It transpiles, so a landing whose data
 * modules contradict their own types builds perfectly and fails later, in a
 * browser, at a customer. The first real landing made that concrete: the
 * emitter began writing `brand: null` while `ProductContent.brand` was still
 * `string`, and nothing in the pipeline could have noticed.
 *
 * ORDER IS THE POINT. A fatal check means the sources are wrong, and building
 * wrong sources produces an artefact that looks finished — so the build is not
 * attempted and the stage fails with the type error rather than with a
 * confusing success. It also means `dist/` is absent afterwards, which is what
 * makes "the check gate is real" measurable rather than claimed.
 *
 * Uses the landing's OWN node_modules when present; otherwise installs them,
 * because a generated landing ships none on purpose.
 */
export async function defaultRunBuild(outDir: string): Promise<{ ok: boolean; message: string | null }> {
  const local = path.join(outDir, 'node_modules/.bin/astro');

  // A generated landing ships no node_modules on purpose (portability), so
  // the first build has to install them. Astro resolves its config and
  // integrations from the project's OWN node_modules, so borrowing the
  // template's binary against a dependency-less cwd fails — found by running
  // the pipeline for real. Installing here is what makes the landing's build
  // genuinely self-contained rather than parasitic on the template.
  if (!existsSync(local)) {
    // `--prod=false` IS LOAD-BEARING, not decoration. The child runs with
    // NODE_ENV=production (see productionEnv), and `astro check` lives in
    // devDependencies alongside typescript — a package manager that honours
    // NODE_ENV for install would leave the type check with nothing to run.
    const install = await runOnce('pnpm', ['install', '--prefer-offline', '--prod=false'], outDir);
    if (!install.ok) {
      return { ok: false, message: `dependency install failed — ${install.message ?? 'unknown error'}` };
    }
  }

  if (!existsSync(local)) {
    return { ok: false, message: 'astro is still missing after install — check the landing\'s package.json' };
  }

  // ASKED FOR EXPLICITLY, so the failure is a sentence rather than a hang.
  // `astro check` with no @astrojs/check OFFERS TO INSTALL IT, interactively,
  // on a stdin this spawn never writes to.
  if (!existsSync(path.join(outDir, 'node_modules/@astrojs/check'))) {
    return {
      ok: false,
      message: '@astrojs/check is not installed in the landing — the type check cannot run',
    };
  }

  const checked = await runOnce(local, ['check'], outDir);
  if (!checked.ok) {
    return { ok: false, message: `astro check failed — ${checked.message ?? 'unknown error'}` };
  }

  const built = await runOnce(local, ['build'], outDir);
  if (!built.ok) return built;
  return { ok: true, message: 'type-checked and prerendered' };
}

/**
 * Spawns a command, resolving to the root-cause line on failure.
 *
 * THE CHILD DOES NOT INHERIT THE PARENT'S BUILD ENVIRONMENT, and that is a bug
 * fix rather than a preference.
 *
 * Vite — and therefore Vitest — exports its `import.meta.env` values as real
 * environment variables: DEV, PROD, MODE, SSR, TEST, BASE_URL. A child `astro
 * build` picks them up, so an Admin running under any Vite-based parent
 * produced a DEV BUILD of the landing.
 *
 * It is not cosmetic. Astro's Image component emits `data-image-component`
 * only under DEV, so the shipped HTML changed SHAPE: the generated landing's
 * structural fingerprint stopped matching the sealed profile with nothing in
 * the data different. Found exactly that way, by an end-to-end run whose page
 * was structurally wrong for a reason no fixture could explain.
 *
 * `astro build` is a production build by definition. There is no caller for
 * whom inheriting a dev environment is the right answer.
 */
const VITE_ENV_KEYS = ['DEV', 'PROD', 'MODE', 'SSR', 'TEST', 'BASE_URL'];

function productionEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: 'production' };
  for (const key of Object.keys(env)) {
    if (VITE_ENV_KEYS.includes(key) || key.startsWith('VITEST')) delete env[key];
  }
  return env;
}

function runOnce(bin: string, args: string[], cwd: string): Promise<{ ok: boolean; message: string | null }> {
  return new Promise((resolve) => {
    // stdin IGNORED. Nothing here is interactive, and a child that decides to
    // ask a question on a pipe nobody writes to does not fail — it waits.
    const child = spawn(bin, args, { cwd, env: productionEnv(), stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (c) => {
      stderr += String(c);
    });
    child.stdout.on('data', (c) => {
      stderr += String(c);
    });
    child.on('error', (err) => resolve({ ok: false, message: sanitiseError(err.message) }));
    child.on('close', (code) => {
      if (code === 0) return resolve({ ok: true, message: null });
      // Surface the ROOT CAUSE, not the last line. Astro logs the original
      // throw first and then its own wrapper; taking the last match reported
      // a useless "astro build exited 1" for a run whose real cause —
      // "Missing PUBLIC_SHOPIFY_* — build aborted" — was right there in the
      // log. Found by running the pipeline for real.
      const clean = (l: string) =>
        l
          // strip ANSI, leading timestamps and Astro's [ERROR] prefix
          .replace(/\[[0-9;]*m/g, '')
          .replace(/^\s*\d{1,2}:\d{2}:\d{2}\s*/, '')
          .replace(/\[ERROR\]\s*(\[build\]\s*)?/g, '')
          .trim();

      const lines = stderr.split('\n').map(clean).filter(Boolean);
      const cause = lines.find((l) => /error|missing|aborted|failed/i.test(l));
      resolve({ ok: false, message: sanitiseError(cause ?? ` exited `) });
    });
  });
}

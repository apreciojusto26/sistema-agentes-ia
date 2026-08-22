// End-to-end pipeline orchestration.
//
// THE ADMIN ORCHESTRATES; IT DOES NOT REIMPLEMENT. Every stage below is an
// existing capability invoked through the existing JobRegistry:
//   scrape   -> scraper/scrape.js        (+ normalize, inside its archive step)
//   content  -> scripts/generate-content.mjs
//   design   -> scripts/generate-design.mjs
//   generate -> scripts/generate-landing.mjs   (assets + DesignSpec + handle)
//   build    -> astro build inside outputs/<slug>
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
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import type { JobRecord, JobStatus } from '../shared/jobs';
import type { JobRegistry } from './jobs/registry';
import { JOBS_DIR, OUTPUTS_DIR, REPO_ROOT, GEMINI_MODEL } from './config';

export const PIPELINE_STAGES = [
  'scrape',
  'normalize',
  'content',
  'design',
  'assets',
  'generate',
  'build',
  'validate',
] as const;

export type PipelineStageName = (typeof PIPELINE_STAGES)[number];

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
  force?: boolean;
};

export type PipelineDeps = {
  registry: JobRegistry;
  /** Seam for tests: replaces the real `astro build` spawn. */
  runBuild?: (outDir: string) => Promise<{ ok: boolean; message: string | null }>;
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

  // ---- 4. Design Agent ---------------------------------------------------
  const designStage = begin('design');
  const designOut = path.join(JOBS_DIR, scrapeJobId, 'design', 'design.json');
  mkdirSync(path.dirname(designOut), { recursive: true });
  const designJob = registry.createDesignJob({
    scrapeJobId,
    scrapeProductPath: canonicalPath,
    contentPath,
    outPath: designOut,
    model: GEMINI_MODEL,
    productId: record.productId ?? undefined,
  });
  designStage.jobId = designJob.jobId;
  emit();
  const designDone = await awaitJob(registry, designJob.jobId);
  if (designDone.status !== 'succeeded') return fail('design', jobFailure(designDone));
  if (!existsSync(designOut)) {
    return fail('design', 'the Design Agent reported success but wrote no DesignSpec');
  }
  const dr = designDone.result as { family?: string; density?: string; sections?: number } | null;
  pass('design', `family=${dr?.family} · density=${dr?.density} · ${dr?.sections} sections`);

  // ---- 5. assets ---------------------------------------------------------
  // Like normalize, this stage does not run a separate process: the asset
  // pipeline lives inside generate-landing.mjs and is activated by --product.
  // What is checked here is that the inputs it needs genuinely exist, so a
  // missing image directory fails BEFORE the landing is written.
  begin('assets');
  const imagesDir = scrapeJob.archivePath ? path.join(scrapeJob.archivePath, 'images') : null;
  if (!imagesDir || !existsSync(imagesDir)) {
    return fail('assets', 'the scrape archived no images/ directory — there is no real media to materialise');
  }
  pass('assets', 'scraped media ready');

  // ---- 6. generate -------------------------------------------------------
  const generateStage = begin('generate');
  const generateJob = registry.createGenerateJob({
    slug: input.slug,
    contentPath,
    imagesDir,
    force: input.force ?? false,
    productId: record.productId ?? undefined,
    designPath: designOut,
    productJsonPath: canonicalPath,
    shopifyHandle: input.shopifyHandle ?? null,
  });
  generateStage.jobId = generateJob.jobId;
  emit();
  const generateDone = await awaitJob(registry, generateJob.jobId);
  if (generateDone.status !== 'succeeded') return fail('generate', jobFailure(generateDone));
  const outDir = (generateDone.result as { outDir?: string } | null)?.outDir ?? path.join(OUTPUTS_DIR, input.slug);
  record.outputPath = outDir;
  pass('generate', `outputs/${input.slug}`);

  // ---- 7. build ----------------------------------------------------------
  begin('build');
  const build = await runBuild(outDir);
  if (!build.ok) return fail('build', build.message ?? 'astro build failed');
  pass('build', 'prerendered');

  // ---- 8. final validation ----------------------------------------------
  // Structural checks on the artefact itself: the guarantees earlier phases
  // established must all still hold in the thing actually produced.
  begin('validate');
  const missing: string[] = [];
  if (!existsSync(path.join(outDir, '.git'))) missing.push('.git (landing is not its own repository)');
  if (!existsSync(path.join(outDir, '.gitignore'))) missing.push('.gitignore');
  if (!existsSync(path.join(outDir, 'src/data/design.ts'))) missing.push('src/data/design.ts (DesignSpec)');
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
 * Real `astro build` inside the generated landing. Uses the landing's OWN
 * node_modules when present; otherwise falls back to the template's binary,
 * which is a dev convenience for building in place and never something the
 * shipped artefact depends on.
 */
async function defaultRunBuild(outDir: string): Promise<{ ok: boolean; message: string | null }> {
  const local = path.join(outDir, 'node_modules/.bin/astro');

  // A generated landing ships no node_modules on purpose (portability), so
  // the first build has to install them. Astro resolves its config and
  // integrations from the project's OWN node_modules, so borrowing the
  // template's binary against a dependency-less cwd fails — found by running
  // the pipeline for real. Installing here is what makes the landing's build
  // genuinely self-contained rather than parasitic on the template.
  if (!existsSync(local)) {
    const install = await runOnce('pnpm', ['install', '--prefer-offline'], outDir);
    if (!install.ok) {
      return { ok: false, message: `dependency install failed — ${install.message ?? 'unknown error'}` };
    }
  }

  if (!existsSync(local)) {
    return { ok: false, message: 'astro is still missing after install — check the landing\'s package.json' };
  }

  return runOnce(local, ['build'], outDir);
}

/** Spawns a command, resolving to the root-cause line on failure. */
function runOnce(bin: string, args: string[], cwd: string): Promise<{ ok: boolean; message: string | null }> {
  return new Promise((resolve) => {
    const child = spawn(bin, args, { cwd, env: { ...process.env } });
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

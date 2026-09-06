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
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import {
  produceFixedAssets,
  collectUnresolvedRefs,
  FIXED_ASSET_OPERATIONS,
} from '../../../scripts/lib/fixed-asset-producer.mjs';
import { structuralFingerprint, collectUncollapsedRegions } from '../../../scripts/lib/fingerprint.mjs';
import {
  FIXED_GRAMMAR_V3,
  FIXED_OPTIONAL_SLOTS_V3,
} from '../../../scripts/lib/fixed-grammar-v3.mjs';
import { projectFixedSocialProof } from '../../../scripts/lib/fixed-social-proof.mjs';
import { deriveDisplayName } from '../../../scripts/lib/display-name.mjs';
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
import { readGenerationManifest } from './generation-manifest';
import { resolveShopifyProductLink, buildCommerceEnv } from './shopify/commerce-config';
import { resolveSourceIdentity, formatSourceIdentity } from '../../../scripts/lib/source-identity.mjs';
import type { SourceProductIdentity } from '../../../scripts/lib/source-identity.mjs';
import { PIPELINE_STAGES } from '../shared/pipeline-stages';
import type { PipelineStageName } from '../shared/pipeline-stages';

export type PipelineStageStatus = 'pending' | 'running' | 'pass' | 'failed' | 'skipped';

export type PipelineStageErrorDetail = {
  /** One sentence, in the operator's language. */
  headline: string;
  /** The identifiers, for the collapsible section. */
  facts: { label: string; value: string }[];
};

/**
 * ONE REAL OPERATION INSIDE A STAGE.
 *
 * NOT INVENTED, AND NOT A TIMER. Every step here is a `withStage(...)` block
 * the child script actually runs and already announces over the NDJSON
 * protocol (`stage.start` / `stage.end` / `progress` / `warn` / `error`).
 * scrape.js declares launch, open, defer-load, structured-data, gallery,
 * variants, reviews, images, write, close; generate-content declares prepare,
 * generate, save; generate-landing declares args, validate, preflight,
 * copy-template, write-data, patch-theme, write-favicon, copy-images,
 * write-manifest, todos.
 *
 * The registry has been parsing them into JobRecord.stages and persisting them
 * to admin/.jobs/<id>/job.json since the protocol existed. Nothing rendered
 * them. This carries them onto the pipeline record so the UI can, and so a
 * report survives a restart.
 *
 * A UI that showed a checkmark for work that did not happen would be worse
 * than showing nothing, so there is no mapping from "expected steps" here —
 * only what the child reported.
 */
export type PipelineStep = {
  /** The child's own stage id, e.g. 'structured-data'. Labelled in the client. */
  name: string;
  /**
   * `skipped` means DECLARED AND NOT RUN — the operation was next in the
   * sequence and an earlier one failed. It is not an outcome and never a
   * quiet pass: a stage that dies at step three must show steps four and five
   * as unreached rather than dropping them, which would make a partial run
   * look like a complete one.
   */
  status: 'running' | 'passed' | 'failed' | 'warning' | 'skipped';
  startedAt: string;
  endedAt: string | null;
  ms: number | null;
  /** Real counters the child emitted, e.g. images 7/8. Never synthesised. */
  progress: { done: number; total: number; label?: string } | null;
  /**
   * ONE SHORT FACT the operation produced that is not a fraction: a grammar
   * hash, "0 unresolved", "15 checks".
   *
   * Separate from `progress` because forcing a verdict into a done/total pair
   * is how "PASS" becomes "1/1". Null for every step that measured no such
   * fact — and absent entirely on reports written before this field existed,
   * which the client reads as null rather than as an empty string.
   */
  note: string | null;
  warnings: string[];
  /**
   * The STABLE, machine-checkable identifier for a demonstrated failure —
   * e.g. `validation-grammar-failed`. `null` unless this step ended `failed`
   * via `StepFacts.fail()`; a step that threw a genuine, un-anticipated
   * exception carries no code, because there was no invariant name to give
   * it. Never parse `note` or `warnings` to find out which invariant broke —
   * this is the field a test or a future caller matches on.
   */
  code: string | null;
};

export type PipelineStage = {
  name: PipelineStageName;
  status: PipelineStageStatus;
  /** The JobRecord this stage delegated to, when it delegated to one. */
  jobId: string | null;
  startedAt: string | null;
  endedAt: string | null;
  /** Sanitised — never a raw stack, never a secret. */
  error: string | null;
  /**
   * A failure an operator can act on, when the cause is one we understand.
   *
   * The lineage conflict used to surface as a paragraph of identifiers inside
   * the Build Agent's panel — technically complete and unreadable. `headline`
   * is what went wrong in a sentence; `facts` are the identifiers, which belong
   * behind a disclosure rather than in front of one.
   *
   * `null` for every failure we have no better sentence for than the message
   * itself. Inventing a friendly headline for an unknown error would hide the
   * only useful thing about it.
   */
  errorDetail: PipelineStageErrorDetail | null;
  /** Short human-readable outcome, e.g. "family=tech · 9 sections". */
  detail: string | null;
  /**
   * The child's own operations, mirrored live and kept after the run.
   *
   * Empty for a stage that delegates to no child (normalize, validate) or for
   * one that has not started — absence of steps is not a step.
   */
  steps: PipelineStep[];
};

/**
 * The facts an operation reports about itself while it runs.
 *
 * A SINK, NEVER A RETURN VALUE. An earlier draft read `progress` and
 * `warnings` off whatever the operation returned, which meant a canonical
 * product that happened to carry a `warnings` key would have had it rendered
 * as an operation's warning. Data comes back as data; facts go here.
 */
export type StepFacts = {
  /**
   * A RATIO, and only ever a ratio: 2 of 4 files accepted, 30 of 30 reviews
   * renderable, 15 of 15 checks met.
   *
   * A plain total is not one. Reporting "8 images" as `8/8` puts a fraction on
   * screen whose denominator means nothing, and once some of those are real
   * ratios an operator can no longer tell which is which — so a count goes to
   * `note` and every `x/y` in the panel is a proportion worth reading.
   */
  count(done: number, total: number, label?: string): void;
  /** A short fact it produced — a total, a hash, a verdict. Never a guess. */
  note(text: string): void;
  /** A real condition it reported. Never invented for the UI's benefit. */
  warn(message: string): void;
  /**
   * Marks THIS step failed — the check ran to completion and DEMONSTRATED
   * the landing is invalid — WITHOUT aborting the operations declared after
   * it and WITHOUT skipping them.
   *
   * THE THIRD OUTCOME, next to `warn()` and a thrown exception. `warn()` is
   * for a legitimate absence that still ends green — no brand, no factual
   * reviews, no SITE_URL in Preview, Auto Accent's canonical fallback. A
   * THROW is for a genuine crash, a check that could not even run, and it
   * still aborts everything declared after it via `skipRemaining()` — there
   * is no fact left to report from a stage whose own machinery broke.
   * `fail()` sits between them: the check completed, and what it found is a
   * demonstrated defect, but that says nothing about whether the NEXT
   * independent, read-only check can still run and report its own truth.
   * Six real defects surfaced in one run beats discovering them one at a
   * time across six.
   *
   * @param code the STABLE, machine-checkable identifier this failure is
   *   known by, e.g. `validation-grammar-failed`. Never derived by parsing
   *   `message` — a caller matches on this, not on prose.
   */
  fail(message: string, code: string): void;
};

/**
 * Records the operations a stage the ADMIN runs itself performs.
 *
 * ─── WHY THIS EXISTS ───────────────────────────────────────────────────────
 *
 * Three stages delegate to no child process — normalize, assets and validate —
 * so there is no NDJSON to mirror, and their agents showed a single
 * stage-level tick. An operator could click them and find nothing to read.
 *
 * ─── AND WHY IT IS NOT FAKE PROGRESS ───────────────────────────────────────
 *
 * `run` WRAPS A REAL CALL. The step's status is that call's actual outcome and
 * its duration is measured across it: no timer, no estimate, and no step that
 * exists without a function behind it.
 *
 * The ORDER is declared, and only the order. Knowing what a stage is about to
 * attempt is not a prediction of results — it is the literal sequence of calls
 * below, which is what lets a failure at step three leave four and five
 * honestly marked `skipped` instead of vanishing and making a partial run look
 * complete.
 *
 * The declaration is CHECKED rather than trusted: running an operation out of
 * the declared order throws, because a plan that has drifted from the code
 * would put the wrong names under `skipped` — a confident-and-wrong report,
 * which is worse than none.
 *
 * ─── IT REPORTS, IT DOES NOT GATE ──────────────────────────────────────────
 *
 * Instrumenting a stage must not change which runs succeed. A step's job is to
 * say what happened; only the checks a stage ALREADY enforced may throw. An
 * absent fact — no brand, no reviews, no video — is a real state of the world
 * and comes out as a `warning`, never as a new reason to fail a generation
 * that used to pass.
 *
 * Same shape, same record, same file as the child-reported steps. No parallel
 * store — a report is a report.
 */
class StepRecorder {
  readonly #stage: PipelineStage;
  readonly #emit: () => void;
  readonly #planned: readonly string[];
  #index = 0;

  constructor(stage: PipelineStage, emit: () => void, planned: readonly string[]) {
    this.#stage = stage;
    this.#emit = emit;
    this.#planned = planned;
  }

  /** Runs one real operation, timing it and recording what actually happened. */
  run<T>(name: string, fn: (facts: StepFacts) => T): T {
    const ctx = this.#begin(name);
    try {
      const value = fn(ctx.facts);
      this.#settle(ctx);
      return value;
    } catch (err) {
      this.#breakOff(ctx, err);
      throw err;
    }
  }

  /** The same, for an operation that genuinely awaits something. */
  async runAsync<T>(name: string, fn: (facts: StepFacts) => Promise<T>): Promise<T> {
    const ctx = this.#begin(name);
    try {
      const value = await fn(ctx.facts);
      this.#settle(ctx);
      return value;
    } catch (err) {
      this.#breakOff(ctx, err);
      throw err;
    }
  }

  /** Marks every declared operation this stage did not reach. */
  skipRemaining(): void {
    for (const name of this.#planned.slice(this.#index)) {
      this.#stage.steps.push({
        name,
        status: 'skipped',
        // The moment it became known this would not run. There is no start and
        // no duration, because there was no work.
        startedAt: nowIso(),
        endedAt: null,
        ms: null,
        progress: null,
        note: null,
        warnings: [],
        code: null,
      });
    }
    this.#index = this.#planned.length;
  }

  #begin(name: string): { step: PipelineStep; facts: StepFacts; began: number; getFailure: () => { message: string; code: string } | null } {
    const expected = this.#planned[this.#index];
    if (name !== expected) {
      throw new Error(
        `StepRecorder: operation ${this.#index} is declared "${expected ?? 'nothing'}" but "${name}" ran — ` +
          'the declared plan and the code have drifted, and `skipped` would name the wrong work',
      );
    }
    const step: PipelineStep = {
      name,
      status: 'running',
      startedAt: nowIso(),
      endedAt: null,
      ms: null,
      progress: null,
      note: null,
      warnings: [],
      code: null,
    };
    this.#stage.steps.push(step);
    this.#index += 1;
    this.#emit();

    // Captured by closure rather than written straight onto `step`, so
    // `#settle` decides the step's actual status — a step that calls both
    // `warn()` and `fail()` must land on `failed`, never quietly on `warning`
    // because of write order.
    let failure: { message: string; code: string } | null = null;
    const facts: StepFacts = {
      count: (done, total, label) => {
        step.progress = label === undefined ? { done, total } : { done, total, label };
      },
      note: (text) => {
        step.note = text;
      },
      warn: (message) => {
        step.warnings.push(message);
      },
      fail: (message, code) => {
        failure = { message, code };
      },
    };
    return { step, facts, began: Date.now(), getFailure: () => failure };
  }

  #settle(ctx: { step: PipelineStep; began: number; getFailure: () => { message: string; code: string } | null }): void {
    ctx.step.endedAt = nowIso();
    ctx.step.ms = Date.now() - ctx.began;
    const failure = ctx.getFailure();
    if (failure) {
      // A DEMONSTRATED DEFECT — but the check itself RAN TO COMPLETION, so
      // this deliberately does NOT call skipRemaining(). One independent,
      // read-only Validation check finding a real defect says nothing about
      // whether the next one can still run and report its own truth.
      ctx.step.status = 'failed';
      ctx.step.code = failure.code;
      ctx.step.warnings.push(failure.message);
    } else {
      // A FINISHED OPERATION THAT REPORTED A PROBLEM IS NOT A CLEAN PASS. Same
      // rule projectSteps applies to the children: flattening it to a green
      // tick hides the one thing worth reading.
      ctx.step.status = ctx.step.warnings.length > 0 ? 'warning' : 'passed';
    }
    this.#emit();
  }

  #breakOff(ctx: { step: PipelineStep; began: number }, err: unknown): void {
    ctx.step.endedAt = nowIso();
    ctx.step.ms = Date.now() - ctx.began;
    ctx.step.status = 'failed';
    ctx.step.warnings.push(err instanceof Error ? err.message : String(err));
    this.skipRemaining();
    this.#emit();
  }
}

/**
 * WHAT EACH ADMIN-RUN STAGE IS ABOUT TO ATTEMPT, in the order it attempts it.
 *
 * These are DECLARATIONS OF SEQUENCE, not of outcome. Every name below has a
 * function behind it a few hundred lines down; none of them is ticked off
 * because a list said so. Declaring the order is what buys the one thing an
 * outcome-only record cannot express: when an operation fails, the ones after
 * it are reported `skipped` — never run — instead of disappearing and leaving
 * a partial stage looking like a complete one.
 *
 * The ids are NAMESPACED, and that is load-bearing. A child script already
 * declares stages called `validate`, `gallery`, `images` and `write`; an
 * Admin operation sharing one of those names would inherit the child's label
 * and describe the wrong work in the panel.
 *
 * StepRecorder CHECKS these against the calls rather than trusting them — a
 * plan that has drifted from the code would put the wrong names under
 * `skipped`, which is a confident wrong answer and worse than no answer.
 */
export const NORMALIZE_OPERATIONS = [
  'normalize:extraction',
  'normalize:canonical',
  'normalize:identity',
  'normalize:variants',
  'normalize:media',
  'normalize:social-proof',
] as const;

/**
 * The producer names its own five operations and exports them, so the middle
 * of this list cannot drift away from the boundaries it describes.
 */
export const ASSET_OPERATIONS = [
  'assets:inputs',
  ...FIXED_ASSET_OPERATIONS,
  'assets:refs',
  'assets:persist',
  'assets:favicon',
] as const;

export const VALIDATE_OPERATIONS = [
  'validate:artifact',
  'validate:grammar',
  'validate:asset-refs',
  'validate:ownership',
  'validate:social-proof',
  'validate:readiness',
] as const;

/**
 * Every operation the Admin performs in-process, across the three stages that
 * delegate to no child.
 *
 * The client's label table is checked against this list, so a name here with no
 * label — or a label naming nothing here — is a test failure rather than a
 * panel that quietly shows a raw id or, worse, a label for work nothing does.
 */
export const ADMIN_OPERATIONS = [
  ...NORMALIZE_OPERATIONS,
  ...ASSET_OPERATIONS,
  ...VALIDATE_OPERATIONS,
] as const;

/** JobRecord.stages -> PipelineStep[]. A projection, never an interpretation. */
function projectSteps(job: JobRecord | null): PipelineStep[] {
  if (!job) return [];
  return job.stages.map((s) => ({
    name: s.stage,
    // The child reports running/done/failed. `warning` is derived from the
    // warnings IT emitted — a step that finished while reporting a problem is
    // neither a clean pass nor a failure, and flattening it to a green tick
    // hides the one thing worth reading.
    status: s.status === 'running' ? 'running' : s.status === 'failed' ? 'failed' : s.warnings.length > 0 ? 'warning' : 'passed',
    startedAt: s.startedAt,
    endedAt: s.endedAt,
    ms: s.ms,
    progress: s.progress,
    // A CHILD REPORTS NO NOTE. The NDJSON protocol carries progress counters
    // and warnings and nothing shaped like one, so inventing a summary line
    // here would be the projection interpreting instead of projecting.
    note: null,
    // A CHILD REPORTS NO CODE EITHER. `code` is StepRecorder's own vocabulary
    // for the admin's OWN read-only Validation gates; nothing in the NDJSON
    // protocol emits one.
    code: null,
    warnings: s.warnings,
  }));
}

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
  /** The GID this run's ShopifyProductLink carried, or null (preview, or a handle with no resolved GID). */
  shopifyProductGid: string | null;
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
    errorDetail: null,
    detail: null,
    steps: [],
  }));
}

/** Waits for a job to reach a genuinely terminal status. */
async function awaitJob(
  registry: JobRegistry,
  jobId: string,
  /**
   * Called on every poll with the child's CURRENT steps.
   *
   * The poll loop already existed and already had the JobRecord in hand — the
   * substeps were being parsed, stored and thrown away. No new transport, no
   * second subscription: the pipeline's own SSE frame now carries them.
   */
  onSteps?: (steps: PipelineStep[]) => void,
  pollMs = 250,
): Promise<JobRecord> {
  for (;;) {
    const job = registry.get(jobId);
    if (job) onSteps?.(projectSteps(job));
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
  /**
   * The product's Shopify GID, when the picker resolved one (Fase "First
   * Commerce"). `null` for a regeneration prefilled from a run that predates
   * this field, or for a handle typed some other way — `ShopifyProductLink
   * .productGid` stays nullable for exactly this reason.
   */
  shopifyProductGid?: string | null;
  /** F3: the operator's commercial configuration — identity, policy and packs. */
  merchantPath?: string | null;
  /**
   * The landing's public origin, when the operator has one.
   *
   * OPTIONAL AND IT STAYS OPTIONAL. A preview has no domain, and inventing one
   * is what put another product's host on a real landing's social card.
   */
  siteUrl?: string | null;
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
  runBuild?: (outDir: string, extraEnv?: Record<string, string>) => Promise<{ ok: boolean; message: string | null }>;
  /**
   * Seam for tests: replaces the real `check-readiness.mjs` subprocess.
   *
   * PRODUCTION NEVER SETS THIS — `readReadiness` below, the same authority
   * `validate:readiness` has always called, is the default. A test whose
   * subject is stage sequencing rather than a landing's real
   * built-and-ready state (most of the suite predates `validate:readiness`
   * being a hard gate) supplies a trivial `{ ready: true, ... }` here rather
   * than growing a genuine astro build the test was never about.
   */
  readReadiness?: (outDir: string) => Promise<ReadinessReport | null>;
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
  const checkReadiness = deps.readReadiness ?? readReadiness;

  // COMMERCE IDENTITY, RESOLVED ONCE, HERE. `shopify/commerce-config.ts` is
  // the one place a ShopifyProductLink is built — never in React, never from
  // Content, never defaulted inside FixedProductData. Reused below for the
  // record, for what the generate job is told to sell (the SAME authority,
  // never a second one that could name a different product) and for what the
  // build stage's Astro child receives.
  const productLinkResolution = resolveShopifyProductLink(
    input.shopifyHandle ? { handle: input.shopifyHandle, productGid: input.shopifyProductGid ?? null } : null,
  );

  const record: PipelineRecord = {
    pipelineId: `pl_${Date.now().toString(36)}`,
    slug: input.slug,
    sourceUrl: input.url ?? null,
    productId: null,
    shopifyHandle: input.shopifyHandle ?? null,
    shopifyProductGid: productLinkResolution.status === 'complete' ? productLinkResolution.link.productGid : null,
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
  const fail = (
    name: PipelineStageName,
    message: string,
    detail: PipelineStageErrorDetail | null = null,
  ): PipelineRecord => {
    const s = stage(name);
    s.status = 'failed';
    s.endedAt = nowIso();
    s.error = sanitiseError(message, [process.env.GEMINI_API_KEY, process.env.PUBLIC_SHOPIFY_STOREFRONT_TOKEN]);
    s.errorDetail = detail;

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

  // ---- 0. commerce readiness, fail closed --------------------------------
  //
  // BEFORE ANY REAL WORK. A shop connection and a picked product both existing
  // does not mean Commerce can proceed — shopId/storefrontId are the operator's
  // own one-time config (commerce-config.ts), and an operator who requested
  // Commerce but has not set them yet must be told THAT, in one sentence, not
  // watch a full scrape-through-generate run die inside `astro build` with a
  // stack trace. Preview never reaches this branch: `productLinkResolution` is
  // `{ status: 'preview' }` whenever no handle was given at all.
  if (productLinkResolution.status === 'incomplete') {
    begin('scrape');
    return fail('scrape', 'Commerce no está completamente configurado', {
      headline: 'Commerce no está completamente configurado',
      facts: productLinkResolution.missing.map((m) => ({ label: m, value: 'falta' })),
    });
  }

  // ---- 1. scrape ---------------------------------------------------------
  /** WHICH PRODUCT this run is about. Null when no provider can identify the URL. */
  let sourceIdentity: SourceProductIdentity | null = null;
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

    // THE IDENTITY IS RESOLVED BEFORE THE SCRAPE, NOT READ OUT OF IT.
    //
    // This passed `itemId: ''` and `normalizedUrl: input.url` — the raw link,
    // recommendation parameters and all — so the product identity the system
    // could already compute was thrown away at the one moment it mattered.
    // Nothing downstream could then tell a re-run of one product from an
    // attempt on a different one, and the lineage guard fell back to comparing
    // productIds, which are minted once per scrape job.
    //
    // GENERIC, AND IT DOES NOT VALIDATE. Which links are acceptable is the HTTP
    // boundary's decision (routes/pipeline.ts), where an operator can be given
    // an actionable message. Here the question is only "can this URL be
    // identified", and `null` is a legitimate answer that propagates: the
    // lineage guard treats an unprovable identity as an unknown and falls back
    // to failing closed. A pipeline that rejected every non-AliExpress URL
    // would be the AliExpress hardcoding this whole model exists to avoid.
    sourceIdentity = resolveSourceIdentity(input.url);
    const identity = sourceIdentity;
    const job = registry.createScrapeJob({
      url: input.url,
      itemId: identity?.externalProductId ?? '',
      normalizedUrl: identity?.canonicalUrl ?? input.url,
    });
    s.jobId = job.jobId;
    scrapeJobId = job.jobId;
    emit();
    const done = await awaitJob(registry, job.jobId, (steps) => {
      s.steps = steps;
      emit();
    });
    if (done.status !== 'succeeded') return fail('scrape', jobFailure(done));
    pass('scrape', (done.result as { title?: string } | null)?.title ?? undefined);
  }

  // ---- 2. normalize ------------------------------------------------------
  // Not a separate child process: registry.archiveScrape() runs the normalizer
  // as part of the scrape lifecycle. This stage REPORTS that real artefact
  // rather than re-running it — re-normalising would be the second
  // implementation this module exists to avoid.
  //
  // ─── ONE OPERATION PER SECTION THE NORMALIZER ACTUALLY PRODUCES ──────────
  //
  // normalizeProduct() builds a CanonicalProduct out of six closed sections,
  // and the ones below are the ones with a real projector behind them:
  // identity, commerceFacts via projectVariantOption, media via projectImages,
  // socialProof via projectReview. `specifications` is a literal `[]` in the
  // normalizer — DECISION-3, no structured source exists — so there is no
  // operation for it here. A line for work nothing performs is exactly the
  // fake progress this system keeps removing from its landings.
  //
  // ─── AND THEY REPORT, THEY DO NOT GATE ──────────────────────────────────
  //
  // The stage has exactly one failure condition and it is the one it has
  // always had: no canonical-product.json. Everything after it describes what
  // the artefact contains. A product with no brand, no variants or no reviews
  // is a real product from a real listing that published none, and failing it
  // here would break generations that work — instrumentation must not change
  // which runs succeed.
  const normalizeStage = begin('normalize');
  const scrapeJob = registry.get(scrapeJobId)!;
  const canonicalPath = scrapeJob.archivePath
    ? path.join(scrapeJob.archivePath, 'canonical-product.json')
    : null;

  type CanonicalProduct = {
    identity?: { productId?: string; name?: string; brand?: string | null; sourceUrl?: string };
    commerceFacts?: { variantOptions?: unknown[] };
    media?: { images?: unknown[]; videos?: unknown[] };
    socialProof?: { rating?: number | null; reviewCount?: number | null; reviews?: unknown[] };
  };

  let canonicalProduct: CanonicalProduct;
  const normalizeSteps = new StepRecorder(normalizeStage, emit, NORMALIZE_OPERATIONS);
  try {
    normalizeSteps.run('normalize:extraction', (facts) => {
      // THE NORMALIZER'S INPUT. It reads product.json out of the archive and
      // treats an absent or unparseable one as a no-op rather than a failure,
      // so its absence explains a missing canonical product below instead of
      // being a separate verdict here.
      const productJson = scrapeJob.archivePath
        ? path.join(scrapeJob.archivePath, 'product.json')
        : null;
      if (!productJson || !existsSync(productJson)) {
        facts.warn('el scrape no archivó product.json — el normalizador no tuvo entrada que leer');
        return;
      }
      facts.note(`${(statSync(productJson).size / 1024).toFixed(0)} kB extraídos`);
    });

    canonicalProduct = normalizeSteps.run('normalize:canonical', (facts) => {
      // THE ONE GATE, unchanged: without this artefact there is nothing for
      // any later stage to be about.
      if (!canonicalPath || !existsSync(canonicalPath)) {
        throw new Error(
          'the scrape produced no canonical-product.json — the normalizer did not run or failed',
        );
      }
      const parsed = JSON.parse(readFileSync(canonicalPath, 'utf-8')) as CanonicalProduct;
      facts.note('canonical-product.json');
      return parsed;
    });

    normalizeSteps.run('normalize:identity', (facts) => {
      const identity = canonicalProduct.identity ?? {};
      record.productId = (scrapeJob.params as { productId?: string }).productId ?? null;
      // THE SYSTEM'S OWN NARROWING, not a truncation invented here. A source
      // title runs to 150 characters and the generator already writes the
      // short form into .generation.json as `productDisplayName`; deriving it
      // from the same function is what keeps the report and the landing
      // calling this product the same thing.
      facts.note(deriveDisplayName(identity.name) || 'sin nombre en la fuente');
      if (!identity.name) facts.warn('la fuente no publicó título — identity.name queda vacío');
      // BRAND IS NULLABLE AND THAT IS A RESULT, not a problem: a listing that
      // published no maker has none, and the normalizer ships an empty string
      // rather than letting anything invent one.
      if (!identity.brand) facts.warn('la fuente no publicó marca — brand queda vacía');
    });

    normalizeSteps.run('normalize:variants', (facts) => {
      const options = canonicalProduct.commerceFacts?.variantOptions ?? [];
      facts.note(`${options.length} opciones de variante`);
    });

    normalizeSteps.run('normalize:media', (facts) => {
      const images = canonicalProduct.media?.images ?? [];
      const videos = canonicalProduct.media?.videos ?? [];
      facts.note(`${images.length} imágenes`);
      // NO VIDEO IS A FACT ABOUT THE SCRAPER, not about this product: nothing
      // in the pipeline extracts one, so the field is a literal empty list.
      // It is read rather than asserted, so the day that changes this reports
      // the change instead of hiding it.
      if (videos.length > 0) facts.note(`${images.length} imágenes · ${videos.length} vídeo(s)`);
      if (images.length === 0) facts.warn('la fuente no publicó imágenes — la landing no tendrá media propia');
    });

    normalizeSteps.run('normalize:social-proof', (facts) => {
      const proof = canonicalProduct.socialProof ?? {};
      const reviews = proof.reviews ?? [];
      facts.note(
        typeof proof.rating === 'number'
          ? `${reviews.length} reseñas · ${proof.rating} ★ de ${proof.reviewCount ?? 0} en origen`
          : `${reviews.length} reseñas`,
      );
      // NO REVIEWS IS A REAL STATE, not a failure. Social proof is projected
      // from the scrape, so a provider that published none gives none — and
      // the landing renders no reviews section at all.
      if (reviews.length === 0) {
        facts.warn('la fuente no publicó reseñas — la landing no mostrará ninguna');
      }
    });
  } catch (err) {
    return fail('normalize', err instanceof Error ? err.message : 'normalisation could not be verified');
  }

  pass(
    'normalize',
    `${canonicalProduct.media?.images?.length ?? 0} imágenes · ${canonicalProduct.socialProof?.reviews?.length ?? 0} reseñas`,
  );

  // PROVEN BY `normalize:canonical`, which threw when this was absent and took
  // the whole pipeline down with it. Naming it once is what lets every later
  // stage read the artefact without re-asking a question this stage already
  // answered — and already failed on.
  const canonicalFile = canonicalPath!;

  // ---- 3. Content Agent --------------------------------------------------
  const contentStage = begin('content');
  const contentJob = registry.createContentJob({
    scrapeJobId,
    scrapeProductPath: canonicalFile,
    instructionsPath: null,
    model: GEMINI_MODEL,
    productId: record.productId ?? undefined,
  });
  contentStage.jobId = contentJob.jobId;
  emit();
  const contentDone = await awaitJob(registry, contentJob.jobId, (steps) => {
    contentStage.steps = steps;
    emit();
  });
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
  //
  // ─── AND IT REPORTS THE PRODUCER'S OWN BOUNDARIES ───────────────────────
  //
  // produceFixedAssets is one call, so a stage that timed only the call could
  // say "assets: 3.2 s" and nothing else. It takes an OBSERVER instead, and
  // wraps its real internal boundaries with it: the plan, then each fixed
  // region it fills, then the manifest. The producer with no observer behaves
  // exactly as it always has — instrumentation is a wrapper, never a branch —
  // and it names its own operations so this stage cannot describe boundaries
  // that have moved.
  let assetsPath: string | null = null;
  let faviconPath: string | null = null;
  let assetOutput: unknown = null;
  const assetSteps = new StepRecorder(assetStage, emit, ASSET_OPERATIONS);
  try {
    const inputs = assetSteps.run('assets:inputs', (facts) => {
      const stagedContent = JSON.parse(readFileSync(contentPath, 'utf-8'));
      const steps = Array.isArray(stagedContent?.product?.steps) ? stagedContent.product.steps.length : 0;
      // HOW MANY STEP PHOTOGRAPHS ARE NEEDED IS THE COPY'S ANSWER, not the
      // media's — which is why it is read here and reported as an input.
      facts.note(`${steps} paso(s) en el copy`);
      return { canonical: JSON.parse(readFileSync(canonicalFile, 'utf-8')), stepCount: steps };
    });

    const produced = produceFixedAssets({
      canonicalProduct: inputs.canonical,
      imagesDir,
      destDir: null,
      stepCount: inputs.stepCount,
      observer: { step: (name, fn) => assetSteps.run(name, fn) },
    });
    assetOutput = produced.assetOutput;

    assetSteps.run('assets:refs', (facts) => {
      // FAIL HERE, NOT IN ASTRO. A malformed media ref reaches the renderer as
      // an empty placeholder and a blank frame, with a green build and no error
      // anywhere — so the shape is checked while there is still a stage to
      // blame. This has always been a gate and it stays one.
      const issues = collectAssetOutputIssues(produced.assetOutput);
      if (issues.length) {
        throw new Error(`the produced media is not renderable: ${issues.map((i) => i.message).join(' | ')}`);
      }
      // AND THE REFS RESOLVE. Every slot filled above must name a file the plan
      // actually copied; a key nothing can resolve is the defect that put blank
      // frames behind a green build once already.
      const unresolved = collectUnresolvedRefs(
        produced.assetOutput,
        produced.manifest.assets.map((a) => a.key),
      );
      facts.note(`${unresolved.length} referencias sin resolver`);
      for (const issue of unresolved) facts.warn(issue.message);
    });

    assetSteps.run('assets:persist', (facts) => {
      assetsPath = path.join(scrapeJob.archivePath!, 'fixed-assets.json');
      writeFileSync(assetsPath, `${JSON.stringify(produced.assetOutput, null, 2)}\n`);
      writeFileSync(
        path.join(scrapeJob.archivePath!, 'fixed-assets.manifest.json'),
        `${JSON.stringify(produced.manifest, null, 2)}\n`,
      );
      facts.note('fixed-assets.json · fixed-assets.manifest.json');
    });

    assetStage.detail = `${produced.manifest.assets.length} asset(s), ${produced.rejected.length} rejected`;

    // THE BRAND MARK, resolved by the stage that already owns visual files.
    // Kept in its own module and its own artefact — no new top-level stage,
    // because the Admin's seven stages are a contract of their own.
    //
    // GENERATION IS NOT PART OF THE BUILD. A provider is non-deterministic, so
    // the mark is resolved once, persisted and reused while its fingerprint
    // holds. The palette it is drawn from is the one this landing will ship:
    // the operator's overrides on top of the template's canonical tokens.
    faviconPath = await assetSteps.runAsync('assets:favicon', async (facts) => {
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
        brand: inputs.canonical?.identity?.brand ?? null,
        productName: inputs.canonical?.identity?.name ?? null,
        palette,
      });

      writeFileSync(priorPath, `${JSON.stringify(mark.manifest, null, 2)}\n`);
      // WHICH OF THE THREE SOURCES ANSWERED — operator file, generated mark, or
      // the canonical monogram. It is the difference between a brand the
      // operator supplied and one the system drew, and it belongs in the report.
      facts.note(String(mark.manifest.source ?? 'sin marca'));
      const png = mark.files.find((f: { name: string }) => f.name === 'favicon.png');
      if (!png) return null;
      const written = path.join(scrapeJob.archivePath!, 'favicon.png');
      writeFileSync(written, png.contents as Buffer);
      return written;
    });
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
    productJsonPath: canonicalFile,
    merchantPath: input.merchantPath ?? null,
    siteUrl: input.siteUrl ?? null,
    // The stage's own output takes precedence; an explicit input is the escape hatch.
    assetsPath: assetsPath ?? input.assetsPath ?? null,
    themePath: input.themePath ?? null,
    // The stage's resolution wins; an explicit input is the escape hatch.
    faviconPath: faviconPath ?? input.faviconPath ?? null,
    // DERIVED FROM THE RESOLVED LINK, never straight from input.shopifyHandle.
    // ProductLink is what Commerce readiness above just verified complete
    // (or, for preview, the absence that resolution itself represents) — the
    // single authority a product is named through, so a ProductLink naming
    // product A and this argv naming product B is not a representable state.
    shopifyHandle: productLinkResolution.status === 'complete' ? productLinkResolution.link.productHandle : null,
  });
  generateStage.jobId = generateJob.jobId;
  emit();
  const generateDone = await awaitJob(registry, generateJob.jobId, (steps) => {
    generateStage.steps = steps;
    emit();
  });
  if (generateDone.status !== 'succeeded') {
    // A CONFLICT AN OPERATOR CAN ACT ON.
    //
    // This surfaced as a paragraph of prd_ identifiers inside the Build Agent's
    // panel — complete, and unreadable. The facts are read FIRST-HAND here
    // (the existing manifest on disk, the identity this run resolved) rather
    // than parsed back out of the child's message, because a message is prose
    // and prose changes.
    if (generateDone.error?.code === 'generation-owner-mismatch') {
      const existing = readGenerationManifest(path.join(OUTPUTS_DIR, input.slug));
      return fail(
        'generate',
        generateDone.error.message,
        {
          headline:
            'Esta carpeta pertenece a otro producto y no se sobrescribirá para proteger sus datos.',
          facts: [
            { label: 'Carpeta', value: `outputs/${input.slug}` },
            {
              label: 'Producto existente',
              value: existing?.source
                ? formatSourceIdentity(existing.source)
                : formatSourceIdentity(resolveSourceIdentity(existing?.sourceUrl ?? null)),
            },
            { label: 'Producto de esta ejecución', value: formatSourceIdentity(sourceIdentity) },
            { label: 'Ejecución existente', value: existing?.productId ?? '—' },
            { label: 'Ejecución actual', value: record.productId ?? '—' },
          ],
        },
      );
    }
    return fail('generate', jobFailure(generateDone));
  }
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
  // THE PUBLIC STOREFRONT CONFIG THIS ONE BUILD NEEDS — injected into the
  // `astro check` / `astro build` child processes below, NEVER written to
  // outputs/<slug>/.env. Preview gets none of it: `{}` changes nothing about
  // what that child inherits.
  const commerceEnvResult = productLinkResolution.status === 'complete'
    ? buildCommerceEnv(productLinkResolution.link, input.siteUrl ?? null)
    : ({ ok: true, env: {} } as const);
  if (!commerceEnvResult.ok) {
    return fail('build', 'Commerce no está completamente configurado', {
      headline: 'Commerce no está completamente configurado',
      facts: commerceEnvResult.missing.map((m) => ({ label: m, value: 'falta' })),
    });
  }
  const build = await runBuild(outDir, commerceEnvResult.env);
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
  // ─── ONE GATE, FIVE REPORTS ─────────────────────────────────────────────
  //
  // `validate:artifact` is the stage's gate and it is the gate it has always
  // been: the landing must be its own repository, carry its generated data and
  // asset map, record its provenance, and hold the handle a commerce run wrote.
  // A missing file still fails the pipeline, and the five checks after it are
  // reported `skipped` — never run — rather than dropped.
  //
  // The five that follow it MEASURE. Each runs a real authority already in this
  // repo against the artefact on disk, and none of them can fail a generation
  // that would have passed before: a defect they find surfaces as a `warning`
  // naming it. That boundary is deliberate. Turning any of them into a gate is
  // a change to what the pipeline promises, which is a decision for the
  // operator to make on the evidence — and the evidence is what this stage did
  // not have until now.
  const validateStage = begin('validate');
  const validateSteps = new StepRecorder(validateStage, emit, VALIDATE_OPERATIONS);
  try {
    validateSteps.run('validate:artifact', (facts) => {
      // THE EXISTING CHECK, VERBATIM — a HARD GATE now reports through
      // `fail()` instead of a throw, so a missing artifact no longer aborts
      // the five checks declared after it. The set of required files has not
      // changed by one entry.
      const missing: string[] = [];
      if (!existsSync(path.join(outDir, '.git'))) missing.push('.git (landing is not its own repository)');
      if (!existsSync(path.join(outDir, '.gitignore'))) missing.push('.gitignore');
      if (!existsSync(path.join(outDir, 'src/data/product.ts'))) missing.push('src/data/product.ts (product data)');
      if (!existsSync(path.join(outDir, 'src/data/images.ts'))) missing.push('src/data/images.ts (asset map)');
      if (!existsSync(path.join(outDir, '.generation.json'))) missing.push('.generation.json');
      if (input.shopifyHandle && !existsSync(path.join(outDir, '.env'))) missing.push('.env (commerce mode handle)');
      if (missing.length > 0) {
        facts.fail(`the generated landing is missing: ${missing.join(', ')}`, 'validation-artifacts-failed');
        return;
      }
      facts.note(`${input.shopifyHandle ? 6 : 5} artefactos presentes`);
    });

    validateSteps.run('validate:grammar', (facts) => {
      // THE SEALED STRUCTURE, MEASURED ON WHAT WAS ACTUALLY BUILT. V3 is the
      // current profile: V2 could not represent a comparison table whose
      // closing row pairs a tick with a value, which is what the first real
      // landing produced.
      const built = path.join(outDir, 'dist/client/index.html');
      if (!existsSync(built)) {
        // NOT `skipped`: the check ran and found nothing to measure, which is
        // a different fact from never having been attempted.
        facts.warn('la landing no tiene dist/client/index.html — no hay HTML construido que medir');
        return;
      }
      const html = readFileSync(built, 'utf-8');
      const fp = structuralFingerprint(html, FIXED_GRAMMAR_V3, FIXED_OPTIONAL_SLOTS_V3);
      facts.note(`${fp.hash.slice(0, 12)}… · ${fp.elements} elementos`);

      // THE HARD GATE. A hash alone has nothing to compare itself against —
      // this asks WHICH region, if any, is on the page but does not fit any
      // shape V3 declares for it, or is below its declared minimum. Never
      // reported as a warning, and never fixed by editing the sealed grammar:
      // V1/V2/V3 stay exactly as sealed.
      const findings = collectUncollapsedRegions(html, FIXED_GRAMMAR_V3);
      for (const finding of findings) facts.warn(finding.message);
      if (findings.length > 0) {
        facts.fail(
          `${findings.length} región(es) de la Structural Grammar V3 sin colapsar o por debajo del mínimo declarado`,
          'validation-grammar-failed',
        );
      }
    });

    validateSteps.run('validate:asset-refs', (facts) => {
      // EVERY MEDIA REF THE PAGE CARRIES MUST RESOLVE TO A FILE THE GENERATOR
      // COPIED. resolveMedia() answers an unknown key with an empty placeholder,
      // so an unresolved ref is a blank frame behind a green build — the exact
      // silent degradation that produced `video-02` on a page that had no video.
      const imagesModule = path.join(outDir, 'src/data/images.ts');
      const source = existsSync(imagesModule) ? readFileSync(imagesModule, 'utf-8') : '';
      const keys = [...source.matchAll(/^\s*'((?:[^'\\]|\\.)*)':/gm)].map((m) => m[1]!.replace(/\\'/g, "'"));
      if (assetOutput === null || keys.length === 0) {
        facts.warn('no hay mapa de assets generado que contrastar con la salida del productor');
        return;
      }
      const unresolved = collectUnresolvedRefs(assetOutput, keys);
      // THE RATIO IS REFS OVER REFS, not refs over keys. Those are different
      // populations — a landing offers more keys than the page references, and
      // dividing one by the other would print a fraction that moves for
      // reasons unrelated to anything being wrong.
      const output = assetOutput as {
        gallery?: unknown[];
        heroExtras?: unknown[];
        productMediaStrip?: unknown[];
        stepMedia?: Record<string, unknown>;
      };
      const refs =
        (output.gallery?.length ?? 0) +
        (output.heroExtras?.length ?? 0) +
        (output.productMediaStrip?.length ?? 0) +
        Object.keys(output.stepMedia ?? {}).length;
      facts.count(refs - unresolved.length, refs, 'referencias resueltas');
      facts.note(`${keys.length} claves en images.ts`);
      for (const issue of unresolved) facts.warn(issue.message);
      // THE HARD GATE. A landing with a broken image reference cannot stay
      // green — this is the exact ratio already computed above, just no
      // longer merely reported.
      if (unresolved.length > 0) {
        facts.fail(`${unresolved.length}/${refs} referencias de asset sin resolver`, 'validation-assets-failed');
      }
    });

    validateSteps.run('validate:ownership', (facts) => {
      // THE LANDING SAYS WHOSE IT IS, and this run says whose it is. They must
      // be the same answer — a folder that belongs to another product is the
      // contamination the whole isolation rule exists to prevent, and
      // `.generation.json` is where the generator recorded it first-hand.
      // FAIL CLOSED. `.generation.json` is itself one of validate:artifact's
      // mandatory artifacts — if it is missing or unreadable, ownership CANNOT
      // be demonstrated when it SHOULD be demonstrable, which is the exact
      // condition the spec calls out, not a shrug.
      const manifest = readGenerationManifest(outDir);
      if (!manifest) {
        facts.fail(
          'la landing no registra .generation.json legible — la propiedad del producto no puede demostrarse',
          'validation-ownership-failed',
        );
        return;
      }
      const shipped = manifest.productId ?? null;
      if (shipped && record.productId && shipped !== record.productId) {
        facts.fail(
          `la carpeta declara ${shipped} y esta ejecución es ${record.productId} — pertenece a otro producto`,
          'validation-ownership-failed',
        );
        return;
      }
      // BELONGS TO ANOTHER SOURCE PRODUCT, same productId notwithstanding —
      // only compared when BOTH sides actually carry a source URL, so a
      // legitimately sourceless product (manual entry, no scrape) never fails
      // on an absence neither side can be faulted for.
      if (manifest.sourceUrl && record.sourceUrl && manifest.sourceUrl !== record.sourceUrl) {
        facts.fail(
          `la carpeta declara origen ${manifest.sourceUrl} y esta ejecución es ${record.sourceUrl} — pertenece a otro source product`,
          'validation-ownership-failed',
        );
        return;
      }
      const identity = manifest.source
        ? formatSourceIdentity(manifest.source)
        : formatSourceIdentity(resolveSourceIdentity(manifest.sourceUrl ?? null));
      facts.note(identity);
    });

    validateSteps.run('validate:social-proof', (facts) => {
      // WHAT THE SOURCE SUPPORTS, and nothing beyond it. The projection is the
      // authority for which canonical reviews are renderable; the audit it
      // already produces is the provenance record. A review that is not
      // displayable is REPORTED here rather than quietly missing from the page.
      const proof = projectFixedSocialProof(canonicalProduct);
      facts.count(proof.audit.displayable, proof.audit.found, 'factuales');
      if (proof.audit.found === 0) {
        facts.warn('la fuente no publicó reseñas — la landing no muestra prueba social');
        return;
      }
      for (const rejection of proof.audit.rejected) {
        facts.warn(`reseña descartada: ${rejection.reason}`);
      }

      // THE HARD GATE — on what the page actually RENDERS, not on the
      // found/displayable ratio. A review missing text or rating is EXCLUDED
      // before it ever reaches testimonials.ts — `proof.audit.rejected`
      // already reports that above as a legitimate data gap, never a defect.
      // What this checks is whether every testimonial WRITTEN to the landing
      // traces back to a body this same canonical product's reviews produce
      // right now — the literal reading of "reviews rendered that cannot be
      // traced to a CanonicalReview".
      const testimonialsModule = path.join(outDir, 'src/data/testimonials.ts');
      if (!existsSync(testimonialsModule)) {
        if (proof.testimonials.length > 0) {
          facts.fail(
            `la landing debería mostrar ${proof.testimonials.length} reseña(s) pero no escribió testimonials.ts`,
            'validation-social-proof-failed',
          );
        }
        return;
      }
      const testimonialsSource = readFileSync(testimonialsModule, 'utf-8');
      const renderedBodies = [...testimonialsSource.matchAll(/body:\s*("(?:[^"\\]|\\.)*")/g)].map(
        (m) => JSON.parse(m[1]!) as string,
      );
      const traceable = new Set(proof.testimonials.map((t) => t.body));
      const untraceable = renderedBodies.filter((body) => !traceable.has(body));
      if (untraceable.length > 0) {
        facts.fail(
          `${untraceable.length}/${renderedBodies.length} reseñas renderizadas no trazan a ninguna CanonicalReview actual`,
          'validation-social-proof-failed',
        );
      }
    });

    await validateSteps.runAsync('validate:readiness', async (facts) => {
      // THE READINESS AUTHORITY ITSELF, run against the landing on disk. Not a
      // reimplementation of its checks — `scripts/check-readiness.mjs` is the
      // one command that answers "is this output ready", and reading its own
      // `--json` is what keeps this from becoming a second opinion that drifts.
      const readiness = await checkReadiness(outDir);
      if (!readiness) {
        facts.warn('el chequeo de readiness no pudo ejecutarse sobre esta landing');
        return;
      }
      const failed = readiness.results.filter((r) => !r.ok);
      facts.count(readiness.total - failed.length, readiness.total, 'checks');
      facts.note(readiness.ready ? 'READY' : `${failed.length} sin cumplir`);
      for (const check of failed) facts.warn(`${check.name}: ${check.detail}`);
      // THE HARD GATE — check-readiness.mjs's own verdict, passed through
      // rather than re-decided. Its 15 checks stay wholly its own; this only
      // asks the one question that authority already answered.
      if (!readiness.ready) {
        facts.fail(
          `production readiness: ${failed.length}/${readiness.total} checks sin cumplir`,
          'validation-readiness-failed',
        );
      }
    });
  } catch (err) {
    // RESERVED FOR A GENUINE CRASH — a check that could not even run. Every
    // hard gate above reports through `facts.fail()`, which never throws;
    // reaching this branch means Validation's own machinery broke, not that
    // it demonstrated a defect, so `skipRemaining()` (already run inside
    // StepRecorder) is the right call here and nowhere else in this stage.
    return fail('validate', err instanceof Error ? err.message : 'the generated landing could not be validated');
  }

  // THE AGGREGATE VERDICT. Six independent, read-only checks all ran to
  // completion above regardless of one another's outcome — this is the one
  // place their results are combined. ANY demonstrated failure makes the
  // whole stage `failed`, never `succeeded with warnings`: Validation can
  // find every real defect in one run, but it does not get to call a landing
  // done while one of them stands.
  const validateFailures = validateStage.steps.filter((s) => s.status === 'failed');
  const validateWarnings = validateStage.steps.filter((s) => s.status === 'warning').length;
  if (validateFailures.length > 0) {
    return fail(
      'validate',
      `Validation Agent: ${validateFailures.length} invariant(s) demostrablemente inválido(s) — ${validateFailures.map((s) => s.name).join(', ')}`,
      {
        headline: `${validateFailures.length} chequeo(s) de Validation fallaron`,
        facts: validateFailures.map((s) => ({ label: s.name, value: s.code ?? 'sin código' })),
      },
    );
  }
  pass('validate', validateWarnings === 0 ? 'artefact complete' : `artefact complete · ${validateWarnings} con avisos`);

  record.status = 'succeeded';
  record.currentStage = null;
  record.finishedAt = nowIso();
  emit();
  return record;
}

export type ReadinessReport = {
  ready: boolean;
  total: number;
  results: { name: string; ok: boolean; detail: string }[];
};

/**
 * Runs the readiness authority against a landing and reads its verdict.
 *
 * NOT A SECOND OPINION. `scripts/check-readiness.mjs` is the one command that
 * answers "is this output ready", and every check in it is a guarantee some
 * phase established. Reimplementing even two of them here would create a pair
 * of answers that drift apart, so the script is invoked and its own
 * `--json` output — the same results, same order, same details a human sees —
 * is what gets reported.
 *
 * It reads. It never writes, never builds, never installs and never touches a
 * network, so running it inside the pipeline is safe by the script's own
 * contract.
 *
 * `null` means the scan could not run at all, which is a different fact from
 * a landing that is not ready, and is reported as one.
 */
export function readReadiness(outDir: string): Promise<ReadinessReport | null> {
  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      [path.join(REPO_ROOT, 'scripts/check-readiness.mjs'), outDir, '--json'],
      { cwd: REPO_ROOT, stdio: ['ignore', 'pipe', 'ignore'] },
    );
    let out = '';
    child.stdout.on('data', (c) => {
      out += String(c);
    });
    child.on('error', () => resolve(null));
    child.on('close', () => {
      // EXIT CODE IS NOT THE ANSWER — 0 is ready and 1 is not ready, and both
      // carry the full report. Only unparseable output means no answer at all.
      try {
        const parsed = JSON.parse(out) as ReadinessReport;
        resolve(Array.isArray(parsed?.results) ? parsed : null);
      } catch {
        resolve(null);
      }
    });
  });
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
export async function defaultRunBuild(
  outDir: string,
  extraEnv: Record<string, string> = {},
): Promise<{ ok: boolean; message: string | null }> {
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

  // BOTH COMMANDS GET THE COMMERCE ENV, NOT ONLY THE BUILD. `astro check`
  // resolves the same `import.meta.env` catalog.ts reads (assertEnv() throws
  // without it) — a Commerce landing that reached `check` before `build` did
  // would fail there first, with the same missing-credential message, on a
  // command the Admin thought was env-agnostic.
  const checked = await runOnce(local, ['check'], outDir, extraEnv);
  if (!checked.ok) {
    return { ok: false, message: `astro check failed — ${checked.message ?? 'unknown error'}` };
  }

  const built = await runOnce(local, ['build'], outDir, extraEnv);
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

/**
 * @param extraEnv Commerce config for THIS build only (buildCommerceEnv()) —
 *   spread in AFTER the base production env, so it is never shadowed by
 *   whatever this Admin process happens to be running under. Empty for
 *   Preview and for every non-build spawn (`pnpm install`).
 */
function productionEnv(extraEnv: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: 'production' };
  for (const key of Object.keys(env)) {
    if (VITE_ENV_KEYS.includes(key) || key.startsWith('VITEST')) delete env[key];
  }
  return { ...env, ...extraEnv };
}

function runOnce(
  bin: string,
  args: string[],
  cwd: string,
  extraEnv: Record<string, string> = {},
): Promise<{ ok: boolean; message: string | null }> {
  return new Promise((resolve) => {
    // stdin IGNORED. Nothing here is interactive, and a child that decides to
    // ask a question on a pipe nobody writes to does not fail — it waits.
    const child = spawn(bin, args, { cwd, env: productionEnv(extraEnv), stdio: ['ignore', 'pipe', 'pipe'] });
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

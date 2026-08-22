// Job lifecycle data model (spec R1 "Job Lifecycle State Machine", R9
// "Re-run Creates New Immutable Job Record"; design §2). Type-only — no
// runtime logic lives here. Consumed by BOTH server (registry.ts, routes)
// and client (job history, detail panels).

export type JobKind = 'scrape' | 'generate' | 'content' | 'design';

/**
 * `queued` and `running` are the only pre-terminal states. Everything else
 * is terminal and, per R9, immutable once reached — a re-run always creates
 * a brand new JobRecord with a new jobId, it never mutates this one.
 */
export type JobStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'timed-out'
  | 'interrupted';

export type ScrapeParams = {
  url: string;
  itemId: string;
  normalizedUrl: string;
  /** Product identity lineage (design "product-identity-generation-isolation" D1/D2). Minted by registry.createScrapeJob when absent. */
  productId?: string;
};

export type GenerateParams = {
  slug: string;
  contentPath: string;
  imagesDir: string | null;
  force: boolean;
  /** Product identity lineage (design D1/D5). Optional — absent means no ownership check is asserted at this call site. */
  productId?: string;
  /** Fase 2: the DesignSpec produced by the Design Agent. Absent = legacy generation. */
  designPath?: string | null;
  /** Fase 4: the CanonicalProduct whose media[] drives the asset pipeline. Absent = legacy filename matching. */
  productJsonPath?: string | null;
  /** Fase 5: operator-supplied Shopify handle. Its PRESENCE switches the landing to commerce mode. Never agent-produced. */
  shopifyHandle?: string | null;
};

/**
 * Design & Layout Agent (agents.MD §5). Runs `scripts/generate-design.mjs`,
 * which is the ONLY implementation — the admin orchestrates it, it does not
 * reimplement it. Its single output is a DesignSpec, which stays the sole
 * interface between the agent and the renderer.
 */
export type DesignParams = {
  /** The scrape job whose canonical product feeds this run. */
  scrapeJobId: string;
  /** Absolute: admin/.jobs/{scrapeJobId}/scrape/canonical-product.json */
  scrapeProductPath: string;
  /** Absolute path to the content.json the Content Agent produced. */
  contentPath: string;
  /** Absolute path the DesignSpec is written to. */
  outPath: string;
  /** Pinned server-side, recorded per-run so a past landing's model is auditable. */
  model: string;
  /** Product identity lineage, carried through for provenance. */
  productId?: string;
};

export type ContentParams = {
  /** The scrape job whose ARCHIVED product.json feeds this run (D2 — never scraper/output/). */
  scrapeJobId: string;
  /** Absolute: admin/.jobs/{scrapeJobId}/scrape/canonical-product.json */
  scrapeProductPath: string;
  /** Absolute path to the operator's free-text file, or null when they left it empty. NEVER the text itself (D2 argv/record hygiene). */
  instructionsPath: string | null;
  /** Pinned server-side (config.GEMINI_MODEL). Recorded per-run so a past landing's model is auditable. Never read from the request body. */
  model: string;
  /** Product identity lineage (design D1/D2), carried through for provenance. */
  productId?: string;
};

export type StageProgress = {
  stage: string;
  status: 'running' | 'done' | 'failed';
  startedAt: string;
  endedAt: string | null;
  ms: number | null;
  progress: { done: number; total: number; label?: string } | null;
  warnings: string[];
};

export type ScrapeResult = {
  outputPath: string;
  title: string | null;
  imageCount: number;
  localImageCount: number;
  reviewCount: number;
  variantCount: number;
  sourceUrl: string;
  scrapedAt: string;
  archivedFiles: number;
  /** Product identity lineage (design D2), echoed from scrape.js's result event. */
  productId?: string;
};

export type GenerateResult = {
  outDir: string;
  slug: string;
  force: boolean;
  imagesMatched: number;
  imagesUnmatched: string[];
  todos: string[];
  /** Product identity lineage (design D2), echoed from generate-landing.mjs's result event. */
  productId?: string;
  /** Absolute path to the written outputs/{slug}/.generation.json manifest (design "write-manifest" stage). */
  manifestPath?: string;
};

export type ContentResult = {
  stagedPath: string;
  model: string;
  /** 1..3 — computed by the script, not reported by the provider. */
  turns: number;
  promptTokenCount: number;
  candidatesTokenCount: number;
  totalTokenCount: number;
  /** null when Gemini omits it (non-thinking response). Never defaulted to 0 — 0 and "not reported" are different facts. */
  thoughtsTokenCount: number | null;
  attemptsDir: string;
  /** Mirrors ValidateResponse['summary'] so the panel renders the same readout the manual path does. */
  productFields: number;
  faqCount: number;
  testimonialCount: number;
  hasDesign: boolean;
  // NO costUsd. NO quotaRemaining. Both explicitly banned by spec.
  /** Product identity lineage (design D2), echoed from generate-content.mjs's result event. */
  productId?: string;
};

export type JobError = {
  message: string;
  stage: string | null;
  code?: string;
};

export type EventGap = { expected: number; got: number };

export type JobRecord = {
  schema: 1;
  jobId: string;
  kind: JobKind;
  status: JobStatus;
  params: ScrapeParams | GenerateParams | ContentParams | DesignParams;
  /** Exact spawn argv, for auditability (design §2). */
  argv: string[];
  /** Absolute cwd the child was spawned with. */
  cwd: string;
  pid: number | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  /** Arrival order, derived ONLY from real events — never fabricated. */
  stages: StageProgress[];
  result: ScrapeResult | GenerateResult | ContentResult | DesignResult | null;
  error: JobError | null;
  /** null => the child emitted no LG_EVENTS lines (degraded, honest). */
  eventSchemaVersion: number | null;
  malformedEventCount: number;
  eventGaps: EventGap[];
  /** Admin-side monotonic counter — distinct from the child's own `seq`. Used as the SSE frame id / Last-Event-ID. */
  lastSeq: number;
  /** Relative to admin/.jobs/{jobId}/, e.g. 'log.ndjson'. */
  logPath: string;
  /** scrape jobs only. */
  archivePath: string | null;
  archiveError: string | null;
};

/** Terminal result of a `design` job — see DesignResultData in events.ts. */
export type DesignResult = {
  outPath: string;
  productId: string | null;
  family: string;
  density: string;
  sections: number;
  attempts: number;
  impeccableFindings: string[];
};

// Job lifecycle data model (spec R1 "Job Lifecycle State Machine", R9
// "Re-run Creates New Immutable Job Record"; design §2). Type-only — no
// runtime logic lives here. Consumed by BOTH server (registry.ts, routes)
// and client (job history, detail panels).

export type JobKind = 'scrape' | 'generate';

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
};

export type GenerateParams = {
  slug: string;
  contentPath: string;
  imagesDir: string | null;
  force: boolean;
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
};

export type GenerateResult = {
  outDir: string;
  slug: string;
  force: boolean;
  imagesMatched: number;
  imagesUnmatched: string[];
  todos: string[];
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
  params: ScrapeParams | GenerateParams;
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
  result: ScrapeResult | GenerateResult | null;
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

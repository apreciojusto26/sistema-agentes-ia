// Structured progress protocol (spec R5, design §4). Type-only — no runtime
// logic lives here. The two agent scripts (scraper/scrape.js, CJS; and
// scripts/generate-landing.mjs, ESM) emit NDJSON lines shaped like `LgEvent`
// to stderr via `scripts/lib/events.cjs`, gated behind `LG_EVENTS=1`.
//
// IMPORTANT (design §10, judgment call #11): the two scripts emit BARE STRING
// LITERALS for `stage` — plain untyped JS, not these enums. There is no
// compiler enforcement tying `ScrapeStage`/`GenerateStage` to what the
// scripts actually emit. The coupling is guarded only by the contract tests
// (admin/test/contract.generate-landing.test.ts Group B, and
// admin/test/contract.scrape-log-lines.test.ts Group E), which assert the
// exact stage sequence against the real scripts. If a script's stage name
// changes, these types will NOT catch it — the contract tests will.

export const EVENT_SCHEMA_VERSION = 1 as const;

/**
 * `scrape.js` stages, one-to-one with the real console.log sequence in
 * `scrapeAliExpress` (scrape.js L316-423). See design §4's stage table for
 * the exact anchor lines.
 */
export type ScrapeStage =
  | 'launch'
  | 'open'
  | 'defer-load'
  | 'structured-data'
  | 'gallery'
  | 'variants'
  | 'reviews'
  | 'images'
  | 'write'
  | 'close';

/**
 * `generate-landing.mjs` stages, mapped to `main()` (generate-landing.mjs
 * L245-297). `copy-images` is only emitted when `--images` is passed.
 */
export type GenerateStage =
  | 'args'
  | 'validate'
  | 'preflight'
  | 'copy-template'
  | 'write-data'
  | 'patch-theme'
  | 'copy-images'
  | 'todos';

export type AgentName = 'scrape' | 'generate';

export type LgEventType = 'stage.start' | 'stage.end' | 'progress' | 'warn' | 'result' | 'error';

export type ScrapeResultData = {
  outputPath: string;
  title: string | null;
  imageCount: number;
  localImageCount: number;
  reviewCount: number;
  variantCount: number;
  sourceUrl: string;
  scrapedAt: string;
};

export type GenerateResultData = {
  outDir: string;
  slug: string;
  force: boolean;
  imagesMatched: number;
  imagesUnmatched: string[];
  todos: string[];
};

export type LgEventData =
  | null
  | { ms: number } // stage.end
  | { done: number; total: number; label?: string } // progress
  | { message: string } // warn
  | { message: string; code?: string } // error
  | ScrapeResultData
  | GenerateResultData; // result

/**
 * The exact NDJSON envelope written to stderr, one object per line.
 * `lg` is always the first key so the sentinel prefix check
 * (`line.startsWith('{"lg":1,')`) is a cheap string comparison with no
 * `JSON.parse` attempt required for non-event lines.
 */
export type LgEvent = {
  lg: 1;
  v: typeof EVENT_SCHEMA_VERSION;
  seq: number;
  ts: string;
  agent: AgentName;
  type: LgEventType;
  stage: ScrapeStage | GenerateStage | string | null;
  data: LgEventData;
};

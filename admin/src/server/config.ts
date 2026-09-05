// Central config: absolute repo paths, ports, timeouts (design §1/§7/§9).
// No runtime logic beyond path arithmetic — every value here is either a
// resolved absolute path or a constant pulled straight from design's
// worst-case derivations, not guesses.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FIXED_TEMPLATE_NAME } from '../../../scripts/lib/fixed-template.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** admin/src/server -> repo root is three levels up. */
export const REPO_ROOT = path.resolve(__dirname, '../../..');

/** admin/src/server -> admin/ is two levels up. */
export const ADMIN_ROOT = path.resolve(__dirname, '../..');

export const SCRAPER_DIR = path.join(REPO_ROOT, 'scraper');
export const SCRAPER_OUTPUT_DIR = path.join(SCRAPER_DIR, 'output');
export const GENERATE_SCRIPT = path.join(REPO_ROOT, 'scripts', 'generate-landing.mjs');
export const CONTENT_CONTRACT_MODULE = path.join(REPO_ROOT, 'scripts', 'lib', 'content-contract.mjs');
/**
 * The Fixed canonical template. The NAME comes from scripts/lib/fixed-template
 * .mjs, which generate-landing.mjs reads too, so the preview server's symlink
 * and the directory the generator actually copies can never name two different
 * templates again. They did.
 */
export const TEMPLATE_DIR = path.join(REPO_ROOT, 'content', FIXED_TEMPLATE_NAME);
export const OUTPUTS_DIR = path.join(REPO_ROOT, 'outputs');

/**
 * THE OPERATOR'S MERCHANT CONFIGURATION — seller identity and commercial policy.
 *
 * The Admin had no way to supply one. `merchantPath` existed on PipelineInput,
 * runner.ts already turned it into `--merchant`, and the HTTP route simply
 * never set it — so every landing generated through the UI reached
 * `astro build` with `packs: []` and died on "product.packs is empty". The
 * whole surface was one unset argument away from working.
 *
 * ONE FILE, because there is one merchant: this system has one Shopify store,
 * one payment account and one legal seller (agents.MD §9). It is never written
 * by an agent and never derived from content — merchant.mjs rejects a config
 * with a missing fact rather than defaulting one, which is the entire point of
 * that layer.
 *
 * ABSENT IS A REAL STATE. Without it a generation still runs and still
 * produces a navigable landing whose legal pages say the information is
 * pending — it simply cannot be built or sold yet, and says so.
 */
export const MERCHANT_CONFIG_PATH = path.join(ADMIN_ROOT, 'merchant.json');

export const JOBS_DIR = path.join(ADMIN_ROOT, '.jobs');
/**
 * One file per generation run — the report an operator opens days later.
 *
 * Beside .jobs rather than inside outputs/: a run that FAILED produced no
 * output directory, and a report that only survived success would be missing
 * exactly when it is most wanted.
 */
export const PIPELINES_DIR = path.join(ADMIN_ROOT, '.pipelines');
export const STAGED_DIR = path.join(ADMIN_ROOT, '.staged');
export const STAGED_CONTENT_PATH = path.join(STAGED_DIR, 'content.json');

export const PORT = Number(process.env.PORT ?? 5174);

export const GEMINI_MODEL = 'gemini-2.5-flash';
export const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

/** Per-Gemini-call abort ceiling. A structured-JSON generation of ~6-8k output
 *  tokens on 2.5 Flash (a thinking model) commonly runs 20-60s; 120s means "this
 *  socket is hung", not "this is slow". */
export const GEMINI_REQUEST_TIMEOUT_MS = 120_000;

/** Derived, not guessed (same discipline as SCRAPE_TIMEOUT_MS): 3 sequential
 *  attempts x GEMINI_REQUEST_TIMEOUT_MS = 360s, + ~60s for prompt assembly,
 *  example-content.json + product.json reads, 3 validator passes and 3
 *  attempt-N.json writes. Rounded to 7 minutes. This is the OUTER backstop —
 *  a healthy single-attempt run finishes in 20-60s and never approaches it. */
export const CONTENT_TIMEOUT_MS = 420_000;

/**
 * Derived, not guessed (design §7): page.goto 60s + waitForSelector('h1')
 * 30s + autoScroll ~7s + review-expansion up to ~44s + up to 8 image
 * downloads at a 20s axios timeout each (worst case ~160s). Rounded up.
 */
export const SCRAPE_TIMEOUT_MS = 180_000;

/** generate-landing.mjs is pure fs I/O; the template tree copy dominates. */
export const GENERATE_TIMEOUT_MS = 60_000;

/** SIGTERM -> SIGKILL grace period for both the timeout ladder and manual cancel. */
export const KILL_GRACE_MS = 5_000;

/** In-memory job cap for JobRegistry#jobs (design §2); older records are read from disk on demand. */
export const MAX_JOBS_IN_MEMORY = 200;

/** Requested starting port for "Ver el resultado"'s astro dev preview. Not 4321 (astro's own
 * default — someone may already have a landing-base dev server on it); astro dev auto-increments
 * to the next free port on collision and prints the real one, which startPreview() parses out. */
export const PREVIEW_PORT = 4322;

/** How long startPreview() waits for astro dev's "Local: http://..." ready line before giving up. */
export const PREVIEW_START_TIMEOUT_MS = 30_000;

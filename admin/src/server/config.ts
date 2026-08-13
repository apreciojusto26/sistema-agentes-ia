// Central config: absolute repo paths, ports, timeouts (design §1/§7/§9).
// No runtime logic beyond path arithmetic — every value here is either a
// resolved absolute path or a constant pulled straight from design's
// worst-case derivations, not guesses.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** admin/src/server -> repo root is three levels up. */
export const REPO_ROOT = path.resolve(__dirname, '../../..');

/** admin/src/server -> admin/ is two levels up. */
export const ADMIN_ROOT = path.resolve(__dirname, '../..');

export const SCRAPER_DIR = path.join(REPO_ROOT, 'scraper');
export const SCRAPER_OUTPUT_DIR = path.join(SCRAPER_DIR, 'output');
export const GENERATE_SCRIPT = path.join(REPO_ROOT, 'scripts', 'generate-landing.mjs');
export const CONTENT_CONTRACT_MODULE = path.join(REPO_ROOT, 'scripts', 'lib', 'content-contract.mjs');
export const TEMPLATE_DIR = path.join(REPO_ROOT, 'content', 'landing-base');
export const OUTPUTS_DIR = path.join(REPO_ROOT, 'outputs');

export const JOBS_DIR = path.join(ADMIN_ROOT, '.jobs');
export const STAGED_DIR = path.join(ADMIN_ROOT, '.staged');
export const STAGED_CONTENT_PATH = path.join(STAGED_DIR, 'content.json');

export const PORT = Number(process.env.PORT ?? 5174);

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

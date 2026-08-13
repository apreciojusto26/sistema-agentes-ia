// GET /api/health (design-addendum §9 tail, task E1/E2). Real filesystem
// checks, no guesses — any `false` lets the UI disable the corresponding Run
// button with the specific reason instead of spawning something that fails
// 3s later.
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import {
  REPO_ROOT,
  SCRAPER_DIR,
  TEMPLATE_DIR,
  OUTPUTS_DIR,
  GENERATE_SCRIPT,
  CONTENT_CONTRACT_MODULE,
} from '../config';
import type { HealthResponse } from '../../shared/api';

/** darwin: ~/Library/Caches/ms-playwright | linux: ~/.cache/ms-playwright (design-addendum §9). */
function playwrightCacheDir(): string {
  const home = os.homedir();
  return process.platform === 'darwin'
    ? path.join(home, 'Library', 'Caches', 'ms-playwright')
    : path.join(home, '.cache', 'ms-playwright');
}

export function getHealthResponse(): HealthResponse {
  return {
    node: process.version,
    repoRoot: REPO_ROOT,
    checks: {
      scraperNodeModules: existsSync(path.join(SCRAPER_DIR, 'node_modules', 'playwright')),
      playwrightBrowsers: existsSync(playwrightCacheDir()),
      templateDir: existsSync(TEMPLATE_DIR),
      outputsDir: existsSync(OUTPUTS_DIR),
      generateScript: existsSync(GENERATE_SCRIPT),
      contentContract: existsSync(CONTENT_CONTRACT_MODULE),
    },
  };
}

export function registerHealthRoutes(app: FastifyInstance): void {
  app.get('/api/health', async () => getHealthResponse());
}

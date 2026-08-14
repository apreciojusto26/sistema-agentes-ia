// RED-before-GREEN for GET /api/health (design-addendum §9 tail, task E1).
// The checks object MUST reflect real filesystem state — no guesses. This
// test verifies both the pure computation (getHealthResponse) and the wired
// Fastify route via app.inject(), and cross-checks against existsSync calls
// performed independently in the test itself so a hardcoded `true`/`false`
// in the implementation would fail here.
import { describe, test, expect, afterEach, vi } from 'vitest';
import { existsSync } from 'node:fs';
import path from 'node:path';
import Fastify from 'fastify';
import { SCRAPER_DIR, TEMPLATE_DIR, OUTPUTS_DIR, GENERATE_SCRIPT, CONTENT_CONTRACT_MODULE, REPO_ROOT } from '../config';

const ORIGINAL_GEMINI_API_KEY = process.env.GEMINI_API_KEY;
afterEach(() => {
  if (ORIGINAL_GEMINI_API_KEY === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = ORIGINAL_GEMINI_API_KEY;
  vi.unstubAllGlobals();
});

describe('GET /api/health', () => {
  test('getHealthResponse() reflects real fs state, not guesses', async () => {
    const { getHealthResponse } = await import('./health');
    const health = getHealthResponse();

    expect(health.node).toBe(process.version);
    expect(health.repoRoot).toBe(REPO_ROOT);
    expect(health.checks.scraperNodeModules).toBe(existsSync(path.join(SCRAPER_DIR, 'node_modules', 'playwright')));
    expect(health.checks.templateDir).toBe(existsSync(TEMPLATE_DIR));
    expect(health.checks.outputsDir).toBe(existsSync(OUTPUTS_DIR));
    expect(health.checks.generateScript).toBe(existsSync(GENERATE_SCRIPT));
    expect(health.checks.contentContract).toBe(existsSync(CONTENT_CONTRACT_MODULE));
    // templateDir/generateScript/contentContract genuinely exist in this repo
    // right now (Batch B/C already created them) — assert the real positive,
    // not just "matches whatever the impl says", to rule out a function that
    // always returns false for everything.
    expect(health.checks.templateDir).toBe(true);
    expect(health.checks.generateScript).toBe(true);
    expect(health.checks.contentContract).toBe(true);
  });

  test('GET /api/health returns 200 with the real checks object over HTTP', async () => {
    const { registerHealthRoutes } = await import('./health');
    const app = Fastify();
    registerHealthRoutes(app);

    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.checks.templateDir).toBe(true);
    expect(typeof body.checks.playwrightBrowsers).toBe('boolean');
  });

  describe('geminiApiKey — presence-only check (spec "Health Check Gains geminiApiKey")', () => {
    test('key present and non-empty -> checks.geminiApiKey is true', async () => {
      process.env.GEMINI_API_KEY = 'a-real-looking-key';
      const { getHealthResponse } = await import('./health');
      expect(getHealthResponse().checks.geminiApiKey).toBe(true);
    });

    test('key unset -> checks.geminiApiKey is false', async () => {
      delete process.env.GEMINI_API_KEY;
      const { getHealthResponse } = await import('./health');
      expect(getHealthResponse().checks.geminiApiKey).toBe(false);
    });

    test('key set to an empty/whitespace string -> checks.geminiApiKey is false', async () => {
      process.env.GEMINI_API_KEY = '   ';
      const { getHealthResponse } = await import('./health');
      expect(getHealthResponse().checks.geminiApiKey).toBe(false);
    });

    test('health check NEVER spends daily quota — zero fetch calls across a GET /api/health invocation', async () => {
      process.env.GEMINI_API_KEY = 'a-real-looking-key';
      const fetchSpy = vi.fn();
      vi.stubGlobal('fetch', fetchSpy);

      const { registerHealthRoutes } = await import('./health');
      const app = Fastify();
      registerHealthRoutes(app);
      const res = await app.inject({ method: 'GET', url: '/api/health' });

      expect(res.statusCode).toBe(200);
      expect(res.json().checks.geminiApiKey).toBe(true);
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });
});

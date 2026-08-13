// RED-before-GREEN for the real Fastify bootstrap (design §1 "Serving the
// built frontend"; task E11/E12). Replaces Batch A's health-stub placeholder
// at admin/src/server/main.ts.
//
// Asserts: registry.recover() completes BEFORE the app is handed back /
// accepts connections; static serving of dist/client with SPA fallback when
// present; honest "frontend not built" degradation (API-only mode) when
// absent — never a blank page with no explanation.
import { describe, test, expect, afterEach, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpDirs: string[] = [];
afterEach(() => {
  for (const d of tmpDirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function makeDistClient(): string {
  const distClientDir = mkdtempSync(path.join(os.tmpdir(), 'lg-dist-client-'));
  tmpDirs.push(distClientDir);
  writeFileSync(path.join(distClientDir, 'index.html'), '<!doctype html><html><body>admin-app</body></html>');
  mkdirSync(path.join(distClientDir, 'assets'), { recursive: true });
  writeFileSync(path.join(distClientDir, 'assets', 'app.js'), 'console.log("app")');
  return distClientDir;
}

describe('buildApp() — recover() ordering', () => {
  test('registry.recover() is called synchronously before buildApp() resolves (i.e. before .listen() can ever run)', async () => {
    const { buildApp } = await import('../src/server/main');
    const { JobRegistry } = await import('../src/server/jobs/registry');
    const registry = new JobRegistry();
    const recoverSpy = vi.spyOn(registry, 'recover');

    const app = await buildApp({ registry });
    expect(recoverSpy).toHaveBeenCalledOnce();
    await app.close();
  });
});

describe('buildApp() — static serving + SPA fallback when dist/client exists', () => {
  test('serves index.html at "/" and falls back to it for any non-/api route (SPA), while /api 404s stay JSON', async () => {
    const distClientDir = makeDistClient();
    const { buildApp } = await import('../src/server/main');
    const { JobRegistry } = await import('../src/server/jobs/registry');
    const app = await buildApp({ registry: new JobRegistry(), distClientDir });

    const root = await app.inject({ method: 'GET', url: '/' });
    expect(root.statusCode).toBe(200);
    expect(root.payload).toContain('admin-app');

    const spaRoute = await app.inject({ method: 'GET', url: '/some/deep/client/route' });
    expect(spaRoute.statusCode).toBe(200);
    expect(spaRoute.payload).toContain('admin-app');

    const asset = await app.inject({ method: 'GET', url: '/assets/app.js' });
    expect(asset.statusCode).toBe(200);

    const apiMiss = await app.inject({ method: 'GET', url: '/api/this-route-does-not-exist' });
    expect(apiMiss.statusCode).toBe(404);
    expect(apiMiss.headers['content-type']).toContain('application/json');

    await app.close();
  });
});

describe('buildApp() — honest degradation when dist/client is absent', () => {
  test('logs "frontend not built" and serves API-only (no SPA fallback, "/" is a real 404 not a blank page)', async () => {
    const { buildApp } = await import('../src/server/main');
    const { JobRegistry } = await import('../src/server/jobs/registry');
    const nonExistentDir = path.join(os.tmpdir(), 'lg-dist-client-does-not-exist-' + Date.now());

    const warnings: string[] = [];
    const app = await buildApp({
      registry: new JobRegistry(),
      distClientDir: nonExistentDir,
      logger: { warn: (msg: string) => warnings.push(msg) },
    });

    expect(warnings.some((w) => w.includes('frontend not built'))).toBe(true);

    // API surface still fully functional in API-only mode.
    const health = await app.inject({ method: 'GET', url: '/api/health' });
    expect(health.statusCode).toBe(200);

    const root = await app.inject({ method: 'GET', url: '/' });
    expect(root.statusCode).toBe(404);

    await app.close();
  });
});

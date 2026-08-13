// RED-before-GREEN for read-only archived-scrape artifact routes (spec R11;
// design §7 "archiveScrape"; task E9/E10). Path-traversal guarded by an
// allowlist derived from scrape.js's real naming (`img_${index}`) and its
// EXTENSION_BY_MIME set.
import { describe, test, expect, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import Fastify from 'fastify';
import type { JobRecord } from '../../shared/jobs';

function fakeJob(overrides: Partial<JobRecord> = {}): JobRecord {
  return {
    schema: 1,
    jobId: 'zz-fake-scrape-job',
    kind: 'scrape',
    status: 'succeeded',
    params: { url: 'x', itemId: '1', normalizedUrl: 'x' },
    argv: [],
    cwd: '/repo',
    pid: null,
    createdAt: 't0',
    startedAt: 't0',
    finishedAt: 't1',
    exitCode: 0,
    signal: null,
    stages: [],
    result: null,
    error: null,
    eventSchemaVersion: null,
    malformedEventCount: 0,
    eventGaps: [],
    lastSeq: 0,
    logPath: '.jobs/zz-fake-scrape-job/log.ndjson',
    archivePath: null,
    archiveError: null,
    ...overrides,
  };
}

async function buildApp(registry: { get: (id: string) => JobRecord | null }) {
  const { registerArtifactsRoutes } = await import('./artifacts');
  const app = Fastify();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  registerArtifactsRoutes(app, registry as any);
  return app;
}

const tmpDirs: string[] = [];
afterEach(() => {
  for (const d of tmpDirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function makeArchive(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'lg-artifacts-test-'));
  tmpDirs.push(dir);
  mkdirSync(path.join(dir, 'images'), { recursive: true });
  writeFileSync(path.join(dir, 'product.json'), JSON.stringify({ title: 'Fixture Product' }));
  writeFileSync(path.join(dir, 'images', 'img_1.jpg'), 'jpeg-bytes');
  writeFileSync(path.join(dir, '..', 'escape-me.txt'), 'should never be reachable');
  return dir;
}

describe('GET /api/jobs/:id/scrape/product.json', () => {
  test('404 when the job has no archivePath', async () => {
    const registry = { get: () => fakeJob({ archivePath: null }) };
    const app = await buildApp(registry);
    const res = await app.inject({ method: 'GET', url: '/api/jobs/zz-fake-scrape-job/scrape/product.json' });
    expect(res.statusCode).toBe(404);
  });

  test('404 for an unknown job id', async () => {
    const registry = { get: () => null };
    const app = await buildApp(registry);
    const res = await app.inject({ method: 'GET', url: '/api/jobs/nope/scrape/product.json' });
    expect(res.statusCode).toBe(404);
  });

  test('200 with the archived product.json content when present', async () => {
    const archivePath = makeArchive();
    const registry = { get: () => fakeJob({ archivePath }) };
    const app = await buildApp(registry);
    const res = await app.inject({ method: 'GET', url: '/api/jobs/zz-fake-scrape-job/scrape/product.json' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ title: 'Fixture Product' });
  });
});

describe('GET /api/jobs/:id/scrape/images/:file', () => {
  test('200 for a real archived image matching the allowlist', async () => {
    const archivePath = makeArchive();
    const registry = { get: () => fakeJob({ archivePath }) };
    const app = await buildApp(registry);
    const res = await app.inject({ method: 'GET', url: '/api/jobs/zz-fake-scrape-job/scrape/images/img_1.jpg' });
    expect(res.statusCode).toBe(200);
    expect(res.payload).toBe('jpeg-bytes');
  });

  test('400 for a filename outside the /^img_\\d+\\.(jpg|png|webp|avif)$/ allowlist — blocks path traversal', async () => {
    const archivePath = makeArchive();
    const registry = { get: () => fakeJob({ archivePath }) };
    const app = await buildApp(registry);

    const traversal = await app.inject({
      method: 'GET',
      url: `/api/jobs/zz-fake-scrape-job/scrape/images/${encodeURIComponent('../escape-me.txt')}`,
    });
    expect(traversal.statusCode).toBe(400);

    const wrongExt = await app.inject({ method: 'GET', url: '/api/jobs/zz-fake-scrape-job/scrape/images/img_1.exe' });
    expect(wrongExt.statusCode).toBe(400);
  });

  test('404 for a well-formed but non-existent image filename', async () => {
    const archivePath = makeArchive();
    const registry = { get: () => fakeJob({ archivePath }) };
    const app = await buildApp(registry);
    const res = await app.inject({ method: 'GET', url: '/api/jobs/zz-fake-scrape-job/scrape/images/img_99.png' });
    expect(res.statusCode).toBe(404);
  });
});

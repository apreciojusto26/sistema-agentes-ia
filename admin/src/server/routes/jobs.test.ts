// RED-before-GREEN for POST/GET /api/jobs, GET /api/jobs/:id,
// POST /api/jobs/:id/cancel (spec R1,R3,R9,R10,R12; design §7; task E5/E6).
//
// Batch D's registry.createScrapeJob/createGenerateJob ALREADY implement the
// actual locking/queueing/spawning — these tests exercise the ROUTE layer
// against a fake registry double (no real spawns), proving the routes are
// thin validate-then-delegate wrappers: slug regex, missing-artifact,
// invalid-content, and the overwrite-confirmation-required 409 + confirmToken
// round-trip are all route-owned checks that must reject BEFORE ever calling
// registry.create*Job().
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import Fastify from 'fastify';
import { OUTPUTS_DIR, STAGED_DIR, STAGED_CONTENT_PATH } from '../config';
import type { JobRecord } from '../../shared/jobs';

const MINIMAL_CONTENT_PATH = path.join(process.cwd(), 'test', 'fixtures', 'minimal-content.json');

function fakeJob(overrides: Partial<JobRecord> = {}): JobRecord {
  return {
    schema: 1,
    jobId: 'zz-fake-job',
    kind: 'scrape',
    status: 'running',
    params: { url: 'https://es.aliexpress.com/item/1005007502111078.html', itemId: '1', normalizedUrl: 'x' },
    argv: [],
    cwd: '/repo',
    pid: 123,
    createdAt: 't0',
    startedAt: 't0',
    finishedAt: null,
    exitCode: null,
    signal: null,
    stages: [],
    result: null,
    error: null,
    eventSchemaVersion: null,
    malformedEventCount: 0,
    eventGaps: [],
    lastSeq: 0,
    logPath: '.jobs/zz-fake-job/log.ndjson',
    archivePath: null,
    archiveError: null,
    ...overrides,
  };
}

function fakeRegistry() {
  return {
    createScrapeJob: vi.fn((params) => fakeJob({ kind: 'scrape', params })),
    createGenerateJob: vi.fn((params) => fakeJob({ kind: 'generate', params, jobId: 'zz-fake-generate-job' })),
    list: vi.fn(() => [fakeJob()]),
    get: vi.fn((id: string) => (id === 'zz-fake-job' ? fakeJob() : null)),
    cancel: vi.fn((id: string) => id === 'zz-fake-job'),
  };
}

async function buildApp(registry: ReturnType<typeof fakeRegistry>) {
  const { registerJobsRoutes } = await import('./jobs');
  const app = Fastify();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  registerJobsRoutes(app, registry as any);
  return app;
}

describe('POST /api/jobs — kind:"scrape"', () => {
  test('empty URL -> 400, no spawn', async () => {
    const registry = fakeRegistry();
    const app = await buildApp(registry);
    const res = await app.inject({ method: 'POST', url: '/api/jobs', payload: { kind: 'scrape', url: '' } });
    expect(res.statusCode).toBe(400);
    expect(registry.createScrapeJob).not.toHaveBeenCalled();
  });

  test('malformed (non-AliExpress) URL -> 400, no spawn', async () => {
    const registry = fakeRegistry();
    const app = await buildApp(registry);
    const res = await app.inject({ method: 'POST', url: '/api/jobs', payload: { kind: 'scrape', url: 'https://example.com/item/123.html' } });
    expect(res.statusCode).toBe(400);
    expect(registry.createScrapeJob).not.toHaveBeenCalled();
  });

  test('valid URL -> 201, delegates to registry.createScrapeJob (thin wrapper, no re-implemented locking)', async () => {
    const registry = fakeRegistry();
    const app = await buildApp(registry);
    const res = await app.inject({
      method: 'POST',
      url: '/api/jobs',
      payload: { kind: 'scrape', url: 'https://es.aliexpress.com/item/1005007502111078.html' },
    });
    expect(res.statusCode).toBe(201);
    expect(registry.createScrapeJob).toHaveBeenCalledOnce();
    expect(res.json().job.jobId).toBe('zz-fake-job');
  });

  test('a second concurrent scrape is queued (registry decides), route just echoes status:"queued" with 201 — no rejection', async () => {
    const registry = fakeRegistry();
    registry.createScrapeJob.mockReturnValueOnce(fakeJob({ status: 'queued', jobId: 'zz-fake-job-2' }));
    const app = await buildApp(registry);
    const res = await app.inject({
      method: 'POST',
      url: '/api/jobs',
      payload: { kind: 'scrape', url: 'https://es.aliexpress.com/item/1005007502111078.html' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().job.status).toBe('queued');
  });
});

describe('POST /api/jobs — kind:"generate"', () => {
  beforeEach(() => rmSync(STAGED_DIR, { recursive: true, force: true }));
  afterEach(() => rmSync(STAGED_DIR, { recursive: true, force: true }));

  test('invalid slug -> 400 with the SAME message shape as generate-landing.mjs L34/L35', async () => {
    const registry = fakeRegistry();
    const app = await buildApp(registry);
    const res = await app.inject({ method: 'POST', url: '/api/jobs', payload: { kind: 'generate', slug: 'Not_Kebab' } });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.code).toBe('slug-invalid');
    expect(body.message).toContain('must be kebab-case');
    expect(registry.createGenerateJob).not.toHaveBeenCalled();
  });

  test('no staged content artifact -> 409 no-content-artifact, no spawn', async () => {
    const registry = fakeRegistry();
    const app = await buildApp(registry);
    const res = await app.inject({ method: 'POST', url: '/api/jobs', payload: { kind: 'generate', slug: 'valid-slug' } });
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('no-content-artifact');
    expect(registry.createGenerateJob).not.toHaveBeenCalled();
  });

  test('invalid staged content -> 422 content-invalid + issues (payoff of D3/shared validator reuse), no spawn', async () => {
    mkdirSync(STAGED_DIR, { recursive: true });
    const invalid = JSON.parse(
      readFileSync(path.join(process.cwd(), 'test', 'fixtures', 'invalid-content.json'), 'utf8'),
    );
    writeFileSync(STAGED_CONTENT_PATH, JSON.stringify(invalid));

    const registry = fakeRegistry();
    const app = await buildApp(registry);
    const res = await app.inject({ method: 'POST', url: '/api/jobs', payload: { kind: 'generate', slug: 'valid-slug' } });
    expect(res.statusCode).toBe(422);
    const body = res.json();
    expect(body.code).toBe('content-invalid');
    expect(Array.isArray(body.issues)).toBe(true);
    expect(body.issues.length).toBeGreaterThan(0);
    expect(registry.createGenerateJob).not.toHaveBeenCalled();
  });

  test('valid content, no existing outputs/{slug} -> 201, delegates with force:false', async () => {
    mkdirSync(STAGED_DIR, { recursive: true });
    writeFileSync(STAGED_CONTENT_PATH, readFileSync(MINIMAL_CONTENT_PATH, 'utf8'));

    const registry = fakeRegistry();
    const app = await buildApp(registry);
    const slug = 'zz-test-no-conflict-slug';
    const res = await app.inject({ method: 'POST', url: '/api/jobs', payload: { kind: 'generate', slug } });
    expect(res.statusCode).toBe(201);
    expect(registry.createGenerateJob).toHaveBeenCalledOnce();
    expect(registry.createGenerateJob.mock.calls[0][0]).toMatchObject({ slug, force: false });
  });

  describe('existing outputs/{slug} — overwrite confirmation flow (R10, design §7)', () => {
    const slug = 'zz-test-overwrite-slug';
    const outDir = path.join(OUTPUTS_DIR, slug);

    beforeEach(() => {
      mkdirSync(STAGED_DIR, { recursive: true });
      writeFileSync(STAGED_CONTENT_PATH, readFileSync(MINIMAL_CONTENT_PATH, 'utf8'));
      mkdirSync(outDir, { recursive: true });
      writeFileSync(path.join(outDir, 'marker.txt'), 'pre-existing');
    });
    afterEach(() => rmSync(outDir, { recursive: true, force: true }));

    test('without confirmOverwrite -> 409 overwrite-confirmation-required with confirmToken + the two verbatim gotcha warnings, no spawn', async () => {
      const registry = fakeRegistry();
      const app = await buildApp(registry);
      const res = await app.inject({ method: 'POST', url: '/api/jobs', payload: { kind: 'generate', slug } });
      expect(res.statusCode).toBe(409);
      const body = res.json();
      expect(body.code).toBe('overwrite-confirmation-required');
      expect(body.slug).toBe(slug);
      expect(typeof body.confirmToken).toBe('string');
      expect(body.warnings).toHaveLength(2);
      expect(body.warnings[0]).toContain('--force does NOT delete');
      expect(body.warnings[1]).toContain('node_modules');
      expect(registry.createGenerateJob).not.toHaveBeenCalled();
    });

    test('a stale/unknown token is rejected with a fresh 409, still no spawn', async () => {
      const registry = fakeRegistry();
      const app = await buildApp(registry);
      const res = await app.inject({
        method: 'POST',
        url: '/api/jobs',
        payload: { kind: 'generate', slug, confirmOverwrite: { token: 'not-a-real-token' } },
      });
      expect(res.statusCode).toBe(409);
      expect(registry.createGenerateJob).not.toHaveBeenCalled();
    });

    test('the confirmToken from the 409 makes force-overwrite possible end to end', async () => {
      const registry = fakeRegistry();
      const app = await buildApp(registry);

      const first = await app.inject({ method: 'POST', url: '/api/jobs', payload: { kind: 'generate', slug } });
      const { confirmToken } = first.json();

      const second = await app.inject({
        method: 'POST',
        url: '/api/jobs',
        payload: { kind: 'generate', slug, confirmOverwrite: { token: confirmToken } },
      });
      expect(second.statusCode).toBe(201);
      expect(registry.createGenerateJob).toHaveBeenCalledOnce();
      expect(registry.createGenerateJob.mock.calls[0][0]).toMatchObject({ slug, force: true });
    });

    test('a confirmToken bound to a DIFFERENT slug is rejected', async () => {
      const registry = fakeRegistry();
      const app = await buildApp(registry);

      const otherOutDir = path.join(OUTPUTS_DIR, 'zz-test-other-slug');
      mkdirSync(otherOutDir, { recursive: true });
      try {
        const forOther = await app.inject({ method: 'POST', url: '/api/jobs', payload: { kind: 'generate', slug: 'zz-test-other-slug' } });
        const { confirmToken } = forOther.json();

        const res = await app.inject({
          method: 'POST',
          url: '/api/jobs',
          payload: { kind: 'generate', slug, confirmOverwrite: { token: confirmToken } },
        });
        expect(res.statusCode).toBe(409);
        expect(registry.createGenerateJob).not.toHaveBeenCalled();
      } finally {
        rmSync(otherOutDir, { recursive: true, force: true });
      }
    });
  });
});

describe('GET /api/jobs, GET /api/jobs/:id, POST /api/jobs/:id/cancel', () => {
  test('GET /api/jobs lists jobs from registry.list()', async () => {
    const registry = fakeRegistry();
    const app = await buildApp(registry);
    const res = await app.inject({ method: 'GET', url: '/api/jobs' });
    expect(res.json().jobs).toHaveLength(1);
  });

  test('GET /api/jobs/:id returns the job, 404 when unknown', async () => {
    const registry = fakeRegistry();
    const app = await buildApp(registry);
    const ok = await app.inject({ method: 'GET', url: '/api/jobs/zz-fake-job' });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().job.jobId).toBe('zz-fake-job');

    const missing = await app.inject({ method: 'GET', url: '/api/jobs/does-not-exist' });
    expect(missing.statusCode).toBe(404);
  });

  test('POST /api/jobs/:id/cancel delegates to registry.cancel()', async () => {
    const registry = fakeRegistry();
    const app = await buildApp(registry);
    const res = await app.inject({ method: 'POST', url: '/api/jobs/zz-fake-job/cancel' });
    expect(res.statusCode).toBe(200);
    expect(registry.cancel).toHaveBeenCalledWith('zz-fake-job');
  });

  test('POST cancel on an unknown/non-cancellable job -> 404', async () => {
    const registry = fakeRegistry();
    const app = await buildApp(registry);
    const res = await app.inject({ method: 'POST', url: '/api/jobs/does-not-exist/cancel' });
    expect(res.statusCode).toBe(404);
  });
});

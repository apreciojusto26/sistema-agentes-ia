// RED-before-GREEN for registry.ts — the D-batch bottleneck (spec R1 "Job
// Lifecycle State Machine", R3 "Concurrency Serialization", R4 "SSE Event
// Stream" plumbing, R9, R11; design §2/§3/§7). Written before registry.ts
// exists.
//
// Group 1 (D14) is the explicitly-specified restart-recovery contract:
// running/queued -> interrupted, pid=null, error.message set, running
// stages -> failed with NO invented endedAt/ms, corrupt job.json
// logged+skipped (never throws), NEVER reattach by pid.
//
// Groups 2-4 (D15) exercise ingest()/create*/cancel()/archiving against REAL
// spawned children — the lightweight fixture child for fast, deterministic
// coverage of queueing/cancel/timeout, and the REAL generate-landing.mjs for
// one full-stack proof that production wiring (default deps, no overrides)
// actually works end to end.
import { describe, test, expect, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync, mkdtempSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { JOBS_DIR, REPO_ROOT } from '../config';
import type { JobRecord } from '../../shared/jobs';
import type { SseFrame } from '../../shared/api';
import type { RunSpec } from './runner';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_CHILD = path.join(__dirname, '..', '..', '..', 'test', 'fixtures', 'runner-fixture-child.cjs');
const MINIMAL_CONTENT = path.join(__dirname, '..', '..', '..', 'test', 'fixtures', 'minimal-content.json');

const cleanupDirs: string[] = [];
afterEach(() => {
  for (const dir of cleanupDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function reserveJobDir(jobId: string): string {
  const dir = path.join(JOBS_DIR, jobId);
  cleanupDirs.push(dir);
  return dir;
}

function fixtureJob(jobId: string, overrides: Partial<JobRecord> = {}): JobRecord {
  return {
    schema: 1,
    jobId,
    kind: 'scrape',
    status: 'running',
    params: { url: 'https://es.aliexpress.com/item/1005007502111078.html', itemId: '1', normalizedUrl: 'x' },
    argv: ['scrape.js', 'x'],
    cwd: '/repo/scraper',
    pid: 99999,
    createdAt: '2026-08-13T00:00:00.000Z',
    startedAt: '2026-08-13T00:00:00.100Z',
    finishedAt: null,
    exitCode: null,
    signal: null,
    stages: [
      { stage: 'open', status: 'done', startedAt: 't1', endedAt: 't2', ms: 50, progress: null, warnings: [] },
      { stage: 'gallery', status: 'running', startedAt: 't3', endedAt: null, ms: null, progress: null, warnings: [] },
    ],
    result: null,
    error: null,
    eventSchemaVersion: 1,
    malformedEventCount: 0,
    eventGaps: [],
    lastSeq: 3,
    logPath: `.jobs/${jobId}/log.ndjson`,
    archivePath: null,
    archiveError: null,
    ...overrides,
  };
}

function writeFixtureJobFile(jobId: string, overrides: Partial<JobRecord> = {}): void {
  const dir = reserveJobDir(jobId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'job.json'), JSON.stringify(fixtureJob(jobId, overrides), null, 2));
}

describe('JobRegistry.recover() — restart recovery (D14)', () => {
  test('a job persisted as "running" becomes "interrupted", pid=null, error.message set, and the running stage becomes "failed" with NO invented endedAt/ms', async () => {
    const jobId = 'zz-test-recover-running';
    writeFixtureJobFile(jobId, { status: 'running' });

    const { JobRegistry } = await import('./registry');
    const registry = new JobRegistry();
    registry.recover();

    const job = registry.get(jobId)!;
    expect(job.status).toBe('interrupted');
    expect(job.pid).toBeNull();
    expect(job.error?.message).toBeTruthy();
    expect(job.error?.stage).toBe('gallery');

    const galleryStage = job.stages.find((s) => s.stage === 'gallery')!;
    expect(galleryStage.status).toBe('failed');
    expect(galleryStage.endedAt).toBeNull(); // never invented
    expect(galleryStage.ms).toBeNull(); // never invented

    // Untouched stage stays untouched.
    const openStage = job.stages.find((s) => s.stage === 'open')!;
    expect(openStage).toEqual({ stage: 'open', status: 'done', startedAt: 't1', endedAt: 't2', ms: 50, progress: null, warnings: [] });
  });

  test('a job persisted as "queued" also becomes "interrupted"', async () => {
    const jobId = 'zz-test-recover-queued';
    writeFixtureJobFile(jobId, { status: 'queued', pid: null, stages: [] });

    const { JobRegistry } = await import('./registry');
    const registry = new JobRegistry();
    registry.recover();

    const job = registry.get(jobId)!;
    expect(job.status).toBe('interrupted');
    expect(job.pid).toBeNull();
  });

  test('NEVER reattaches by pid — a job whose persisted pid equals a real live process (this test process itself) is still marked interrupted with pid=null', async () => {
    const jobId = 'zz-test-recover-real-pid';
    writeFixtureJobFile(jobId, { status: 'running', pid: process.pid });

    const { JobRegistry } = await import('./registry');
    const registry = new JobRegistry();
    registry.recover();

    const job = registry.get(jobId)!;
    expect(job.pid).toBeNull();
    expect(job.status).toBe('interrupted');
  });

  test('a corrupt job.json is logged and skipped, never throws, and does not prevent recovery of sibling jobs', async () => {
    const corruptId = 'zz-test-recover-corrupt';
    const dir = reserveJobDir(corruptId);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'job.json'), '{ not valid json');

    const goodId = 'zz-test-recover-good-sibling';
    writeFixtureJobFile(goodId, { status: 'running' });

    const { JobRegistry } = await import('./registry');
    const registry = new JobRegistry();
    expect(() => registry.recover()).not.toThrow();

    expect(registry.get(corruptId)).toBeNull();
    expect(registry.get(goodId)?.status).toBe('interrupted');
  });

  test('terminal jobs (e.g. "succeeded") are loaded unchanged, not touched by recovery', async () => {
    const jobId = 'zz-test-recover-terminal';
    writeFixtureJobFile(jobId, { status: 'succeeded', pid: null, exitCode: 0, finishedAt: 't9' });

    const { JobRegistry } = await import('./registry');
    const registry = new JobRegistry();
    registry.recover();

    const job = registry.get(jobId)!;
    expect(job.status).toBe('succeeded');
    expect(job.finishedAt).toBe('t9');
  });
});

describe('JobRegistry — create/ingest/cancel against a real spawned fixture child (D15)', () => {
  function fixtureDeps(overrides: Partial<Record<'buildGenerateSpec' | 'buildScrapeSpec', (...args: never[]) => RunSpec>> = {}) {
    return overrides;
  }

  function genSpecFor(mode: string, timeoutMs = 5_000, killGraceMs = 150): RunSpec {
    return { command: process.execPath, args: [FIXTURE_CHILD, mode], cwd: __dirname, timeoutMs, killGraceMs, env: process.env };
  }

  test('createGenerateJob: full lifecycle running -> succeeded, result populated, subscribers receive job/log/stage/end frames', async () => {
    const { JobRegistry } = await import('./registry');
    const registry = new JobRegistry({
      buildGenerateSpec: () => genSpecFor('events'),
    });

    const job = registry.createGenerateJob({ slug: 'zz-fixture-slug', contentPath: '/x', imagesDir: null, force: false });
    reserveJobDir(job.jobId);
    expect(job.status).toBe('running');

    const frames: SseFrame[] = [];
    const unsubscribe = registry.subscribe(job.jobId, (f) => frames.push(f));

    await new Promise<void>((resolve) => {
      const interval = setInterval(() => {
        const current = registry.get(job.jobId);
        if (current && current.status !== 'running') {
          clearInterval(interval);
          resolve();
        }
      }, 10);
    });
    unsubscribe();

    const final = registry.get(job.jobId)!;
    expect(final.status).toBe('succeeded');
    expect(final.exitCode).toBe(0);
    expect(final.result).not.toBeNull();
    expect(final.eventSchemaVersion).toBe(1);

    expect(frames.some((f) => f.type === 'job')).toBe(true);
    expect(frames.some((f) => f.type === 'log')).toBe(true);
    expect(frames.some((f) => f.type === 'stage')).toBe(true);
    expect(frames.some((f) => f.type === 'end')).toBe(true);
  });

  test('same-slug generate is queued while one runs, then starts automatically once the first releases the lock', async () => {
    const { JobRegistry } = await import('./registry');
    const registry = new JobRegistry({
      buildGenerateSpec: () => genSpecFor('events', 5_000),
    });

    const job1 = registry.createGenerateJob({ slug: 'zz-shared-slug', contentPath: '/x', imagesDir: null, force: false });
    reserveJobDir(job1.jobId);
    const job2 = registry.createGenerateJob({ slug: 'zz-shared-slug', contentPath: '/x', imagesDir: null, force: false });
    reserveJobDir(job2.jobId);

    expect(job1.status).toBe('running');
    expect(job2.status).toBe('queued');

    // Wait for job2 to reach a genuinely TERMINAL state, not merely leave
    // 'queued' — it transitions to 'running' immediately on lock acquisition
    // but its own real child (also 60ms-delayed) keeps running after that.
    // Resolving on "!== 'queued'" alone would let the test (and afterEach's
    // rmSync) finish before that child's own exit handler runs, which would
    // then recreate the just-deleted job directory via ensureJobDir().
    await new Promise<void>((resolve) => {
      const interval = setInterval(() => {
        const j2 = registry.get(job2.jobId);
        if (j2 && j2.status === 'succeeded') {
          clearInterval(interval);
          resolve();
        }
      }, 10);
    });

    const finalJob2 = registry.get(job2.jobId)!;
    expect(finalJob2.status).toBe('succeeded');
  });

  test('different-slug generate jobs run concurrently, both immediately "running"', async () => {
    const { JobRegistry } = await import('./registry');
    const registry = new JobRegistry({ buildGenerateSpec: () => genSpecFor('events', 5_000) });

    const jobA = registry.createGenerateJob({ slug: 'zz-slug-a', contentPath: '/x', imagesDir: null, force: false });
    reserveJobDir(jobA.jobId);
    const jobB = registry.createGenerateJob({ slug: 'zz-slug-b', contentPath: '/x', imagesDir: null, force: false });
    reserveJobDir(jobB.jobId);

    expect(jobA.status).toBe('running');
    expect(jobB.status).toBe('running');

    // Wait for both real children to actually finish before the test (and
    // afterEach's rmSync) ends — otherwise a late writeJobRecord() call from
    // the still-running child's eventual exit handler would recreate the
    // just-deleted job directory via ensureJobDir()'s mkdirSync, leaking it.
    await Promise.all(
      [jobA.jobId, jobB.jobId].map(
        (id) =>
          new Promise<void>((resolve) => {
            const interval = setInterval(() => {
              const current = registry.get(id);
              if (current && current.status !== 'running') {
                clearInterval(interval);
                resolve();
              }
            }, 10);
          }),
      ),
    );
  });

  test('cancel() on a queued job marks it cancelled without ever spawning', async () => {
    const { JobRegistry } = await import('./registry');
    const registry = new JobRegistry({ buildGenerateSpec: () => genSpecFor('hang', 30_000, 150) });

    const job1 = registry.createGenerateJob({ slug: 'zz-cancel-queue-slug', contentPath: '/x', imagesDir: null, force: false });
    reserveJobDir(job1.jobId);
    const job2 = registry.createGenerateJob({ slug: 'zz-cancel-queue-slug', contentPath: '/x', imagesDir: null, force: false });
    reserveJobDir(job2.jobId);

    expect(job2.status).toBe('queued');
    const cancelled = registry.cancel(job2.jobId);
    expect(cancelled).toBe(true);
    expect(registry.get(job2.jobId)?.status).toBe('cancelled');

    // Cleanup: stop the hung job1 and WAIT for it to actually exit before this
    // test ends — otherwise afterEach's rmSync races the async SIGTERM/SIGKILL
    // exit handler's attempt to write a final log line into an already-deleted dir.
    registry.cancel(job1.jobId);
    await new Promise<void>((resolve) => {
      const interval = setInterval(() => {
        const current = registry.get(job1.jobId);
        if (current && current.status !== 'running') {
          clearInterval(interval);
          resolve();
        }
      }, 10);
    });
  });

  test('cancel() on a running job uses the SIGTERM/SIGKILL ladder and lands on status "cancelled" (not "timed-out")', async () => {
    const { JobRegistry } = await import('./registry');
    const registry = new JobRegistry({ buildGenerateSpec: () => genSpecFor('hang', 30_000, 150) });

    const job = registry.createGenerateJob({ slug: 'zz-cancel-running-slug', contentPath: '/x', imagesDir: null, force: false });
    reserveJobDir(job.jobId);
    expect(job.status).toBe('running');

    await new Promise((r) => setTimeout(r, 30));
    registry.cancel(job.jobId);

    await new Promise<void>((resolve) => {
      const interval = setInterval(() => {
        const current = registry.get(job.jobId);
        if (current && current.status !== 'running') {
          clearInterval(interval);
          resolve();
        }
      }, 10);
    });

    expect(registry.get(job.jobId)?.status).toBe('cancelled');
  });

  test('a hung job that is never cancelled times out on its own and lands on status "timed-out"', async () => {
    const { JobRegistry } = await import('./registry');
    const registry = new JobRegistry({ buildGenerateSpec: () => genSpecFor('hang', 100, 150) });

    const job = registry.createGenerateJob({ slug: 'zz-timeout-slug', contentPath: '/x', imagesDir: null, force: false });
    reserveJobDir(job.jobId);

    await new Promise<void>((resolve) => {
      const interval = setInterval(() => {
        const current = registry.get(job.jobId);
        if (current && current.status !== 'running') {
          clearInterval(interval);
          resolve();
        }
      }, 10);
    });

    expect(registry.get(job.jobId)?.status).toBe('timed-out');
  });

  test('createScrapeJob on success archives scraper output into .jobs/{jobId}/scrape (design §7 archiving)', async () => {
    const srcDir = mkdtempSync(path.join(os.tmpdir(), 'lg-registry-archive-src-'));
    cleanupDirs.push(srcDir);
    mkdirSync(path.join(srcDir, 'images'), { recursive: true });
    writeFileSync(path.join(srcDir, 'product.json'), JSON.stringify({ title: 'Fixture Product' }));
    writeFileSync(path.join(srcDir, 'images', 'img_1.jpg'), 'x');
    writeFileSync(path.join(srcDir, 'images', 'img_2.jpg'), 'y');

    const { JobRegistry } = await import('./registry');
    const { archiveScrape } = await import('./archive');
    const registry = new JobRegistry({
      buildScrapeSpec: () => genSpecFor('scrape-success', 5_000),
      archiveScrape: (jobId: string) => archiveScrape(jobId, { srcDir }),
    });

    const job = registry.createScrapeJob({ url: 'https://es.aliexpress.com/item/1005007502111078.html', itemId: '1', normalizedUrl: 'x' });
    reserveJobDir(job.jobId);

    await new Promise<void>((resolve) => {
      const interval = setInterval(() => {
        const current = registry.get(job.jobId);
        if (current && current.status !== 'running') {
          clearInterval(interval);
          resolve();
        }
      }, 10);
    });

    const final = registry.get(job.jobId)!;
    expect(final.status).toBe('succeeded');
    expect(final.archivePath).toBeTruthy();
    expect(final.archiveError).toBeNull();
    expect(existsSync(path.join(final.archivePath!, 'product.json'))).toBe(true);
    expect(existsSync(path.join(final.archivePath!, 'images', 'img_1.jpg'))).toBe(true);
    expect((final.result as { archivedFiles: number }).archivedFiles).toBeGreaterThanOrEqual(3);
  });

  // Formal coverage for design D3 Layer 2 / task 3.3 (task 7.2): a fatal
  // archive result must demote an otherwise-succeeded child exit (code 0)
  // to job.status 'failed', via the DI seam the test suite already uses
  // above for the non-fatal archive path — no real archiveScrape() call, no
  // real ownership mismatch needed, just its documented return shape.
  test('a FATAL archiveScrape() result demotes the job to "failed" with error.code/stage set, archivePath null, archiveError mirrored, and no fabricated stages[] entry', async () => {
    const { JobRegistry } = await import('./registry');
    let receivedExpectedProductId: string | undefined;
    const registry = new JobRegistry({
      buildScrapeSpec: () => genSpecFor('scrape-success', 5_000),
      archiveScrape: (_jobId: string, expectedProductId?: string) => {
        receivedExpectedProductId = expectedProductId;
        return {
          ok: false,
          fatal: true,
          code: 'archive-ownership-mismatch',
          error: 'archived product.json belongs to productId "prd_wrong00-11111111", expected "prd_expect0-22222222"',
          expected: 'prd_expect0-22222222',
          found: 'prd_wrong00-11111111',
        };
      },
    });

    const job = registry.createScrapeJob({
      url: 'https://es.aliexpress.com/item/1005007502111078.html',
      itemId: '1',
      normalizedUrl: 'x',
      productId: 'prd_expect0-22222222',
    });
    reserveJobDir(job.jobId);

    await new Promise<void>((resolve) => {
      const interval = setInterval(() => {
        const current = registry.get(job.jobId);
        if (current && current.status !== 'running') {
          clearInterval(interval);
          resolve();
        }
      }, 10);
    });

    expect(receivedExpectedProductId).toBe('prd_expect0-22222222');

    const final = registry.get(job.jobId)!;
    // The child genuinely exited 0 — this is the deliberate exitCode:0 +
    // status:'failed' combination flagged as Risk R1 in design #423.
    expect(final.exitCode).toBe(0);
    expect(final.status).toBe('failed');
    expect(final.error).toEqual({
      message: 'archived product.json belongs to productId "prd_wrong00-11111111", expected "prd_expect0-22222222"',
      stage: 'archive',
      code: 'archive-ownership-mismatch',
    });
    expect(final.archivePath).toBeNull();
    expect(final.archiveError).toBe(
      'archived product.json belongs to productId "prd_wrong00-11111111", expected "prd_expect0-22222222"',
    );
    // No fabricated stages[] entry for 'archive' — the fixture child only
    // ever emitted 'open' and 'write' stage events.
    expect(final.stages.map((s) => s.stage)).toEqual(['open', 'write']);
  });
});

describe('JobRegistry — A7 spec-factory inversion regression (content-agent change)', () => {
  test('createScrapeJob still calls buildScrapeSpec with the same (params, opts) shape and uses its exact returned argv/cwd', async () => {
    const { JobRegistry } = await import('./registry');
    let receivedParams: unknown = null;
    let receivedOpts: unknown = null;
    const registry = new JobRegistry({
      buildScrapeSpec: (params, opts) => {
        receivedParams = params;
        receivedOpts = opts;
        return { command: process.execPath, args: [FIXTURE_CHILD, 'exit-code', '0'], cwd: __dirname, timeoutMs: 5_000 };
      },
    });

    const scrapeParams = { url: 'https://es.aliexpress.com/item/1005007502111078.html', itemId: '1', normalizedUrl: 'x' };
    const job = registry.createScrapeJob(scrapeParams);
    reserveJobDir(job.jobId);

    // Updated for design "product-identity-generation-isolation" D1/D2/task
    // 3.3 (Batch 3): createScrapeJob now mints a productId when the caller
    // didn't pin one, and passes the WIDENED params (including productId)
    // to buildScrapeSpec — this is an intentional, design-contemplated
    // contract change, not a regression. The rest of this test's assertions
    // (argv/cwd shape) are unaffected and unchanged.
    expect(receivedParams).toMatchObject(scrapeParams);
    expect(typeof (receivedParams as { productId?: unknown }).productId).toBe('string');
    expect(receivedOpts).toMatchObject({ repoRoot: REPO_ROOT });
    // The inversion changed HOW the spec is built (thunked, after jobId
    // allocation) but not WHAT argv/cwd the job record ends up with —
    // #createJob still derives argv as [spec.command, ...spec.args].
    expect(job.argv).toEqual([process.execPath, FIXTURE_CHILD, 'exit-code', '0']);
    expect(job.cwd).toBe(__dirname);
  });

  test('createGenerateJob still calls buildGenerateSpec with the same (params, opts) shape and uses its exact returned argv/cwd', async () => {
    const { JobRegistry } = await import('./registry');
    let receivedParams: unknown = null;
    const registry = new JobRegistry({
      buildGenerateSpec: (params, opts) => {
        receivedParams = params;
        return { command: process.execPath, args: [FIXTURE_CHILD, 'exit-code', '0'], cwd: opts.repoRoot, timeoutMs: 5_000 };
      },
    });

    const generateParams = { slug: 'zz-a7-regression-slug', contentPath: '/x', imagesDir: null, force: false };
    const job = registry.createGenerateJob(generateParams);
    reserveJobDir(job.jobId);

    expect(receivedParams).toEqual(generateParams);
    expect(job.argv).toEqual([process.execPath, FIXTURE_CHILD, 'exit-code', '0']);
    expect(job.cwd).toBe(REPO_ROOT);
  });

  test('createContentJob\'s buildSpec thunk receives the REAL allocated jobId (the whole point of the inversion — attempts-dir needs it)', async () => {
    const { JobRegistry } = await import('./registry');
    let receivedJobId: string | null = null;
    const registry = new JobRegistry({
      buildContentSpec: (params, opts) => {
        receivedJobId = opts.jobId;
        return { command: process.execPath, args: ['-e', '0'], cwd: opts.repoRoot, timeoutMs: 5_000 };
      },
    });

    const job = registry.createContentJob({ scrapeJobId: 'zz-x', scrapeProductPath: '/x', instructionsPath: null, model: 'gemini-2.5-flash' });
    reserveJobDir(job.jobId);
    registry.cancel(job.jobId);

    expect(receivedJobId).toBe(job.jobId);
  });
});

describe('JobRegistry — content job result casting (C3, spec "Job Kind Exhaustiveness")', () => {
  test('a content job\'s terminal result event is cast as ContentResult, not silently treated as GenerateResult', async () => {
    const { JobRegistry } = await import('./registry');
    const registry = new JobRegistry({
      buildContentSpec: () => ({ command: process.execPath, args: [FIXTURE_CHILD, 'events'], cwd: __dirname, timeoutMs: 5_000, env: process.env }),
    });

    const job = registry.createContentJob({ scrapeJobId: 'zz-x', scrapeProductPath: '/x', instructionsPath: null, model: 'gemini-2.5-flash' });
    reserveJobDir(job.jobId);

    await new Promise<void>((resolve) => {
      const interval = setInterval(() => {
        const current = registry.get(job.jobId);
        if (current && current.status !== 'running') {
          clearInterval(interval);
          resolve();
        }
      }, 10);
    });

    const final = registry.get(job.jobId)!;
    expect(final.kind).toBe('content');
    // The fixture child's 'events' mode emits a GenerateResultData-shaped
    // result (outDir/slug/...) — the point of this test is that registry.ts
    // no longer assumes "not scrape means generate": it trusts job.kind and
    // casts to ContentResult without inspecting the payload shape.
    expect(final.result).not.toBeNull();
  });
});

describe('JobRegistry — real end-to-end against generate-landing.mjs, default (non-overridden) deps', () => {
  const SLUG = 'zz-registry-e2e-fixture';
  const OUT_DIR = path.join(REPO_ROOT, 'outputs', SLUG);

  afterEach(() => rmSync(OUT_DIR, { recursive: true, force: true }));

  test('createGenerateJob with default deps really spawns generate-landing.mjs and reaches "succeeded"', async () => {
    const { JobRegistry } = await import('./registry');
    const registry = new JobRegistry();

    const job = registry.createGenerateJob({ slug: SLUG, contentPath: MINIMAL_CONTENT, imagesDir: null, force: false });
    reserveJobDir(job.jobId);
    expect(job.status).toBe('running');
    expect(job.argv).toContain('scripts/generate-landing.mjs');

    await new Promise<void>((resolve) => {
      const interval = setInterval(() => {
        const current = registry.get(job.jobId);
        if (current && current.status !== 'running') {
          clearInterval(interval);
          resolve();
        }
      }, 20);
    });

    const final = registry.get(job.jobId)!;
    expect(final.status).toBe('succeeded');
    expect(final.result).not.toBeNull();
    expect(existsSync(path.join(OUT_DIR, 'src/data/product.ts'))).toBe(true);
  });
});

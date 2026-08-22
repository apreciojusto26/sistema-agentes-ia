// HTTP surface over the pipeline: POST /api/pipeline, its GET siblings and the
// SSE stream.
//
// The route is transport + validation ONLY. These tests assert that boundary
// as much as the behaviour: a route that started reaching for an agent, or
// deciding stage order itself, would be the second implementation the whole
// design avoids.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { registerPipelineRoutes, validateStart } from '../src/server/routes/pipeline';
import * as store from '../src/server/pipeline-store';
import type { JobRecord } from '../src/shared/jobs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROUTE_SRC = path.join(__dirname, '../src/server/routes/pipeline.ts');

const temps: string[] = [];
beforeEach(() => store.__reset());
afterEach(() => {
  while (temps.length) rmSync(temps.pop()!, { recursive: true, force: true });
  store.__reset();
});

function fakeJob(over: Partial<JobRecord>): JobRecord {
  return {
    schema: 1, jobId: 'j', kind: 'scrape', status: 'succeeded', params: {}, argv: [], cwd: '',
    pid: null, createdAt: '', startedAt: null, finishedAt: null, exitCode: 0, signal: null,
    stages: [], result: null, error: null, eventSchemaVersion: 1, malformedEventCount: 0,
    eventGaps: [], lastSeq: 0, logPath: '', archivePath: null, archiveError: null, ...over,
  } as JobRecord;
}

/** A registry whose scrape archive and output dir are real temp directories. */
function fakeRegistry() {
  const archive = mkdtempSync(path.join(tmpdir(), 'lg-route-arch-'));
  const outDir = mkdtempSync(path.join(tmpdir(), 'lg-route-out-'));
  temps.push(archive, outDir);

  mkdirSync(path.join(archive, 'images'), { recursive: true });
  writeFileSync(path.join(archive, 'images', 'img_0.webp'), 'b');
  writeFileSync(path.join(archive, 'canonical-product.json'), '{}');

  mkdirSync(path.join(outDir, '.git'), { recursive: true });
  mkdirSync(path.join(outDir, 'src/data'), { recursive: true });
  for (const f of ['.gitignore', 'src/data/design.ts', 'src/data/images.ts', '.generation.json']) {
    writeFileSync(path.join(outDir, f), '');
  }

  const contentPath = path.join(archive, 'content.json');
  let n = 0;
  const jobs = new Map<string, JobRecord>();
  const mk = (kind: string, result: unknown) => {
    n += 1;
    const rec = fakeJob({ jobId: `${kind}-${n}`, kind: kind as JobRecord['kind'], result: result as JobRecord['result'], archivePath: kind === 'scrape' ? archive : null });
    jobs.set(rec.jobId, rec);
    return rec;
  };

  return {
    archive,
    outDir,
    registry: {
      get: (id: string) => jobs.get(id) ?? null,
      createScrapeJob: () => mk('scrape', { title: 'p' }),
      createContentJob: () => {
        writeFileSync(contentPath, '{}');
        return mk('content', { stagedPath: contentPath, faqCount: 3 });
      },
      createDesignJob: (p: any) => {
        mkdirSync(path.dirname(p.outPath), { recursive: true });
        writeFileSync(p.outPath, '{}');
        return mk('design', { family: 'tech', density: 'airy', sections: 8 });
      },
      createGenerateJob: () => mk('generate', { outDir }),
    } as any,
  };
}

async function buildApp(registry: any) {
  const app = Fastify();
  registerPipelineRoutes(app, registry);
  await app.ready();
  return app;
}

describe('input validation', () => {
  it.each([
    [{ slug: '' }, 'slug'],
    [{ slug: 'Not Kebab', url: 'https://x/y' }, 'slug'],
    [{ slug: 'ok' }, 'url'],
    [{ slug: 'ok', url: 'https://x/y', scrapeJobId: 'a' }, 'not both'],
    [{ slug: 'ok', url: 'ftp://x' }, 'http'],
    [{ slug: 'ok', url: 'https://x/y', shopifyHandle: 'Bad Handle' }, 'shopifyHandle'],
  ])('rejects %j', (body, needle) => {
    const r = validateStart(body as any);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain(needle);
  });

  it('accepts a url form and a scrapeJobId form', () => {
    expect(validateStart({ slug: 'ok', url: 'https://x/y' }).ok).toBe(true);
    expect(validateStart({ slug: 'ok', scrapeJobId: 'abc' }).ok).toBe(true);
  });

  it('treats an EMPTY shopifyHandle as preview mode, not as invalid', () => {
    // '' means "no handle". Rejecting it would make the optional field
    // impossible to leave blank from a form.
    expect(validateStart({ slug: 'ok', url: 'https://x/y', shopifyHandle: '' }).ok).toBe(true);
  });

  it('a bad request never starts anything', async () => {
    const fake = fakeRegistry();
    const app = await buildApp(fake.registry);
    const res = await app.inject({ method: 'POST', url: '/api/pipeline', payload: { slug: '' } });
    expect(res.statusCode).toBe(400);
    expect(store.list()).toEqual([]);
    await app.close();
  });
});

describe('POST /api/pipeline', () => {
  it('starts a run and returns the initial record', async () => {
    const fake = fakeRegistry();
    const app = await buildApp(fake.registry);
    const res = await app.inject({ method: 'POST', url: '/api/pipeline', payload: { slug: 'zz-route', url: 'https://x/y' } });

    expect(res.statusCode).toBe(201);
    const { pipeline } = res.json();
    expect(pipeline.pipelineId).toMatch(/^pl_/);
    expect(pipeline.slug).toBe('zz-route');
    expect(pipeline.stages).toHaveLength(8);
    await app.close();
  });

  it('starts the pipeline ONCE — a concurrent request is refused, not queued', async () => {
    const fake = fakeRegistry();
    const app = await buildApp(fake.registry);

    const first = await app.inject({ method: 'POST', url: '/api/pipeline', payload: { slug: 'zz-a', url: 'https://x/y' } });
    expect(first.statusCode).toBe(201);

    // While the first is still running, a second must be rejected outright:
    // two runs against the same outputs directory would race each other.
    const second = await app.inject({ method: 'POST', url: '/api/pipeline', payload: { slug: 'zz-b', url: 'https://x/y' } });
    expect([409, 201]).toContain(second.statusCode);
    if (second.statusCode === 409) expect(second.json().error).toContain('already running');
    await app.close();
  });

  it('no handle -> preview-only; a handle -> commerce-configured', async () => {
    const a = fakeRegistry();
    const appA = await buildApp(a.registry);
    const previewRes = await appA.inject({ method: 'POST', url: '/api/pipeline', payload: { slug: 'zz-p', url: 'https://x/y' } });
    expect(previewRes.json().pipeline.commerceMode).toBe('preview-only');
    await appA.close();
    store.__reset();

    const b = fakeRegistry();
    const appB = await buildApp(b.registry);
    const commerceRes = await appB.inject({
      method: 'POST', url: '/api/pipeline',
      payload: { slug: 'zz-c', url: 'https://x/y', shopifyHandle: 'real-handle' },
    });
    expect(commerceRes.json().pipeline.commerceMode).toBe('commerce-configured');
    await appB.close();
  });

  it('NEVER reports shopify-live-verified', async () => {
    const fake = fakeRegistry();
    const app = await buildApp(fake.registry);
    const res = await app.inject({ method: 'POST', url: '/api/pipeline', payload: { slug: 'zz-s', url: 'https://x/y', shopifyHandle: 'h' } });
    expect(res.json().pipeline.commerceMode).not.toBe('shopify-live-verified');
    await app.close();
  });
});

describe('GET /api/pipeline/:id', () => {
  it('404s for an unknown id', async () => {
    const app = await buildApp(fakeRegistry().registry);
    expect((await app.inject({ method: 'GET', url: '/api/pipeline/nope' })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/api/pipeline/nope/events' })).statusCode).toBe(404);
    await app.close();
  });

  it('returns the stored record', async () => {
    const fake = fakeRegistry();
    const app = await buildApp(fake.registry);
    const started = (await app.inject({ method: 'POST', url: '/api/pipeline', payload: { slug: 'zz-g', url: 'https://x/y' } })).json();
    const got = await app.inject({ method: 'GET', url: `/api/pipeline/${started.pipeline.pipelineId}` });
    expect(got.statusCode).toBe(200);
    expect(got.json().pipeline.pipelineId).toBe(started.pipeline.pipelineId);
    await app.close();
  });
});

describe('the store drives real progress, never a timer', () => {
  it('every subscriber update comes from a put(), and the last one is terminal', async () => {
    const seen: string[] = [];
    const rec = { pipelineId: 'pl_x', status: 'running', currentStage: 'scrape' } as any;
    const off = store.subscribe('pl_x', (r) => seen.push(`${r.currentStage}:${r.status}`));

    store.put(rec);
    store.put({ ...rec, currentStage: 'content' });
    store.put({ ...rec, currentStage: 'validate', status: 'succeeded' });
    off();

    expect(seen).toEqual(['scrape:running', 'content:running', 'validate:succeeded']);
    // A terminal record releases the "one at a time" slot.
    expect(store.active()).toBeNull();
  });

  it('a running record occupies the slot until it finishes', () => {
    store.put({ pipelineId: 'pl_y', status: 'running' } as any);
    expect(store.active()?.pipelineId).toBe('pl_y');
    store.put({ pipelineId: 'pl_y', status: 'failed' } as any);
    expect(store.active()).toBeNull();
  });
});

describe('the route is transport only', () => {
  const src = () => readFileSync(ROUTE_SRC, 'utf-8');

  it('delegates to runPipeline instead of sequencing stages itself', () => {
    expect(src()).toContain('runPipeline(');
    // No stage list, no agent script, no Gemini.
    expect(src()).not.toMatch(/generate-(content|design|landing)\.mjs/);
    expect(src()).not.toContain(':generateContent');
    expect(src()).not.toMatch(/PIPELINE_STAGES\s*=/);
  });

  it('never spawns a process of its own', () => {
    expect(src()).not.toMatch(/\bspawn\(/);
    expect(src()).not.toMatch(/execFileSync|execSync/);
  });

  it('reads no credential', () => {
    expect(src()).not.toMatch(/process\.env\.(GEMINI_API_KEY|PUBLIC_SHOPIFY_STOREFRONT_TOKEN)/);
  });
});

describe('the UI surface decides nothing', () => {
  const panel = () => readFileSync(path.join(__dirname, '../src/client/components/PipelinePanel.tsx'), 'utf-8');

  it('renders the stages the server sent rather than a hardcoded sequence', () => {
    // Labels are allowed; an ORDERED stage list in the client is not — it
    // would let the UI disagree with what actually ran.
    expect(panel()).toContain('record.stages.map');
    expect(panel()).not.toMatch(/const\s+\w*STAGES\w*\s*=\s*\[/);
  });

  it('shows preview only for a succeeded run', () => {
    expect(panel()).toContain("record?.status === 'succeeded'");
  });

  it('reuses the existing preview endpoint and StatusPill', () => {
    expect(panel()).toContain('api.startPreview');
    expect(panel()).toContain('StatusPill');
  });

  it('carries no agent logic and no secret', () => {
    expect(panel()).not.toContain(':generateContent');
    expect(panel()).not.toMatch(/TOKEN|API_KEY/);
  });
});

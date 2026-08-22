// Admin end-to-end pipeline orchestration.
//
// The central property under test is NEGATIVE: the admin must not become a
// second implementation of the agents. Every stage delegates to an existing
// script through the existing JobRegistry, so these tests assert the wiring
// and the structural boundary, not re-tested agent behaviour.
//
// The registry is faked here on purpose. Running the real Gemini agents inside
// a unit suite would make it slow, networked and non-deterministic; the REAL
// end-to-end execution is a separate, manual verification.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runPipeline, sanitiseError, PIPELINE_STAGES } from '../src/server/pipeline';
import type { JobRecord } from '../src/shared/jobs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SERVER_DIR = path.join(REPO_ROOT, 'admin/src/server');

const temps: string[] = [];
afterEach(() => {
  while (temps.length) rmSync(temps.pop()!, { recursive: true, force: true });
  vi.restoreAllMocks();
});

/** A scrape archive that looks exactly like a real one. */
function fakeArchive() {
  const dir = mkdtempSync(path.join(tmpdir(), 'lg-pipe-'));
  temps.push(dir);
  mkdirSync(path.join(dir, 'images'), { recursive: true });
  writeFileSync(path.join(dir, 'images', 'img_0.webp'), 'bytes');
  writeFileSync(path.join(dir, 'canonical-product.json'), JSON.stringify({ identity: { productId: 'prd_x-1' } }));
  return dir;
}

function job(over: Partial<JobRecord>): JobRecord {
  return {
    schema: 1,
    jobId: 'j1',
    kind: 'scrape',
    status: 'succeeded',
    params: {},
    argv: [],
    cwd: '',
    pid: null,
    createdAt: '',
    startedAt: null,
    finishedAt: null,
    exitCode: 0,
    signal: null,
    stages: [],
    result: null,
    error: null,
    eventSchemaVersion: 1,
    malformedEventCount: 0,
    eventGaps: [],
    lastSeq: 0,
    logPath: '',
    archivePath: null,
    archiveError: null,
    ...over,
  } as JobRecord;
}

/**
 * Fake registry that records the ORDER of creations and the params each stage
 * received — which is how "each stage feeds the next" is verified.
 */
function fakeRegistry(opts: { archive: string; outDir: string; failKind?: string } = {} as any) {
  const created: { kind: string; params: any }[] = [];
  const jobs = new Map<string, JobRecord>();
  let n = 0;

  const make = (kind: string, params: any, result: unknown): JobRecord => {
    n += 1;
    const id = `${kind}-${n}`;
    created.push({ kind, params });
    const failed = opts.failKind === kind;
    const rec = job({
      jobId: id,
      kind: kind as JobRecord['kind'],
      status: failed ? 'failed' : 'succeeded',
      params,
      result: failed ? null : (result as JobRecord['result']),
      error: failed ? { message: `${kind} blew up`, stage: kind } : null,
      archivePath: kind === 'scrape' ? opts.archive : null,
    });
    jobs.set(id, rec);
    return rec;
  };

  const contentPath = path.join(opts.archive ?? tmpdir(), 'content.json');

  return {
    created,
    contentPath,
    registry: {
      get: (id: string) => jobs.get(id) ?? null,
      createScrapeJob: (p: any) => make('scrape', p, { title: 'A product' }),
      createContentJob: (p: any) => {
        writeFileSync(contentPath, '{}');
        return make('content', p, { stagedPath: contentPath, faqCount: 6 });
      },
      createDesignJob: (p: any) => {
        mkdirSync(path.dirname(p.outPath), { recursive: true });
        writeFileSync(p.outPath, '{}');
        return make('design', p, { family: 'tech', density: 'balanced', sections: 9 });
      },
      createGenerateJob: (p: any) => make('generate', p, { outDir: opts.outDir, slug: p.slug }),
    } as any,
  };
}

/** A generated landing that satisfies every structural guarantee. */
function fakeOutput(withEnv: boolean) {
  const dir = mkdtempSync(path.join(tmpdir(), 'lg-out-'));
  temps.push(dir);
  mkdirSync(path.join(dir, '.git'), { recursive: true });
  mkdirSync(path.join(dir, 'src/data'), { recursive: true });
  writeFileSync(path.join(dir, '.gitignore'), 'node_modules/\n');
  writeFileSync(path.join(dir, 'src/data/design.ts'), '');
  writeFileSync(path.join(dir, 'src/data/images.ts'), '');
  writeFileSync(path.join(dir, '.generation.json'), '{}');
  if (withEnv) writeFileSync(path.join(dir, '.env'), 'PUBLIC_SHOPIFY_PRODUCT_HANDLE=h\n');
  return dir;
}

const okBuild = async () => ({ ok: true, message: null });

describe('stage order and hand-off', () => {
  it('runs every stage, in the documented order, and succeeds', async () => {
    const out = fakeOutput(false);
    const { registry } = fakeRegistry({ archive: fakeArchive(), outDir: out });

    const seen: string[] = [];
    const rec = await runPipeline(
      { url: 'https://example.com/item/1', slug: 'zz-pipe' },
      { registry, runBuild: okBuild, onUpdate: (r) => r.currentStage && seen.push(r.currentStage) },
    );

    expect(rec.status).toBe('succeeded');
    expect(rec.stages.map((s) => s.name)).toEqual([...PIPELINE_STAGES]);
    expect(rec.stages.every((s) => s.status === 'pass')).toBe(true);
    // Stages were entered in declaration order, never out of sequence.
    expect([...new Set(seen)]).toEqual([...PIPELINE_STAGES]);
  });

  it('each stage receives the REAL output of the previous one', async () => {
    const archive = fakeArchive();
    const out = fakeOutput(false);
    const fake = fakeRegistry({ archive, outDir: out });

    await runPipeline({ url: 'https://example.com/item/1', slug: 'zz-pipe' }, { registry: fake.registry, runBuild: okBuild });

    const byKind = (k: string) => fake.created.find((c) => c.kind === k)!.params;

    // content consumes the scrape's canonical product
    expect(byKind('content').scrapeProductPath).toBe(path.join(archive, 'canonical-product.json'));
    // design consumes BOTH the canonical product and the content agent's file
    expect(byKind('design').scrapeProductPath).toBe(path.join(archive, 'canonical-product.json'));
    expect(byKind('design').contentPath).toBe(fake.contentPath);
    // generate consumes the content, the DesignSpec, the canonical product and the scraped images
    const gen = byKind('generate');
    expect(gen.contentPath).toBe(fake.contentPath);
    expect(gen.designPath).toBe(byKind('design').outPath);
    expect(gen.productJsonPath).toBe(path.join(archive, 'canonical-product.json'));
    expect(gen.imagesDir).toBe(path.join(archive, 'images'));
  });

  it('no stage uses a fixture — every path points at the run\'s own artefacts', async () => {
    const archive = fakeArchive();
    const fake = fakeRegistry({ archive, outDir: fakeOutput(false) });
    await runPipeline({ url: 'https://example.com/item/1', slug: 'zz-pipe' }, { registry: fake.registry, runBuild: okBuild });

    for (const { params } of fake.created) {
      for (const value of Object.values(params)) {
        if (typeof value === 'string' && value.includes('fixtures')) {
          throw new Error(`stage received a fixture path: ${value}`);
        }
      }
    }
  });
});

describe('a failed stage stops the pipeline', () => {
  it('marks the failure and SKIPS every later stage — never "failed"', async () => {
    const fake = fakeRegistry({ archive: fakeArchive(), outDir: fakeOutput(false), failKind: 'design' });

    const rec = await runPipeline({ url: 'https://example.com/item/1', slug: 'zz-pipe' }, { registry: fake.registry, runBuild: okBuild });

    expect(rec.status).toBe('failed');
    expect(rec.currentStage).toBe('design');

    const status = (n: string) => rec.stages.find((s) => s.name === n)!.status;
    expect(status('scrape')).toBe('pass');
    expect(status('content')).toBe('pass');
    expect(status('design')).toBe('failed');
    // Never attempted -> skipped, not failed.
    for (const later of ['assets', 'generate', 'build', 'validate']) expect(status(later)).toBe('skipped');
  });

  it('does not run any later job after a failure', async () => {
    const fake = fakeRegistry({ archive: fakeArchive(), outDir: fakeOutput(false), failKind: 'content' });
    await runPipeline({ url: 'https://example.com/item/1', slug: 'zz-pipe' }, { registry: fake.registry, runBuild: okBuild });
    expect(fake.created.map((c) => c.kind)).toEqual(['scrape', 'content']);
  });

  it('a failing build blocks final validation', async () => {
    const fake = fakeRegistry({ archive: fakeArchive(), outDir: fakeOutput(false) });
    const rec = await runPipeline(
      { url: 'https://example.com/item/1', slug: 'zz-pipe' },
      { registry: fake.registry, runBuild: async () => ({ ok: false, message: 'astro exploded' }) },
    );
    expect(rec.stages.find((s) => s.name === 'build')!.status).toBe('failed');
    expect(rec.stages.find((s) => s.name === 'validate')!.status).toBe('skipped');
  });

  it('reports a missing normalizer artefact instead of continuing', async () => {
    const emptyArchive = mkdtempSync(path.join(tmpdir(), 'lg-empty-'));
    temps.push(emptyArchive);
    const fake = fakeRegistry({ archive: emptyArchive, outDir: fakeOutput(false) });
    const rec = await runPipeline({ url: 'https://example.com/item/1', slug: 'zz-pipe' }, { registry: fake.registry, runBuild: okBuild });
    expect(rec.currentStage).toBe('normalize');
    expect(rec.error).toContain('canonical-product.json');
  });
});

describe('final validation guards the artefact\'s guarantees', () => {
  it('fails when the landing has no .git of its own', async () => {
    const out = fakeOutput(false);
    rmSync(path.join(out, '.git'), { recursive: true, force: true });
    const fake = fakeRegistry({ archive: fakeArchive(), outDir: out });
    const rec = await runPipeline({ url: 'https://example.com/item/1', slug: 'zz-pipe' }, { registry: fake.registry, runBuild: okBuild });
    expect(rec.stages.find((s) => s.name === 'validate')!.status).toBe('failed');
    expect(rec.error).toContain('.git');
  });

  it('fails when the DesignSpec did not reach the landing', async () => {
    const out = fakeOutput(false);
    rmSync(path.join(out, 'src/data/design.ts'), { force: true });
    const fake = fakeRegistry({ archive: fakeArchive(), outDir: out });
    const rec = await runPipeline({ url: 'https://example.com/item/1', slug: 'zz-pipe' }, { registry: fake.registry, runBuild: okBuild });
    expect(rec.error).toContain('design.ts');
  });
});

describe('commerce modes are three distinct states', () => {
  it('no handle -> preview-only, and no handle reaches generate', async () => {
    const fake = fakeRegistry({ archive: fakeArchive(), outDir: fakeOutput(false) });
    const rec = await runPipeline({ url: 'https://example.com/item/1', slug: 'zz-pipe' }, { registry: fake.registry, runBuild: okBuild });
    expect(rec.commerceMode).toBe('preview-only');
    expect(fake.created.find((c) => c.kind === 'generate')!.params.shopifyHandle).toBeNull();
  });

  it('a handle -> commerce-configured, and the handle is forwarded verbatim', async () => {
    const fake = fakeRegistry({ archive: fakeArchive(), outDir: fakeOutput(true) });
    const rec = await runPipeline(
      { url: 'https://example.com/item/1', slug: 'zz-pipe', shopifyHandle: 'selfie-vlog-monitor' },
      { registry: fake.registry, runBuild: okBuild },
    );
    expect(rec.commerceMode).toBe('commerce-configured');
    expect(fake.created.find((c) => c.kind === 'generate')!.params.shopifyHandle).toBe('selfie-vlog-monitor');
  });

  it('NEVER claims shopify-live-verified — only verify-shopify-live.mjs can justify that', async () => {
    const fake = fakeRegistry({ archive: fakeArchive(), outDir: fakeOutput(true) });
    const rec = await runPipeline(
      { url: 'https://example.com/item/1', slug: 'zz-pipe', shopifyHandle: 'h' },
      { registry: fake.registry, runBuild: okBuild },
    );
    expect(rec.commerceMode).not.toBe('shopify-live-verified');
  });

  it('commerce mode requires the .env the handle produced', async () => {
    const fake = fakeRegistry({ archive: fakeArchive(), outDir: fakeOutput(false) });
    const rec = await runPipeline(
      { url: 'https://example.com/item/1', slug: 'zz-pipe', shopifyHandle: 'h' },
      { registry: fake.registry, runBuild: okBuild },
    );
    expect(rec.error).toContain('.env');
  });
});

describe('errors are sanitised', () => {
  it('redacts a known secret value', () => {
    expect(sanitiseError('failed with sk-abcdef123456 inside', ['sk-abcdef123456'])).toBe('failed with «REDACTED» inside');
  });

  it('redacts credential-shaped assignments whatever the value', () => {
    expect(sanitiseError('env GEMINI_API_KEY=AIzaSyXXXX rejected')).toContain('GEMINI_API_KEY=«REDACTED»');
    expect(sanitiseError('PUBLIC_SHOPIFY_STOREFRONT_TOKEN=abc123 bad')).toContain('«REDACTED»');
  });

  it('drops the stack trace when a real message exists', () => {
    const msg = sanitiseError('Something broke\n    at foo (/a/b.js:1:1)\n    at bar');
    expect(msg).toBe('Something broke');
  });

  it('a stage error stored on the record is already sanitised', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'super-secret-key-value');
    // The failing job must also be RESOLVABLE via registry.get(), otherwise
    // awaitJob() polls forever — the same way a real registry would behave.
    const fake = fakeRegistry({ archive: fakeArchive(), outDir: fakeOutput(false) });
    const failing = job({
      jobId: 'c',
      kind: 'content',
      status: 'failed',
      error: { message: 'boom super-secret-key-value', stage: 'generate' },
    });
    const baseGet = fake.registry.get;
    fake.registry.get = (id: string) => (id === 'c' ? failing : baseGet(id));
    fake.registry.createContentJob = () => failing;

    const rec = await runPipeline({ url: 'https://example.com/item/1', slug: 'zz-pipe' }, { registry: fake.registry, runBuild: okBuild });
    expect(rec.error).not.toContain('super-secret-key-value');
  });
});

describe('the admin does NOT reimplement any agent', () => {
  const serverSources = () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of require('node:fs').readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) files.push(full);
      }
    };
    walk(SERVER_DIR);
    return files;
  };

  it('no server file INVOKES a Gemini generation', () => {
    // Narrowed deliberately: config.ts legitimately declares GEMINI_API_BASE
    // for the health check, and a declared constant is configuration, not an
    // agent. What must not exist server-side is the generation call itself.
    for (const file of serverSources()) {
      const src = readFileSync(file, 'utf-8');
      expect(src, `${file} invokes a Gemini generation`).not.toContain(':generateContent');
      expect(src, `${file} builds a Gemini request body`).not.toMatch(/systemInstruction\s*:/);
    }
  });

  it('no server file carries an agent prompt or the design registry', () => {
    for (const file of serverSources()) {
      const src = readFileSync(file, 'utf-8');
      expect(src, `${file} embeds a design vocabulary`).not.toMatch(/DESIGN_FAMILIES\s*=/);
      expect(src, `${file} embeds a capability registry`).not.toMatch(/const REGISTRY\s*=/);
      expect(src, `${file} embeds an Impeccable prompt`).not.toMatch(/IMPECCABLE_PROMPT\s*=/);
    }
  });

  it('the pipeline delegates through the registry, spawning only the build', () => {
    const src = readFileSync(path.join(SERVER_DIR, 'pipeline.ts'), 'utf-8');
    for (const call of ['createScrapeJob', 'createContentJob', 'createDesignJob', 'createGenerateJob']) {
      expect(src).toContain(`registry.${call}`);
    }
    // Exactly one spawn: `astro build`. Any other would be a second runner.
    expect([...src.matchAll(/\bspawn\(/g)]).toHaveLength(1);
  });

  it('the Design Agent is invoked as the real script', () => {
    const runner = readFileSync(path.join(SERVER_DIR, 'jobs/runner.ts'), 'utf-8');
    expect(runner).toContain("'scripts/generate-design.mjs'");
  });
});

// THE DESIGN AGENT DOES NOT RUN. Proved by running the pipeline, not by grep.
//
// This repo is Fixed AstraVibe: every generated product is the SAME PAGE with
// different data in it. A Design Agent choosing a composition per product is
// the one thing that premise forbids — so the `design` stage was removed from
// the orchestrator rather than defaulted, stubbed, or run-and-ignored.
//
// WHY A GREP SUITE WOULD NOT BE ENOUGH. "pipeline.ts does not contain
// createDesignJob" is true of a pipeline that calls it through a variable, and
// it stays green if a DesignSpec starts arriving from somewhere else entirely.
// The claim worth defending is behavioural: drive a real runPipeline() to
// completion against a registry that TREATS ANY DESIGN JOB AS A FAILURE, and
// show the run still succeeds. If the Design Agent were reached, these tests
// could not pass — the registry would throw.
//
// The design CONTRACT modules stay in the tree on purpose (the Design System
// suites still exercise them against content/landing-base, which physically
// remains here). That is why the last test below pins the boundary explicitly:
// the tooling may exist, the Fixed pipeline may not reach it.
import { describe, it, expect, afterAll } from 'vitest';
import { cpSync, mkdirSync, mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runPipeline } from '../src/server/pipeline';
import { PIPELINE_STAGES } from '../src/shared/pipeline-stages';
import type { JobRecord } from '../src/shared/jobs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = path.join(__dirname, '../src/server');

const temps: string[] = [];
afterAll(() => {
  while (temps.length) rmSync(temps.pop()!, { recursive: true, force: true });
});

function temp(prefix: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  temps.push(dir);
  return dir;
}

function job(over: Partial<JobRecord>): JobRecord {
  return {
    schema: 1, jobId: 'j', kind: 'scrape', status: 'succeeded', params: {}, argv: [], cwd: '',
    pid: null, createdAt: '', startedAt: null, finishedAt: null, exitCode: 0, signal: null,
    stages: [], result: null, error: null, eventSchemaVersion: 1, malformedEventCount: 0,
    eventGaps: [], lastSeq: 0, logPath: '', archivePath: null, archiveError: null, ...over,
  } as JobRecord;
}

/**
 * A registry that can satisfy every Fixed stage — and that EXPLODES if asked
 * for a design job. That inversion is the whole mechanism: the assertion is
 * not "we did not see a design job", it is "a design job was impossible and
 * the pipeline finished anyway".
 */
function strictRegistry() {
  const archive = temp('lg-db-arch-');
  const outDir = temp('lg-db-out-');
  const contentPath = path.join(archive, 'content.json');
  const designCalls: unknown[] = [];

  // REAL MEDIA, because the assets stage now PRODUCES rather than checks. An
  // empty images/ and a `{}` canonical were enough while the stage only
  // asserted the directory existed; a producer has nothing to select from.
  // This suite is about the Design Agent, so the media is the smallest real
  // thing that lets the pipeline reach the stages it does care about.
  mkdirSync(path.join(archive, 'images'), { recursive: true });
  const FIXTURE_IMAGES = path.join(__dirname, 'fixtures/assets/a/images');
  for (const file of ['img_0.png', 'img_1.png']) {
    cpSync(path.join(FIXTURE_IMAGES, file), path.join(archive, 'images', file));
  }
  writeFileSync(
    path.join(archive, 'canonical-product.json'),
    JSON.stringify({
      identity: { productId: null, name: 'Producto de prueba', brand: null },
      media: {
        images: [
          { url: null, localPath: 'images/img_0.png', order: 0 },
          { url: null, localPath: 'images/img_1.png', order: 1 },
        ],
        videos: [],
      },
    }),
  );
  writeFileSync(contentPath, JSON.stringify({ product: { steps: [] }, faq: [], testimonials: [] }));

  // A COMPLETE Fixed artefact. Note what is NOT here: src/data/design.ts.
  // The landing below is valid without one, which is the validate-side half
  // of the same claim.
  mkdirSync(path.join(outDir, '.git'), { recursive: true });
  mkdirSync(path.join(outDir, 'src/data'), { recursive: true });
  writeFileSync(path.join(outDir, '.gitignore'), '');
  writeFileSync(path.join(outDir, 'src/data/product.ts'), '');
  writeFileSync(path.join(outDir, 'src/data/images.ts'), '');
  writeFileSync(path.join(outDir, '.generation.json'), '{}');

  const created: Array<{ kind: string; params: any }> = [];
  const jobs = new Map<string, JobRecord>();
  let n = 0;
  const make = (kind: string, params: any, result: unknown) => {
    n += 1;
    created.push({ kind, params });
    const rec = job({
      jobId: `${kind}-${n}`,
      kind: kind as JobRecord['kind'],
      result: result as JobRecord['result'],
      archivePath: kind === 'scrape' ? archive : null,
    });
    jobs.set(rec.jobId, rec);
    return rec;
  };

  return {
    archive,
    outDir,
    created,
    designCalls,
    registry: {
      get: (id: string) => jobs.get(id) ?? null,
      createScrapeJob: (p: any) => make('scrape', p, { title: 'p' }),
      createContentJob: (p: any) => {
        writeFileSync(contentPath, '{}');
        return make('content', p, { stagedPath: contentPath, faqCount: 3 });
      },
      createDesignJob: (p: any) => {
        designCalls.push(p);
        throw new Error('createDesignJob was called — the Design Agent must never run in Fixed');
      },
      createGenerateJob: (p: any) => make('generate', p, { outDir, slug: p.slug }),
    } as any,
  };
}

const okBuild = async () => ({ ok: true, message: null });
const run = (registry: any) =>
  runPipeline({ url: 'https://example.com/item/1', slug: 'zz-bypass' }, { registry, runBuild: okBuild });

describe('the Design Agent is not executed', () => {
  it('a full run succeeds against a registry that cannot produce a design job', async () => {
    const fake = strictRegistry();
    const rec = await run(fake.registry);

    expect(rec.status, rec.error ?? 'pipeline failed').toBe('succeeded');
    expect(fake.designCalls).toEqual([]);
  });

  it('no design job is created, and no stage is named design', async () => {
    const fake = strictRegistry();
    const rec = await run(fake.registry);

    expect(fake.created.map((c) => c.kind)).not.toContain('design');
    expect(rec.stages.map((s) => s.name)).not.toContain('design');
    expect([...PIPELINE_STAGES]).not.toContain('design');
  });

  it('the stage list is exactly the Fixed sequence', async () => {
    const fake = strictRegistry();
    const rec = await run(fake.registry);

    expect(rec.stages.map((s) => s.name)).toEqual([
      'scrape',
      'normalize',
      'content',
      'assets',
      'generate',
      'build',
      'validate',
    ]);
  });

  it('generate is invoked WITHOUT a designPath, so the child never gets --design', async () => {
    const fake = strictRegistry();
    await run(fake.registry);

    const gen = fake.created.find((c) => c.kind === 'generate')!.params;
    // Absent, not null. buildGenerateSpec appends `--design` on truthiness, so
    // what actually keeps the flag off the argv is the key not being set.
    expect('designPath' in gen && gen.designPath !== undefined).toBe(false);

    // …and the argv builder agrees, given exactly these params.
    const { buildGenerateSpec } = await import('../src/server/jobs/runner');
    const spec = buildGenerateSpec(
      { slug: gen.slug, contentPath: gen.contentPath, imagesDir: gen.imagesDir, force: false },
      { repoRoot: '/repo' },
    );
    expect(spec.args).not.toContain('--design');
  });

  it('a landing with NO src/data/design.ts passes final validation', async () => {
    const fake = strictRegistry();
    const rec = await run(fake.registry);

    // The artefact built above never had one. Under the Version A rule this
    // exact run failed with "missing: src/data/design.ts (DesignSpec)".
    expect(rec.stages.find((s) => s.name === 'validate')!.status).toBe('pass');
    expect(rec.error).toBeNull();
  });

  it('no DesignSpec is written anywhere the pipeline controls', async () => {
    const fake = strictRegistry();
    await run(fake.registry);

    for (const dir of [fake.archive, fake.outDir]) {
      expect(
        readFileSync(path.join(fake.outDir, '.generation.json'), 'utf-8'),
        `${dir} gained a DesignSpec`,
      ).not.toContain('designSpec');
    }
  });
});

describe('the design tooling may exist; the Fixed pipeline may not reach it', () => {
  it('the orchestrator names no design job and no design script', () => {
    // Comments stripped — pipeline.ts documents what it is forbidden to call,
    // same convention as contract.content-provenance.test.ts's scanner.
    const code = readFileSync(path.join(SERVER_DIR, 'pipeline.ts'), 'utf-8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .filter((l) => !/^\s*(\/\/|\*)/.test(l))
      .join('\n');

    expect(code).not.toContain('createDesignJob');
    expect(code).not.toContain('generate-design.mjs');
    expect(code).not.toContain('DesignSpec');
  });

  it('the Design System contract modules are still present and untouched', () => {
    // The inverse guard, and it is deliberate. "Bypass the Design Agent" must
    // not silently become "delete the Design System", because the suites that
    // still inspect content/landing-base import these. If a future change
    // removes them, that is a decision to make on purpose — not a side effect
    // of this one.
    const repoRoot = path.join(__dirname, '../..');
    for (const rel of [
      'scripts/lib/design-contract.mjs',
      'scripts/lib/design-registry.mjs',
      'admin/src/server/validation/design.ts',
    ]) {
      expect(() => readFileSync(path.join(repoRoot, rel), 'utf-8'), `${rel} disappeared`).not.toThrow();
    }
  });
});

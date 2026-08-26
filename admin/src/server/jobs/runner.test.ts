// RED-before-GREEN for runner.ts — the highest-risk module in Batch D
// (spec R2 "Child Process Execution"; design §1/§4/§7). Written before
// runner.ts exists.
//
// Deliberately tested against REAL spawned child processes, not mocked
// function calls: the whole point of this module is `.setEncoding('utf8')`
// + real stdout/stderr piping + a real SIGTERM/SIGKILL ladder, none of which
// a mock would exercise. Group 1 uses a small fixture child
// (test/fixtures/runner-fixture-child.cjs) to isolate runner mechanics from
// Playwright/network. Group 2 spawns the REAL generate-landing.mjs (fast,
// fs-only, no network) end-to-end to prove the wrapper drives a real agent
// script correctly, closing Batch C's handoff note about setEncoding.
import { describe, test, expect, afterAll } from 'vitest';
import { rmSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { REPO_ROOT } from '../config';
import type { ParsedLine } from './ndjson';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_CHILD = path.join(__dirname, '..', '..', '..', 'test', 'fixtures', 'runner-fixture-child.cjs');
const MINIMAL_CONTENT = path.join(__dirname, '..', '..', '..', 'test', 'fixtures', 'minimal-content.json');

const RUNNER_SLUG = 'zz-runner-test-fixture';
const RUNNER_OUT_DIR = path.join(REPO_ROOT, 'outputs', RUNNER_SLUG);

function cleanRunnerOutput() {
  rmSync(RUNNER_OUT_DIR, { recursive: true, force: true });
}

afterAll(cleanRunnerOutput);

describe('runner — fixture-child mechanics (real spawn, not mocked)', () => {
  test('reconstructs a line whose text (including a multi-byte emoji) is split across two real pipe writes', async () => {
    const { run } = await import('./runner');
    const stdoutLines: string[] = [];

    const result = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
      run(
        { command: process.execPath, args: [FIXTURE_CHILD, 'utf8-split'], cwd: __dirname, timeoutMs: 5_000 },
        {
          onStdoutLine: (line) => stdoutLines.push(line),
          onExit: ({ code, signal }) => resolve({ code, signal }),
        },
      );
    });

    expect(result.code).toBe(0);
    expect(stdoutLines).toEqual(['🚀 Abriendo producto...']);
  });

  test('setEncoding(utf8) is applied: stdout/stderr streams are already decoded strings by the time LineBuffer sees them', async () => {
    const { run } = await import('./runner');
    const stdoutLines: string[] = [];
    const stderrEvents: Array<{ line: string; parsed: ParsedLine }> = [];

    const result = await new Promise<{ code: number | null }>((resolve) => {
      run(
        { command: process.execPath, args: [FIXTURE_CHILD, 'events'], cwd: __dirname, timeoutMs: 5_000 },
        {
          onStdoutLine: (line) => stdoutLines.push(line),
          onStderrLine: (line, parsed) => stderrEvents.push({ line, parsed }),
          onExit: ({ code }) => resolve({ code }),
        },
      );
    });

    expect(result.code).toBe(0);
    expect(stdoutLines).toEqual(['normal human log line']);
    expect(stderrEvents).toHaveLength(3);
    expect(stderrEvents.every((e) => e.parsed.kind === 'event')).toBe(true);
    const types = stderrEvents.map((e) => (e.parsed.kind === 'event' ? e.parsed.event.type : null));
    expect(types).toEqual(['stage.start', 'stage.end', 'result']);
  });

  test('captures a non-zero exit code', async () => {
    const { run } = await import('./runner');
    const result = await new Promise<{ code: number | null }>((resolve) => {
      run(
        { command: process.execPath, args: [FIXTURE_CHILD, 'exit-code', '7'], cwd: __dirname, timeoutMs: 5_000 },
        { onExit: ({ code }) => resolve({ code }) },
      );
    });
    expect(result.code).toBe(7);
  });

  test('timeout ladder: SIGTERM first, escalates to SIGKILL after the grace period, for a child that ignores SIGTERM', async () => {
    const { run } = await import('./runner');
    const start = Date.now();
    const result = await new Promise<{ code: number | null; signal: NodeJS.Signals | null; timedOut: boolean }>(
      (resolve) => {
        run(
          { command: process.execPath, args: [FIXTURE_CHILD, 'hang'], cwd: __dirname, timeoutMs: 150, killGraceMs: 150 },
          { onExit: resolve },
        );
      },
    );
    const elapsed = Date.now() - start;

    expect(result.timedOut).toBe(true);
    expect(result.signal).toBe('SIGKILL');
    // Should resolve close to timeoutMs + killGraceMs, not hang indefinitely.
    expect(elapsed).toBeLessThan(3_000);
  });

  test('manual cancel() on a responsive child sends SIGTERM and does not need to escalate', async () => {
    // The 'clean-term' fixture catches SIGTERM and calls process.exit(0) itself
    // — Node reports that as code:0, signal:null (an explicit exit, not a
    // signal-kill), which is exactly how a well-behaved child (e.g. Playwright's
    // browser.close() in a finally block) is expected to shut down on SIGTERM.
    // cancel() is deliberately only called once the fixture's own 'ready' line
    // proves its SIGTERM handler is registered — a fixed delay would otherwise
    // occasionally race the child's own process startup under load and send
    // SIGTERM before the handler exists, which is a fixture-timing artifact,
    // not something this test is meant to exercise.
    const { run } = await import('./runner');
    let start = 0;
    const result = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
      const handle = run(
        { command: process.execPath, args: [FIXTURE_CHILD, 'clean-term'], cwd: __dirname, timeoutMs: 30_000, killGraceMs: 5_000 },
        {
          onStdoutLine: (line) => {
            if (line === 'ready') {
              start = Date.now();
              handle.cancel();
            }
          },
          onExit: resolve,
        },
      );
    });
    const elapsed = Date.now() - start;
    expect(result.code).toBe(0);
    expect(result.signal).toBeNull();
    expect(elapsed).toBeLessThan(1_000); // well under the 5s kill grace period — SIGKILL was never needed
  });

  test('manual cancel() on a child that ignores SIGTERM escalates to SIGKILL after the grace period', async () => {
    const { run } = await import('./runner');
    const result = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
      const handle = run(
        { command: process.execPath, args: [FIXTURE_CHILD, 'hang'], cwd: __dirname, timeoutMs: 30_000, killGraceMs: 150 },
        { onExit: resolve },
      );
      setTimeout(() => handle.cancel(), 30);
    });
    expect(result.signal).toBe('SIGKILL');
  });

  test('returns a real pid on the handle', async () => {
    const { run } = await import('./runner');
    const handle = run(
      { command: process.execPath, args: [FIXTURE_CHILD, 'exit-code', '0'], cwd: __dirname, timeoutMs: 5_000 },
      {},
    );
    expect(typeof handle.pid).toBe('number');
    expect(handle.pid).toBeGreaterThan(0);
  });
});

describe('runner — buildScrapeSpec / buildGenerateSpec argv (design §7)', () => {
  test('buildScrapeSpec spawns node scrape.js <url> with cwd=scraper/ and LG_EVENTS=1', async () => {
    const { buildScrapeSpec } = await import('./runner');
    const spec = buildScrapeSpec(
      { url: 'https://es.aliexpress.com/item/1005007502111078.html', itemId: '1005007502111078', normalizedUrl: 'x' },
      { repoRoot: REPO_ROOT, timeoutMs: 180_000 },
    );
    expect(spec.command).toBe(process.execPath);
    expect(spec.args).toEqual(['scrape.js', 'https://es.aliexpress.com/item/1005007502111078.html']);
    expect(spec.cwd).toBe(path.join(REPO_ROOT, 'scraper'));
    expect(spec.env?.LG_EVENTS).toBe('1');
    expect(spec.timeoutMs).toBe(180_000);
  });

  test('buildGenerateSpec spawns with cwd=REPO_ROOT and absolute --content/--images, plus --force when requested', async () => {
    const { buildGenerateSpec } = await import('./runner');
    const spec = buildGenerateSpec(
      { slug: 'my-product', contentPath: '/abs/content.json', imagesDir: '/abs/images', force: true },
      { repoRoot: REPO_ROOT, timeoutMs: 60_000 },
    );
    expect(spec.command).toBe(process.execPath);
    expect(spec.args).toEqual([
      'scripts/generate-landing.mjs',
      '--slug',
      'my-product',
      '--content',
      '/abs/content.json',
      '--images',
      '/abs/images',
      '--force',
    ]);
    expect(spec.cwd).toBe(REPO_ROOT);
    expect(spec.env?.LG_EVENTS).toBe('1');
  });

  test('buildGenerateSpec omits --images and --force when not requested', async () => {
    const { buildGenerateSpec } = await import('./runner');
    const spec = buildGenerateSpec(
      { slug: 'my-product', contentPath: '/abs/content.json', imagesDir: null, force: false },
      { repoRoot: REPO_ROOT, timeoutMs: 60_000 },
    );
    expect(spec.args).toEqual(['scripts/generate-landing.mjs', '--slug', 'my-product', '--content', '/abs/content.json']);
  });

  // Positive-case coverage for design D2/D5 (task 3.4), addendum flagged in
  // apply-progress Batch 3/7: only the null/absent productId case had
  // existing coverage before this task.
  test('buildScrapeSpec sets env.LG_PRODUCT_ID to params.productId when provided (design D2 — env transport, not argv)', async () => {
    const { buildScrapeSpec } = await import('./runner');
    const spec = buildScrapeSpec(
      {
        url: 'https://es.aliexpress.com/item/1005007502111078.html',
        itemId: '1005007502111078',
        normalizedUrl: 'x',
        productId: 'prd_abcdef-12345678',
      },
      { repoRoot: REPO_ROOT, timeoutMs: 180_000 },
    );
    // argv stays byte-identical to the existing pinned case above — the id
    // rides ONLY on env, never on argv.
    expect(spec.args).toEqual(['scrape.js', 'https://es.aliexpress.com/item/1005007502111078.html']);
    expect(spec.env?.LG_PRODUCT_ID).toBe('prd_abcdef-12345678');
  });

  test('buildScrapeSpec sets env.LG_PRODUCT_ID to the empty string when params.productId is absent (never "undefined")', async () => {
    const { buildScrapeSpec } = await import('./runner');
    const spec = buildScrapeSpec(
      { url: 'https://es.aliexpress.com/item/1005007502111078.html', itemId: '1', normalizedUrl: 'x' },
      { repoRoot: REPO_ROOT, timeoutMs: 180_000 },
    );
    expect(spec.env?.LG_PRODUCT_ID).toBe('');
  });

  test('buildGenerateSpec appends --product-id <id> only when params.productId is present (design D5/5.1)', async () => {
    const { buildGenerateSpec } = await import('./runner');
    const spec = buildGenerateSpec(
      { slug: 'my-product', contentPath: '/abs/content.json', imagesDir: null, force: false, productId: 'prd_abcdef-12345678' },
      { repoRoot: REPO_ROOT, timeoutMs: 60_000 },
    );
    expect(spec.args).toEqual([
      'scripts/generate-landing.mjs',
      '--slug',
      'my-product',
      '--content',
      '/abs/content.json',
      '--product-id',
      'prd_abcdef-12345678',
    ]);
  });
});

describe('runner — buildContentSpec argv (content-agent change, design §4)', () => {
  test('exact argv shape: --product/--attempts-dir/--staged/--model, cwd=repoRoot, no --instructions when null', async () => {
    const { buildContentSpec } = await import('./runner');
    const spec = buildContentSpec(
      { scrapeJobId: 'zz-scrape', scrapeProductPath: '/abs/product.json', instructionsPath: null, model: 'gemini-2.5-flash' },
      { repoRoot: REPO_ROOT, timeoutMs: 420_000, jobId: 'zz-content-job' },
    );
    expect(spec.command).toBe(process.execPath);
    expect(spec.args).toEqual([
      'scripts/generate-content.mjs',
      '--product',
      '/abs/product.json',
      '--attempts-dir',
      path.join(REPO_ROOT, 'admin', '.jobs', 'zz-content-job', 'content'),
      '--staged',
      path.join(REPO_ROOT, 'admin', '.staged', 'content.json'),
      '--model',
      'gemini-2.5-flash',
    ]);
    expect(spec.cwd).toBe(REPO_ROOT);
    expect(spec.timeoutMs).toBe(420_000);
  });

  test('appends --instructions <path> only when instructionsPath is set', async () => {
    const { buildContentSpec } = await import('./runner');
    const spec = buildContentSpec(
      { scrapeJobId: 'zz-scrape', scrapeProductPath: '/abs/product.json', instructionsPath: '/abs/instructions.txt', model: 'gemini-2.5-flash' },
      { repoRoot: REPO_ROOT, timeoutMs: 420_000, jobId: 'zz-content-job' },
    );
    expect(spec.args.slice(-2)).toEqual(['--instructions', '/abs/instructions.txt']);
  });

  test('GEMINI_API_KEY rides the env spread (present in spec.env) but is NEVER an argv element (key-transport-hygiene structural check)', async () => {
    const { buildContentSpec } = await import('./runner');
    const originalKey = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = 'zz-test-secret-should-never-be-in-argv';
    try {
      const spec = buildContentSpec(
        { scrapeJobId: 'zz-scrape', scrapeProductPath: '/abs/product.json', instructionsPath: '/abs/instructions.txt', model: 'gemini-2.5-flash' },
        { repoRoot: REPO_ROOT, timeoutMs: 420_000, jobId: 'zz-content-job' },
      );
      expect(spec.env?.GEMINI_API_KEY).toBe('zz-test-secret-should-never-be-in-argv');
      expect(spec.args.join(' ')).not.toContain('zz-test-secret-should-never-be-in-argv');
    } finally {
      if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = originalKey;
    }
  });
});

describe('runner — real end-to-end against generate-landing.mjs (no network, fast; proves the wrapper against a REAL agent script)', () => {
  test('drives generate-landing.mjs to completion with the exact expected stage sequence and byte-correct utf8 stdout', async () => {
    const { run, buildGenerateSpec } = await import('./runner');
    const spec = buildGenerateSpec(
      { slug: RUNNER_SLUG, contentPath: MINIMAL_CONTENT, imagesDir: null, force: false },
      { repoRoot: REPO_ROOT, timeoutMs: 60_000 },
    );

    const stdoutLines: string[] = [];
    const stageStarts: string[] = [];
    let resultEvent: unknown = null;

    const outcome = await new Promise<{ code: number | null }>((resolve) => {
      run(spec, {
        onStdoutLine: (line) => stdoutLines.push(line),
        onStderrLine: (_line, parsed) => {
          if (parsed.kind !== 'event') return;
          if (parsed.event.type === 'stage.start') stageStarts.push(String(parsed.event.stage));
          if (parsed.event.type === 'result') resultEvent = parsed.event;
        },
        onExit: ({ code }) => resolve({ code }),
      });
    });

    expect(outcome.code).toBe(0);
    // `write-manifest` inserted before `todos` (Product Identity + Generation
    // Isolation, design D5, task 5.4 — see apply-progress Batch 5).
    expect(stageStarts).toEqual([
      'args',
      'validate',
      'preflight',
      'copy-template',
      'write-data',
      'patch-theme',
      'write-favicon',
      'write-manifest',
      'todos',
    ]);
    expect(resultEvent).not.toBeNull();
    expect(stdoutLines.join('\n')).toContain(`✓ outputs/${RUNNER_SLUG} created from content/landing-base`);

    // Real file on disk, written by the real child, proving this was not an in-process import.
    const productTs = readFileSync(path.join(RUNNER_OUT_DIR, 'src/data/product.ts'), 'utf8');
    expect(productTs).toContain('as const satisfies Product');
  });
});

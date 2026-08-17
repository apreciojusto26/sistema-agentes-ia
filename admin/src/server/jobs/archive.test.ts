// RED-before-GREEN for archive.ts (spec R11 "Scrape Artifact Archiving";
// design §7 "Post-scrape archiving"). Written before archive.ts exists.
//
// Uses temp src/jobs dirs (mkdtempSync) rather than the real
// scraper/output — archiveScrape accepts optional overrides for exactly
// this reason, so tests never touch (or race with) a real scrape run's
// output directory. Default wiring (no overrides) still points at
// REPO_ROOT/scraper/output -> admin/.jobs/{jobId}/scrape per design.
import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

let srcDir: string;
let jobsDir: string;

beforeEach(() => {
  srcDir = mkdtempSync(path.join(os.tmpdir(), 'lg-archive-src-'));
  jobsDir = mkdtempSync(path.join(os.tmpdir(), 'lg-archive-jobs-'));
});

afterEach(() => {
  rmSync(srcDir, { recursive: true, force: true });
  rmSync(jobsDir, { recursive: true, force: true });
});

function seedScrapeOutput() {
  writeFileSync(path.join(srcDir, 'product.json'), JSON.stringify({ title: 'x' }));
  mkdirSync(path.join(srcDir, 'images'), { recursive: true });
  writeFileSync(path.join(srcDir, 'images', 'img_1.jpg'), 'binary-data-1');
  writeFileSync(path.join(srcDir, 'images', 'img_2.jpg'), 'binary-data-2');
}

describe('archiveScrape', () => {
  test('copies product.json and images/ into .jobs/{jobId}/scrape, and does NOT delete the source', () => {
    seedScrapeOutput();

    return import('./archive').then(({ archiveScrape }) => {
      const result = archiveScrape('job-1', { srcDir, jobsDir });

      const destDir = path.join(jobsDir, 'job-1', 'scrape');
      expect(existsSync(path.join(destDir, 'product.json'))).toBe(true);
      expect(existsSync(path.join(destDir, 'images', 'img_1.jpg'))).toBe(true);
      expect(existsSync(path.join(destDir, 'images', 'img_2.jpg'))).toBe(true);
      expect(readFileSync(path.join(destDir, 'product.json'), 'utf8')).toBe(JSON.stringify({ title: 'x' }));

      // Copy, not move — source must survive (design §7: "does NOT modify scrape.js's fixed output path").
      expect(existsSync(path.join(srcDir, 'product.json'))).toBe(true);
      expect(existsSync(path.join(srcDir, 'images', 'img_1.jpg'))).toBe(true);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.productJson).toBe(true);
        expect(result.files).toBeGreaterThanOrEqual(3); // product.json + 2 images
      }
    });
  });

  test('sequential archives for two different jobIds remain independently readable (no clobbering)', async () => {
    seedScrapeOutput();
    const { archiveScrape } = await import('./archive');

    const r1 = archiveScrape('job-a', { srcDir, jobsDir });
    // Simulate a second scrape overwriting the shared scraper/output/ dir before job-b archives.
    writeFileSync(path.join(srcDir, 'product.json'), JSON.stringify({ title: 'y' }));
    const r2 = archiveScrape('job-b', { srcDir, jobsDir });

    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);

    const contentA = readFileSync(path.join(jobsDir, 'job-a', 'scrape', 'product.json'), 'utf8');
    const contentB = readFileSync(path.join(jobsDir, 'job-b', 'scrape', 'product.json'), 'utf8');
    expect(contentA).toBe(JSON.stringify({ title: 'x' }));
    expect(contentB).toBe(JSON.stringify({ title: 'y' }));
  });

  test('a missing source directory does NOT throw — returns ok:false with an archiveError, never fails the caller', async () => {
    rmSync(srcDir, { recursive: true, force: true }); // src never existed / already gone
    const { archiveScrape } = await import('./archive');
    expect(() => archiveScrape('job-missing-src', { srcDir, jobsDir })).not.toThrow();
    const result = archiveScrape('job-missing-src-2', { srcDir, jobsDir });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeTruthy();
  });

  test('reports productJson:false when product.json is absent but images/ exists', async () => {
    mkdirSync(path.join(srcDir, 'images'), { recursive: true });
    writeFileSync(path.join(srcDir, 'images', 'img_1.jpg'), 'x');
    const { archiveScrape } = await import('./archive');
    const result = archiveScrape('job-no-product', { srcDir, jobsDir });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.productJson).toBe(false);
  });
});

// Formal coverage for design D3 Layer 2 (task 7.2) — the fail-closed
// ownership gate and the non-fatal ghost-image prune, both added on top of
// the byte-identical archiveScrape() behavior pinned by the 4 tests above.
// Those 4 tests are deliberately left untouched: none of them pass
// `expectedProductId`, so none of them can ever reach the fatal branch —
// confirming (by construction, not just by re-running) that this task did
// not alter the pre-existing soft-failure/no-assertion behavior.
describe('archiveScrape — ownership gate (design D3 Layer 2, task 3.2/7.2)', () => {
  function seedProductJson(productId: string | undefined) {
    writeFileSync(
      path.join(srcDir, 'product.json'),
      JSON.stringify(productId === undefined ? { title: 'x' } : { title: 'x', productId }),
    );
  }

  test('ok path: matching expectedProductId succeeds and reports productId + pruned:0 (no manifest, nothing to prune)', async () => {
    seedProductJson('prd_abcdef-12345678');
    const { archiveScrape } = await import('./archive');
    const result = archiveScrape('job-match', { srcDir, jobsDir, expectedProductId: 'prd_abcdef-12345678' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.productId).toBe('prd_abcdef-12345678');
      expect(result.pruned).toBe(0);
    }
  });

  test('ok path: prunes a ghost image not listed in .scrape-run.json, reports pruned:1, keeps the listed one', async () => {
    seedProductJson('prd_abcdef-12345678');
    mkdirSync(path.join(srcDir, 'images'), { recursive: true });
    writeFileSync(path.join(srcDir, 'images', 'img_0.jpg'), 'real');
    writeFileSync(path.join(srcDir, 'images', 'img_9.jpg'), 'ghost-from-a-prior-run');
    writeFileSync(
      path.join(srcDir, '.scrape-run.json'),
      JSON.stringify({ schema: 1, productId: 'prd_abcdef-12345678', images: ['img_0.jpg'] }),
    );

    const { archiveScrape } = await import('./archive');
    const result = archiveScrape('job-prune', { srcDir, jobsDir, expectedProductId: 'prd_abcdef-12345678' });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.pruned).toBe(1);
    const destImages = path.join(jobsDir, 'job-prune', 'scrape', 'images');
    expect(existsSync(path.join(destImages, 'img_0.jpg'))).toBe(true);
    expect(existsSync(path.join(destImages, 'img_9.jpg'))).toBe(false);
  });

  test('FAIL-CLOSED: mismatched productId returns {ok:false, fatal:true, code:"archive-ownership-mismatch"}, never throws, and removes the partially-copied destDir', async () => {
    seedProductJson('prd_wrong00-11111111');
    const { archiveScrape } = await import('./archive');

    expect(() => archiveScrape('job-mismatch', { srcDir, jobsDir, expectedProductId: 'prd_expect0-22222222' })).not.toThrow();
    const result = archiveScrape('job-mismatch-2', { srcDir, jobsDir, expectedProductId: 'prd_expect0-22222222' });

    expect(result.ok).toBe(false);
    if (!result.ok && result.fatal) {
      expect(result.code).toBe('archive-ownership-mismatch');
      expect(result.expected).toBe('prd_expect0-22222222');
      expect(result.found).toBe('prd_wrong00-11111111');
      expect(typeof result.error).toBe('string');
    } else {
      throw new Error('expected a fatal ownership-mismatch result');
    }
    // destDir removed — no downstream stage can accidentally read it.
    expect(existsSync(path.join(jobsDir, 'job-mismatch-2', 'scrape'))).toBe(false);
  });

  test('legacy tolerance: expectedProductId absent -> ok:true even though product.json carries an id (no assertion possible)', async () => {
    seedProductJson('prd_abcdef-12345678');
    const { archiveScrape } = await import('./archive');
    const result = archiveScrape('job-no-expectation', { srcDir, jobsDir });
    expect(result.ok).toBe(true);
  });

  test('legacy tolerance: archived product.json has NO productId (pre-change scrape) -> ok:true, not fatal, even with an expectedProductId set', async () => {
    seedProductJson(undefined);
    const { archiveScrape } = await import('./archive');
    const result = archiveScrape('job-legacy-product', { srcDir, jobsDir, expectedProductId: 'prd_expect0-22222222' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.productId).toBeNull();
  });
});

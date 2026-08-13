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

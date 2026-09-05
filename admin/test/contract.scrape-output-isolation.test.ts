// ARTIFACTS BELONG TO THE RUN THAT WROTE THEM, OR THEY ARE NOT ARCHIVED.
//
// `scraper/output/` is a SHARED directory: every scrape overwrites the same two
// files, and it writes them in its FINAL stage. So a run that died earlier — a
// 403, an anti-bot interstitial, a selector timeout — left the PREVIOUS
// product's `product.json` sitting there describing a different product, with
// nothing in the file saying it was stale.
//
// Found for real: the first live smoke against Leroy Merlin died at
// `waitForSelector('h1')` while `scraper/output/` still held a September
// AliExpress run — product.json for "Pantalla de Monitor con temporizador Vlog"
// and eight of its images. Nothing was contaminated, because the pipeline
// archives only on exit code 0. That is a real protection, and it was the ONLY
// one: it says "the process finished", not "these files are this run's".
import { describe, test, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { archiveScrape } from '../src/server/jobs/archive';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

const PRODUCT_A = 'prd_aaaaaaaa-11111111';
const PRODUCT_B = 'prd_bbbbbbbb-22222222';

/** A throwaway scraper output dir plus a throwaway jobs dir. */
function bed() {
  const root = mkdtempSync(path.join(tmpdir(), 'scrape-iso-'));
  const srcDir = path.join(root, 'output');
  const jobsDir = path.join(root, 'jobs');
  mkdirSync(path.join(srcDir, 'images'), { recursive: true });
  mkdirSync(jobsDir, { recursive: true });
  return { root, srcDir, jobsDir, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

const writeProduct = (dir: string, productId: string | null, title = 'Producto') =>
  writeFileSync(
    path.join(dir, 'product.json'),
    JSON.stringify(productId === null ? { title } : { productId, title }),
  );

describe('a stale product cannot be archived as a new one', () => {
  test('an id that disagrees with the run fails closed and removes the copy', () => {
    const b = bed();
    try {
      writeProduct(b.srcDir, PRODUCT_A);
      const r = archiveScrape('job-1', { srcDir: b.srcDir, jobsDir: b.jobsDir, expectedProductId: PRODUCT_B });
      expect(r.ok).toBe(false);
      expect((r as { code: string }).code).toBe('archive-ownership-mismatch');
      // The partially-copied destination is deleted, so no downstream stage can
      // read a directory that failed its own ownership check.
      expect(existsSync(path.join(b.jobsDir, 'job-1', 'scrape'))).toBe(false);
    } finally {
      b.cleanup();
    }
  });

  test('an archive that carries NO id is refused when the run expected one', () => {
    // This was the hole. The gate read "a missing id on either side is legacy
    // tolerance" — right for a legacy caller that mints none, wrong the moment
    // the registry HAS minted one, because "no id" is exactly what a stale or
    // half-written artifact looks like in a shared directory.
    const b = bed();
    try {
      writeProduct(b.srcDir, null, 'Un producto anterior sin identidad');
      const r = archiveScrape('job-2', { srcDir: b.srcDir, jobsDir: b.jobsDir, expectedProductId: PRODUCT_B });
      expect(r.ok).toBe(false);
      expect((r as { code: string }).code).toBe('archive-ownership-unprovable');
    } finally {
      b.cleanup();
    }
  });

  test('a legacy caller that expects no id is unaffected', () => {
    // The tolerance is narrowed, not removed: it still applies where it was
    // meant to, which is a call site that never minted an identity.
    const b = bed();
    try {
      writeProduct(b.srcDir, null);
      expect(archiveScrape('job-3', { srcDir: b.srcDir, jobsDir: b.jobsDir }).ok).toBe(true);
    } finally {
      b.cleanup();
    }
  });
});

describe('a partial run cannot borrow the previous product.json', () => {
  test('images written but no product.json is refused when an id was expected', () => {
    const b = bed();
    try {
      writeFileSync(path.join(b.srcDir, 'images', 'img_0.jpg'), 'bytes');
      const r = archiveScrape('job-4', { srcDir: b.srcDir, jobsDir: b.jobsDir, expectedProductId: PRODUCT_B });
      expect(r.ok).toBe(false);
      expect((r as { code: string }).code).toBe('archive-ownership-unprovable');
    } finally {
      b.cleanup();
    }
  });

  test('and the message says WHY, not just that something failed', () => {
    const b = bed();
    try {
      const r = archiveScrape('job-5', { srcDir: b.srcDir, jobsDir: b.jobsDir, expectedProductId: PRODUCT_B });
      expect((r as { error: string }).error).toMatch(/cannot be shown to belong to run/);
    } finally {
      b.cleanup();
    }
  });
});

describe('a successful run archives only itself', () => {
  test('a stale predecessor does not survive into the archive', () => {
    // The scraper purges the previous identity before it starts, so by the time
    // a run succeeds the only product.json on disk is its own.
    const b = bed();
    try {
      writeProduct(b.srcDir, PRODUCT_B, 'El producto de esta corrida');
      const r = archiveScrape('job-6', { srcDir: b.srcDir, jobsDir: b.jobsDir, expectedProductId: PRODUCT_B });
      expect(r.ok).toBe(true);
      const archived = JSON.parse(
        readFileSync(path.join(b.jobsDir, 'job-6', 'scrape', 'product.json'), 'utf-8'),
      );
      expect(archived.productId).toBe(PRODUCT_B);
      expect(archived.title).toBe('El producto de esta corrida');
    } finally {
      b.cleanup();
    }
  });
});

describe('the scraper drops the previous run identity before it navigates', () => {
  const src = readFileSync(path.join(REPO_ROOT, 'scraper/scrape.js'), 'utf-8');

  test('it purges the two files it owns, and only those', () => {
    expect(src).toMatch(/function purgePreviousRunIdentity\(\)/);
    const body = /function purgePreviousRunIdentity\(\)[\s\S]*?\n\}/.exec(src)![0];
    expect(body).toContain("'product.json'");
    expect(body).toContain("'.scrape-run.json'");
    // images/ has its own lifecycle in the images stage; nothing else in the
    // tree is assumed to be the scraper's.
    expect(body, 'the purge reaches beyond the files the scraper owns').not.toMatch(/recursive:\s*true/);
  });

  test('and it runs BEFORE the browser launches', () => {
    // A run that dies at navigation must already have dropped the old identity.
    const run = src.indexOf('purgePreviousRunIdentity();\n');
    const launch = src.indexOf("withStage('launch'");
    expect(run).toBeGreaterThan(-1);
    expect(run).toBeLessThan(launch);
  });
});

describe('the live smoke cannot regress to running TypeScript under plain node', () => {
  const smoke = readFileSync(path.join(REPO_ROOT, 'scripts/e2e/admin-live-smoke.mjs'), 'utf-8');

  test('the child is spawned through tsx', () => {
    // live-smoke-run.mjs imports the Admin's orchestrator and registry, which
    // are TypeScript. Plain node dies with ERR_UNKNOWN_FILE_EXTENSION before
    // the first stage — found by checking the harness before spending a model
    // call on it.
    expect(smoke).toMatch(/admin\/node_modules\/\.bin\/tsx/);
    expect(smoke).toMatch(/spawnSync\(TSX, \[runner\]/);
    expect(smoke, 'the child would run under plain node again').not.toMatch(
      /spawnSync\(process\.execPath, \[runner\]/,
    );
  });

  test('and it says so rather than failing obscurely when tsx is missing', () => {
    expect(smoke).toMatch(/tsx is missing/);
  });
});

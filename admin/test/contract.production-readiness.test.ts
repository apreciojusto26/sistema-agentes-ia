// PRODUCTION READINESS — the checks an operator runs before shipping, and the
// harness that exercises the real world by hand.
//
// Both are about the same question asked in two places: is what we produced
// actually correct, and does the system still work against a third party.
import { describe, test, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, mkdtempSync, rmSync, writeFileSync, cpSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FIX = path.join(REPO_ROOT, 'admin/test/fixtures');
const sha = (f: string) => createHash('sha256').update(readFileSync(f)).digest('hex');

/** Generates a landing and returns its directory. */
function generate(slug: string, extra: string[] = []) {
  const out = path.join(REPO_ROOT, 'outputs', slug);
  rmSync(out, { recursive: true, force: true });
  const r = spawnSync(
    process.execPath,
    [
      path.join(REPO_ROOT, 'scripts/generate-landing.mjs'),
      '--slug', slug,
      '--content', path.join(FIX, 'fixed/content.json'),
      '--merchant', path.join(FIX, 'fixed/merchant.json'),
      '--force',
      ...extra,
    ],
    { cwd: REPO_ROOT, encoding: 'utf-8' },
  );
  return { out, stdout: r.stdout ?? '', status: r.status };
}

// ───────────────────────────────────────────────────────────────────────────
// SOCIAL PREVIEW OWNERSHIP
// ───────────────────────────────────────────────────────────────────────────

describe('a landing never shares another product as its own', () => {
  const TEMPLATE_COVER = path.join(REPO_ROOT, 'content/landing-astravibe/public/og-cover.png');

  test('a PNG main image becomes the social preview', () => {
    const { out } = generate('zz-og-png', [
      '--images', path.join(FIX, 'assets/a/images'),
      '--product', path.join(FIX, 'assets/a/product.json'),
    ]);
    try {
      const cover = path.join(out, 'public/og-cover.png');
      expect(existsSync(cover)).toBe(true);
      expect(sha(cover), "the landing still ships AstraVibe's artwork").not.toBe(sha(TEMPLATE_COVER));
      expect(sha(cover)).toBe(sha(path.join(FIX, 'assets/a/images/img_0.png')));
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });

  test('a JPEG main image becomes the preview under its REAL extension', () => {
    // THIS TEST USED TO ASSERT THE OPPOSITE, and the reversal is an improvement
    // rather than a relaxation. The old rule deleted the cover whenever the
    // source was not a PNG, because Base.astro requested a fixed
    // `/og-cover.png` and lived under a protected path.
    //
    // That path is now authorized and fixed: the layout reads the filename from
    // src/data/og.ts, so there is no `.png` to satisfy and no reason to rename a
    // JPEG into a lie about a file other systems read. Absence is still the
    // answer when there is no usable media — it is no longer the answer to a
    // file extension.
    const dir = mkdtempSync(path.join(tmpdir(), 'og-jpg-'));
    mkdirSync(path.join(dir, 'images'), { recursive: true });
    cpSync(path.join(FIX, 'assets/a/images/img_0.png'), path.join(dir, 'images/img_0.jpg'));
    writeFileSync(
      path.join(dir, 'product.json'),
      JSON.stringify({
        identity: { productId: null, name: 'Producto', brand: null },
        media: { images: [{ url: null, localPath: 'images/img_0.jpg', order: 0 }], videos: [] },
      }),
    );
    const { out } = generate('zz-og-jpg', [
      '--images', path.join(dir, 'images'),
      '--product', path.join(dir, 'product.json'),
    ]);
    try {
      expect(existsSync(path.join(out, 'public/og-cover.jpg'))).toBe(true);
      expect(readFileSync(path.join(out, 'src/data/og.ts'), 'utf-8')).toContain("'og-cover.jpg'");
      // The template's own cover never survives, whatever the extension.
      expect(existsSync(path.join(out, 'public/og-cover.png'))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(out, { recursive: true, force: true });
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// THE READINESS COMMAND
// ───────────────────────────────────────────────────────────────────────────

describe('one command answers "is this ready?"', () => {
  const check = (dir: string) =>
    spawnSync(process.execPath, [path.join(REPO_ROOT, 'scripts/check-readiness.mjs'), dir], {
      cwd: REPO_ROOT,
      encoding: 'utf-8',
    });

  test('a good landing passes every check', () => {
    const { out } = generate('zz-ready', [
      '--images', path.join(FIX, 'assets/a/images'),
      '--product', path.join(FIX, 'assets/a/product.json'),
    ]);
    try {
      const r = check(out);
      expect(r.stdout, r.stdout).toMatch(/READY —/);
      expect(r.status).toBe(0);
      for (const name of [
        'Structural Grammar sealed',
        'Fixed template authority',
        'Design Agent absent',
        'Assets real',
        'Theme safe',
        'Favicon valid',
        'Social preview',
        'Commerce authority',
      ]) {
        expect(r.stdout).toContain(name);
      }
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });

  test('it FAILS when a landing would ship the template artwork', () => {
    // The check has to be able to say no, or it is decoration.
    const { out } = generate('zz-ready-bad', [
      '--images', path.join(FIX, 'assets/a/images'),
      '--product', path.join(FIX, 'assets/a/product.json'),
    ]);
    try {
      // Written OVER the file the landing DECLARES — the only way this artwork
      // could actually reach a social card now that the filename is generated
      // beside the image instead of being a fixed `/og-cover.png`.
      const declared = /ogImageFile: string \| null = '([^']+)'/.exec(
        readFileSync(path.join(out, 'src/data/og.ts'), 'utf-8'),
      )![1];
      cpSync(
        path.join(REPO_ROOT, 'content/landing-astravibe/public/og-cover.png'),
        path.join(out, 'public', declared),
      );
      const r = check(out);
      expect(r.status).toBe(1);
      expect(r.stdout).toMatch(/NOT READY/);
      expect(r.stdout).toMatch(/AstraVibe's own artwork/);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });

  test('it FAILS when a design artefact appears', () => {
    const { out } = generate('zz-ready-design');
    try {
      writeFileSync(path.join(out, 'src/data/design.ts'), 'export const design = {};\n');
      const r = check(out);
      expect(r.status).toBe(1);
      expect(r.stdout).toMatch(/Design Agent wrote here/);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });

  test('it never writes to the tree it inspects', () => {
    const { out } = generate('zz-ready-ro');
    try {
      const before = spawnSync('git', ['status', '--porcelain', out], { cwd: REPO_ROOT, encoding: 'utf-8' }).stdout;
      check(out);
      const after = spawnSync('git', ['status', '--porcelain', out], { cwd: REPO_ROOT, encoding: 'utf-8' }).stdout;
      expect(after).toBe(before);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// THE LIVE SMOKE REFUSES TO RUN BY ACCIDENT
// ───────────────────────────────────────────────────────────────────────────

describe('the live smoke is opt-in, twice', () => {
  const smoke = (env: Record<string, string>) =>
    spawnSync(process.execPath, [path.join(REPO_ROOT, 'scripts/e2e/admin-live-smoke.mjs')], {
      cwd: REPO_ROOT,
      encoding: 'utf-8',
      env: { ...process.env, LIVE_SMOKE: '', SOURCE_URL: '', GEMINI_API_KEY: '', ...env },
    });

  test('without LIVE_SMOKE=1 it refuses', () => {
    const r = smoke({});
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/refusing to run without LIVE_SMOKE=1/);
  });

  test('there is no default URL — someone would be scraped by accident', () => {
    const r = smoke({ LIVE_SMOKE: '1' });
    expect(r.stderr).toMatch(/SOURCE_URL is required/);
  });

  test('a non-https URL is refused', () => {
    const r = smoke({ LIVE_SMOKE: '1', SOURCE_URL: 'http://example.invalid/p' });
    expect(r.stderr).toMatch(/must be https/);
  });

  test('it stops before the network when the model key is absent', () => {
    const r = smoke({ LIVE_SMOKE: '1', SOURCE_URL: 'https://example.invalid/p' });
    expect(r.stderr).toMatch(/GEMINI_API_KEY is not set/);
  });

  test('the source hardcodes no URL and prints no secret', () => {
    const src = readFileSync(path.join(REPO_ROOT, 'scripts/e2e/admin-live-smoke.mjs'), 'utf-8');
    // Presence is recorded; a value never is.
    expect(src).toMatch(/Boolean\(process\.env\.GEMINI_API_KEY\)/);
    expect(src).not.toMatch(/process\.env\.GEMINI_API_KEY\s*\}/);
    expect(src).not.toMatch(/https:\/\/(www\.)?(aliexpress|amazon|leroymerlin)/i);
  });

  test('and it never updates a golden from a live run', () => {
    // A real URL producing an unexpected shape is a finding. Moving a seal to
    // match it would make every earlier phase meaningless.
    const src = readFileSync(path.join(REPO_ROOT, 'scripts/e2e/admin-live-smoke.mjs'), 'utf-8');
    expect(src).toMatch(/goldens are never updated from a live run/);
    expect(src).not.toMatch(/writeFileSync\([^)]*GRAMMAR/);
  });
});

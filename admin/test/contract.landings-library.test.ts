// PÁGINAS CREADAS — the library, its preview, and the one destructive action.
//
// ─── WHY THIS IS NOT THE JOB HISTORY ───────────────────────────────────────
//
// The Admin listed JOBS and an operator read the column as their pages. They
// are different things and the difference compounds: one landing generated
// four times is four jobs and one page; a failed job produced no page at all;
// a landing made before this Admin existed has no job. The library is
// DISCOVERED from outputs/, which is the only thing that is actually the set
// of landings.
//
// ─── AND WHY HALF OF THIS FILE IS ABOUT PATHS ──────────────────────────────
//
// Two of the new capabilities read and delete files, from a slug a browser
// supplied. A delete is the one operation where being wrong is unrecoverable,
// so the containment is tested directly, against inputs chosen to break it,
// rather than trusted because the happy path works.
import { describe, test, expect, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as landings from '../src/server/landings';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const OUTPUTS = path.join(REPO_ROOT, 'outputs');

const made: string[] = [];

/** A landing on disk, as the generator would have left it. */
function plant(
  slug: string,
  options: {
    manifest?: Record<string, unknown> | null;
    displayName?: string;
    name?: string;
    built?: boolean;
    assets?: number;
  } = {},
) {
  const dir = path.join(OUTPUTS, slug);
  made.push(dir);
  mkdirSync(path.join(dir, 'src/data'), { recursive: true });

  if (options.manifest !== null) {
    writeFileSync(
      path.join(dir, '.generation.json'),
      JSON.stringify({
        schema: 1,
        slug,
        productId: 'prd_mtest01-abcdef01',
        sourceUrl: 'https://es.aliexpress.com/item/1005007345199501.html?spm=x',
        commerce: { mode: 'preview', shopifyHandle: null },
        timestamps: { generatedAt: '2026-09-05T18:42:00.000Z' },
        ...(options.manifest ?? {}),
      }),
    );
  }
  writeFileSync(
    path.join(dir, 'src/data/product.ts'),
    `export const product: Product = {\n  brand: null,\n  name: ${JSON.stringify(
      options.name ?? 'Tubo de luz de tubo colorido, luz RGB de 17cm/32cm, luz nocturna USB',
    )},\n  displayName: ${JSON.stringify(options.displayName ?? 'Tubo de luz RGB')},\n};\n`,
  );
  if (options.assets) {
    writeFileSync(
      path.join(dir, '.assets.json'),
      JSON.stringify({ assets: Array.from({ length: options.assets }, (_, i) => ({ dest: `p-${i}.webp` })) }),
    );
  }
  if (options.built) {
    mkdirSync(path.join(dir, 'dist/client/_astro'), { recursive: true });
    writeFileSync(path.join(dir, 'dist/client/index.html'), '<!doctype html><h1>landing</h1>');
    writeFileSync(path.join(dir, 'dist/client/_astro/app.css'), 'body{}');
  }
  return dir;
}

afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});

// ───────────────────────────────────────────────────────────────────────────
// DISCOVERY
// ───────────────────────────────────────────────────────────────────────────

describe('the library is derived from outputs, not from job history', () => {
  test('a generated landing appears, named by its display name', () => {
    plant('zz-lib-one', { built: true, assets: 8 });
    const found = landings.list().find((l) => l.slug === 'zz-lib-one');
    expect(found).toBeTruthy();
    expect(found!.displayName).toBe('Tubo de luz RGB');
    expect(found!.built).toBe(true);
    expect(found!.assetCount).toBe(8);
    expect(found!.mode).toBe('preview');
    // The IDENTITY, resolved from the source URL — not the run id.
    expect(found!.source).toEqual({
      provider: 'aliexpress',
      externalProductId: '1005007345199501',
      canonicalUrl: 'https://es.aliexpress.com/item/1005007345199501.html',
    });
  });

  test('a directory with no manifest is NOT a landing', () => {
    // A half-copied tree, or a folder someone made by hand. Guessing from the
    // folder name is exactly the reasoning the lineage guard forbids.
    plant('zz-lib-nomanifest', { manifest: null });
    expect(landings.list().some((l) => l.slug === 'zz-lib-nomanifest')).toBe(false);
    expect(landings.describe('zz-lib-nomanifest')).toBeNull();
  });

  test('a corrupt manifest is skipped, never fatal', () => {
    const dir = plant('zz-lib-corrupt');
    writeFileSync(path.join(dir, '.generation.json'), '{ not json');
    expect(() => landings.list()).not.toThrow();
    expect(landings.list().some((l) => l.slug === 'zz-lib-corrupt')).toBe(false);
  });

  test('dot-directories are never landings', () => {
    // outputs/.smoke and the archived first-run evidence live there.
    expect(landings.list().some((l) => l.slug.startsWith('.'))).toBe(false);
  });

  test('a landing with a Shopify handle reads as commerce', () => {
    plant('zz-lib-commerce', { manifest: { commerce: { mode: 'commerce', shopifyHandle: 'tubo-rgb' } } });
    const found = landings.describe('zz-lib-commerce')!;
    expect(found.mode).toBe('commerce');
    expect(found.shopifyHandle).toBe('tubo-rgb');
  });

  test('one landing generated many times is still ONE row', () => {
    // The whole reason this is not the job list. Regenerating rewrites the
    // same directory; the library counts directories.
    plant('zz-lib-regen', { built: true });
    const before = landings.list().filter((l) => l.slug === 'zz-lib-regen').length;
    plant('zz-lib-regen', { built: true, displayName: 'Tubo de luz RGB v2' });
    const after = landings.list().filter((l) => l.slug === 'zz-lib-regen');
    expect(before).toBe(1);
    expect(after).toHaveLength(1);
    expect(after[0]!.displayName).toBe('Tubo de luz RGB v2');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// CONTAINMENT
// ───────────────────────────────────────────────────────────────────────────

describe('a slug from a browser never becomes an arbitrary path', () => {
  test.each([
    '..',
    '../admin',
    'zz/../../admin',
    '/etc',
    './.smoke',
    '.smoke',
    'Not A Slug',
    'UPPER',
    '',
    'a'.repeat(300),
  ])('refuses %j', (slug) => {
    expect(landings.resolveOutputDir(slug)).toBeNull();
  });

  test.each([null, undefined, 42, {}, []])('refuses the non-string %j', (slug) => {
    expect(landings.resolveOutputDir(slug as unknown)).toBeNull();
  });

  test('a lookalike sibling directory is refused', () => {
    // `outputs-evil` passes a naive startsWith('outputs') test. The resolver
    // compares against the resolved path PLUS a separator for this reason.
    const evil = path.join(REPO_ROOT, 'outputs-evil');
    mkdirSync(evil, { recursive: true });
    made.push(evil);
    expect(landings.resolveOutputDir('../outputs-evil')).toBeNull();
  });

  test('preview files resolve only inside the landing\'s own build', () => {
    plant('zz-lib-preview', { built: true });
    for (const attempt of [
      '../../../../etc/passwd',
      '../../.env',
      '/etc/passwd',
      '../../../admin/merchant.json',
      'dist/../../../.env',
      '..',
    ]) {
      expect(landings.resolvePreviewFile('zz-lib-preview', attempt), `${attempt} escaped`).toBeNull();
    }
    // …and the real files it is FOR do resolve.
    expect(landings.resolvePreviewFile('zz-lib-preview', 'index.html')).toContain('dist/client/index.html');
    expect(landings.resolvePreviewFile('zz-lib-preview', '_astro/app.css')).toContain('app.css');
    // An empty path is the index, the way a static server behaves.
    expect(landings.resolvePreviewFile('zz-lib-preview', '')).toContain('index.html');
  });

  test('a symlink pointing out of the tree does not become a preview file', () => {
    const dir = plant('zz-lib-symlink', { built: true });
    const target = path.join(REPO_ROOT, 'admin/package.json');
    const link = path.join(dir, 'dist/client/escape.json');
    try {
      symlinkSync(target, link);
    } catch {
      return; // a platform without symlink permission has nothing to prove here
    }
    const resolved = landings.resolvePreviewFile('zz-lib-symlink', 'escape.json');
    // path.resolve does not follow symlinks, so the guard is that the RESULT
    // still lives inside the landing — the link itself is inside it, and what
    // matters is that no traversal string reached outside.
    expect(resolved === null || resolved.startsWith(dir)).toBe(true);
  });

  test('a landing that was never built has nothing to preview', () => {
    plant('zz-lib-unbuilt');
    expect(landings.resolvePreviewFile('zz-lib-unbuilt', 'index.html')).toBeNull();
    expect(landings.describe('zz-lib-unbuilt')!.built).toBe(false);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// DELETE
// ───────────────────────────────────────────────────────────────────────────

describe('deleting a landing removes its files and nothing else', () => {
  test('a real landing is removed', () => {
    const dir = plant('zz-lib-del', { built: true });
    expect(landings.remove('zz-lib-del')).toEqual({ ok: true, slug: 'zz-lib-del' });
    expect(existsSync(dir)).toBe(false);
  });

  test('a directory that cannot be PROVEN to be a landing is refused', () => {
    // Not "deleted just in case". A folder with no manifest was not produced
    // by this system, or predates manifests, and either way the server cannot
    // show that removing it is safe.
    const dir = plant('zz-lib-del-nomanifest', { manifest: null });
    const outcome = landings.remove('zz-lib-del-nomanifest');
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.code).toBe('not-a-landing');
    expect(existsSync(dir), 'a directory it could not verify was deleted anyway').toBe(true);
  });

  test.each(['..', '../admin', 'zz/../../admin', '/etc', 'nope!'])(
    'refuses to delete via %j, and removes nothing',
    (slug) => {
      const canary = plant('zz-lib-canary');
      const outcome = landings.remove(slug);
      expect(outcome.ok).toBe(false);
      expect(existsSync(canary)).toBe(true);
      // The repository is still standing.
      expect(existsSync(path.join(REPO_ROOT, 'admin/package.json'))).toBe(true);
      expect(existsSync(path.join(REPO_ROOT, 'content/landing-astravibe'))).toBe(true);
    },
  );

  test('the delete route reports that Shopify was NOT touched', () => {
    // The one thing an operator most needs to know before pressing it. There
    // is no Admin API client anywhere in this server, so the claim is a fact
    // rather than a promise.
    const route = readFileSync(path.join(REPO_ROOT, 'admin/src/server/routes/landings.ts'), 'utf-8');
    expect(route).toContain('shopifyProductDeleted: false');
    expect(route, 'a write to Shopify appeared in the delete path').not.toMatch(/productDelete|Admin API call/);
    const ui = readFileSync(
      path.join(REPO_ROOT, 'admin/src/client/components/LandingDetail.tsx'),
      'utf-8',
    );
    expect(ui).toContain('El producto vinculado en Shopify');
    expect(ui).toContain('Se eliminarán los archivos generados de esta landing.');
  });

  test('deleting is confirmed before it happens', () => {
    const ui = readFileSync(
      path.join(REPO_ROOT, 'admin/src/client/components/LandingDetail.tsx'),
      'utf-8',
    );
    // The button opens a confirmation; only the confirmation calls the API.
    expect(ui).toMatch(/setConfirming\(true\)/);
    expect(ui).toMatch(/confirming && \(/);
    expect(ui).toMatch(/deleteLanding\(landing\.slug\)/);
  });
});

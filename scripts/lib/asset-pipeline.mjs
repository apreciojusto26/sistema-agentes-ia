// Product asset pipeline (Fase 4) — deterministic, no AI.
//
// THE BLOCKAGE THIS REMOVES. The scraper writes `img_0.webp … img_N.webp`.
// The template registers asset KEYS (`gallery-01`, `ugc-01`, `step-01`) whose
// files are `.jpg`. `copyImagesByName()` copies a file only when its bare
// filename already exists in `src/assets/product/`, so not one scraped image
// ever matched and every real product image was dropped. Meanwhile the
// Content Agent already emits `"asset": "img_0.webp"` references, and
// `resolveMedia()` returns an EMPTY placeholder for any key missing from
// `src/data/images.ts`. Net effect: real media on disk, placeholders and
// template stock on the page.
//
// THE FIX, in one sentence: copy the real images under stable safe names and
// REGENERATE `src/data/images.ts` so every key anyone might reference — the
// canonical `product-NN`, the Content Agent's original filenames, and the
// template's own slot keys — resolves to a real product file.
//
// Deliberately NOT an agent. Selection is positional and reproducible: same
// canonical product in, same mapping out, byte for byte.
import { createHash } from 'node:crypto';
import { cpSync, existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

/** Extensions Astro's image pipeline can actually optimise. Anything else is
 * rejected rather than copied into a slot where it would fail at build. */
export const SUPPORTED_EXTENSIONS = ['.webp', '.jpg', '.jpeg', '.png', '.avif', '.gif'];

/** Template slot keys that must be re-pointed at real media when it exists.
 * These are KEYS in the template's own src/data/images.ts, not filenames. */
export const TEMPLATE_SLOT_KEYS = [
  'gallery-01', 'gallery-02', 'gallery-03', 'gallery-04', 'gallery-05',
  'ugc-01', 'ugc-02', 'ugc-03',
  'step-01',
];

function sha256OfFile(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

/** `img_0.webp` → `.webp`, lowercased. */
function extOf(file) {
  return path.extname(file).toLowerCase();
}

/** Stable, safe, collision-free destination name. Never derived from the
 * source filename — position in the canonical order is the only input, which
 * is what makes the mapping independent of whatever the scraper happened to
 * call the file. */
export function stableName(index, ext) {
  return `product-${String(index + 1).padStart(2, '0')}${ext}`;
}

/**
 * Builds the copy plan from a CanonicalProduct's media plus the directory
 * that actually holds the bytes.
 *
 * Every rejection is REPORTED, never silently skipped — an image the operator
 * expected to see missing from the page with no explanation is exactly the
 * silent degradation this pipeline exists to prevent.
 *
 * @returns {{assets: Array, rejected: Array, main: object|null, sourceNames: string[]}}
 */
export function planAssets(media, imagesDir) {
  const rejected = [];
  const assets = [];
  const seenHashes = new Map();

  if (!existsSync(imagesDir) || !statSync(imagesDir).isDirectory()) {
    return { assets: [], rejected: [{ reason: 'images-dir-missing', detail: imagesDir }], main: null, sourceNames: [] };
  }

  const onDisk = new Set(readdirSync(imagesDir));

  // Canonical order is authoritative. A media list that is absent or empty
  // falls back to the directory listing, sorted naturally so the result is
  // still deterministic (img_2 before img_10).
  const entries =
    Array.isArray(media) && media.length > 0
      ? [...media].sort((a, b) => (a?.order ?? 0) - (b?.order ?? 0))
      : [...onDisk].sort(naturalCompare).map((f, i) => ({ localPath: f, order: i }));

  for (const entry of entries) {
    const ref = entry?.localPath ?? entry?.url ?? null;
    if (typeof ref !== 'string' || ref.trim() === '') {
      rejected.push({ reason: 'no-reference', detail: JSON.stringify(entry) });
      continue;
    }

    // Only the basename is used: `localPath` is relative to the scraper's own
    // cwd ("output/images/img_0.webp"), which does not exist here.
    const base = path.basename(ref.split('?')[0]);
    if (base === '' || base === '.' || base === '..' || base.includes(path.sep)) {
      rejected.push({ reason: 'unsafe-name', detail: ref });
      continue;
    }

    const ext = extOf(base);
    if (!SUPPORTED_EXTENSIONS.includes(ext)) {
      rejected.push({ reason: 'unsupported-type', detail: base });
      continue;
    }

    if (!onDisk.has(base)) {
      rejected.push({ reason: 'file-missing', detail: base });
      continue;
    }

    const srcPath = path.join(imagesDir, base);
    const bytes = statSync(srcPath).size;
    if (bytes === 0) {
      rejected.push({ reason: 'empty-file', detail: base });
      continue;
    }

    const hash = sha256OfFile(srcPath);
    if (seenHashes.has(hash)) {
      rejected.push({ reason: 'duplicate', detail: `${base} == ${seenHashes.get(hash)}` });
      continue;
    }
    seenHashes.set(hash, base);

    assets.push({
      src: base,
      dest: stableName(assets.length, ext),
      srcPath,
      bytes,
      sha256: hash,
      order: assets.length,
    });
  }

  return {
    assets,
    rejected,
    main: assets[0] ?? null,
    sourceNames: assets.map((a) => a.src),
  };
}

/** img_2 before img_10 — plain lexicographic sort would not. */
function naturalCompare(a, b) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

/** Copies the planned files into the landing's asset directory. */
export function materializeAssets(plan, destDir) {
  const copied = [];
  for (const asset of plan.assets) {
    cpSync(asset.srcPath, path.join(destDir, asset.dest));
    copied.push({ src: asset.src, dest: asset.dest, bytes: asset.bytes, sha256: asset.sha256 });
  }
  return copied;
}

/**
 * Generates the replacement `src/data/images.ts`.
 *
 * THREE key families all resolve to the same real files, which is what makes
 * the swap total rather than partial:
 *   1. `product-01 … product-NN` — the canonical, position-derived keys.
 *   2. the ORIGINAL source filenames (`img_0.webp`) — the Content Agent
 *      already emits these as `asset` refs, so keeping them as aliases means
 *      the content contract does not change and existing content.json files
 *      keep working untouched.
 *   3. the template's own slot keys (`gallery-01`, `ugc-01`, `step-01`) —
 *      cycled over the real images so no template stock survives anywhere.
 *
 * Cycling (`i % assets.length`) is deliberate: with fewer real images than
 * slots, repeating a real product photo is honest, whereas leaving a stock
 * photo of a different product on the page is contamination.
 */
export function buildImagesModule(plan) {
  const { assets } = plan;
  if (assets.length === 0) {
    throw new Error('buildImagesModule called with zero assets — the caller must fail closed before this point');
  }

  const importLines = assets.map((a, i) => `import product${String(i + 1).padStart(2, '0')} from '@/assets/product/${a.dest}';`);
  const varOf = (i) => `product${String(i + 1).padStart(2, '0')}`;

  const entries = [];
  assets.forEach((a, i) => entries.push(`  '${path.basename(a.dest, path.extname(a.dest))}': ${varOf(i)},`));
  assets.forEach((a, i) => entries.push(`  '${a.src}': ${varOf(i)},`));
  TEMPLATE_SLOT_KEYS.forEach((key, i) => entries.push(`  '${key}': ${varOf(i % assets.length)},`));

  return [
    "import type { ImageMetadata } from 'astro';",
    ...importLines,
    '',
    '/**',
    ' * GENERATED by scripts/lib/asset-pipeline.mjs — do not edit by hand.',
    ' *',
    ` * ${assets.length} real product image(s). Three key families resolve here:`,
    ' *   - `product-NN`  canonical, derived from position, never from the source filename',
    ' *   - the original scraped filenames, because the Content Agent emits them as `asset` refs',
    ' *   - the template slot keys, re-pointed so no template stock image survives',
    ' */',
    'export const images: Record<string, ImageMetadata> = {',
    ...entries,
    '};',
    '',
  ].join('\n');
}

/** Human-readable rejection lines for the generator's TODO block. */
export function describeRejections(rejected) {
  return rejected.map((r) => `image rejected (${r.reason}): ${r.detail}`);
}

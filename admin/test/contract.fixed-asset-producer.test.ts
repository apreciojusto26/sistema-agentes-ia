// WHAT FILLS THE FIXED MEDIA SLOTS, AND WHERE IT CAME FROM.
//
// Until F4 the Admin could PASS an asset output but never PRODUCE one, so the
// only way to fill these slots was a hand-written fixture — and the last
// hand-written one invented `video-02` and `video-03`, keys that existed in no
// images module and rendered blank frames behind a green build.
//
// TWO FIXTURES, DIFFERENT CARDINALITIES:
//   A — four distinct images, four distinct sizes
//   B — three files, two of them byte-identical, so dedupe is under test
import { describe, test, expect } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  produceFixedAssets,
  collectUnresolvedRefs,
  readImageSize,
  fileDigest,
  FixedAssetError,
} from '../../scripts/lib/fixed-asset-producer.mjs';
import { collectAssetOutputIssues } from '../../scripts/lib/fixed-asset-output.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const F = path.join(REPO_ROOT, 'admin/test/fixtures/assets');

const canonical = (which: 'a' | 'b') => JSON.parse(readFileSync(path.join(F, which, 'product.json'), 'utf-8'));
const imagesDir = (which: 'a' | 'b') => path.join(F, which, 'images');

/** Produces into a throwaway directory so file existence is really checked. */
function produce(which: 'a' | 'b', stepCount = 3) {
  const destDir = path.join(mkdtempSync(path.join(tmpdir(), 'fixed-assets-')), 'product');
  const result = produceFixedAssets({
    canonicalProduct: canonical(which),
    imagesDir: imagesDir(which),
    destDir,
    stepCount,
  });
  return { ...result, destDir, cleanup: () => rmSync(path.dirname(destDir), { recursive: true, force: true }) };
}

describe('the producer selects real media, deterministically', () => {
  test('fixture A yields one asset per distinct image', () => {
    const r = produce('a');
    try {
      expect(r.manifest.assets).toHaveLength(4);
      expect(r.assetOutput.gallery).toHaveLength(4);
      expect(collectAssetOutputIssues(r.assetOutput)).toEqual([]);
    } finally {
      r.cleanup();
    }
  });

  test('the same input twice gives byte-identical output', () => {
    // Not a nicety. The structural fingerprint of a generated landing depends
    // on this, so a producer that sampled or shuffled would make the seal
    // untestable.
    const a = produce('a');
    const b = produce('a');
    try {
      expect(JSON.stringify(a.assetOutput)).toBe(JSON.stringify(b.assetOutput));
    } finally {
      a.cleanup();
      b.cleanup();
    }
  });

  test('every produced ref resolves to a file that exists', () => {
    const r = produce('a');
    try {
      const keys = new Set(r.manifest.assets.map((asset: { key: string }) => asset.key));
      expect(collectUnresolvedRefs(r.assetOutput, keys)).toEqual([]);
      for (const asset of r.manifest.assets as { file: string }[]) {
        expect(existsSync(path.join(r.destDir, asset.file)), `${asset.file} was never copied`).toBe(true);
      }
    } finally {
      r.cleanup();
    }
  });

  test('real dimensions are recorded, never invented', () => {
    const r = produce('a');
    try {
      // The fixtures are 800x1000, 1200x900, 640x640 and 900x1600 — read out
      // of the PNG header rather than guessed, and `null` would be the honest
      // answer for a format the reader does not parse.
      expect(r.manifest.assets.map((a: { width: number; height: number }) => [a.width, a.height])).toEqual([
        [800, 1000],
        [1200, 900],
        [640, 640],
        [900, 1600],
      ]);
    } finally {
      r.cleanup();
    }
  });

  test('a product with no usable media fails rather than shipping stock photos', () => {
    expect(() =>
      produceFixedAssets({ canonicalProduct: canonical('a'), imagesDir: path.join(F, 'does-not-exist') }),
    ).toThrow(FixedAssetError);
  });
});

describe('duplicates collapse into one asset', () => {
  test('fixture B has three files and two unique assets', () => {
    const r = produce('b');
    try {
      // img_2.png is byte-identical to img_0.png. Identical bytes are one
      // photograph, however many times the provider listed it.
      expect(r.manifest.assets).toHaveLength(2);
      expect(r.manifest.rejected.some((x: { reason: string }) => x.reason === 'duplicate')).toBe(true);
      const digests = (r.manifest.assets as { file: string }[]).map((a) =>
        fileDigest(path.join(r.destDir, a.file)),
      );
      expect(new Set(digests).size).toBe(2);
    } finally {
      r.cleanup();
    }
  });

  test('the rejection is reported, never silently swallowed', () => {
    const r = produce('b');
    try {
      expect(r.rejected.join(' ')).toMatch(/duplicate/);
    } finally {
      r.cleanup();
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// THE PRODUCT MEDIA STRIP — NOT UGC
// ───────────────────────────────────────────────────────────────────────────

describe('the product media strip is product media, and says nothing else', () => {
  test('one unique asset means one strip item — never padded to a count', () => {
    // The banned behaviour, made mechanical. buildImagesModule used to alias
    // every template slot with `i % assets.length`, so a product with one photo
    // showed it in nine places. Cardinality follows the media, not a fixture's
    // historical shape.
    const single = {
      ...canonical('b'),
      media: { images: [{ url: null, localPath: 'images/img_1.png', order: 0 }], videos: [] },
    };
    const destDir = path.join(mkdtempSync(path.join(tmpdir(), 'fixed-assets-')), 'product');
    try {
      const r = produceFixedAssets({ canonicalProduct: single, imagesDir: imagesDir('b'), destDir, stepCount: 3 });
      expect(r.assetOutput.productMediaStrip).toHaveLength(1);
      expect(r.assetOutput.gallery).toHaveLength(1);
      expect(collectAssetOutputIssues(r.assetOutput)).toEqual([]);
    } finally {
      rmSync(path.dirname(destDir), { recursive: true, force: true });
    }
  });

  test('two unique assets give at most two strip items, never [a,b,a,b]', () => {
    const r = produce('b');
    try {
      const keys = r.assetOutput.productMediaStrip.map((m: { asset: string }) => m.asset);
      expect(keys).toHaveLength(2);
      expect(new Set(keys).size, 'an asset repeats inside the strip').toBe(keys.length);
    } finally {
      r.cleanup();
    }
  });

  test('listing photography is allowed in the strip', () => {
    const r = produce('a');
    try {
      expect(r.assetOutput.productMediaStrip.length).toBeGreaterThan(0);
      expect(r.manifest.assets.every((a: { provenance: string }) => a.provenance === 'product/promotional')).toBe(true);
    } finally {
      r.cleanup();
    }
  });

  test('and it is never classified or described as customer content', () => {
    // THE FACTUAL RULE, unchanged and still binding: supplier media may appear
    // in the band, and may never be PRESENTED as something a buyer sent. The
    // region itself renders no heading, author, rating or attribution — this
    // asserts the data does not smuggle the claim in through alt text.
    const r = produce('a');
    try {
      expect(r.manifest.assets.some((a: { provenance: string }) => a.provenance === 'ugc')).toBe(false);
      const alts = [
        ...r.assetOutput.productMediaStrip,
        ...r.assetOutput.gallery,
        ...Object.values(r.assetOutput.stepMedia),
      ].map((m) => (m as { alt: string }).alt);
      for (const alt of alts) {
        expect(alt, `"${alt}" implies a customer took the photograph`).not.toMatch(
          /cliente|comprador|customer|buyer|enviad/i,
        );
      }
    } finally {
      r.cleanup();
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// STEP MEDIA
// ───────────────────────────────────────────────────────────────────────────

describe('step media is assigned by position, by the asset layer', () => {
  test('one assignment per step, keyed structurally', () => {
    const r = produce('a', 3);
    try {
      expect(Object.keys(r.assetOutput.stepMedia)).toEqual(['step-0', 'step-1', 'step-2']);
    } finally {
      r.cleanup();
    }
  });

  test('distinct while there is choice — the copy sets the count, not the media', () => {
    // Three steps and four photos: three different photos. Reuse only starts
    // when the narrative asks for more slots than the product has media, which
    // is the copy's cardinality rather than fabricated media.
    const r = produce('a', 3);
    try {
      const used = Object.values(r.assetOutput.stepMedia).map((m) => (m as { asset: string }).asset);
      expect(new Set(used).size).toBe(3);
    } finally {
      r.cleanup();
    }
  });

  test('with fewer assets than steps the last one repeats, deterministically', () => {
    const r = produce('b', 4);
    try {
      const used = Object.values(r.assetOutput.stepMedia).map((m) => (m as { asset: string }).asset);
      expect(used).toEqual(['product-01', 'product-02', 'product-02', 'product-02']);
    } finally {
      r.cleanup();
    }
  });

  test('no steps means no assignments — not an empty-looking one', () => {
    const r = produce('a', 0);
    try {
      expect(r.assetOutput.stepMedia).toEqual({});
    } finally {
      r.cleanup();
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// VIDEO — supported in shape, absent in fact
// ───────────────────────────────────────────────────────────────────────────

describe('video is supported, and no source supplies one yet', () => {
  test('a real product yields no hero clips, because the scraper extracts none', () => {
    const r = produce('a');
    try {
      expect(r.assetOutput.heroExtras).toEqual([]);
    } finally {
      r.cleanup();
    }
  });

  test('the normalizer states that fact rather than leaving it to chance', () => {
    const normalizer = readFileSync(path.join(REPO_ROOT, 'scripts/lib/product-normalizer.mjs'), 'utf-8');
    expect(normalizer).toMatch(/videos: \[\]/);
  });

  test('but a canonical product carrying video produces a video ref', () => {
    // The shape is wired now so a future scraper needs no redesign here, and
    // Grammar V1 already knows video with and without a poster.
    const withVideo = {
      ...canonical('a'),
      media: {
        images: canonical('a').media.images,
        videos: [{ localPath: 'clip-01.mp4', poster: 'clip-01-poster' }],
      },
    };
    const destDir = path.join(mkdtempSync(path.join(tmpdir(), 'fixed-assets-')), 'product');
    try {
      const r = produceFixedAssets({ canonicalProduct: withVideo, imagesDir: imagesDir('a'), destDir, stepCount: 1 });
      expect(r.assetOutput.heroExtras).toEqual([
        { asset: 'clip-01.mp4', alt: 'Tabla de roble macizo, vídeo 1', ratio: '9/16', kind: 'video', poster: 'clip-01-poster' },
      ]);
    } finally {
      rmSync(path.dirname(destDir), { recursive: true, force: true });
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// THE CONTRACT VALIDATES SHAPE, NOT JUST KEYS
// ───────────────────────────────────────────────────────────────────────────

describe('a shape Astro cannot render is refused before the build', () => {
  const base = () => ({
    gallery: [{ id: 'g1', asset: 'product-01', alt: 'Producto', ratio: '4/5' }],
    heroExtras: [],
    productMediaStrip: [{ asset: 'product-01', alt: 'Producto', ratio: '9/16' }],
    stepMedia: { 'step-0': { asset: 'product-01', alt: 'Paso 1', ratio: '4/3' } },
  });

  test('the baseline is valid', () => {
    expect(collectAssetOutputIssues(base())).toEqual([]);
  });

  test.each([
    ['a bad ratio', { ...base(), gallery: [{ id: 'g1', asset: 'a', alt: 'x', ratio: '5/7' }] }, 'asset-media-bad-ratio'],
    ['a missing asset key', { ...base(), heroExtras: [{ alt: 'x', ratio: '1/1' }] }, 'asset-media-missing-key'],
    ['a poster on an image', { ...base(), heroExtras: [{ asset: 'a', alt: 'x', ratio: '1/1', poster: 'p' }] }, 'asset-media-poster-on-image'],
    ['a bad kind', { ...base(), heroExtras: [{ asset: 'a', alt: 'x', ratio: '1/1', kind: 'audio' }] }, 'asset-media-bad-kind'],
    ['a gallery item with no id', { ...base(), gallery: [{ asset: 'a', alt: 'x', ratio: '4/5' }] }, 'asset-gallery-missing-id'],
    ['an empty strip', { ...base(), productMediaStrip: [] }, 'asset-strip-empty'],
    ['a copy-keyed step slot', { ...base(), stepMedia: { 'como-usarlo': { asset: 'a', alt: 'x', ratio: '4/3' } } }, 'asset-step-slot-invalid'],
    ['step media that is not an object', { ...base(), stepMedia: { 'step-0': 'product-01' } }, 'asset-media-not-an-object'],
    ['alt claiming a customer sent it', { ...base(), productMediaStrip: [{ asset: 'a', alt: 'Foto enviada por un cliente', ratio: '9/16' }] }, 'asset-media-false-provenance'],
  ])('%s is rejected', (_label, output, code) => {
    const codes = collectAssetOutputIssues(output).map((i) => i.code);
    expect(codes, `expected ${code}, got ${codes.join(', ') || 'nothing'}`).toContain(code);
  });

  test('a video without a poster stays valid — the grammar already allows it', () => {
    // Not over-validating: video-with-poster and video-without are both sealed
    // shapes, and making the second an error would invent a requirement.
    const output = { ...base(), heroExtras: [{ asset: 'clip', alt: 'Clip', ratio: '9/16', kind: 'video' }] };
    expect(collectAssetOutputIssues(output)).toEqual([]);
  });
});

describe('the header reader is honest about what it cannot read', () => {
  test('an unparseable file yields null rather than a guess', () => {
    expect(readImageSize(path.join(F, 'a', 'product.json'))).toBeNull();
    expect(readImageSize(path.join(F, 'nope.png'))).toBeNull();
  });
});

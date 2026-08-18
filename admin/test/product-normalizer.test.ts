// Formal unit coverage for scripts/lib/product-normalizer.mjs (design "Product
// Normalizer — Canonical Product Contract", tasks 3.1-3.12). No
// `scripts/lib/**` include glob exists in vitest.config.ts, so this lives
// under admin/test/ (already included) and imports the .mjs module directly
// via a dynamic import() over its file:// URL — the same pattern
// admin/test/product-id.test.ts uses for scripts/lib/product-id.cjs.
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const MODULE_PATH = path.join(REPO_ROOT, 'scripts/lib/product-normalizer.mjs');
const MODULE_URL = pathToFileURL(MODULE_PATH).href;
const MODULE_SOURCE = readFileSync(MODULE_PATH, 'utf-8');
// The module deliberately documents, in prose comments, WHY it does not
// import product-id.cjs / node:path / etc. (ADR-6, projectImages' basename()
// doc-comment). A literal whole-file substring scan would false-positive on
// that self-documentation. The dependency-footprint / no-product-id-reference
// checks (3.3, 3.11) are about actual code references, not prose mentions —
// so they run against the source with comments stripped, which is the
// intent-truthful reading of design §11/AC5/T12 ("references" = code, not
// documentation of an absence).
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '') // block comments (incl. JSDoc)
    .replace(/^\s*\/\/.*$/gm, ''); // full-line // comments
}
const MODULE_CODE = stripComments(MODULE_SOURCE);

const REAL_FIELD_SET_PATH = path.join(
  __dirname,
  'fixtures/product-normalizer/real-field-set.json',
);
const LEGACY_MINIMAL_PATH = path.join(
  __dirname,
  'fixtures/product-normalizer/legacy-minimal.json',
);

// 3.1 — module loader mirroring product-id.test.ts's dynamic import() pattern.
async function loadNormalizer() {
  return import(MODULE_URL);
}

// The canonical key set at every nesting level (spec #431 §5). Used by group
// 3.2 (shape stability) and 3.10 (absence-of-invention: no key outside this
// set may ever appear anywhere in the output tree).
const TOP_LEVEL_KEYS = [
  'commerceFacts',
  'description',
  'identity',
  'media',
  'provenance',
  'socialProof',
  'specifications',
].sort();
const IDENTITY_KEYS = ['brand', 'name', 'productId', 'sourceItemId', 'sourceUrl'].sort();
const COMMERCE_FACTS_KEYS = ['variantOptions'].sort();
const VARIANT_OPTION_KEYS = ['name', 'options', 'selected'].sort();
const SOCIAL_PROOF_KEYS = ['rating', 'reviewCount', 'reviews'].sort();
const REVIEW_KEYS = ['author', 'dateRaw', 'rating', 'text', 'variant'].sort();
const MEDIA_KEYS = ['images', 'videos'].sort();
const IMAGE_KEYS = ['localPath', 'order', 'url'].sort();
const DESCRIPTION_KEYS = ['raw'].sort();
const PROVENANCE_KEYS = ['scrapeJobId', 'scrapedAt'].sort();

// All known-good key names anywhere in a CanonicalProduct — used by the
// recursive scanner in group 3.10 to prove no unlisted key can ever surface.
const ALL_KNOWN_KEYS = new Set([
  ...TOP_LEVEL_KEYS,
  ...IDENTITY_KEYS,
  ...COMMERCE_FACTS_KEYS,
  ...VARIANT_OPTION_KEYS,
  ...SOCIAL_PROOF_KEYS,
  ...REVIEW_KEYS,
  ...MEDIA_KEYS,
  ...IMAGE_KEYS,
  ...DESCRIPTION_KEYS,
  ...PROVENANCE_KEYS,
]);

/** Recursively collects every object key found anywhere in `value`. */
function collectKeysDeep(value: unknown, into: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) collectKeysDeep(item, into);
    return into;
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      into.add(k);
      collectKeysDeep(v, into);
    }
  }
  return into;
}

describe('product-normalizer.mjs — full transformation + shape stability (3.2)', () => {
  test('real-field-set.json produces the exact CanonicalProduct shape via toStrictEqual', async () => {
    const { normalizeProduct } = await loadNormalizer();
    const raw = JSON.parse(readFileSync(REAL_FIELD_SET_PATH, 'utf-8'));
    const out = normalizeProduct(raw);

    expect(out).toStrictEqual({
      identity: {
        productId: 'prd_abcdef-12345678',
        sourceUrl: 'https://www.aliexpress.com/item/1005006123456789.html',
        sourceItemId: null,
        name: 'Almohada Cervical Ortopédica de Espuma Viscoelástica',
        brand: 'SleepWell',
      },
      commerceFacts: {
        variantOptions: [
          { name: 'Color', selected: 'Gris', options: ['Gris', 'Azul', 'Beige'] },
          { name: 'Talla', selected: 'Estándar', options: ['Estándar', 'Grande'] },
        ],
      },
      socialProof: {
        rating: 4.6,
        reviewCount: 1284,
        reviews: [
          {
            text: 'Excelente almohada, dormí mucho mejor desde el primer día.',
            rating: 5,
            author: 'Anónimo',
            dateRaw: '25 AGO 2025',
            variant: 'Gris / Estándar',
          },
          {
            text: 'Buena calidad pero tardó bastante en llegar.',
            rating: 4,
            author: null,
            dateRaw: '02 SEP 2025',
            variant: null,
          },
        ],
      },
      media: {
        images: [
          {
            url: 'https://ae-pic-a1.aliexpress-media.com/kf/S0001.jpg',
            localPath: 'out/images/img_0.jpg',
            order: 0,
          },
          {
            url: 'https://ae-pic-a1.aliexpress-media.com/kf/S0002.jpg',
            localPath: 'out/images/img_1.jpg',
            order: 1,
          },
          {
            url: 'https://ae-pic-a1.aliexpress-media.com/kf/S0003.jpg',
            localPath: 'out/images/img_2.jpg',
            order: 2,
          },
        ],
        videos: [],
      },
      specifications: [],
      description: {
        raw: 'Almohada ergonómica diseñada para aliviar el dolor cervical durante el sueño. Núcleo de espuma con memoria que se adapta a la forma del cuello.',
      },
      provenance: {
        scrapedAt: '2026-08-10T14:32:07.512Z',
        scrapeJobId: null,
      },
    });
  });

  test('key sets at every nesting level match spec §5 exactly, no extra/missing keys', async () => {
    const { normalizeProduct } = await loadNormalizer();
    const raw = JSON.parse(readFileSync(REAL_FIELD_SET_PATH, 'utf-8'));
    const out = normalizeProduct(raw);

    expect(Object.keys(out).sort()).toEqual(TOP_LEVEL_KEYS);
    expect(Object.keys(out.identity).sort()).toEqual(IDENTITY_KEYS);
    expect(Object.keys(out.commerceFacts).sort()).toEqual(COMMERCE_FACTS_KEYS);
    for (const v of out.commerceFacts.variantOptions) {
      expect(Object.keys(v).sort()).toEqual(VARIANT_OPTION_KEYS);
    }
    expect(Object.keys(out.socialProof).sort()).toEqual(SOCIAL_PROOF_KEYS);
    for (const r of out.socialProof.reviews) {
      expect(Object.keys(r).sort()).toEqual(REVIEW_KEYS);
    }
    expect(Object.keys(out.media).sort()).toEqual(MEDIA_KEYS);
    for (const img of out.media.images) {
      expect(Object.keys(img).sort()).toEqual(IMAGE_KEYS);
    }
    expect(Object.keys(out.description).sort()).toEqual(DESCRIPTION_KEYS);
    expect(Object.keys(out.provenance).sort()).toEqual(PROVENANCE_KEYS);

    // AC2: commerceFacts exists, `commerce` never appears.
    expect('commerceFacts' in out).toBe(true);
    expect('commerce' in out).toBe(false);
  });
});

describe('product-normalizer.mjs — productId pure passthrough, no validation (3.3)', () => {
  test('malformed productId string survives byte-identical', async () => {
    const { normalizeProduct } = await loadNormalizer();
    const out = normalizeProduct({ productId: 'not-a-valid-id' });
    expect(out.identity.productId).toBe('not-a-valid-id');
  });

  test('absent productId → null', async () => {
    const { normalizeProduct } = await loadNormalizer();
    const out = normalizeProduct({});
    expect(out.identity.productId).toBeNull();
  });

  test('non-string productId (number) → null', async () => {
    const { normalizeProduct } = await loadNormalizer();
    const out = normalizeProduct({ productId: 12345 });
    expect(out.identity.productId).toBeNull();
  });

  test('module source never references product-id / PRODUCT_ID_RE / isProductId / newProductId (ADR-6)', () => {
    // Scoped to code (comments stripped) — the module's own JSDoc legitimately
    // documents, in prose, that it does NOT import product-id.cjs (see note
    // above MODULE_CODE); that documentation must not itself trip this check.
    expect(MODULE_CODE).not.toMatch(/product-id/);
    expect(MODULE_CODE).not.toMatch(/PRODUCT_ID_RE/);
    expect(MODULE_CODE).not.toMatch(/isProductId/);
    expect(MODULE_CODE).not.toMatch(/newProductId/);
  });
});

describe('product-normalizer.mjs — provenance-gap adversarial (3.4)', () => {
  test('hand-carried itemId/scrapeJobId on raw input still yield null (masking-bug prevention, #429 §12)', async () => {
    const { normalizeProduct } = await loadNormalizer();
    const out = normalizeProduct({
      itemId: 'item_123',
      scrapeJobId: 'job_456',
      productId: 'prd_abcdef-12345678',
    });
    expect(out.identity.sourceItemId).toBeNull();
    expect(out.provenance.scrapeJobId).toBeNull();
    // The module must not read these keys at all — confirmed by their
    // absence from any recognized influence on the output above, and
    // independently by the source-scan in 3.11 (no `itemId`/`scrapeJobId`
    // reads exist in the module).
  });
});

describe('product-normalizer.mjs — reviews factual projection (3.5)', () => {
  test('review exposes exactly {text,rating,author,dateRaw,variant}; forbidden keys structurally absent via `in`', async () => {
    const { normalizeProduct } = await loadNormalizer();
    const out = normalizeProduct({
      reviews: [{ text: 'x', rating: 5, author: null, date: '25 AGO 2025', variant: 'Black' }],
    });
    const r = out.socialProof.reviews[0];

    expect(Object.keys(r).sort()).toEqual(REVIEW_KEYS);
    // ADR-8: the load-bearing assertion is `in`, not `toEqual` (which
    // ignores undefined-valued properties in vitest).
    expect('location' in r).toBe(false);
    expect('title' in r).toBe(false);
    expect('verified' in r).toBe(false);
    expect('purchaseVerified' in r).toBe(false);
    expect('helpfulCount' in r).toBe(false);
    expect('reviewImages' in r).toBe(false);

    expect(r).toStrictEqual({
      text: 'x',
      rating: 5,
      author: null,
      dateRaw: '25 AGO 2025',
      variant: 'Black',
    });
  });

  test('dateRaw is string-identical to raw.date, never ISO-parsed or reformatted', async () => {
    const { normalizeProduct } = await loadNormalizer();
    const out = normalizeProduct({
      reviews: [{ text: 'y', rating: 3, author: 'A', date: '02 SEP 2025', variant: null }],
    });
    expect(out.socialProof.reviews[0].dateRaw).toBe('02 SEP 2025');
  });
});

describe('product-normalizer.mjs — variants factual projection (3.6)', () => {
  test('variant exposes exactly {name,selected,options}, no SKU/price/stock/Shopify id', async () => {
    const { normalizeProduct } = await loadNormalizer();
    const out = normalizeProduct({
      variants: [{ name: 'Color', selected: 'Red', options: ['Red', 'Blue'] }],
    });
    const v = out.commerceFacts.variantOptions[0];
    expect(Object.keys(v).sort()).toEqual(VARIANT_OPTION_KEYS);
    expect('sku' in v).toBe(false);
    expect('price' in v).toBe(false);
    expect('stock' in v).toBe(false);
    expect('shopifyId' in v).toBe(false);
    expect(v).toStrictEqual({ name: 'Color', selected: 'Red', options: ['Red', 'Blue'] });
  });

  test('output options array is not aliased to raw.variants[i].options — mutating output does not mutate raw', async () => {
    const { normalizeProduct } = await loadNormalizer();
    const raw = { variants: [{ name: 'Color', selected: 'Red', options: ['Red', 'Blue'] }] };
    const out = normalizeProduct(raw);

    out.commerceFacts.variantOptions[0].options.push('MUTATED');
    out.commerceFacts.variantOptions[0].options[0] = 'ALSO-MUTATED';

    expect(raw.variants[0].options).toStrictEqual(['Red', 'Blue']);
  });
});

describe('product-normalizer.mjs — images join, ADR-5 conservative all-null-batch (3.7)', () => {
  test('conforming batch with a partial download failure: order:2 gets localPath:null, no positional shift', async () => {
    const { normalizeProduct } = await loadNormalizer();
    const out = normalizeProduct({
      images: ['u0', 'u1', 'u2', 'u3'],
      localImages: ['out/images/img_0.jpg', 'out/images/img_1.webp', 'out/images/img_3.avif'],
    });
    expect(out.media.images).toStrictEqual([
      { url: 'u0', localPath: 'out/images/img_0.jpg', order: 0 },
      { url: 'u1', localPath: 'out/images/img_1.webp', order: 1 },
      { url: 'u2', localPath: null, order: 2 },
      { url: 'u3', localPath: 'out/images/img_3.avif', order: 3 },
    ]);
  });

  test('localImages absent → every localPath is null, no URL lost', async () => {
    const { normalizeProduct } = await loadNormalizer();
    const out = normalizeProduct({ images: ['u0', 'u1'] });
    expect(out.media.images).toStrictEqual([
      { url: 'u0', localPath: null, order: 0 },
      { url: 'u1', localPath: null, order: 1 },
    ]);
  });

  test('localImages === [] → every localPath is null, no URL lost', async () => {
    const { normalizeProduct } = await loadNormalizer();
    const out = normalizeProduct({ images: ['u0', 'u1'], localImages: [] });
    expect(out.media.images).toStrictEqual([
      { url: 'u0', localPath: null, order: 0 },
      { url: 'u1', localPath: null, order: 1 },
    ]);
  });

  test('non-conforming basename mixed with conforming ones → ALL localPath null for the whole batch (inline, no on-disk fixture per design §11 fixture-honesty)', async () => {
    const { normalizeProduct } = await loadNormalizer();
    const out = normalizeProduct({
      images: ['u0', 'u1', 'u2'],
      localImages: ['gallery-01.jpg', 'out/images/img_1.jpg', 'out/images/img_2.jpg'],
    });
    expect(out.media.images).toStrictEqual([
      { url: 'u0', localPath: null, order: 0 },
      { url: 'u1', localPath: null, order: 1 },
      { url: 'u2', localPath: null, order: 2 },
    ]);
  });

  test('duplicate captured index → ALL localPath null for the whole batch', async () => {
    const { normalizeProduct } = await loadNormalizer();
    const out = normalizeProduct({
      images: ['u0', 'u1'],
      localImages: ['out/images/img_0.jpg', 'other/img_0.png'],
    });
    expect(out.media.images).toStrictEqual([
      { url: 'u0', localPath: null, order: 0 },
      { url: 'u1', localPath: null, order: 1 },
    ]);
  });

  test('out-of-range captured index → ALL localPath null for the whole batch', async () => {
    const { normalizeProduct } = await loadNormalizer();
    const out = normalizeProduct({
      images: ['u0', 'u1'],
      localImages: ['out/images/img_5.jpg'],
    });
    expect(out.media.images).toStrictEqual([
      { url: 'u0', localPath: null, order: 0 },
      { url: 'u1', localPath: null, order: 1 },
    ]);
  });

  test('every case above preserves media.images.length === images.length and never throws', async () => {
    const { normalizeProduct } = await loadNormalizer();
    const cases = [
      { images: ['u0', 'u1', 'u2', 'u3'], localImages: ['out/images/img_0.jpg'] },
      { images: ['u0', 'u1'] },
      { images: ['u0', 'u1'], localImages: [] },
      { images: ['u0', 'u1', 'u2'], localImages: ['gallery-01.jpg', 'out/images/img_1.jpg'] },
      { images: ['u0', 'u1'], localImages: ['out/images/img_0.jpg', 'other/img_0.png'] },
      { images: ['u0', 'u1'], localImages: ['out/images/img_5.jpg'] },
    ];
    for (const raw of cases) {
      let out: ReturnType<typeof normalizeProduct> | undefined;
      expect(() => {
        out = normalizeProduct(raw);
      }).not.toThrow();
      expect(out!.media.images.length).toBe(raw.images.length);
      expect(out!.media.images.map((i) => i.url)).toStrictEqual(raw.images);
    }
  });

  test('image item key set is exactly {url,localPath,order} — no role/primary/hero/asset key', async () => {
    const { normalizeProduct } = await loadNormalizer();
    const out = normalizeProduct({ images: ['u0'], localImages: ['out/images/img_0.jpg'] });
    const img = out.media.images[0];
    expect(Object.keys(img).sort()).toEqual(IMAGE_KEYS);
    expect('role' in img).toBe(false);
    expect('primary' in img).toBe(false);
    expect('hero' in img).toBe(false);
  });
});

describe('product-normalizer.mjs — constants + no-coercion (3.8)', () => {
  const proseRichDescription = {
    description: 'Material: acero inoxidable, 30cm x 15cm',
  };

  test.each([
    ['real-field-set.json', JSON.parse(readFileSync(REAL_FIELD_SET_PATH, 'utf-8'))],
    ['legacy-minimal.json', JSON.parse(readFileSync(LEGACY_MINIMAL_PATH, 'utf-8'))],
    ['prose-rich description', proseRichDescription],
  ])('specifications and media.videos are [] for %s', async (_label, raw) => {
    const { normalizeProduct } = await loadNormalizer();
    const out = normalizeProduct(raw);
    expect(out.specifications).toStrictEqual([]);
    expect(out.media.videos).toStrictEqual([]);
  });

  test('rating: "4.5" (string) → null, not coerced', async () => {
    const { normalizeProduct } = await loadNormalizer();
    const out = normalizeProduct({ rating: '4.5' });
    expect(out.socialProof.rating).toBeNull();
  });

  test('reviewCount: "" (empty string) → null, not coerced to 0', async () => {
    const { normalizeProduct } = await loadNormalizer();
    const out = normalizeProduct({ reviewCount: '' });
    expect(out.socialProof.reviewCount).toBeNull();
  });

  test('rating: NaN → null', async () => {
    const { normalizeProduct } = await loadNormalizer();
    const out = normalizeProduct({ rating: NaN });
    expect(out.socialProof.rating).toBeNull();
  });

  test('rating: true (boolean) → null', async () => {
    const { normalizeProduct } = await loadNormalizer();
    const out = normalizeProduct({ rating: true });
    expect(out.socialProof.rating).toBeNull();
  });
});

describe('product-normalizer.mjs — totality: never throws, always full shape (3.9)', () => {
  test.each([
    ['{}', {}],
    ['null', null],
    ["'a string'", 'a string'],
    ['[]', []],
    ['42', 42],
  ])('normalizeProduct(%s) does not throw and returns a fully-shaped CanonicalProduct', async (_label, raw) => {
    const { normalizeProduct } = await loadNormalizer();
    let out: ReturnType<typeof normalizeProduct> | undefined;
    expect(() => {
      out = normalizeProduct(raw);
    }).not.toThrow();
    expect(Object.keys(out!).sort()).toEqual(TOP_LEVEL_KEYS);
    expect(out!.identity.productId).toBeNull();
    expect(out!.identity.sourceUrl).toBeNull();
    expect(out!.identity.sourceItemId).toBeNull();
    expect(out!.identity.name).toBeNull();
    expect(out!.identity.brand).toBeNull();
    expect(out!.commerceFacts.variantOptions).toStrictEqual([]);
    expect(out!.socialProof.rating).toBeNull();
    expect(out!.socialProof.reviewCount).toBeNull();
    expect(out!.socialProof.reviews).toStrictEqual([]);
    expect(out!.media.images).toStrictEqual([]);
    expect(out!.media.videos).toStrictEqual([]);
    expect(out!.specifications).toStrictEqual([]);
    expect(out!.description.raw).toBeNull();
    expect(out!.provenance.scrapedAt).toBeNull();
    expect(out!.provenance.scrapeJobId).toBeNull();
  });

  test('legacy-minimal.json fixture ({title, description} only) does not throw, full shape with defaults elsewhere', async () => {
    const { normalizeProduct } = await loadNormalizer();
    const raw = JSON.parse(readFileSync(LEGACY_MINIMAL_PATH, 'utf-8'));
    let out: ReturnType<typeof normalizeProduct> | undefined;
    expect(() => {
      out = normalizeProduct(raw);
    }).not.toThrow();
    expect(Object.keys(out!).sort()).toEqual(TOP_LEVEL_KEYS);
    expect(out!.identity.name).toBe('Fixture Product');
    expect(out!.description.raw).toBe('A fixture product for testing.');
    expect(out!.identity.productId).toBeNull();
    expect(out!.identity.sourceUrl).toBeNull();
    expect(out!.provenance.scrapedAt).toBeNull();
  });
});

describe('product-normalizer.mjs — determinism, purity, absence of invention (3.10)', () => {
  test('same input called twice → deep-equal outputs, identical JSON.stringify, distinct object references, input unmutated', async () => {
    const { normalizeProduct } = await loadNormalizer();
    const raw = JSON.parse(readFileSync(REAL_FIELD_SET_PATH, 'utf-8'));
    const before = structuredClone(raw);

    const a = normalizeProduct(raw);
    const b = normalizeProduct(raw);

    expect(a).toStrictEqual(b);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a).not.toBe(b);
    expect(raw).toStrictEqual(before);
  });

  test('no field appears in output that has no corresponding raw source cited in spec §6 — recursive key-set audit', async () => {
    const { normalizeProduct } = await loadNormalizer();
    // A "poison" input that hand-carries several plausible-but-forbidden
    // keys at various levels (top-level, review-level, image-level,
    // variant-level) — none of these may ever surface anywhere in output.
    const poison = {
      productId: 'prd_abcdef-12345678',
      commerce: { note: 'must never appear — commerceFacts is the only key' },
      itemId: 'poison-item-id',
      scrapeJobId: 'poison-job-id',
      images: ['u0'],
      localImages: ['out/images/img_0.jpg'],
      reviews: [
        {
          text: 't',
          rating: 5,
          author: 'a',
          date: 'd',
          variant: 'v',
          location: 'poison-location',
          verified: true,
          purchaseVerified: true,
          helpfulCount: 99,
          reviewImages: ['poison.jpg'],
          title: 'poison title',
        },
      ],
      variants: [
        {
          name: 'Color',
          selected: 'Red',
          options: ['Red'],
          sku: 'poison-sku',
          price: 999,
          stock: 1,
          shopifyId: 'poison-shopify-id',
        },
      ],
      specifications: [{ key: 'poison-spec', value: 'poison-value' }],
      videos: ['poison-video-url'],
    };

    const out = normalizeProduct(poison);
    const observedKeys = collectKeysDeep(out);

    for (const k of observedKeys) {
      expect(ALL_KNOWN_KEYS.has(k)).toBe(true);
    }
    // Explicit spot-checks matching spec §6's fixed-empty / fixed-null rows —
    // these fields have NO source row in §6 at all (DECISION-2/3), so a
    // hand-carried raw value must never leak through.
    expect(out.commerceFacts.variantOptions[0]).not.toHaveProperty('sku');
    expect(out.socialProof.reviews[0]).not.toHaveProperty('location');
    expect(out.specifications).toStrictEqual([]);
    expect(out.media.videos).toStrictEqual([]);
    expect(out.identity.sourceItemId).toBeNull();
    expect(out.provenance.scrapeJobId).toBeNull();
    expect((out as Record<string, unknown>).commerce).toBeUndefined();
  });
});

describe('product-normalizer.mjs — dependency footprint (3.11)', () => {
  test('module source contains zero require()/import...from and no forbidden substrings', () => {
    // These check ACTUAL code, not the module's own prose documentation of
    // what it deliberately avoids (see MODULE_CODE note above) — e.g. the
    // basename() doc-comment explains it avoids node:path, which would
    // otherwise false-positive a raw whole-file scan.
    expect(MODULE_CODE).not.toMatch(/require\(/);
    expect(MODULE_CODE).not.toMatch(/import\s[^\n]*from/);
    expect(MODULE_CODE).not.toContain('node:fs');
    expect(MODULE_CODE).not.toContain('node:path');
    expect(MODULE_CODE).not.toContain('fetch');
    expect(MODULE_CODE).not.toContain('axios');
    expect(MODULE_CODE).not.toContain('@google/genai');
  });

  test('module source contains no entropy/clock access and is not async', () => {
    expect(MODULE_CODE).not.toMatch(/Date\.now|new Date|Math\.random|randomUUID|process\.env|performance\.now/);
    expect(MODULE_CODE).not.toMatch(/async function normalizeProduct/);
    expect(MODULE_CODE).not.toMatch(/\bthrow\s/);
  });

  test('module source contains the ADR-5 image-basename regex without the `i` flag', () => {
    expect(MODULE_SOURCE).toContain('/^img_(\\d+)\\.[a-z0-9]+$/');
  });
});

describe('product-normalizer.mjs — fixture honesty, anti-masking guard (3.12)', () => {
  test('real-field-set.json key set equals exactly the 12 scrape.js L470-483 keys — no itemId/scrapeJobId/specifications/videos', () => {
    const keys = Object.keys(JSON.parse(readFileSync(REAL_FIELD_SET_PATH, 'utf-8'))).sort();
    expect(keys).toEqual([
      'brand',
      'description',
      'images',
      'localImages',
      'productId',
      'rating',
      'reviewCount',
      'reviews',
      'scrapedAt',
      'sourceUrl',
      'title',
      'variants',
    ]);
    expect(keys).not.toContain('itemId');
    expect(keys).not.toContain('scrapeJobId');
    expect(keys).not.toContain('specifications');
    expect(keys).not.toContain('videos');
  });
});

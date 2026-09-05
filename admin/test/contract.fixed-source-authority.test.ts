// WHO IS ALLOWED TO SAY WHAT.
//
// FixedProductData names five authorities — the scrape, the Content Agent, the
// asset pipeline, the merchant and the Shopify link — and until F3 that naming
// existed only in a type comment. Nothing enforced it, and the drift was not
// hypothetical: `gallery` reached the page through content.json, which made a
// language model the authority for which photographs a landing shows, and
// `heroExtras`, `ugcStrip` and the free-shipping threshold reached it through
// nothing at all.
//
// These tests are the enforcement. They are written against the assembler
// rather than against generated output on purpose: a boundary that only holds
// for the one caller that exists today is not a boundary.
import { describe, test, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, rmSync, mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assembleFixedProductData,
  collectAssemblyIssues,
  FixedAssemblyError,
  CONTENT_FORBIDDEN_MEDIA_FIELDS,
  CONTENT_FORBIDDEN_COMMERCIAL_FIELDS,
} from '../../scripts/lib/fixed-product-data.mjs';
import { collectAssetOutputIssues } from '../../scripts/lib/fixed-asset-output.mjs';
import { projectFixedContent } from '../../scripts/lib/fixed-content-output.mjs';
import { collectMerchantIssues, normalizeMerchant } from '../../scripts/lib/merchant.mjs';
import { ALLOWED_PRODUCT_FIELDS } from '../../scripts/lib/content-contract.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const MERCHANT_FIXTURE = path.join(REPO_ROOT, 'admin/test/fixtures/merchant/test-merchant.json');

/** The smallest content output the assembler accepts — copy and narrative only. */
const contentOutput = () => ({
  // NO `brand`. It is a product FACT, owned by the scrape, and a content output
  // carrying one is now rejected — see "the Content Agent has no authority over
  // the brand" below.
  name: 'Producto',
  tagline: 'Un titular',
  subtagline: 'Un subtitular',
  cta: { primary: 'Comprar', sticky: 'Comprar', checkout: 'Pagar', pending: 'Un momento', soldOut: 'Agotado' },
  variantGroupLabel: 'Color',
  trustTicker: ['Envío peninsular'],
  steps: [],
  comparison: [],
  faq: [],
});

const assetOutput = () => ({
  gallery: [{ id: 'g1', asset: 'gallery-01', alt: 'Foto', ratio: '4/5' }],
  heroExtras: [],
  // `productMediaStrip` is the Fixed name for what the frozen template still
  // calls `ugcStrip`. The region renders no heading, author or attribution, so
  // it is a product media marquee — see fixed-asset-output.mjs.
  productMediaStrip: [{ asset: 'gallery-01', alt: 'Foto', ratio: '9/16' }],
  stepMedia: {},
});

const PACKS = [
  { id: 'x1', units: 1, freeUnits: 0, label: 'Una unidad', default: true },
  { id: 'x3', units: 2, freeUnits: 1, label: 'Pack 2 + 1 GRATIS' },
];
const merchantConfig = () => ({ ...JSON.parse(readFileSync(MERCHANT_FIXTURE, 'utf-8')), packs: PACKS });
const canonicalProduct = () => ({ identity: { brand: 'Marca', name: 'Producto' }, media: { images: [], videos: [] } });

const sources = (over: Record<string, unknown> = {}) => ({
  canonicalProduct: canonicalProduct(),
  contentOutput: contentOutput(),
  assetOutput: assetOutput(),
  merchantConfig: merchantConfig(),
  shopifyProductLink: null,
  ...over,
});

// ───────────────────────────────────────────────────────────────────────────
// CONTENT MAY NOT EMIT MEDIA
// ───────────────────────────────────────────────────────────────────────────

describe('the Content Agent has no authority over media', () => {
  test.each(CONTENT_FORBIDDEN_MEDIA_FIELDS)('a content output carrying %s is rejected', (field) => {
    const issues = collectAssemblyIssues(sources({ contentOutput: { ...contentOutput(), [field]: [] } }));
    const hit = issues.find((i) => i.code === 'content-writes-media');
    expect(hit, `${field} was accepted from contentOutput`).toBeDefined();
    expect(hit!.fields).toContain(field);
  });

  test('rejected, not silently dropped — the difference is the whole point', () => {
    // A dropped field and a field never sent produce identical output, which
    // leaves the next author to rediscover the boundary from scratch.
    expect(() =>
      assembleFixedProductData(sources({ contentOutput: { ...contentOutput(), gallery: [{ asset: 'x' }] } })),
    ).toThrow(FixedAssemblyError);
  });

  test('media in the assembled document comes from the asset output', () => {
    const fixed = assembleFixedProductData(sources());
    expect(fixed.media.gallery).toEqual(assetOutput().gallery);
    // The legacy template field is fed from the Fixed one, and the mapping is
    // the only place the old name appears.
    expect(fixed.media.ugcStrip).toEqual(assetOutput().productMediaStrip);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// CONTENT MAY NOT EMIT COMMERCIAL POLICY
// ───────────────────────────────────────────────────────────────────────────

describe('the Content Agent has no authority over commercial policy', () => {
  test.each(CONTENT_FORBIDDEN_COMMERCIAL_FIELDS)('a content output carrying %s is rejected', (field) => {
    const issues = collectAssemblyIssues(sources({ contentOutput: { ...contentOutput(), [field]: 1 } }));
    const hit = issues.find((i) => i.code === 'content-writes-commercial');
    expect(hit, `${field} was accepted from contentOutput`).toBeDefined();
    expect(hit!.fields).toContain(field);
  });

  test('and the content contract still refuses them upstream', () => {
    // The Version A seal in contract.commercial-policy.test.ts asserts the same
    // rule by scanning source. This asserts it against the exported list, so a
    // future edit has to defeat both.
    for (const field of ['shipping', 'heroExtras', 'ugcStrip']) {
      expect(ALLOWED_PRODUCT_FIELDS, `${field} is back in the Content Agent's surface`).not.toContain(field);
    }
  });

  test('the threshold comes from merchant config, and reaches the document', () => {
    const fixed = assembleFixedProductData(
      sources({ merchantConfig: { ...merchantConfig(), freeShippingOverCents: 4900 } }),
    );
    expect(fixed.commercial.freeShippingOverCents).toBe(4900);
  });

  test('no merchant means no threshold — null, never a plausible number', () => {
    const fixed = assembleFixedProductData(sources({ merchantConfig: null }));
    expect(fixed.commercial.freeShippingOverCents).toBeNull();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// THE ASSET PIPELINE MAY NOT DECIDE COPY
// ───────────────────────────────────────────────────────────────────────────

describe('the asset pipeline has no authority over copy', () => {
  test.each(['tagline', 'cta', 'trustTicker', 'packs', 'shipping'])('an asset output carrying %s is rejected', (field) => {
    const issues = collectAssetOutputIssues({ ...assetOutput(), [field]: 'anything' });
    expect(issues.some((i) => i.code === 'asset-output-writes-copy')).toBe(true);
  });

  test('an omitted slot is an error, not an empty list', () => {
    // The defect this contract ends: `?? []` made "nobody supplied it" and
    // "the pipeline says none" indistinguishable in the output.
    const { heroExtras: _dropped, ...withoutHeroExtras } = assetOutput();
    const issues = collectAssetOutputIssues(withoutHeroExtras);
    expect(issues.some((i) => i.code === 'asset-field-missing')).toBe(true);
  });

  test('an explicitly empty slot is accepted — it is a real answer', () => {
    expect(collectAssetOutputIssues(assetOutput())).toEqual([]);
  });

  test('an empty gallery is refused — the template stock must never fill it', () => {
    const issues = collectAssetOutputIssues({ ...assetOutput(), gallery: [] });
    expect(issues.some((i) => i.code === 'asset-gallery-empty')).toBe(true);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// THE MERCHANT MAY NOT DECIDE MARKETING COPY
// ───────────────────────────────────────────────────────────────────────────

describe('merchant config has no authority over marketing copy', () => {
  test.each(['tagline', 'subtagline', 'benefits', 'trustTicker', 'gallery'])(
    'a merchant config carrying %s is rejected',
    (field) => {
      const issues = collectMerchantIssues({ ...merchantConfig(), [field]: 'anything' });
      expect(issues.some((i) => i.code === 'merchant-unknown-fields')).toBe(true);
    },
  );

  test('the threshold is NOT rendered onto the merchant object', () => {
    // One number, one generated module. Two copies of a price is how they drift
    // and how a legal page ends up contradicting the cart.
    const normalized = normalizeMerchant({ ...merchantConfig(), freeShippingOverCents: 4900 });
    expect(Object.keys(normalized!)).not.toContain('freeShippingOverCents');
  });

  test('a fractional or negative threshold is refused, never rounded', () => {
    expect(collectMerchantIssues({ ...merchantConfig(), freeShippingOverCents: -1 }).length).toBeGreaterThan(0);
    expect(collectMerchantIssues({ ...merchantConfig(), freeShippingOverCents: 49.5 }).length).toBeGreaterThan(0);
    expect(collectMerchantIssues({ ...merchantConfig(), freeShippingOverCents: 0 })).toEqual([]);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// COMMERCE FAILS CLOSED
// ───────────────────────────────────────────────────────────────────────────

describe('an incomplete Shopify link never degrades to preview', () => {
  const link = { shopId: 'shop_1', storefrontId: 'sf_1', productHandle: 'un-producto', productGid: null };

  test('a complete link assembles', () => {
    expect(assembleFixedProductData(sources({ shopifyProductLink: link })).shopifyProductLink).toEqual(link);
  });

  test('null is preview, and it is stated rather than reached', () => {
    expect(assembleFixedProductData(sources()).shopifyProductLink).toBeNull();
  });

  test.each(['shopId', 'storefrontId', 'productHandle'])('a link missing %s fails closed', (field) => {
    const broken = { ...link, [field]: '' };
    const issues = collectAssemblyIssues(sources({ shopifyProductLink: broken }));
    const hit = issues.find((i) => i.code === 'commerce-link-incomplete');
    expect(hit, `a link with no ${field} was accepted`).toBeDefined();
    expect(hit!.fields).toContain(field);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// END TO END — the authority actually reaches the generated landing
// ───────────────────────────────────────────────────────────────────────────

describe('the generated landing carries the merchant threshold, not a content one', () => {
  const GENERATOR = path.join(REPO_ROOT, 'scripts/generate-landing.mjs');
  const CONTENT = path.join(REPO_ROOT, 'admin/test/fixtures/minimal-content.json');

  const generate = (slug: string, merchant?: string) => {
    const args = [GENERATOR, '--slug', slug, '--content', CONTENT, '--force'];
    if (merchant) args.push('--merchant', merchant);
    execFileSync(process.execPath, args, { cwd: REPO_ROOT, encoding: 'utf-8' });
    return readFileSync(path.join(REPO_ROOT, 'outputs', slug, 'src/data/product.ts'), 'utf-8');
  };

  test('a configured threshold reaches product.ts; an unconfigured one is null', () => {
    const tmp = mkdtempSync(path.join(tmpdir(), 'fixed-authority-'));
    const merchantPath = path.join(tmp, 'merchant.json');
    writeFileSync(merchantPath, JSON.stringify({ ...merchantConfig(), freeShippingOverCents: 4900 }));

    try {
      expect(generate('zz-authority-merchant', merchantPath)).toMatch(/freeOverCents:\s*4900/);
      // Without a merchant nothing has configured a threshold, so the cart draws
      // no progress bar and the page claims nothing.
      expect(generate('zz-authority-preview')).toMatch(/freeOverCents:\s*null/);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
      for (const slug of ['zz-authority-merchant', 'zz-authority-preview']) {
        const dir = path.join(REPO_ROOT, 'outputs', slug);
        if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
      }
    }
  }, 120_000);
});

// ───────────────────────────────────────────────────────────────────────────
// PACKS ARE MERCHANDISING, NOT COPY
// ───────────────────────────────────────────────────────────────────────────

describe('packs come from merchant config and from nowhere else', () => {
  test('a Fixed content output carrying packs is rejected', () => {
    const issues = collectAssemblyIssues(sources({ contentOutput: { ...contentOutput(), packs: PACKS } }));
    const hit = issues.find((i) => i.code === 'content-writes-commercial');
    expect(hit, 'packs was accepted from the Content Agent').toBeDefined();
    expect(hit!.fields).toContain('packs');
  });

  test('merchant packs reach FixedProductData.commercial.packs verbatim', () => {
    expect(assembleFixedProductData(sources()).commercial.packs).toEqual(PACKS);
  });

  test('no merchant means no packs — [] , never an invented bundle', () => {
    // `[]` is not a working landing: FIXED_GRAMMAR seals buy/packs at min 1.
    // It is the honest report of an unconfigured store, and the generator
    // surfaces it as a TODO rather than filling the region.
    expect(assembleFixedProductData(sources({ merchantConfig: null })).commercial.packs).toEqual([]);
  });

  test('DIFFERENT content packs cannot change the assembled packs', () => {
    // The compat case. A Version A content.json is REQUIRED to carry packs, so
    // the generator's projection drops them rather than erroring — and this is
    // what proves the dropped value is genuinely inert rather than merely
    // deprioritised.
    const decoy = [{ id: 'DECOY', units: 99, freeUnits: 99, label: 'should never render', default: true }];
    const viaProjection = projectFixedContent({
      product: { ...contentOutput(), packs: decoy, gallery: [] },
      faq: [],
      testimonials: [],
    });
    expect(viaProjection, 'the projection carried packs through').not.toHaveProperty('packs');

    const fixed = assembleFixedProductData(sources({ contentOutput: viaProjection }));
    expect(fixed.commercial.packs).toEqual(PACKS);
    expect(JSON.stringify(fixed)).not.toContain('DECOY');
  });

  test('the merchant pack shape is validated, not trusted', () => {
    const bad = (packs: unknown) => collectMerchantIssues({ ...merchantConfig(), packs }).length;
    expect(bad([{ id: 'x1', label: 'A', units: 0, freeUnits: 0, default: true }])).toBeGreaterThan(0);
    expect(bad([{ id: 'x1', label: 'A', units: 1, freeUnits: -1, default: true }])).toBeGreaterThan(0);
    // "Exactly one pack MUST have default: true" was stated in the type and
    // enforced nowhere: two defaults makes the selection depend on iteration
    // order, none opens the BuyBox with nothing chosen.
    expect(bad([{ id: 'x1', label: 'A', units: 1, freeUnits: 0 }])).toBeGreaterThan(0);
    expect(bad([])).toBeGreaterThan(0);
  });
});

describe('the Fixed Content Agent is never asked to author packs', () => {
  const agent = readFileSync(path.join(REPO_ROOT, 'scripts/generate-content.mjs'), 'utf-8');

  test('Fixed mode tells the model packs are not its to write', () => {
    // Not merely ignored downstream. The prompt itself removes the task, so no
    // tokens are spent inventing prices that would then be discarded.
    expect(agent).toMatch(/"packs" debe ser SIEMPRE un array vac/);
  });

  test('and the value is overwritten after the loop, like the rating facts', () => {
    // Belt and braces, and the same pattern the projected ratings already use:
    // a model that writes packs anyway does not get them onto the page.
    expect(agent).toMatch(/if \(args\.fixed === true\) parsed\.product\.packs = \[\];/);
  });

  test('the agent still knows nothing about the config layer it defers to', () => {
    // The Version A seal in contract.landing-completeness.test.ts. Fixed mode
    // says "configured elsewhere" without naming or importing that layer.
    expect(agent).not.toMatch(/merchant/i);
  });
});

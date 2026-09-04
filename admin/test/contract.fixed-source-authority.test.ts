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
import { collectMerchantIssues, normalizeMerchant } from '../../scripts/lib/merchant.mjs';
import { ALLOWED_PRODUCT_FIELDS } from '../../scripts/lib/content-contract.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const MERCHANT_FIXTURE = path.join(REPO_ROOT, 'admin/test/fixtures/merchant/test-merchant.json');

/** The smallest content output the assembler accepts — copy and narrative only. */
const contentOutput = () => ({
  brand: 'Marca',
  name: 'Producto',
  tagline: 'Un titular',
  subtagline: 'Un subtitular',
  cta: { primary: 'Comprar', sticky: 'Comprar', checkout: 'Pagar', pending: 'Un momento', soldOut: 'Agotado' },
  variantGroupLabel: 'Color',
  trustTicker: ['Envío peninsular'],
  steps: [],
  comparison: [],
  faq: [],
  packs: [],
});

const assetOutput = () => ({
  gallery: [{ id: 'g1', asset: 'gallery-01', alt: 'Foto', ratio: '4/5' }],
  heroExtras: [],
  ugcStrip: [],
});

const merchantConfig = () => JSON.parse(readFileSync(MERCHANT_FIXTURE, 'utf-8'));
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
    const { heroExtras, ...withoutHeroExtras } = assetOutput();
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

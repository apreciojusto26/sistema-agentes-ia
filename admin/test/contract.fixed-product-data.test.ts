// THE FIXED CONTRACT'S OWN GUARDS.
//
// FixedProductData says what fills AstraVibe. Structural Grammar V1 says how
// AstraVibe is built. The whole value of the split is that neither drifts into
// the other, and drift is quiet: one layout-ish field in a data contract, and
// the Content Agent gains a say over composition that the sealed grammar was
// supposed to have removed.
//
// These assertions are the machine half of that separation.
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const T = 'content/landing-astravibe/src';

const readRaw = (rel: string) => readFileSync(path.join(REPO_ROOT, rel), 'utf-8');
/** Comments stripped — this file documents the fields it forbids. */
const read = (rel: string) =>
  readRaw(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*)/.test(l))
    .join('\n');

const CONTRACT = `${T}/types/fixed-product-data.ts`;

describe('the contract carries content, never design', () => {
  test('it names no component, variant, section or token', () => {
    const src = read(CONTRACT);
    for (const forbidden of [
      /\bvariant:\s*'/, // a component variant, not a product variant
      /\bcomponent\b/i,
      /\bsectionOrder\b/i,
      /\bclassName\b/,
      /\bbreakpoint\b/i,
      /\bdesignSpec\b/i,
      /\bregistry\b/i,
      /\bspacing\b/i,
      /\bfontFamily\b/i,
    ]) {
      expect(src, `the contract leaks a design decision: ${forbidden}`).not.toMatch(forbidden);
    }
  });

  test('it declares no palette or CSS token', () => {
    const src = read(CONTRACT);
    expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(src).not.toMatch(/--color-/);
  });
});

describe('the six unconsumed fields are gone, and stay gone', () => {
  // A field-level sweep of the mounted page found no consumer for any of
  // these. They are not kept as optional: a contract field nobody reads is a
  // slot the Content Agent fills with text that never reaches a visitor.
  test.each(['benefits', 'heroPills', 'specs', 'badges', 'offer'])(
    '`%s` is not a FixedProductData field',
    (field) => {
      expect(read(CONTRACT)).not.toMatch(new RegExp(`^\\s*${field}[?]?:`, 'm'));
    },
  );

  test('the orphaned `ugc` list is gone — only the strip survives', () => {
    // `product.ugc` was read solely by 13-results-gallery.astro, which
    // index.astro does not mount.
    const src = read(CONTRACT);
    expect(src).not.toMatch(/^\s*ugc[?]?:/m);
    expect(src).toMatch(/ugcStrip:/);
  });

  test('removing them from the contract did NOT remove them from the facts', () => {
    // CanonicalProduct keeps its specifications and raw description: they
    // ground comparison rows, FAQ answers and step copy even with no section
    // rendering them. "Not displayed" and "not useful" are different claims.
    const canonical = readRaw('scripts/lib/product-normalizer.d.mts');
    expect(canonical).toMatch(/specifications:/);
    expect(canonical).toMatch(/description:/);
  });
});

describe('identity is factual — the Content Agent cannot author it', () => {
  test('brand is nullable, because absence is a real answer', () => {
    // A model inventing a brand is the same defect class as the invented
    // reviewer names F2 removed: a claim about a real party, with no source.
    expect(read(CONTRACT)).toMatch(/brand:\s*string\s*\|\s*null/);
  });

  test('the copy group contains no factual identity', () => {
    const copy = /export interface FixedCopy \{[\s\S]*?\n\}/.exec(read(CONTRACT))?.[0] ?? '';
    expect(copy.length).toBeGreaterThan(0);
    for (const factual of ['brand', 'name', 'rating', 'price', 'availability']) {
      expect(copy, `FixedCopy claims authority over ${factual}`).not.toMatch(
        new RegExp(`^\\s*${factual}`, 'im'),
      );
    }
  });
});

describe('social proof stays absent rather than invented', () => {
  test('the aggregate is nullable and carries no breakdown', () => {
    const src = read(CONTRACT);
    expect(src).toMatch(/ratingAverage:\s*number\s*\|\s*null/);
    expect(src).toMatch(/ratingCount:\s*number\s*\|\s*null/);
    // An average cannot imply a distribution, so no field may ask for one.
    expect(src).not.toMatch(/ratingBreakdown/);
  });

  test('a review carries no location and no verification flag', () => {
    const review = /export interface FixedReview \{[\s\S]*?\n\}/.exec(read(CONTRACT))?.[0] ?? '';
    expect(review.length).toBeGreaterThan(0);
    expect(review).not.toMatch(/location/);
    expect(review).not.toMatch(/verified/);
  });

  test('the featured testimonial is optional, matching the sealed grammar slot', () => {
    // OPTIONAL<FeaturedTestimonial> exists in V1 whether or not a product
    // fills it. The contract has to agree, or a product with no suitable
    // review would have to invent one.
    expect(read(CONTRACT)).toMatch(/featuredTestimonial:\s*FixedReview\s*\|\s*null/);
  });
});

describe('policy is never product copy', () => {
  test('the contract declares no returns, guarantee or delivery promise', () => {
    const src = read(CONTRACT);
    for (const policy of ['guarantee', 'returnsWindow', 'shippingEta', 'carrier', 'commercialGuarantee']) {
      expect(src, `${policy} belongs to merchant config, not to product data`).not.toMatch(
        new RegExp(`^\\s*${policy}`, 'im'),
      );
    }
  });

  test('freeShippingOverCents is the one commercial number, and it is nullable', () => {
    // A store's own pricing threshold, not a promise about returns or
    // delivery — those are derived from merchant config in lib/policy.ts.
    expect(read(CONTRACT)).toMatch(/freeShippingOverCents:\s*number\s*\|\s*null/);
  });
});

describe('the Shopify link has three levels and no secrets', () => {
  test('shop, storefront and product are separate identities', () => {
    const link = /export interface ShopifyProductLink \{[\s\S]*?\n\}/.exec(read(CONTRACT))?.[0] ?? '';
    expect(link.length).toBeGreaterThan(0);
    expect(link).toMatch(/shopId/);
    expect(link).toMatch(/storefrontId/);
    expect(link).toMatch(/productHandle/);
  });

  test('it carries no token, secret or API version', () => {
    // A landing payload must never hold credentials, and the API version is
    // runtime configuration for the whole system rather than per-product data.
    const src = read(CONTRACT);
    for (const secret of ['token', 'secret', 'apiKey', 'accessToken', 'apiVersion']) {
      expect(src, `the contract carries ${secret}`).not.toMatch(new RegExp(secret, 'i'));
    }
  });

  test('preview is the absence of a link, not a flag', () => {
    // One field decides the profile. A separate `isPreview` boolean could
    // disagree with the link's presence, and then the page and the data would
    // be making different claims.
    expect(read(CONTRACT)).toMatch(/shopifyProductLink:\s*ShopifyProductLink\s*\|\s*null/);
    expect(read(CONTRACT)).not.toMatch(/isPreview|previewMode/);
  });
});

describe('the FAQ item carries no identity', () => {
  test('faq entries are question and answer only', () => {
    // `id` was a content slug that reached the DOM, and src/data/faq.ts shipped
    // a duplicate of it. Its last real consumer is the accordion's own open
    // state, which uses position instead.
    const src = read(CONTRACT);
    const faq = /faq:\s*\{[^}]*\}\[\]/.exec(src)?.[0] ?? '';
    expect(faq.length, 'the faq field is not declared inline any more').toBeGreaterThan(0);
    expect(faq).not.toMatch(/\bid\b/);
    expect(faq).toMatch(/question/);
    expect(faq).toMatch(/answer/);
  });
});

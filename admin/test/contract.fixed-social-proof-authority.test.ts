// NO REVIEW ON A FIXED LANDING WAS WRITTEN BY A MODEL.
//
// A card showing an author, a star rating and a body is an assertion about a
// stranger's experience. generate-content.mjs used to ask for exactly that, and
// nothing projected the reviews the scraper had already collected — so every
// landing shipped invented customers while real ones sat unused in
// CanonicalProduct.socialProof.reviews.
//
// F2 removed the decorations: the "✓ Compra verificada" pill, the "· Madrid"
// no source could supply, the named personas in the template's own data. It did
// not remove the fabrication underneath.
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  projectFixedSocialProof,
  isDisplayableReview,
  selectFeatured,
  describeRejection,
} from '../../scripts/lib/fixed-social-proof.mjs';
import {
  FIXED_CONTENT_FIELDS,
  FIXED_CONTENT_FOREIGN_FIELDS,
  projectFixedContent,
} from '../../scripts/lib/fixed-content-output.mjs';
import { assembleFixedProductData } from '../../scripts/lib/fixed-product-data.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

/** Shaped exactly like what product-normalizer.mjs emits. */
const canonical = (reviews: unknown[]) => ({
  identity: { productId: 'prd_x-1', name: 'Producto', brand: 'Marca' },
  socialProof: { rating: 4.6, reviewCount: 1284, reviews },
  media: { images: [], videos: [] },
});

const real = (over = {}) => ({
  text: 'Dormí de un tirón la primera noche.',
  rating: 5,
  author: 'M***a',
  dateRaw: '11 FEB 2026',
  variant: 'Color: Gris',
  ...over,
});

// ───────────────────────────────────────────────────────────────────────────
// THE AUTHORITY MOVED
// ───────────────────────────────────────────────────────────────────────────

describe('the Content Agent has no authority over social proof', () => {
  test.each(['reviews', 'testimonials', 'featuredTestimonial'])('%s is foreign to the Fixed content output', (f) => {
    expect(FIXED_CONTENT_FOREIGN_FIELDS).toContain(f);
    expect(FIXED_CONTENT_FIELDS).not.toContain(f);
  });

  test('the projection no longer carries a content document\'s testimonials across', () => {
    const projected = projectFixedContent({
      product: { name: 'P', tagline: 't', subtagline: 's', cta: {}, variantGroupLabel: 'v', trustTicker: [] },
      faq: [],
      testimonials: [{ id: 't1', author: 'Inventada', rating: 5, date: '2026-01-01', body: 'x', variant: 'quote' }],
    });
    expect(projected).not.toHaveProperty('reviews');
    expect(projected).not.toHaveProperty('testimonials');
  });

  test('the Fixed Content Agent is not asked for them, and its answer is discarded anyway', () => {
    // Belt and braces, the same shape the projected ratings and packs already
    // use: the prompt removes the task, and the value is overwritten after the
    // validate loop so a model that wrote them regardless gets nowhere.
    const agent = readFileSync(path.join(REPO_ROOT, 'scripts/generate-content.mjs'), 'utf-8');
    expect(agent).toMatch(/"testimonials" debe ser SIEMPRE un array vac/);
    expect(agent).toMatch(/if \(args\.fixed === true\) parsed\.testimonials = \[\];/);
  });

  test('the generator emits the ASSEMBLER\'s reviews, never the content document\'s', () => {
    const gen = readFileSync(path.join(REPO_ROOT, 'scripts/generate-landing.mjs'), 'utf-8');
    expect(gen).toMatch(/buildTestimonialsTs\(\s*fixed\.socialProof\.reviews,?\s*\)/);
    expect(gen, 'the content document\'s testimonials are still written').not.toMatch(
      /buildTestimonialsTs\(input\.testimonials\)/,
    );
  });
});

// ───────────────────────────────────────────────────────────────────────────
// PROVENANCE
// ───────────────────────────────────────────────────────────────────────────

describe('every rendered review traces to a canonical one', () => {
  test('the body is the source text, never rewritten', () => {
    // A "polished" quote is a sentence the customer did not write, attributed
    // to them by name.
    const source = real({ text: '  el cuello no se me cargó  ' });
    const { testimonials } = projectFixedSocialProof(canonical([source]));
    expect(testimonials[0].body).toBe('el cuello no se me cargó');
  });

  test('the author keeps its mask — that mask IS the provenance', () => {
    const { testimonials } = projectFixedSocialProof(canonical([real({ author: 'M***a' })]));
    expect(testimonials[0].author).toBe('M***a');
  });

  test('an absent author becomes empty, never a person', () => {
    const { testimonials } = projectFixedSocialProof(canonical([real({ author: null })]));
    expect(testimonials[0].author).toBe('');
  });

  test('the date is the provider\'s own string, verbatim', () => {
    // scrape.js reads "25 AGO 2025" from a meta line; product-normalizer's
    // DECISION-7 forbids reformatting it. Parsing it into ISO would invent a
    // precision the source never gave.
    const { testimonials } = projectFixedSocialProof(canonical([real({ dateRaw: '25 AGO 2025' })]));
    expect(testimonials[0].date).toBe('25 AGO 2025');
  });

  test('an absent date becomes empty, never today', () => {
    const { testimonials } = projectFixedSocialProof(canonical([real({ dateRaw: null })]));
    expect(testimonials[0].date).toBe('');
  });

  test('the purchased SKU is NOT used as the layout slot', () => {
    // `CanonicalReview.variant` is "Color: Gris". `Testimonial.variant` is a
    // rendering slot. Same word, unrelated meanings.
    const { testimonials } = projectFixedSocialProof(canonical([real({ variant: 'Color: Gris' })]));
    expect(testimonials[0].variant).toBe('quote');
  });

  test('and the assembled document carries exactly what the scrape proved', () => {
    const fixed = assembleFixedProductData({
      canonicalProduct: canonical([real(), real({ text: 'Va bien.', rating: 4, author: 'J***o' })]),
      contentOutput: {
        name: 'P', tagline: 't', subtagline: 's', cta: {}, variantGroupLabel: 'v', trustTicker: [],
      },
      assetOutput: {
        gallery: [{ id: 'g1', asset: 'a', alt: 'x', ratio: '4/5' }],
        heroExtras: [],
        productMediaStrip: [{ asset: 'a', alt: 'x', ratio: '9/16' }],
        stepMedia: {},
      },
      merchantConfig: null,
      shopifyProductLink: null,
    });
    expect(fixed.socialProof.reviews).toHaveLength(2);
    expect(fixed.socialProof.reviews.map((r: { body: string }) => r.body)).toEqual([
      'Dormí de un tirón la primera noche.',
      'Va bien.',
    ]);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// ELIGIBILITY AND SELECTION
// ───────────────────────────────────────────────────────────────────────────

describe('a review is shown only when the source proves both halves of the card', () => {
  test('text and a counted star rating are both required', () => {
    expect(isDisplayableReview(real())).toBe(true);
    expect(isDisplayableReview(real({ text: '   ' })), 'an empty quotation mark').toBe(false);
    expect(isDisplayableReview(real({ rating: null })), 'a star row the source never counted').toBe(false);
    expect(isDisplayableReview(real({ rating: 4.5 })), 'stars is a closed integer domain').toBe(false);
  });

  test('an author is NOT required — absence is a real state', () => {
    expect(isDisplayableReview(real({ author: null }))).toBe(true);
    expect(isDisplayableReview(real({ dateRaw: null }))).toBe(true);
  });

  test('a rejection is reported with its reason, never silently dropped', () => {
    const { audit } = projectFixedSocialProof(canonical([real(), real({ text: '' }), real({ rating: null })]));
    expect(audit).toEqual({
      found: 3,
      displayable: 1,
      rejected: [{ reason: 'no review text' }, { reason: 'no usable star rating (null)' }],
    });
    expect(describeRejection(real({ rating: null }))).toMatch(/star rating/);
  });

  test('the featured review is chosen deterministically, never at random', () => {
    // Highest rating, then longest body, then earliest — same scrape, same
    // quote, every time. A random pick would show different customers on two
    // builds of one product.
    const reviews = [
      real({ text: 'corto', rating: 5 }),
      real({ text: 'mucho más largo que el otro', rating: 5 }),
      real({ text: 'el mejor pero cuatro estrellas', rating: 4 }),
    ];
    expect(selectFeatured(reviews)!.text).toBe('mucho más largo que el otro');
    // Stable across shuffles of the input order.
    expect(selectFeatured([...reviews].reverse())!.text).toBe('mucho más largo que el otro');
  });

  test('the featured review is the one flagged for the quote slot', () => {
    const { testimonials, featured } = projectFixedSocialProof(
      canonical([real({ text: 'a', rating: 4 }), real({ text: 'bbbb', rating: 5 })]),
    );
    expect(featured!.body).toBe('bbbb');
    expect(featured!.variant).toBe('quote');
    expect(testimonials.filter((t: { variant: string }) => t.variant === 'quote')).toHaveLength(1);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// NO REVIEWS
// ───────────────────────────────────────────────────────────────────────────

describe('a product the provider published nothing about shows nothing', () => {
  test.each([
    ['no reviews at all', []],
    ['only unusable ones', [{ text: '', rating: null, author: null, dateRaw: null, variant: null }]],
  ])('%s yields capability false and an empty list', (_label, reviews) => {
    const projected = projectFixedSocialProof(canonical(reviews));
    expect(projected.capability).toBe(false);
    expect(projected.testimonials).toEqual([]);
    expect(projected.featured).toBeNull();
  });

  test('the capability IS the list — `true` with nothing in it is unrepresentable', () => {
    // One binding, not a flag that can drift from the data it describes.
    for (const reviews of [[], [real()], [real(), real()]]) {
      const p = projectFixedSocialProof(canonical(reviews));
      expect(p.capability).toBe(p.testimonials.length > 0);
    }
  });

  test('nothing is invented to fill the gap', () => {
    const { testimonials } = projectFixedSocialProof(canonical([]));
    expect(testimonials).toEqual([]);
  });
});

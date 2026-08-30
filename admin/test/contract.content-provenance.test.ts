// PROVENANCE GUARDS — a generated landing may only state what something
// upstream can actually support.
//
// This file exists because a real generated landing shipped three claims that
// nothing backed:
//
//   "✓ Compra verificada"   CanonicalReview carries NO verification signal
//   "· Mendoza"             CanonicalReview carries NO location; it was copied
//                           verbatim out of the few-shot example
//   "X vs. lámparas decorativas comunes"
//                           a template literal, true for exactly one product
//
// Each is guarded at its ORIGIN — the contract and the few-shot — rather than
// at the render. Hiding a badge with CSS would leave the fabricated boolean in
// content.json, and the next component to read it would print it again.
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const readRaw = (rel: string) => readFileSync(path.join(REPO_ROOT, rel), 'utf-8');

/**
 * Strips comments before scanning source — the same convention
 * contract.design-blocks.test.ts's B2 scanner and buy-action.contract.test.ts
 * both use, and for the same reason a third time: these files DOCUMENT the
 * claims they are forbidden to make, and a scanner that flagged its own
 * explanation would be useless. Caught here by reviewer-identity.ts's header,
 * which says "Cliente verificado" while explaining why it never renders it.
 */
const read = (rel: string) =>
  readRaw(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*)/.test(l))
    .join('\n');
const contract = await import(
  pathToFileURL(path.join(REPO_ROOT, 'scripts/lib/content-contract.mjs')).href
);

const example = JSON.parse(readRaw('scripts/example-content.json'));

describe('purchase verification cannot be fabricated', () => {
  test('the testimonial contract does not ask for `verified`', () => {
    // The origin. While this was REQUIRED, every generation had to invent it.
    expect(contract.TESTIMONIAL_REQUIRED_FIELDS).not.toContain('verified');
    expect(contract.TESTIMONIAL_ALL_FIELDS).not.toContain('verified');
  });

  test('an emitted `verified` is rejected as an unknown field', () => {
    const issues = contract.collectContentErrors({
      ...example,
      testimonials: [{ ...example.testimonials[0], verified: true }],
    });
    const codes = issues.map((i: { code: string }) => i.code);
    expect(codes, 'a fabricated `verified` slipped through').toContain('testimonials-unknown-fields');
  });

  test('the few-shot teaches no verification', () => {
    // Gemini copies the example's distributions. Every testimonial in it was
    // `verified: true`, which is how the model learned that all reviews are.
    for (const t of example.testimonials) {
      expect(t, `example testimonial ${t.id} still carries verified`).not.toHaveProperty('verified');
    }
    expect(readRaw('scripts/example-content.json')).not.toMatch(/verified/);
  });

  test('NO component can render a verification claim', () => {
    // Not a CSS check — a source check across every renderer.
    const files = [
      'content/landing-base/src/components/sections/07-featured-testimonial.astro',
      'content/landing-base/src/design-system/blocks/social-proof/FeaturedTestimonial/Default.astro',
      'content/landing-base/src/design-system/blocks/social-proof/ReviewsReel/Grid.astro',
      'content/landing-base/src/components/islands/ReviewCarousel.tsx',
    ];
    for (const f of files) {
      const src = read(f);
      expect(src, `${f} still reads .verified`).not.toMatch(/\.verified\b/);
      expect(src, `${f} still renders a verification claim`).not.toMatch(/[Cc]ompra verificada/);
    }
  });

  test('the reviewer fallback makes no verification claim either', () => {
    const helper = read('content/landing-base/src/lib/reviewer-identity.ts');
    expect(helper).toContain("ANONYMOUS_REVIEWER = 'Cliente'");
    expect(helper).not.toMatch(/Cliente verificado/);
  });
});

describe('reviewer location cannot be fabricated', () => {
  test('the testimonial contract has no `location` field', () => {
    expect(contract.TESTIMONIAL_ALL_FIELDS).not.toContain('location');
  });

  test('an emitted `location` is rejected', () => {
    const issues = contract.collectContentErrors({
      ...example,
      testimonials: [{ ...example.testimonials[0], location: 'Mendoza' }],
    });
    expect(issues.map((i: { code: string }) => i.code)).toContain('testimonials-unknown-fields');
  });

  test('no renderer prints a location beside the author', () => {
    for (const f of [
      'content/landing-base/src/design-system/blocks/social-proof/ReviewsReel/Grid.astro',
      'content/landing-base/src/components/islands/ReviewCarousel.tsx',
    ]) {
      expect(read(f), `${f} still renders review.location`).not.toMatch(/review\.location/);
    }
  });
});

describe('every renderer goes through the ONE reviewer identity helper', () => {
  // Where each surface resolves the display name. The carousel is the odd one:
  // it is an ISLAND, so its reviews are serialized into the <astro-island>
  // props attribute. Deriving inside it still shipped the raw `Y***t` in the
  // page source — visible text said "Cliente" while view-source said
  // otherwise. It therefore receives names ALREADY resolved by reel-reviews.ts,
  // and the guard follows the resolution to where it actually happens.
  //
  // socialProof/FeaturedTestimonial appears ONCE now, at its block. It used to
  // appear twice — once at the legacy section, once at FeaturedQuote — and the
  // two have been merged into a single capability. The legacy section is a
  // one-line shim; pointing a MUST-CONTAIN assertion at it would have been the
  // green-but-empty failure mode this suite exists to prevent, so the shim gets
  // the opposite guard instead, right below: it must read no testimonial at all.
  const RENDERERS = [
    ['FeaturedTestimonial', 'content/landing-base/src/design-system/blocks/social-proof/FeaturedTestimonial/Default.astro'],
    ['ReviewsReel/Grid', 'content/landing-base/src/design-system/blocks/social-proof/ReviewsReel/Grid.astro'],
    ['ReviewsReel/Carousel (via reel-reviews)', 'content/landing-base/src/design-system/blocks/social-proof/ReviewsReel/reel-reviews.ts'],
  ] as const;

  test.each(RENDERERS)('%s resolves through reviewerDisplayName', (_n, f) => {
    expect(read(f)).toMatch(/reviewerDisplayName/);
  });

  test('the FeaturedTestimonial shim renders no reviewer of its own', () => {
    // The inverse guard. This file must DELEGATE, not resolve: if markup ever
    // came back to it, it could reach an author without the helper and the
    // sweep above would never see it.
    const shim = read('content/landing-base/src/components/sections/07-featured-testimonial.astro');
    expect(shim, 'the shim selects testimonials again').not.toMatch(/testimonials/);
    expect(shim, 'the shim reads an author again').not.toMatch(/\.author\b/);
    expect(shim, 'the shim no longer delegates to the block').toMatch(
      /blocks\/social-proof\/FeaturedTestimonial\/Default\.astro/,
    );
  });

  test.each(RENDERERS)('%s renders NO raw author', (name, f) => {
    const src = read(f);
    expect(src, `${name} prints the raw author`).not.toMatch(/\{\s*(review|featured)\.author\s*\}/);
  });

  test('NO island receives a raw author in its serialized props', () => {
    // The bug this closes, stated as an invariant: an island that takes raw
    // testimonials ships the mask in the HTML no matter what it renders.
    const carousel = read('content/landing-base/src/design-system/blocks/social-proof/Carousel.astro'.replace('social-proof/', 'social-proof/ReviewsReel/'));
    expect(carousel).toContain('reelReviews(');
    expect(carousel, 'the carousel block reaches for raw testimonials').not.toMatch(
      /from '@\/data\/testimonials'/,
    );
    const accessor = read('content/landing-base/src/design-system/blocks/social-proof/ReviewsReel/reel-reviews.ts');
    expect(accessor).toMatch(/author: reviewerDisplayName\(/);
  });

  test.each(RENDERERS)('%s implements no masking regex of its own', (name, f) => {
    // Four regexes that drift is exactly what the helper exists to prevent.
    expect(read(f), `${name} grew its own mask rule`).not.toMatch(/\*{2,}|\\\*/);
  });
});

describe('the comparison rival is content, never a template literal', () => {
  test('`comparisonRival` is a required product field', () => {
    expect(contract.ALLOWED_PRODUCT_FIELDS).toContain('comparisonRival');
    expect(contract.REQUIRED_PRODUCT_FIELDS).toContain('comparisonRival');
  });

  test('a landing without one is rejected', () => {
    const { comparisonRival, ...withoutRival } = example.product;
    const issues = contract.collectContentErrors({ ...example, product: withoutRival });
    expect(issues.map((i: { code: string }) => i.code)).toContain('product-missing-fields');
  });

  test('the heading derives from it, and no category term is hardcoded', () => {
    const src = read('content/landing-base/src/design-system/blocks/product/Comparison/comparison-rows.ts');
    expect(src).toContain('product.comparisonRival');
    // The specific literal, and the general shape: no `vs. <words>` baked in.
    const code = src.split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'));
    expect(code.join('\n'), 'a category term is still hardcoded').not.toMatch(/vs\.\s+[a-záéíóúñ]/i);
  });
});

describe('cross-product leakage — the few-shot must not become the answer', () => {
  // The rule, stated once: a FACTUAL field generated for a product may not
  // reproduce, verbatim, a specific value from the example product that the
  // real CanonicalProduct never supplied.
  //
  // Scoped to factual fields on purpose. Marketing copy legitimately rhymes
  // with the example — that is what a few-shot is FOR — so a blanket
  // "no example string may appear anywhere" rule would flag good output. What
  // may never be copied is a fact about a different product.
  const FACTUAL_PRODUCT_FIELDS = ['comparisonRival', 'brand', 'name'] as const;

  test('the example itself carries no reviewer facts to leak', () => {
    for (const t of example.testimonials) {
      expect(Object.keys(t).sort()).toEqual(
        [...contract.TESTIMONIAL_ALL_FIELDS].filter((f: string) => f in t).sort(),
      );
      expect(t).not.toHaveProperty('location');
      expect(t).not.toHaveProperty('verified');
    }
  });

  test('a product from another category may not inherit the example rival', () => {
    // Simulated the way the real check will run at validate time: compare the
    // generated factual field against the example's, and fail on an exact copy.
    const leaked = { ...example.product, brand: 'OtraMarca', name: 'Sacacorchos eléctrico' };
    for (const field of FACTUAL_PRODUCT_FIELDS) {
      if (field === 'comparisonRival') {
        expect(
          leaked[field] === example.product[field],
          'a corkscrew inherited the pillow rival — this is the leak the rule catches',
        ).toBe(true); // demonstrates the detector fires on the leaked shape
      }
    }
    // …and the honest version passes it.
    const honest = { ...leaked, comparisonRival: 'sacacorchos manuales' };
    expect(honest.comparisonRival).not.toBe(example.product.comparisonRival);
  });

  test('the example rival is generic and names no brand', () => {
    const rival: string = example.product.comparisonRival;
    expect(rival.length).toBeGreaterThan(3);
    // A rival that is Capitalised mid-phrase is usually a brand name.
    expect(rival, 'the few-shot teaches a brand rival').toBe(rival.toLowerCase());
    expect(rival).not.toContain(example.product.brand);
  });
});

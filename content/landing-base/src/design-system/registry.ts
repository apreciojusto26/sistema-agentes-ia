// Runtime capability registry for the generated landing (Design System Fase 2).
//
// MIRRORS scripts/lib/design-registry.mjs exactly. This duplication is
// deliberate and unavoidable: content/landing-base is COPIED wholesale into
// outputs/{slug}/ by generate-landing.mjs's copyTemplate(), so at runtime it
// has no path to scripts/lib. Do NOT "fix" it by importing from scripts/.
//
// The compensating control is admin/test/contract.design-registry-parity.test.ts,
// which fails if these two registries diverge on ANY field of ANY capability.
// That test is LOAD-BEARING: without it, this file silently becomes a second
// source of truth and Fase 1's whole anti-drift doctrine is defeated.
//
// ADR-1: this module is PURE DATA and imports nothing at runtime. The only
// import is `import type`, which is erased at build time. Component resolution
// (import.meta.glob) deliberately lives in index.astro instead, so that this
// module stays importable from a plain Node/vitest context with no Vite
// pipeline and no `@/` alias — which is exactly what makes the parity test
// mechanically possible.
import type { RegistryEntry } from '../types/design';

/** A legacy section: unconstrained `default` variant, zero props. */
function legacy(
  category: string,
  type: string,
  component: string,
  requiresData: string[] = [],
): RegistryEntry {
  return {
    category,
    type,
    variant: 'default',
    component,
    propsSchema: {},
    familiesAllowed: '*',
    densityAllowed: '*',
    incompatibleWith: [],
    requiresData,
  };
}

/**
 * A design-system building block. Declares no family/density restriction and no
 * incompatibility — none has been established. The only thing these add over
 * `legacy()` is a REAL props contract backed by a real rendering difference.
 */
function block(
  category: string,
  type: string,
  variant: string,
  component: string,
  propsSchema: RegistryEntry['propsSchema'],
  requiresData: string[] = [],
): RegistryEntry {
  return {
    category,
    type,
    variant,
    component,
    propsSchema,
    familiesAllowed: '*',
    densityAllowed: '*',
    incompatibleWith: [],
    requiresData,
  };
}

export const REGISTRY: RegistryEntry[] = [
  legacy('hero', 'Hero', '@/components/sections/03-hero.astro', ['product.gallery']),
  legacy('conversion', 'BuyBox', '@/components/sections/05-buy-box.astro'),
  legacy('product', 'HowItWorks', '@/components/sections/06-how-it-works.astro', ['product.steps']),
  legacy('socialProof', 'FeaturedTestimonial', '@/components/sections/07-featured-testimonial.astro', ['testimonials:quote']),
  legacy('conversion', 'Faq', '@/components/sections/08-faq.astro', ['faq']),
  legacy('socialProof', 'UgcStrip', '@/components/sections/09-ugc-strip.astro', ['product.ugc']),
  legacy('product', 'Comparison', '@/components/sections/11-comparison.astro', ['product.comparison']),
  legacy('conversion', 'Guarantee', '@/components/sections/12-guarantee.astro'),
  legacy('socialProof', 'RealResults', '@/components/sections/13-real-results.astro', ['product.ugc']),

  block('hero', 'ProductHero', 'split', '@/design-system/blocks/hero/ProductHero/Split.astro', {
    align: { type: 'string', enum: ['left', 'center'] },
  }, ['product.gallery']),
  block('socialProof', 'FeaturedQuote', 'default', '@/design-system/blocks/social-proof/FeaturedQuote/Default.astro', {
    tone: { type: 'string', enum: ['light', 'muted'] },
  }, ['testimonials:quote']),
  block('conversion', 'ProductGuarantee', 'default', '@/design-system/blocks/conversion/ProductGuarantee/Default.astro', {
    tone: { type: 'string', enum: ['gold', 'plain'] },
  }),

  // --- STRUCTURAL VARIANTS v1 ---------------------------------------------
  // socialProof/ReviewsReel is the FIRST capability whose `variant` axis
  // carries a real structural choice rather than the placeholder 'default'.
  // Both variants render the same reviews through the same selector
  // (blocks/social-proof/ReviewsReel/reel-reviews.ts) and therefore declare
  // the SAME requiresData — a new variant can never be a way around the
  // data-aware gate.
  //
  // `carousel` is the composition this capability always had (it moved out of
  // components/sections/10-reviews-reel.astro verbatim, which is now a shim);
  // `grid` is a genuinely different composition: static, no island, no
  // controls, every review visible at once.
  //
  // AUDIT — familiesAllowed / incompatibleWith (both left at their honest
  // empty values, deliberately):
  //   * families only re-declare CSS custom properties (styles/design-system.css
  //     changes colours, radii, shadows, --font-display and --spacing). Neither
  //     composition depends on any of those to stay legible, so no real
  //     family incompatibility exists. familiesAllowed stays '*'.
  //   * carousel vs grid cannot co-occur ALREADY: collectSectionsIssues()
  //     rejects a repeated `type` with `section-duplicate-type`, independently
  //     of variant. Declaring them incompatibleWith each other would be
  //     redundant metadata dressed up as a rule — the exact fiction this
  //     registry forbids. incompatibleWith stays [].
  block('socialProof', 'ReviewsReel', 'carousel', '@/design-system/blocks/social-proof/ReviewsReel/Carousel.astro', {}, ['testimonials:reel']),
  block('socialProof', 'ReviewsReel', 'grid', '@/design-system/blocks/social-proof/ReviewsReel/Grid.astro', {}, ['testimonials:reel']),

  // media/GalleryStrip — SECOND capability on the structural-variant axis,
  // same pattern as socialProof/ReviewsReel above. Both variants resolve their
  // images through blocks/media/GalleryStrip/gallery-images.ts, which owns the
  // commerce precedence rule (Shopify images win over the authored gallery) so
  // no variant can answer "which images are these" differently.
  //
  // AUDIT — familiesAllowed / incompatibleWith, both left empty on evidence:
  //   * families only re-declare CSS custom properties; a strip and a grid are
  //     both legible under all nine. No real restriction exists. '*' stays.
  //   * strip vs grid cannot co-occur already — `section-duplicate-type`
  //     rejects a repeated type regardless of variant. [] stays.
  block('media', 'GalleryStrip', 'strip', '@/design-system/blocks/media/GalleryStrip/Strip.astro', {}, ['product.gallery']),
  block('media', 'GalleryStrip', 'grid', '@/design-system/blocks/media/GalleryStrip/Grid.astro', {}, ['product.gallery']),
];

/** Canonical `category/type/variant` key. */
export function capabilityKey(category: string, type: string, variant: string): string {
  return `${category}/${type}/${variant}`;
}

/**
 * Exact lookup — no fallback, no substitution. Returns null when the exact
 * triple is not registered, which the renderer MUST treat as a hard failure.
 */
export function resolveCapability(
  category: string,
  type: string,
  variant: string,
  registry: RegistryEntry[] = REGISTRY,
): RegistryEntry | null {
  return (
    registry.find((e) => e.category === category && e.type === type && e.variant === variant) ?? null
  );
}

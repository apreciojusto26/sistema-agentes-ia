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
  legacy('media', 'GalleryStrip', '@/components/sections/04-gallery-strip.astro', ['product.gallery']),
  legacy('conversion', 'BuyBox', '@/components/sections/05-buy-box.astro'),
  legacy('product', 'HowItWorks', '@/components/sections/06-how-it-works.astro', ['product.steps']),
  legacy('socialProof', 'FeaturedTestimonial', '@/components/sections/07-featured-testimonial.astro', ['testimonials:quote']),
  legacy('conversion', 'Faq', '@/components/sections/08-faq.astro', ['faq']),
  legacy('socialProof', 'UgcStrip', '@/components/sections/09-ugc-strip.astro', ['product.ugc']),
  legacy('socialProof', 'ReviewsReel', '@/components/sections/10-reviews-reel.astro', ['testimonials:reel']),
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

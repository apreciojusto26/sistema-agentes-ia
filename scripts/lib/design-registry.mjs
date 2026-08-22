// Design System Registry (agents.MD §5 "Design & Layout Agent", §5.7
// "DesignSpec v1"). THE single source of truth for what the design system can
// actually render. No field list here may be duplicated anywhere else in the
// repo — guarded by admin/test/no-duplicated-contract.test.ts, same rule
// content-contract.mjs's whitelists live under.
//
// Pure data + pure lookups: no filesystem, no network, no LLM, no dependencies
// (mirrors product-normalizer.mjs's dependency-footprint discipline). A future
// Design Agent resolves capabilities ONLY as (category, type, variant) triples
// — it never sees, and never supplies, a component path. The renderer is the
// only layer that dereferences `component`.
//
// HONESTY CONTRACT (agents.MD §6.3 "No Arbitrary Components"): every entry
// below maps to a section component that ALREADY EXISTS and already renders in
// content/landing-base/src/pages/index.astro today. Nothing here is
// aspirational. `propsSchema: {}`, `familiesAllowed: '*'`, `densityAllowed:
// '*'` and `incompatibleWith: []` are the TRUTHFUL description of the current
// state — those components take no props and no compatibility rules have been
// established yet. They are not placeholders to be filled with guesses; they
// get narrowed only when a real capability is built.

/** agents.MD §5.1. Semantic dimension only in v1 — no family-specific visual system exists yet. */
export const DESIGN_FAMILIES = [
  'minimal', 'premium', 'editorial', 'ecommerce', 'bold', 'tech', 'soft', 'energetic', 'luxury',
];

/**
 * Semantic dimension only in v1. Deliberately NOT mapped to spacing tokens:
 * content/landing-base/src/styles/global.css declares no spacing or density
 * scale at all, and inventing one here would be a fictional capability
 * (agents.MD §5.7).
 */
export const DESIGN_DENSITIES = ['compact', 'balanced', 'airy'];

/**
 * Theme groups the CURRENT renderer already knows how to apply — mirrors
 * CSS_VAR_MAP in scripts/generate-landing.mjs (colors|fonts|radius|shadow)
 * plus its separate `text` branch. A group outside this list has no renderer
 * support and is therefore rejected, never silently ignored.
 */
export const THEME_GROUPS = ['colors', 'fonts', 'radius', 'shadow', 'text'];

/**
 * The REAL token keys declared in content/landing-base/src/styles/global.css's
 * `@theme` block, grouped by the CSS var prefix CSS_VAR_MAP builds
 * (colors -> --color-{key}, fonts -> --font-{key}, ...). Hardcoded here on
 * purpose so this module stays pure (no fs read) like content-contract.mjs;
 * drift against the real stylesheet is caught mechanically by
 * admin/test/contract.design-spec.test.ts's @theme cross-check, the same way
 * admin/test/theme-tokens.test.ts guards the admin dashboard's own tokens.
 */
export const THEME_TOKENS = {
  colors: [
    'bone', 'bone-dim', 'graphite', 'graphite-soft', 'steel', 'steel-light',
    'rust', 'rust-dark', 'rust-tint', 'gold', 'gold-tint', 'surface',
  ],
  fonts: ['display', 'sans'],
  radius: ['card', 'tile', 'pill'],
  shadow: ['card', 'lift', 'sticky', 'ring-white'],
  text: ['eyebrow', 'display', 'hero'],
};

/** Sub-keys allowed inside a `theme.text.{key}` entry — exactly what patchThemeBlock() consumes. */
export const THEME_TEXT_FIELDS = ['size', 'lineHeight', 'letterSpacing'];

/**
 * agents.MD §5.6 "Protected Structural Tokens". These live inside the same
 * `@theme` block but are STRUCTURAL — no DesignSpec may ever address them.
 * They are unreachable by construction (no THEME_GROUPS prefix produces
 * `--breakpoint-` or `--animate-`), and a contract test asserts that stays
 * true rather than trusting the construction.
 */
export const PROTECTED_STRUCTURAL_TOKENS = ['--breakpoint-xs', '--animate-marquee'];

/**
 * The flexible-content-area capabilities that exist TODAY. The shell
 * (01-utility-bar, 02-site-header, 14-site-footer, 15-sticky-bar, CartDrawer)
 * is deliberately absent: it is mandatory, non-reorderable structure the
 * Design Agent may never compose or remove (agents.MD §5.3), so it is not a
 * building block and must not be addressable through `sections[]`.
 *
 * `component` is the import specifier index.astro already uses. It exists so
 * the RENDERER can resolve a triple; it is never accepted as agent input.
 */
export const REGISTRY = [
  // --- LEGACY capabilities (Fase 1) ---------------------------------------
  // The 11 original sections, unchanged and still registered. They take no
  // props and live under src/components/sections/ (a path the scope-boundaries
  // guardrail protects — they are read and rendered, never modified).
  legacy('hero', 'Hero', '@/components/sections/03-hero.astro'),
  legacy('media', 'GalleryStrip', '@/components/sections/04-gallery-strip.astro'),
  legacy('conversion', 'BuyBox', '@/components/sections/05-buy-box.astro'),
  legacy('product', 'HowItWorks', '@/components/sections/06-how-it-works.astro'),
  legacy('socialProof', 'FeaturedTestimonial', '@/components/sections/07-featured-testimonial.astro'),
  legacy('conversion', 'Faq', '@/components/sections/08-faq.astro'),
  legacy('socialProof', 'UgcStrip', '@/components/sections/09-ugc-strip.astro'),
  legacy('socialProof', 'ReviewsReel', '@/components/sections/10-reviews-reel.astro'),
  legacy('product', 'Comparison', '@/components/sections/11-comparison.astro'),
  legacy('conversion', 'Guarantee', '@/components/sections/12-guarantee.astro'),
  legacy('socialProof', 'RealResults', '@/components/sections/13-real-results.astro'),

  // --- DESIGN SYSTEM building blocks (Fase 2 vertical slice) ---------------
  // Props-driven derivations living under src/design-system/blocks/. Each one
  // derives visually from a legacy section (documented in its own header) but
  // exposes a real, narrow design prop. Deliberately given NEW type names
  // rather than re-pointing a legacy key: a generation without --design must
  // keep rendering exactly the legacy components it renders today.
  //
  // `props` here are DESIGN decisions only, never content. Content still
  // arrives through the src/data/* modules generate-landing.mjs writes — the
  // Content Agent owns what is said, the Design Agent owns how it is composed.
  block('hero', 'ProductHero', 'split', '@/design-system/blocks/hero/ProductHero/Split.astro', {
    align: { type: 'string', enum: ['left', 'center'] },
  }),
  block('socialProof', 'FeaturedQuote', 'default', '@/design-system/blocks/social-proof/FeaturedQuote/Default.astro', {
    tone: { type: 'string', enum: ['light', 'muted'] },
  }),
  block('conversion', 'ProductGuarantee', 'default', '@/design-system/blocks/conversion/ProductGuarantee/Default.astro', {
    tone: { type: 'string', enum: ['gold', 'plain'] },
  }),
];

/**
 * A legacy section: unconstrained `default` variant, zero props. Written as a
 * helper rather than 11 hand-copied literals so the "no fictional constraint"
 * invariant is structural — there is exactly one place a constraint could be
 * introduced for these, and it would be a deliberate edit.
 */
function legacy(category, type, component) {
  return {
    category,
    type,
    variant: 'default',
    component,
    propsSchema: {},
    familiesAllowed: '*',
    densityAllowed: '*',
    incompatibleWith: [],
  };
}

/**
 * A design-system building block. Still declares no family/density restriction
 * and no incompatibility: none has been established yet, and inventing one to
 * look sophisticated would be exactly the fiction this registry forbids. The
 * only thing these add over `legacy()` is a REAL props contract backed by a
 * real rendering difference in the component.
 */
function block(category, type, variant, component, propsSchema) {
  return {
    category,
    type,
    variant,
    component,
    propsSchema,
    familiesAllowed: '*',
    densityAllowed: '*',
    incompatibleWith: [],
  };
}

/** Capabilities implemented as design-system building blocks (vs. legacy sections). */
export function isBuildingBlock(entry) {
  return entry.component.startsWith('@/design-system/');
}

/** Categories that actually have at least one capability — derived, never hand-listed. */
export function listCategories(registry = REGISTRY) {
  return [...new Set(registry.map((e) => e.category))];
}

/** Types registered under a category (empty when the category itself is unknown). */
export function listTypes(category, registry = REGISTRY) {
  return [...new Set(registry.filter((e) => e.category === category).map((e) => e.type))];
}

/** Variants registered for a (category, type) pair. */
export function listVariants(category, type, registry = REGISTRY) {
  return registry.filter((e) => e.category === category && e.type === type).map((e) => e.variant);
}

/**
 * Resolves a (category, type, variant) triple to its registry entry, or null.
 * `null` NEVER means "fall back to something close" — the contract turns it
 * into an explicit unsupported_design (agents.MD §6.3).
 */
export function resolveCapability(category, type, variant, registry = REGISTRY) {
  return (
    registry.find((e) => e.category === category && e.type === type && e.variant === variant) ?? null
  );
}

/** Canonical `category/type/variant` string used in errors and missingCapability. */
export function capabilityKey(category, type, variant) {
  return `${category}/${type}/${variant}`;
}

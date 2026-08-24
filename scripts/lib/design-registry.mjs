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
//
// `requiresData` (Design Integrity fase) obeys the SAME honesty rule: every
// requirement below was read off the component's own source. A capability
// declares a requirement only where a real selector would come back empty.
// `10-reviews-reel.astro` does `.filter(t => t.variant === 'reel')`, so it
// declares `testimonials:reel`; `12-guarantee.astro` reads nothing
// collection-shaped, so it declares nothing. Do not add a requirement to look
// thorough — an unfounded one rejects a landing that would have rendered.

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
  legacy('hero', 'Hero', '@/components/sections/03-hero.astro', ['product.gallery']),
  legacy('conversion', 'BuyBox', '@/components/sections/05-buy-box.astro'),
  legacy('product', 'HowItWorks', '@/components/sections/06-how-it-works.astro', ['product.steps']),
  legacy('socialProof', 'FeaturedTestimonial', '@/components/sections/07-featured-testimonial.astro', ['testimonials:quote']),
  legacy('conversion', 'Faq', '@/components/sections/08-faq.astro', ['faq']),
  legacy('socialProof', 'UgcStrip', '@/components/sections/09-ugc-strip.astro', ['product.ugc']),
  legacy('product', 'Comparison', '@/components/sections/11-comparison.astro', ['product.comparison']),
  legacy('conversion', 'Guarantee', '@/components/sections/12-guarantee.astro'),
  legacy('socialProof', 'RealResults', '@/components/sections/13-real-results.astro', ['product.ugc']),

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

/**
 * A legacy section: unconstrained `default` variant, zero props. Written as a
 * helper rather than 11 hand-copied literals so the "no fictional constraint"
 * invariant is structural — there is exactly one place a constraint could be
 * introduced for these, and it would be a deliberate edit.
 */
function legacy(category, type, component, requiresData = []) {
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
 * A design-system building block. Still declares no family/density restriction
 * and no incompatibility: none has been established yet, and inventing one to
 * look sophisticated would be exactly the fiction this registry forbids. The
 * only thing these add over `legacy()` is a REAL props contract backed by a
 * real rendering difference in the component.
 */
function block(category, type, variant, component, propsSchema, requiresData = []) {
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

// --- data-aware capability resolution -------------------------------------
//
// A capability may only be composed into a landing when the CONTENT can
// actually feed it. Before this existed the chain failed in the worst possible
// place: the DesignSpec validated, generation succeeded, `astro build`
// succeeded, `validate` passed on six existsSync() calls, and the operator
// discovered the hole by LOOKING at the page — a dark band with carousel
// arrows around an empty track.
//
// The grammar is deliberately tiny and fully general, so no capability is ever
// special-cased in an agent:
//
//   "faq"                -> content.faq            must be a non-empty array
//   "product.ugc"        -> content.product.ugc    must be a non-empty array
//   "testimonials:reel"  -> content.testimonials   must contain >= 1 entry
//                                                  whose `variant` is "reel"
//
// `<dot.path>` selects; the optional `:<variant>` filters by the `variant`
// discriminator. Adding a requirement is a one-token registry edit; it needs
// no change here, in design-contract.mjs, or in generate-design.mjs.

/** Walks a dot-path. Returns undefined for any missing link — never throws. */
function readPath(root, dotPath) {
  return dotPath.split('.').reduce((node, key) => (node == null ? undefined : node[key]), root);
}

/**
 * Is one requirement satisfied by this content.json?
 *
 * NON-EMPTY is the bar, not "present". Every `product.*` path used here is
 * already in REQUIRED_PRODUCT_FIELDS, so presence proves nothing: an empty
 * array passes the content contract and still renders an empty section.
 */
export function isRequirementMet(requirement, content) {
  if (!content) return true; // nothing to judge against — see checkDesignSupport
  const [dotPath, variant] = String(requirement).split(':');
  const value = readPath(content, dotPath);
  if (!Array.isArray(value)) return false;
  if (variant === undefined) return value.length > 0;
  return value.some((item) => item && item.variant === variant);
}

/**
 * The requirements this capability declares that the content does NOT meet.
 * Empty array = composable. Never throws on a malformed entry or content.
 */
export function unmetRequirements(entry, content) {
  if (!entry || !Array.isArray(entry.requiresData)) return [];
  return entry.requiresData.filter((req) => !isRequirementMet(req, content));
}

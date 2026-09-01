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
  // What is LEFT of the 11 original sections. They take no props and still
  // live under src/components/sections/ (a path the scope-boundaries guardrail
  // protects — they are read and rendered, never modified). The others were
  // promoted onto the variant axis one capability at a time; their old paths
  // survive as shims, which is why this list only shrinks.
  legacy('socialProof', 'RealResults', '@/components/sections/13-real-results.astro', ['product.ugc']),

  // --- DESIGN SYSTEM building blocks (Fase 2 vertical slice) ---------------
  // Props-driven derivations living under src/design-system/blocks/. Each one
  // derives visually from a legacy section (documented in its own header) but
  // exposes a real, narrow design prop.
  //
  // These were originally given NEW type names rather than re-pointing a legacy
  // key, to keep a no---design generation byte-identical. hero/Hero below is
  // where that rule was RETIRED for the hero: the byte-identity is now proven
  // by the shim plus two frozen goldens instead of by a duplicate type name,
  // and the duplicate type was costing the Design Agent a coherent catalogue.
  //
  // `props` here are DESIGN decisions only, never content. Content still
  // arrives through the src/data/* modules generate-landing.mjs writes — the
  // Content Agent owns what is said, the Design Agent owns how it is composed.

  // hero/Hero — SEVENTH capability on the structural-variant axis, and the one
  // that CORRECTED a taxonomy mistake rather than only extending it.
  //
  // `split` shipped at 19f60d5 as a separate capability TYPE, `hero/ProductHero`.
  // That was wrong: a landing has ONE hero, and "collage" vs "one framed shot"
  // is a choice of composition inside it — exactly what the `variant` axis is
  // for. Two types meant the Design Agent saw two heroes it could compose side
  // by side, and `section-duplicate-type` would not have stopped it. Renaming
  // the type to `Hero` is what makes that combination unrepresentable.
  //
  // `ProductHero` is GONE — not deprecated, not aliased. Nothing resolves it,
  // and contract.design-spec.test.ts asserts the registry cannot answer for
  // that type at all.
  //
  // Both variants read imagery through blocks/hero/Hero/hero-gallery.ts. That
  // accessor carries NO fail-closed guard, unlike its six predecessors; the
  // reason is written in the module itself and it is a deliberate consequence
  // of this migration being behaviour-preserving.
  //
  // `default` carries the legacy composition verbatim (the collage, rendered
  // once per breakpoint) and is the only one of the two that emits the
  // `#hero-end` sentinel 15-sticky-bar.astro observes. `split` does not, and
  // that PRE-EXISTING defect is preserved here on purpose — see both block
  // headers, and the separate "Hero split Sticky CTA anchor parity" item.
  //
  // AUDIT — familiesAllowed / incompatibleWith, both left empty on evidence:
  //   * families only re-declare CSS custom properties; a collage and a split
  //     shot are both legible under all nine. '*' stays.
  //   * the two variants cannot co-occur already — `section-duplicate-type`
  //     rejects a repeated type regardless of variant, and unifying the type
  //     is precisely what brought split under that rule. [] stays.
  //
  // `align` belongs to `split` ALONE — editorial does not inherit it, and
  // nothing in the contract lets a variant borrow a sibling's props.
  // `align` stays a PROP, not a pair of variants. It is the deliberate
  // demonstration of the two axes: `variant` picks a composition,
  // `propsSchema` dials one that already exists. `split-left`/`split-center`
  // would have been the same DOM twice with one class swapped.
  block('hero', 'Hero', 'default', '@/design-system/blocks/hero/Hero/Default.astro', {}, ['product.gallery']),
  block('hero', 'Hero', 'split', '@/design-system/blocks/hero/Hero/Split.astro', {
    align: { type: 'string', enum: ['left', 'center'] },
  }, ['product.gallery']),
  //
  // `editorial` (added after the taxonomy was unified) is the first hero
  // composition with no legacy ancestor. It is the proof that the unified
  // capability accepts a genuinely NEW variant without a new type: it shows
  // brand, ratingAverage, ratingCount and badges — real product data no hero
  // rendered before — and composes the gallery as an asymmetric cluster.
  //
  // It declares NO props. `align` is split's; density/layout/imageCount/overlay
  // were considered and rejected as configurability theatre. The structure IS
  // the variant. It declares the SAME requiresData as its siblings, so a new
  // variant can never be a way around the data-aware gate, and it degrades from
  // three images to two to one on its own rather than leaning on a
  // `product.gallery>=3` grammar that does not exist.
  block('hero', 'Hero', 'editorial', '@/design-system/blocks/hero/Hero/Editorial.astro', {}, ['product.gallery']),
  // socialProof/FeaturedTestimonial — the capability that got MERGED rather
  // than extended, and the mirror image of what hero/Hero did.
  //
  // Two entries used to stand here. `socialProof/FeaturedTestimonial/default`
  // was the legacy section; `socialProof/FeaturedQuote/default` was a block
  // with a `tone` prop, born at 19f60d5 out of the same "give it a NEW type
  // name" reflex that produced `hero/ProductHero/split`. Hero's fix was to
  // collapse two types into one type with two VARIANTS, because collage and
  // framed-shot are genuinely different compositions. This one collapses two
  // types into one type with one variant and a PROP, because they were not.
  //
  // That was measured, not eyeballed. Rendered against the same frozen input,
  // the two differed by a background class, three colour tokens and the order
  // of two classes on one paragraph — same tags, same nesting, same element
  // count. A dial, by this registry's own rule.
  //
  // `plain` is in the enum for a load-bearing reason: the legacy section draws
  // NO background, and neither `light` nor `muted` could say that. Without it
  // the historical composition would have become unreachable and every legacy
  // generation would have quietly gained a surface. It is also the default, so
  // an omitted prop reproduces the legacy render exactly — proven byte-for-byte
  // by the FeaturedTestimonial row in historical-markup.golden.test.ts.
  block('socialProof', 'FeaturedTestimonial', 'default', '@/design-system/blocks/social-proof/FeaturedTestimonial/Default.astro', {
    tone: { type: 'string', enum: ['plain', 'light', 'muted'] },
  }, ['testimonials:quote']),
  // conversion/Guarantee — the THIRD and last of 19f60d5's duplicate types to
  // be collapsed, and the one that was also shipping a real defect.
  //
  // `conversion/ProductGuarantee/default` stood beside this key as a separate
  // capability with a `tone` prop. 19f60d5's own commit message described the
  // arrangement as deliberate: "conversion/Guarantee/default keeps resolving
  // next to conversion/ProductGuarantee/default". Rendered against the same
  // frozen input the two emitted 30 elements each, the same tag sequence, the
  // same non-class attributes, and byte-identical markup once class attributes
  // were stripped. Colour tokens only — a dial.
  //
  // AND BOTH CARRIED id={SECTION_ANCHORS.Guarantee}. A DesignSpec naming both
  // validated, built, and shipped a page with TWO id="guarantee" elements
  // repeating the same guarantee word for word, with the footer's
  // href="#guarantee" resolving to whichever came first. That combination is
  // no longer expressible: the duplicate TYPE is gone, so nothing needs an
  // incompatibleWith rule to forbid it.
  //
  // `gold` is the legacy surface and the default, byte-identical to
  // 12-guarantee.astro. Two details had to resolve in the BASELINE's favour to
  // get there: the section literal keeps the legacy class order, and the gold
  // heading carries no colour class — ProductGuarantee had added
  // `text-graphite`, which global.css already applies to `body`. A no-op that
  // would still have changed the bytes of every legacy generation.
  block('conversion', 'Guarantee', 'default', '@/design-system/blocks/conversion/Guarantee/Default.astro', {
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

  // socialProof/UgcStrip — THIRD capability on the structural-variant axis.
  // Both variants read through blocks/social-proof/UgcStrip/ugc-items.ts,
  // which is deliberately thin: Media.astro already owns asset resolution, so
  // the only thing genuinely shared is the emptiness guard. Extracting it
  // anyway is what stops a future variant from shipping without one.
  //
  // AUDIT — familiesAllowed / incompatibleWith, both left empty on evidence:
  //   * families only re-declare CSS custom properties; a horizontal strip and
  //     a mosaic are both legible under all nine. '*' stays.
  //   * strip vs grid cannot co-occur already — `section-duplicate-type`
  //     rejects a repeated type regardless of variant. [] stays.
  //   * NOT declared incompatible with socialProof/RealResults either, even
  //     though that section also reads product.ugc. Two sections showing the
  //     same pieces in different framings is an editorial call the Design
  //     Agent is allowed to make; inventing a rule against it would be
  //     taste dressed up as a contract.
  block('socialProof', 'UgcStrip', 'strip', '@/design-system/blocks/social-proof/UgcStrip/Strip.astro', {}, ['product.ugc']),
  block('socialProof', 'UgcStrip', 'grid', '@/design-system/blocks/social-proof/UgcStrip/Grid.astro', {}, ['product.ugc']),

  // conversion/Faq — FOURTH capability on the structural-variant axis, and the
  // FIRST outside socialProof/media. Nothing about the pattern changed for a
  // different category, which is the point of converting one here.
  //
  // The two variants differ in whether the answers need interaction to be
  // read, not in whether they are in the document: FaqAccordion collapses with
  // `grid-rows-[0fr]`, so its answers ship in the HTML either way. See
  // OpenList.astro's header for the honest version of that difference.
  //
  // AUDIT — familiesAllowed / incompatibleWith, both left empty on evidence:
  //   * families only re-declare CSS custom properties; an accordion and a
  //     definition list are both legible under all nine. '*' stays.
  //   * accordion vs open-list cannot co-occur already — `section-duplicate-type`
  //     rejects a repeated type regardless of variant. [] stays.
  block('conversion', 'Faq', 'accordion', '@/design-system/blocks/conversion/Faq/Accordion.astro', {}, ['faq']),
  block('conversion', 'Faq', 'open-list', '@/design-system/blocks/conversion/Faq/OpenList.astro', {}, ['faq']),

  // product/HowItWorks — FIFTH capability on the structural-variant axis, and
  // the first in `product`. Both variants read through
  // blocks/product/HowItWorks/steps.ts and render the AUTHORED `step` number,
  // never an array index, so neither can renumber the process.
  //
  // Neither hydrates: this section explains a process, it does not track one.
  //
  // `horizontal-timeline` carries the legacy composition verbatim (three media
  // cards, lg:grid-cols-3, stacking below) and deliberately draws NO connector
  // line — see its header for why that would have changed legacy output.
  //
  // AUDIT — familiesAllowed / incompatibleWith, both left empty on evidence:
  //   * families only re-declare CSS custom properties; a card row and a
  //     numbered rail are both legible under all nine. '*' stays.
  //   * the two variants cannot co-occur already — `section-duplicate-type`
  //     rejects a repeated type regardless of variant. [] stays.
  block('product', 'HowItWorks', 'vertical-steps', '@/design-system/blocks/product/HowItWorks/VerticalSteps.astro', {}, ['product.steps']),
  block('product', 'HowItWorks', 'horizontal-timeline', '@/design-system/blocks/product/HowItWorks/HorizontalTimeline.astro', {}, ['product.steps']),

  // product/Comparison — SIXTH capability on the structural-variant axis.
  // Both variants read rows through blocks/product/Comparison/comparison-rows.ts,
  // which also owns the ONE interpretation of `boolean | string`: true -> check,
  // false -> cross, string -> text. That is the first shared module in this
  // series that encapsulates real SEMANTICS rather than just an accessor and a
  // guard, and it exists so `false` cannot mean a cross in one variant and the
  // word "No" in the other.
  //
  // `product.brand` is read by both variants and deliberately NOT declared in
  // requiresData: it is already in REQUIRED_PRODUCT_FIELDS, and the requiresData
  // grammar evaluates non-empty ARRAYS, so declaring a string there would be
  // redundant metadata the evaluator would report as permanently unmet.
  //
  // AUDIT — familiesAllowed / incompatibleWith, both left empty on evidence:
  //   * families only re-declare CSS custom properties; a grid table and two
  //     panels are both legible under all nine. '*' stays.
  //   * the two variants cannot co-occur already — `section-duplicate-type`. [] stays.
  block('product', 'Comparison', 'table', '@/design-system/blocks/product/Comparison/Table.astro', {}, ['product.comparison']),
  block('product', 'Comparison', 'cards', '@/design-system/blocks/product/Comparison/Cards.astro', {}, ['product.comparison']),

  // product/Benefits — the first capability in this series that is ADDITIVE
  // rather than a conversion, and the audit that established it is worth
  // keeping: there IS no legacy Benefits section. `product.benefits` has only
  // ever been rendered inside components/sections/05-buy-box.astro, as a row of
  // small tiles carrying `title` and `text` and DISCARDING `icon` and `id`.
  //
  // Extracting it was considered and rejected. BuyBox is imported by the
  // byte-locked test-fixtures/LegacyIndex2074c93.astro, so moving those tiles
  // out would change what every legacy generation renders — a real behaviour
  // change to a commerce-adjacent section, dressed up as a refactor. BuyBox
  // keeps its tiles verbatim; this capability is opt-in through a DesignSpec.
  //
  // That used to be described here as "the arrangement conversion/
  // ProductGuarantee and socialProof/FeaturedQuote already have beside their
  // legacy counterparts". Both of those have since been merged INTO their
  // legacy counterparts, so the comparison no longer holds and is recorded
  // here rather than quietly deleted: Benefits is opt-in because it has no
  // legacy section at all, not because it shadows one.
  //
  // Consequence, stated plainly: Benefits has NO historical golden, because it
  // has no history. Freezing today's output as a "historical" reference would
  // be a fiction — same call as hero/Hero/editorial.
  //
  // Both variants read through blocks/product/Benefits/benefit-items.ts, which
  // owns the emptiness guard AND the icon resolution. That second half is real
  // logic, not symmetry: `ICONS` is typed Record<Exclude<IconName,'star'>,...>
  // while `IconName` includes 'star', and BOTH real catalogues use 'star' for a
  // benefit — so a naive ICONS[benefit.icon] draws a blank square for one
  // benefit in four. It is also the first icon id in this template that arrives
  // as CONTENT rather than being reached statically, which is what makes it the
  // first one that can be wrong.
  //
  // AUDIT — familiesAllowed / incompatibleWith, both left empty on evidence:
  //   * families only re-declare CSS custom properties; a card grid and a
  //     divided list are both legible under all nine. '*' stays.
  //   * the two variants cannot co-occur already — `section-duplicate-type`
  //     rejects a repeated type regardless of variant. [] stays.
  //   * NOT declared incompatible with conversion/BuyBox either, even though
  //     BuyBox also shows the same benefits as tiles. Whether to repeat them is
  //     an editorial call the Design Agent is allowed to make; inventing a rule
  //     against it would be taste dressed up as a contract.
  //
  // Neither declares props. The composition IS the variant, and neither has a
  // dial worth exposing: an `icon` position or a `density` here would be
  // configurability theatre over two compositions that already differ.
  block('product', 'Benefits', 'icon-grid', '@/design-system/blocks/product/Benefits/IconGrid.astro', {}, ['product.benefits']),
  block('product', 'Benefits', 'feature-list', '@/design-system/blocks/product/Benefits/FeatureList.astro', {}, ['product.benefits']),

  // conversion/BuyBox — EIGHTH capability on the variant axis, the first that
  // mounts a commerce island, and the first to declare a real incompatibility.
  //
  // The conversion was only safe because e1bf155 extracted the buy DECISION
  // into parts/use-buy-action.ts first: `card` and `compact` mount two
  // different presentation islands, and both reach that one hook. Same variant
  // id, same pack, same projected price, same quantity, same availability, same
  // cart mutation, same checkout, same analytics, same preview signal, same CTA
  // decision. Only the composition differs. Without that refactor, a second
  // presentation would have been a third copy of the transaction.
  //
  // `card` carries the legacy composition verbatim (05-buy-box.astro is now a
  // shim) and is byte-locked by test-fixtures/legacy-markup/BuyBox.html, whose
  // 4732910 provenance was verified in a worktree rather than assumed.
  //
  // INCOMPATIBILITY — the first honest one in this registry, and the reason the
  // field stops being an empty formality:
  //
  //   `card` renders product.benefits itself, as a 2x4 tile grid. That was
  //   harmless while nothing else did. product/Benefits/{icon-grid,feature-list}
  //   now exist, and a landing composing card WITH either of them prints every
  //   benefit title and text TWICE — measured on a real build, not inferred.
  //   That is a genuine conflict between two capabilities over one dataset, so
  //   it is declared here instead of being left to the agent's taste or, worse,
  //   to an `if` in generate-design.mjs.
  //
  //   `compact` deliberately renders no tiles, so it carries NO incompatibility
  //   and composes freely with Benefits. That is the whole point of the pair.
  //
  // The keys are listed EXACTLY, because that is what the contract compares:
  // collectSectionsIssues() does `incompatibleWith.includes(otherKey)` on full
  // `category/type/variant` strings, symmetrically. There is no wildcard
  // support today and none is faked here — see the audit note in
  // contract.design-blocks.test.ts for the minimal typed extension that a third
  // Benefits variant would justify. Until then a guard test fails if a Benefits
  // variant is added without being listed, so the maintenance cost is
  // mechanical rather than remembered.
  //
  // AUDIT — familiesAllowed / densityAllowed, both left at '*' on evidence:
  //   families only re-declare CSS custom properties; a lifted card and a
  //   ruled block are both legible under all nine.
  //
  // requiresData stays EMPTY for both, deliberately. Everything the buy box
  // reads — packs, cta, errors, shipping, guarantee, ratingAverage, benefits —
  // is already in REQUIRED_PRODUCT_FIELDS, so declaring it would be redundant
  // metadata. And Shopify availability is NOT expressible here on purpose: it
  // is commerce runtime, resolved per request by getProductCommerce(), not a
  // property of content.json that a design-time evaluator could ever check.
  block('conversion', 'BuyBox', 'card', '@/design-system/blocks/conversion/BuyBox/Card.astro', {}, [], [
    'product/Benefits/icon-grid',
    'product/Benefits/feature-list',
  ]),
  block('conversion', 'BuyBox', 'compact', '@/design-system/blocks/conversion/BuyBox/Compact.astro', {}),
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
function block(category, type, variant, component, propsSchema, requiresData = [], incompatibleWith = []) {
  return {
    category,
    type,
    variant,
    component,
    propsSchema,
    familiesAllowed: '*',
    densityAllowed: '*',
    incompatibleWith,
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

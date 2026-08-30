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
  incompatibleWith: string[] = [],
): RegistryEntry {
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

export const REGISTRY: RegistryEntry[] = [
  legacy('conversion', 'Guarantee', '@/components/sections/12-guarantee.astro'),
  legacy('socialProof', 'RealResults', '@/components/sections/13-real-results.astro', ['product.ugc']),

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
  // keeps its tiles verbatim; this capability is opt-in through a DesignSpec,
  // exactly the arrangement conversion/ProductGuarantee and
  // conversion/ProductGuarantee already has beside its legacy counterpart.
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

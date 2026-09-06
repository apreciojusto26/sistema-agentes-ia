// ASTRAVIBE FIXED STRUCTURAL GRAMMAR — V4.
//
// V1, V2 AND V3 ARE NOT MODIFIED, NOT REGENERATED AND NOT DEPRECATED. Their
// three seals stay exactly what they were: V1 a2fc51ddf61b…, V2 82e3913a2cb7…,
// V3 af765fce5c7d…. A contract edited in place to match whatever the code now
// produces is a comment.
//
// ─── WHAT CHANGED, AND WHY IT HAD TO ──────────────────────────────────────
//
// V1/V2/V3 never modelled `<head>` at all — it passed through as fixed,
// unclaimed lines. That was fine until SITE_URL started deciding whether one
// more of those lines exists: Base.astro renders
//
//     {ogImageFile && Astro.site && <meta property="og:image" content={…} />}
//
// so a Preview build (no SITE_URL) and a Commerce build of the SAME product
// (SITE_URL + a real photograph) produce head sections that differ by exactly
// one line — measured directly, on two real builds of one fixture:
//
//     no SITE_URL   → 9 head lines, no og:image meta
//     SITE_URL + OG → 10 head lines, og:image meta present
//
// Both are correct pages. Under V3 they hash differently for a reason that
// has nothing to do with BODY structure — the exact gap OPTIONAL<> exists to
// close, just never applied to the head before now.
//
// ─── THE ONE NEW SLOT, AND WHY IT WORKS WITHOUT TOUCHING SHARED CODE ──────
//
// og:type / og:title / og:description / og:image all render as
// `<meta property="…" content={…}>`. structuralSkeleton() drops `content`'s
// value (VALUE_DROPPED_ATTRS) but keeps `property`'s — verified directly, not
// assumed — so each of those four lines already carries its own identity:
//
//     <meta content property="og:type">
//     <meta content property="og:title">
//     <meta content property="og:description">
//     <meta content property="og:image">
//
// which means the EXISTING applyOptionalSlots() machinery — after/before
// anchors, an exact wrapper match, an exact shape when present — already
// has everything it needs for this slot. Nothing in fingerprint.mjs's shared
// preprocessing (structuralSkeleton, normalizeContextualValues, applyGrammar,
// applyOptionalSlots itself) changes; V1/V2/V3's sealed hashes are computed by
// that exact same code and stay exactly what they were.
//
// ─── WHAT V4 DELIBERATELY DOES NOT DO ─────────────────────────────────────
//
// NOTHING ELSE MOVES. Body, layout and every component region are V3's,
// re-exported rather than re-declared. The reviews section and the featured
// testimonial stay optional exactly as V2 made them. This is metadata in
// `<head>` and only that.
import { FIXED_GRAMMAR_V3, FIXED_OPTIONAL_SLOTS_V3 } from './fixed-grammar-v3.mjs';

/** Body/layout regions are V3's, unchanged. */
export const FIXED_GRAMMAR_V4 = FIXED_GRAMMAR_V3;

/**
 * The social-preview image tag, as a capability.
 *
 * `capability` names the TWO facts that decide it, both upstream of this
 * grammar and both checked independently by Validation
 * (pipeline.ts's validate:grammar): SITE_URL configured for this run, AND
 * src/data/og.ts declaring a real photograph (never a boolean stored on its
 * own that could disagree with either). "capability true with neither fact
 * true" is unrepresentable upstream, the same discipline ReviewsSection's
 * `factualReviews` already follows for its own capability.
 */
export const OG_IMAGE_META_SLOT = {
  id: 'OgImageMeta',
  capability: 'ogImage',
  // Both anchors are unique in the rendered head — see the header note above:
  // `property`'s value survives skeletonisation, so og:description names
  // exactly one line and is never confused with og:type or og:title.
  after: { tag: 'meta', attrs: { property: 'og:description' } },
  before: { tag: 'meta', attrs: { name: 'twitter:card' } },
  wrapper: { tag: 'meta', attrs: { property: 'og:image' } },
  shape: '<meta content property="og:image">',
};

/** V3's optional slots plus the social preview image. */
export const FIXED_OPTIONAL_SLOTS_V4 = [...FIXED_OPTIONAL_SLOTS_V3, OG_IMAGE_META_SLOT];

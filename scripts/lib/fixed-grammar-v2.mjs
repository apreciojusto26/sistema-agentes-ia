// ASTRAVIBE FIXED STRUCTURAL GRAMMAR — V2.
//
// V1 IS NOT MODIFIED, NOT REGENERATED AND NOT DEPRECATED. It remains the
// sealed record of the structure as it stood when social proof was still
// written by a language model, and its artifact still hashes to
// a2fc51ddf61b7dfa6a145eee7e25497a12e10669a7dfd714f07600aa586d77cd. A contract
// edited in place to match whatever the code now produces is a comment.
//
// ─── WHAT CHANGED, AND WHY IT HAD TO ──────────────────────────────────────
//
// F7 made CanonicalProduct.socialProof.reviews the only authority for reviews.
// A product whose provider published nothing usable therefore has none — and
// under V1 that page still rendered the reels wrapper around an empty carousel
// and empty dots, because `reviews/cards` and `reviews/dots` have min 1 and the
// section always mounted. The honest page is one with no reviews section at
// all, and V1 cannot represent that: the section never becomes absent.
//
// So V2 differs from V1 by exactly one declaration:
//
//     OPTIONAL<ReviewsSection>
//
// Nothing else moves. Every region, every shape, every contextual rule and
// every dropped attribute is V1's, re-exported rather than re-declared so the
// two cannot drift apart.
//
// ─── WHAT V2 DELIBERATELY DOES NOT DO ─────────────────────────────────────
//
// It does not loosen the fingerprint. When the section IS present its subtree
// must equal the declared shape byte for byte — a changed wrapper, a changed
// class, a removed carousel or corrupted dots all leave the page verbatim and
// move the hash, exactly as under V1. The only thing V2 tolerates is the
// section not existing.
//
// POSITION IS STILL STRUCTURE. `after` and `before` bracket the one place the
// section may appear. Found outside that bracket, or found twice, the slot is
// left alone and the page fails on its own terms — optional never means
// "anywhere".
import { FIXED_GRAMMAR, FIXED_OPTIONAL_SLOTS } from './fixed-grammar.mjs';

/** Regions are V1's, unchanged. */
export const FIXED_GRAMMAR_V2 = FIXED_GRAMMAR;

/**
 * The reviews reel, as a capability.
 *
 * `capability` names the data that decides it: the projection in
 * fixed-social-proof.mjs derives presence from the factual review list itself,
 * so "capability true with an empty list" is unrepresentable upstream and
 * cannot be asserted here either.
 *
 * THE WAVE DIVIDER ABOVE THE SECTION IS NOT PART OF THIS SLOT. It renders as
 * `<div class="bg-white">` and so does the hero's grid wrapper — two lines this
 * matcher cannot separate, since it discriminates on tag, classes and
 * attributes only. Guarding it would have needed markup present in every
 * landing to change, which is what the seal exists to prevent. It stays: a
 * decorative transition that asserts nothing.
 */
export const REVIEWS_SECTION_SLOT = {
  id: 'ReviewsSection',
  capability: 'factualReviews',
  after: { tag: 'section', attrs: { id: 'como-funciona' } },
  before: { tag: 'section', attrs: { id: 'garantia' } },
  // EXACT, not "carries". `bg-grape-tint` also sits on a comparison-table
  // header cell, and a slot that matched two elements would be left alone as a
  // misplacement rather than collapsed.
  wrapper: { tag: 'div', exactClasses: ['bg-grape-tint'] },
  shape: "<div class=\"bg-grape-tint\">\n  <section class=\"bg-grape-tint md:mx-6 md:py-12 mx-3 py-10 rounded-card xl:max-w-[80rem] xl:mx-auto\">\n    <div class=\"lg:max-w-[72rem] max-w-[28rem] md:max-w-[42rem] mx-auto px-5 w-full xl:max-w-[80rem]\">\n      <div class=\"max-w-2xl mb-6\">\n        <p class=\"font-bold text-eyebrow text-grape uppercase\">\n        <h2 class=\"leading-tight md:text-4xl mt-1 text-[1.75rem]\">\n        <p class=\"mt-3 text-graphite/70 text-sm\">\n      <div>\n        <astro-island await-children client=\"visible\" component-export=\"ReviewCarousel\">\n          <div aria-label aria-roledescription=\"carousel\" role=\"region\">\n            <div class=\"gap-2 hidden items-center justify-end md:flex pb-3\">\n              <button aria-label class=\"bg-white grid hover:bg-grape/5 place-items-center rounded-full shadow-card size-8 text-grape transition\" type=\"button\">\n                <svg aria-hidden=\"true\" class=\"rotate-90 size-4\" viewbox=\"0 0 20 20\">\n                  <path d=\"M5.22 8.22a.75.75 0 011.06 0L10 11.94l3.72-3.72a.75.75 0 111.06 1.06l-4.25 4.25a.75.75 0 01-1.06 0L5.22 9.28a.75.75 0 010-1.06z\" fill=\"currentColor\">\n              <button aria-label class=\"bg-white grid hover:bg-grape/5 place-items-center rounded-full shadow-card size-8 text-grape transition\" type=\"button\">\n                <svg aria-hidden=\"true\" class=\"-rotate-90 size-4\" viewbox=\"0 0 20 20\">\n                  <path d=\"M5.22 8.22a.75.75 0 011.06 0L10 11.94l3.72-3.72a.75.75 0 111.06 1.06l-4.25 4.25a.75.75 0 01-1.06 0L5.22 9.28a.75.75 0 010-1.06z\" fill=\"currentColor\">\n            <div class=\"[&amp;::-webkit-scrollbar]:hidden [scrollbar-width:none] flex gap-4 motion-reduce:scroll-auto overflow-x-auto pb-3 snap-mandatory snap-x\">\n              REPEAT<reviews/cards:S01>\n            <div aria-label class=\"flex gap-1.5 justify-center mt-3\" role=\"tablist\">\n              REPEAT<reviews/dots:S01>\n              REPEAT<reviews/dots:S02>",
};

/** V1's optional slots plus the reviews section. */
export const FIXED_OPTIONAL_SLOTS_V2 = [...FIXED_OPTIONAL_SLOTS, REVIEWS_SECTION_SLOT];

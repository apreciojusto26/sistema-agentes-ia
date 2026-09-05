// ASTRAVIBE FIXED STRUCTURAL GRAMMAR — V3.
//
// V1 AND V2 ARE NOT MODIFIED, NOT REGENERATED AND NOT DEPRECATED. V1 still
// hashes to a2fc51ddf61b… and V2 to 82e3913a2cb7…, and both remain the sealed
// record of what this template permitted when each was written. A contract
// edited in place to match whatever the code now produces is a comment.
//
// ─── WHAT CHANGED, AND WHY IT HAD TO ──────────────────────────────────────
//
// The first real landing failed its structural gate on a comparison table that
// was, by every rule the system states, correct. The model wrote four honest
// rows and the last one was:
//
//     { feature: "Recargable por USB", ours: true, rival: "A pilas o con enchufe" }
//
// A boolean and a string — exactly what the Fixed content contract permits,
// and exactly what 11-comparison.astro renders. V2 had simply never SEEN that
// combination in a final row, so the region refused to collapse, the page
// emitted eighteen extra elements, and the profile did not match.
//
// THE GRAMMAR WAS WRONG, NOT THE CONTENT. V1's comparison shapes were
// assembled from the combinations that HAPPENED to occur in two fixtures, and
// a grammar built by observation describes a sample rather than a template.
// The alternative fix — telling the Content Agent that a closing row should be
// text — would have turned an accidental gap into an editorial rule, and left
// a model writing sentences to satisfy a hash.
//
// ─── THE STATE MODEL, AND THE EXACT GAP IT CLOSES ─────────────────────────
//
// scripts/lib/comparison-states.mjs derives it: each cell is `boolean |
// non-empty string`, and the component branches to a tick, an X or a span. So
// THEORETICAL = 3 × 3 = 9 and REACHABLE = 9, in the body and again in the
// closing position, where the `ours` cell carries `rounded-b-card`.
//
// Measured against nine real builds — one per closing state, produced by
// scripts/e2e/comparison-states.mjs — V2 declared:
//
//     body     4 of 9   missing cross-check, cross-cross, cross-text,
//                               text-check, text-cross
//     closing  2 of 9   missing check-check, check-cross, CHECK-TEXT,
//                               cross-check, cross-text, text-check, text-cross
//
// ─── THE BODY IS FIXED TOO, AND THAT IS DELIBERATE ────────────────────────
//
// The failure that was reported is a closing-row failure, and closing rows
// alone could have been widened. But the body carries the IDENTICAL defect
// from the IDENTICAL cause: a table whose SECOND row is `ours: false` fails
// exactly the way this one did. Shipping a known instance of a bug because the
// report happened to name its sibling is not a smaller change, it is a later
// one. The region is completed, once.
//
// ─── WHAT V3 DELIBERATELY DOES NOT DO ─────────────────────────────────────
//
// NOTHING ELSE MOVES. Every other region, every optional slot, every
// contextual rule and every dropped attribute is V1's, re-exported rather than
// re-declared so they cannot drift. The reviews section stays optional exactly
// as V2 made it. Within the comparison region itself nothing is loosened: the
// three header cells are still compared verbatim, arity is still structure, a
// closing shape in the middle still fails, and a plain shape at the end still
// fails. What grew is the SET of cell combinations the template is admitted to
// be able to render — and every member of it is materialized by a real build
// in contract.fixed-grammar-v3.test.ts, so no shape sits here unexercised.
//
// V2'S NAMES ARE PRESERVED BYTE FOR BYTE. R01-R04 and L01-L02 keep the exact
// skeletons V2 sealed, so the readable diff is purely additive: V3 removes no
// line that V1 or V2 declared.
import { FIXED_GRAMMAR } from './fixed-grammar.mjs';
import { FIXED_OPTIONAL_SLOTS_V2 } from './fixed-grammar-v2.mjs';

/**
 * The comparison region's shapes, each tagged with the row state it renders.
 *
 * `state` is documentation and a test handle — it is not part of the sealed
 * artifact, which renders names and skeleton digests. It exists so a failure
 * can say "cross-text failed as a closing row" instead of naming an index.
 */
export const COMPARISON_BODY_SHAPES = [
  { state: "text-text", name: "R01", skeleton: "<div class=\"bg-surface border-graphite/10 border-t p-3 text-graphite\">\n<div class=\"bg-grape-tint border-graphite/10 border-t p-3 text-center text-graphite\">\n  <span class=\"text-xs\">\n<div class=\"bg-white border-graphite/10 border-t p-3 text-center text-graphite\">\n  <span class=\"text-xs\">" },
  { state: "check-text", name: "R02", skeleton: "<div class=\"bg-surface border-graphite/10 border-t p-3 text-graphite\">\n<div class=\"bg-grape-tint border-graphite/10 border-t p-3 text-center text-graphite\">\n  <svg aria-hidden=\"true\" class=\"mx-auto size-5 text-grape\" viewbox=\"0 0 20 20\">\n    <path d=\"M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z\" fill=\"currentColor\">\n<div class=\"bg-white border-graphite/10 border-t p-3 text-center text-graphite\">\n  <span class=\"text-xs\">" },
  { state: "check-check", name: "R03", skeleton: "<div class=\"bg-surface border-graphite/10 border-t p-3 text-graphite\">\n<div class=\"bg-grape-tint border-graphite/10 border-t p-3 text-center text-graphite\">\n  <svg aria-hidden=\"true\" class=\"mx-auto size-5 text-grape\" viewbox=\"0 0 20 20\">\n    <path d=\"M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z\" fill=\"currentColor\">\n<div class=\"bg-white border-graphite/10 border-t p-3 text-center text-graphite\">\n  <svg aria-hidden=\"true\" class=\"mx-auto size-5 text-steel-light\" viewbox=\"0 0 20 20\">\n    <path d=\"M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z\" fill=\"currentColor\">" },
  { state: "check-cross", name: "R04", skeleton: "<div class=\"bg-surface border-graphite/10 border-t p-3 text-graphite\">\n<div class=\"bg-grape-tint border-graphite/10 border-t p-3 text-center text-graphite\">\n  <svg aria-hidden=\"true\" class=\"mx-auto size-5 text-grape\" viewbox=\"0 0 20 20\">\n    <path d=\"M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z\" fill=\"currentColor\">\n<div class=\"bg-white border-graphite/10 border-t p-3 text-center text-graphite\">\n  <svg aria-hidden=\"true\" class=\"mx-auto size-5 text-steel-light\" viewbox=\"0 0 20 20\">\n    <path d=\"M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z\" fill=\"currentColor\">" },
  { state: "cross-check", name: "R05", skeleton: "<div class=\"bg-surface border-graphite/10 border-t p-3 text-graphite\">\n<div class=\"bg-grape-tint border-graphite/10 border-t p-3 text-center text-graphite\">\n  <svg aria-hidden=\"true\" class=\"mx-auto size-5 text-grape\" viewbox=\"0 0 20 20\">\n    <path d=\"M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z\" fill=\"currentColor\">\n<div class=\"bg-white border-graphite/10 border-t p-3 text-center text-graphite\">\n  <svg aria-hidden=\"true\" class=\"mx-auto size-5 text-steel-light\" viewbox=\"0 0 20 20\">\n    <path d=\"M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z\" fill=\"currentColor\">" },
  { state: "cross-cross", name: "R06", skeleton: "<div class=\"bg-surface border-graphite/10 border-t p-3 text-graphite\">\n<div class=\"bg-grape-tint border-graphite/10 border-t p-3 text-center text-graphite\">\n  <svg aria-hidden=\"true\" class=\"mx-auto size-5 text-grape\" viewbox=\"0 0 20 20\">\n    <path d=\"M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z\" fill=\"currentColor\">\n<div class=\"bg-white border-graphite/10 border-t p-3 text-center text-graphite\">\n  <svg aria-hidden=\"true\" class=\"mx-auto size-5 text-steel-light\" viewbox=\"0 0 20 20\">\n    <path d=\"M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z\" fill=\"currentColor\">" },
  { state: "cross-text", name: "R07", skeleton: "<div class=\"bg-surface border-graphite/10 border-t p-3 text-graphite\">\n<div class=\"bg-grape-tint border-graphite/10 border-t p-3 text-center text-graphite\">\n  <svg aria-hidden=\"true\" class=\"mx-auto size-5 text-grape\" viewbox=\"0 0 20 20\">\n    <path d=\"M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z\" fill=\"currentColor\">\n<div class=\"bg-white border-graphite/10 border-t p-3 text-center text-graphite\">\n  <span class=\"text-xs\">" },
  { state: "text-check", name: "R08", skeleton: "<div class=\"bg-surface border-graphite/10 border-t p-3 text-graphite\">\n<div class=\"bg-grape-tint border-graphite/10 border-t p-3 text-center text-graphite\">\n  <span class=\"text-xs\">\n<div class=\"bg-white border-graphite/10 border-t p-3 text-center text-graphite\">\n  <svg aria-hidden=\"true\" class=\"mx-auto size-5 text-steel-light\" viewbox=\"0 0 20 20\">\n    <path d=\"M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z\" fill=\"currentColor\">" },
  { state: "text-cross", name: "R09", skeleton: "<div class=\"bg-surface border-graphite/10 border-t p-3 text-graphite\">\n<div class=\"bg-grape-tint border-graphite/10 border-t p-3 text-center text-graphite\">\n  <span class=\"text-xs\">\n<div class=\"bg-white border-graphite/10 border-t p-3 text-center text-graphite\">\n  <svg aria-hidden=\"true\" class=\"mx-auto size-5 text-steel-light\" viewbox=\"0 0 20 20\">\n    <path d=\"M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z\" fill=\"currentColor\">" },
];

/** The same nine states, closing the table. Only `rounded-b-card` differs. */
export const COMPARISON_LAST_SHAPES = [
  { state: "text-text", name: "L01", skeleton: "<div class=\"bg-surface border-graphite/10 border-t p-3 text-graphite\">\n<div class=\"bg-grape-tint border-graphite/10 border-t p-3 rounded-b-card text-center text-graphite\">\n  <span class=\"text-xs\">\n<div class=\"bg-white border-graphite/10 border-t p-3 text-center text-graphite\">\n  <span class=\"text-xs\">" },
  { state: "cross-cross", name: "L02", skeleton: "<div class=\"bg-surface border-graphite/10 border-t p-3 text-graphite\">\n<div class=\"bg-grape-tint border-graphite/10 border-t p-3 rounded-b-card text-center text-graphite\">\n  <svg aria-hidden=\"true\" class=\"mx-auto size-5 text-grape\" viewbox=\"0 0 20 20\">\n    <path d=\"M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z\" fill=\"currentColor\">\n<div class=\"bg-white border-graphite/10 border-t p-3 text-center text-graphite\">\n  <svg aria-hidden=\"true\" class=\"mx-auto size-5 text-steel-light\" viewbox=\"0 0 20 20\">\n    <path d=\"M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z\" fill=\"currentColor\">" },
  { state: "check-check", name: "L03", skeleton: "<div class=\"bg-surface border-graphite/10 border-t p-3 text-graphite\">\n<div class=\"bg-grape-tint border-graphite/10 border-t p-3 rounded-b-card text-center text-graphite\">\n  <svg aria-hidden=\"true\" class=\"mx-auto size-5 text-grape\" viewbox=\"0 0 20 20\">\n    <path d=\"M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z\" fill=\"currentColor\">\n<div class=\"bg-white border-graphite/10 border-t p-3 text-center text-graphite\">\n  <svg aria-hidden=\"true\" class=\"mx-auto size-5 text-steel-light\" viewbox=\"0 0 20 20\">\n    <path d=\"M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z\" fill=\"currentColor\">" },
  { state: "check-cross", name: "L04", skeleton: "<div class=\"bg-surface border-graphite/10 border-t p-3 text-graphite\">\n<div class=\"bg-grape-tint border-graphite/10 border-t p-3 rounded-b-card text-center text-graphite\">\n  <svg aria-hidden=\"true\" class=\"mx-auto size-5 text-grape\" viewbox=\"0 0 20 20\">\n    <path d=\"M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z\" fill=\"currentColor\">\n<div class=\"bg-white border-graphite/10 border-t p-3 text-center text-graphite\">\n  <svg aria-hidden=\"true\" class=\"mx-auto size-5 text-steel-light\" viewbox=\"0 0 20 20\">\n    <path d=\"M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z\" fill=\"currentColor\">" },
  { state: "check-text", name: "L05", skeleton: "<div class=\"bg-surface border-graphite/10 border-t p-3 text-graphite\">\n<div class=\"bg-grape-tint border-graphite/10 border-t p-3 rounded-b-card text-center text-graphite\">\n  <svg aria-hidden=\"true\" class=\"mx-auto size-5 text-grape\" viewbox=\"0 0 20 20\">\n    <path d=\"M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z\" fill=\"currentColor\">\n<div class=\"bg-white border-graphite/10 border-t p-3 text-center text-graphite\">\n  <span class=\"text-xs\">" },
  { state: "cross-check", name: "L06", skeleton: "<div class=\"bg-surface border-graphite/10 border-t p-3 text-graphite\">\n<div class=\"bg-grape-tint border-graphite/10 border-t p-3 rounded-b-card text-center text-graphite\">\n  <svg aria-hidden=\"true\" class=\"mx-auto size-5 text-grape\" viewbox=\"0 0 20 20\">\n    <path d=\"M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z\" fill=\"currentColor\">\n<div class=\"bg-white border-graphite/10 border-t p-3 text-center text-graphite\">\n  <svg aria-hidden=\"true\" class=\"mx-auto size-5 text-steel-light\" viewbox=\"0 0 20 20\">\n    <path d=\"M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z\" fill=\"currentColor\">" },
  { state: "cross-text", name: "L07", skeleton: "<div class=\"bg-surface border-graphite/10 border-t p-3 text-graphite\">\n<div class=\"bg-grape-tint border-graphite/10 border-t p-3 rounded-b-card text-center text-graphite\">\n  <svg aria-hidden=\"true\" class=\"mx-auto size-5 text-grape\" viewbox=\"0 0 20 20\">\n    <path d=\"M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z\" fill=\"currentColor\">\n<div class=\"bg-white border-graphite/10 border-t p-3 text-center text-graphite\">\n  <span class=\"text-xs\">" },
  { state: "text-check", name: "L08", skeleton: "<div class=\"bg-surface border-graphite/10 border-t p-3 text-graphite\">\n<div class=\"bg-grape-tint border-graphite/10 border-t p-3 rounded-b-card text-center text-graphite\">\n  <span class=\"text-xs\">\n<div class=\"bg-white border-graphite/10 border-t p-3 text-center text-graphite\">\n  <svg aria-hidden=\"true\" class=\"mx-auto size-5 text-steel-light\" viewbox=\"0 0 20 20\">\n    <path d=\"M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z\" fill=\"currentColor\">" },
  { state: "text-cross", name: "L09", skeleton: "<div class=\"bg-surface border-graphite/10 border-t p-3 text-graphite\">\n<div class=\"bg-grape-tint border-graphite/10 border-t p-3 rounded-b-card text-center text-graphite\">\n  <span class=\"text-xs\">\n<div class=\"bg-white border-graphite/10 border-t p-3 text-center text-graphite\">\n  <svg aria-hidden=\"true\" class=\"mx-auto size-5 text-steel-light\" viewbox=\"0 0 20 20\">\n    <path d=\"M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z\" fill=\"currentColor\">" },
];

const COMPARISON_ID = 'comparison/rows';
const v1Comparison = FIXED_GRAMMAR.find((r) => r.id === COMPARISON_ID);
if (!v1Comparison) throw new Error('comparison/rows is missing from the V1 grammar');

/**
 * The comparison region, with the reachable state space fully declared.
 *
 * Built FROM V1's entry rather than rewritten, so the wrapper, kind, min, zero
 * and tuple arity are provably the ones V1 sealed — only the shape sets grow.
 */
export const COMPARISON_REGION_V3 = {
  ...v1Comparison,
  tuple: {
    ...v1Comparison.tuple,
    shapes: COMPARISON_BODY_SHAPES.map(({ name, skeleton }) => ({ name, skeleton })),
    lastShapes: COMPARISON_LAST_SHAPES.map(({ name, skeleton }) => ({ name, skeleton })),
  },
};

/** V1's regions, with exactly one replaced. Every other entry is the same object. */
export const FIXED_GRAMMAR_V3 = FIXED_GRAMMAR.map((r) =>
  r.id === COMPARISON_ID ? COMPARISON_REGION_V3 : r,
);

/** V2's optional slots, unchanged — the reviews section is still optional. */
export const FIXED_OPTIONAL_SLOTS_V3 = FIXED_OPTIONAL_SLOTS_V2;

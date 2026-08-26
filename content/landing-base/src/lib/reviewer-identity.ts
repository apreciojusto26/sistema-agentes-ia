// THE ONE reviewer display rule, for every component that shows a review.
//
// WHY IT EXISTS. Marketplace reviews arrive with the author already masked by
// the source — `Y***t`, `A***n`, sometimes just `****`. Nothing in this
// pipeline does that masking; product-normalizer.mjs carries the author
// through verbatim, and it should, because the mask IS the provenance. What
// was wrong was rendering it: four components printed `review.author` raw, so
// a real landing greeted buyers with "Y***t".
//
// WHAT THIS IS NOT. It does not rewrite, clean or "restore" the raw author —
// CanonicalProduct keeps exactly what the source said. This derives a DISPLAY
// name at render time and nothing else.
//
// AND IT INVENTS NOTHING. An unreadable author becomes "Cliente", not a
// plausible Spanish name and not "Cliente verificado" — we have no purchase
// verification signal at all (see content-contract.mjs's note on the removed
// `verified` field), so the fallback states only what is true: someone bought
// this and wrote about it.

/** What an unreadable author is shown as. Not a claim — just a person. */
export const ANONYMOUS_REVIEWER = 'Cliente';

/**
 * Masking characters observed in real marketplace exports. `*` is the common
 * one; the others appear where a source substitutes a different glyph.
 *
 * Deliberately NOT a general "looks odd" heuristic: a name is only replaced
 * when it carries an actual masking character or has no letters at all. A real
 * name with punctuation, accents, initials or CJK characters stays exactly as
 * written — turning "J. Ruiz" or "李明" into "Cliente" would be its own kind of
 * erasure.
 */
const MASK_CHARS = /[*·••·#]/;

/** Any letter, in any script — the test for "is there a name in here at all". */
const HAS_LETTER = /\p{L}/u;

/**
 * Is this author string one the source masked (or never had)?
 *
 * Examples that are masked: `Y***t`, `A***n`, `****`, `***`, ``, `   `.
 * Examples that are NOT:    `María García`, `Juan`, `J. Ruiz`, `Ana-Sofía`.
 */
export function isMaskedReviewer(author: string | null | undefined): boolean {
  const raw = (author ?? '').trim();
  if (raw === '') return true;
  if (MASK_CHARS.test(raw)) return true;
  // No letters anywhere — digits, symbols or leftovers of a stripped mask.
  return !HAS_LETTER.test(raw);
}

/**
 * The name to render. Readable authors are preserved verbatim, including their
 * original spacing-insensitive form; masked or absent ones become `Cliente`.
 */
export function reviewerDisplayName(author: string | null | undefined): string {
  const raw = (author ?? '').trim();
  return isMaskedReviewer(raw) ? ANONYMOUS_REVIEWER : raw;
}

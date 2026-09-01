// LAYOUT VOCABULARY — the ONE place a section's width and rhythm become classes.
//
// THE PROBLEM THIS EXISTS FOR, measured rather than assumed. Two deliberately
// opposite DesignSpecs over the same product produced genuinely different
// heroes and then converged: the identical Container literal appeared 8 and 7
// times, 6/9 and 5/8 sections carried the same `py-12 md:py-16`, and both pages
// scrolled as the same template in different colours. `design.density` did not
// help — it scales Tailwind's `--spacing` base by a single factor, which
// preserves the rhythm exactly instead of changing it.
//
// So the missing vocabulary was never per-block. It was compositional: how wide
// a section is and how much air it gets are properties of the PAGE, and the
// block genuinely does not care. A Faq is the same Faq contained or wide.
//
// WHY THIS IS NOT A `propsSchema` PROP. Props are a dial inside one
// composition, declared and owned by the capability. Width and rhythm are
// neither: they would have to be duplicated identically into all 21 propsSchema
// entries, kept in sync by the parity test, and would let a capability declare
// a fictional restriction on something it does not own. They ride on the
// SECTION INSTANCE instead, beside `order` — which is also an instance field
// no capability declares, and for exactly the same reason.
//
// WHY `standard` AND `contained` HAVE NO TOKEN. They are the template's
// existing literals reproduced verbatim, so a section with no `layout` renders
// byte-identically to today and every frozen golden stays green. Only the new
// settings needed a variable. This keeps the change additive: nothing that
// exists moves.
//
// Tailwind v4 scans SOURCE TEXT, so every entry below is a COMPLETE literal
// selected by lookup, never interpolated (ADR-4).

export type SectionWidth = 'contained' | 'wide';
export type SectionRhythm = 'tight' | 'standard' | 'spacious';

export interface SectionLayout {
  width?: SectionWidth;
  rhythm?: SectionRhythm;
}

/** Container widths. `contained` is the template's literal, character for character. */
const WIDTH = {
  contained: 'mx-auto w-full max-w-[28rem] px-5 md:max-w-[42rem] lg:max-w-[72rem] xl:max-w-[80rem]',
  wide: 'mx-auto w-full max-w-[28rem] px-5 md:max-w-[42rem] lg:max-w-[var(--content-wide)]',
} as const;

/**
 * Vertical rhythm.
 *
 * `standard` deliberately has NO entry here. Blocks do not share one baseline:
 * measured across the 21 of them, `py-12 md:py-16` appears 9 times but `py-8`
 * appears 4, `py-8 md:py-12` twice, and three more patterns once each. A single
 * global `standard` would have silently retuned every block that is not in the
 * majority — GalleryStrip/Grid would have gone from py-8 to py-12 the moment
 * this vocabulary landed, changing pages nobody asked to change.
 *
 * So `standard` means THIS BLOCK'S OWN literal, passed in as the baseline. Only
 * `tight` and `spacious` are shared tokens, because only they are new.
 */
const RHYTHM = {
  tight: 'py-[var(--section-tight)]',
  spacious: 'py-[var(--section-spacious)]',
} as const;

export const DEFAULT_WIDTH: SectionWidth = 'contained';
export const DEFAULT_RHYTHM: SectionRhythm = 'standard';

export function containerClass(width: SectionWidth = DEFAULT_WIDTH): string {
  return WIDTH[width];
}

export function rhythmClass(rhythm: SectionRhythm | undefined, baseline: string): string {
  if (rhythm === 'tight' || rhythm === 'spacious') return RHYTHM[rhythm];
  return baseline;
}

/** Every value the contract may accept, derived from the lookups themselves. */
export const SECTION_WIDTHS = Object.keys(WIDTH) as SectionWidth[];
export const SECTION_RHYTHMS: SectionRhythm[] = ['tight', 'standard', 'spacious'];

// The ONE selector for socialProof/ReviewsReel, shared by every variant.
//
// WHY THIS FILE EXISTS: `carousel` and `grid` are different COMPOSITIONS of
// the same content. If each one re-declared `testimonials.filter(...)` and its
// own emptiness guard, the capability would have two sources of truth for
// what "a reel review" is, and a third variant would quietly add a third.
// The registry declares `requiresData: ['testimonials:reel']` ONCE; this is
// the runtime half of that same statement, also once.
//
// The guard is a BACKSTOP, not the primary validation — see the header of
// Carousel.astro for the full chain and for the rule on when a component
// earns a guard at all.
import { testimonials } from '@/data/testimonials';
import type { Testimonial } from '@/types/content';
import { reviewerDisplayName } from '@/lib/reviewer-identity';

/** The discriminator every ReviewsReel variant renders. Declared once. */
export const REEL_VARIANT = 'reel' as const;

/**
 * The reel reviews, or a hard failure.
 *
 * `composedBy` names the variant in the error so the operator is told which
 * section to fix, not merely that "something" was empty.
 */
export function reelReviews(composedBy: string): Testimonial[] {
  const reviews = testimonials.filter((t) => t.variant === REEL_VARIANT);

  if (reviews.length === 0) {
    throw new Error(
      `ReviewsReel (variant "${composedBy}") was composed into this landing, but ` +
        `src/data/testimonials.ts contains no testimonial with variant "${REEL_VARIANT}" — ` +
        'the section would render with no reviews at all.\n' +
        'FIX ONE OF THESE:\n' +
        `  - add at least one testimonial with variant "${REEL_VARIANT}" to src/data/testimonials.ts, or\n` +
        '  - remove the socialProof/ReviewsReel section from src/data/design.ts.\n' +
        'This should have been caught upstream: the capability declares ' +
        'requiresData: ["testimonials:reel"] at BOTH variants, and checkDesignSupport() ' +
        'rejects the pairing at design time and again at generation time. Reaching this ' +
        'throw means a DesignSpec bypassed both gates.',
    );
  }

  // DISPLAY NAMES, resolved HERE rather than inside the carousel island.
  //
  // The island receives its reviews as SERIALIZED PROPS on the <astro-island>
  // element, so deriving the name client-side still shipped the raw `Y***t`
  // into the page source: the visible text said "Cliente" while view-source
  // said otherwise. Caught by grepping a real generated build, not by a test.
  //
  // The raw author stays intact in src/data/testimonials.ts and in
  // CanonicalProduct — the mask is provenance and is not destroyed. What
  // crosses to the client is only what is actually rendered.
  return reviews.map((t) => ({ ...t, author: reviewerDisplayName(t.author) }));
}

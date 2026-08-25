// The ONE accessor for socialProof/UgcStrip, shared by every variant.
//
// DELIBERATELY THINNER than its two siblings, because there is less to share:
//
//   ReviewsReel   reel-reviews.ts   selects on a discriminator (.filter)
//   GalleryStrip  gallery-images.ts a real commerce decision, async
//   UgcStrip      this file         a direct read — Media.astro already owns
//                                   asset resolution, so nothing is mapped here
//
// It exists anyway for the ONE thing that IS shared and must never diverge:
// the emptiness guard. If each variant carried its own, a new variant could
// ship without one and become the quiet way around the data gate. Extracting a
// resolver with no resolution in it would be fiction; extracting the invariant
// is not.
import { product } from '@/data/product';
import type { MediaRef } from '@/types/content';

/**
 * The UGC pieces this landing should show, or a hard failure.
 *
 * `composedBy` names the variant in the error so the operator is told which
 * section to fix, not merely that "something" was empty.
 */
export function ugcItems(composedBy: string): MediaRef[] {
  // WIDENED ON PURPOSE. src/data/product.ts is authored `as const satisfies
  // Product`, so within THIS template `product.ugc` has a six-element tuple
  // type and TypeScript reports the emptiness check below as statically
  // impossible (ts2367). It is not: generate-landing.mjs rewrites product.ts
  // for every generated landing, and that document's `ugc` can be empty. The
  // function's contract is over MediaRef[], so it reads its input as MediaRef[].
  const items: MediaRef[] = [...product.ugc];

  if (items.length === 0) {
    throw new Error(
      `UgcStrip (variant "${composedBy}") was composed into this landing, but ` +
        '`ugc` in src/data/product.ts is empty — the section would render as empty padding.\n' +
        'FIX ONE OF THESE:\n' +
        '  - add at least one entry to `ugc` in src/data/product.ts, or\n' +
        '  - remove the socialProof/UgcStrip section from src/data/design.ts.\n' +
        'This should have been caught upstream: the capability declares ' +
        'requiresData: ["product.ugc"] at BOTH variants, and checkDesignSupport() ' +
        'rejects the pairing at design time and again at generation time. Reaching this ' +
        'throw means a DesignSpec bypassed both gates.',
    );
  }

  return items;
}

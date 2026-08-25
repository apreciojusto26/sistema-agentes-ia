// The ONE answer to "which images is the hero showing" — shared by
// hero/Hero/default, hero/Hero/split and hero/Hero/editorial.
//
// Deliberately thin, and deliberately WITHOUT a fail-closed guard, unlike the
// accessors of the six capabilities converted before this one.
//
// Those guards were introduced where an empty collection produced a section
// that rendered its chrome around nothing — a dark band with carousel arrows
// and no reviews inside. The hero has no such failure mode: every media slot
// below is already behind a truthiness check, so a hero with an empty gallery
// renders its headline, subtagline and pills and simply carries no imagery.
// That is the behaviour BOTH variants have had since 4732910 / 19f60d5, and
// this migration is behaviour-preserving by contract — adding a throw here
// would be a new functional decision smuggled in under a taxonomy change.
//
// Composition is still gated: every variant declares `product.gallery` in
// requiresData, so unmetRequirements() keeps an empty-gallery landing from
// ever selecting a hero that wanted images.
//
// WHAT THIS DOES NOT DO: slice, pad, reorder or cap. Each variant decides how
// many pieces its composition uses (default takes three, split takes one,
// editorial takes up to three) and degrades on its own. Centralising that here
// would make the accessor answer a COMPOSITION question, and the next variant
// would need a fourth branch inside a module whose whole job is to have none.
import { product } from '@/data/product';
import type { MediaRef } from '@/types/content';

/**
 * `variant` is accepted but unused: it exists so a future variant cannot quietly
 * introduce a SECOND source of hero imagery without touching this signature.
 */
export function heroGallery(_variant: 'default' | 'split' | 'editorial'): MediaRef[] {
  // src/data/product.ts is `as const satisfies Product`, so widen the readonly
  // tuple exactly the way comparison-rows.ts does.
  return [...product.gallery];
}

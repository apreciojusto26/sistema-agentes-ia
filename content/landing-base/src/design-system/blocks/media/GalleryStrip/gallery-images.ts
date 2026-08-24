// The ONE image resolver for media/GalleryStrip, shared by every variant.
//
// Same rule as blocks/social-proof/ReviewsReel/reel-reviews.ts: `strip` and
// `grid` are different COMPOSITIONS of the same images. The mapping below is
// NOT a filter over a static array — it is a real decision with a commerce
// dependency (Shopify's images win over the locally authored gallery, and the
// local path is async because it reads image metadata). Re-declaring it per
// variant would give the capability two answers to "which images are these",
// and the second variant would drift the moment the commerce rule changes.
//
// The registry declares `requiresData: ['product.gallery']` once; this is the
// runtime half of the same statement, also once.
import { product } from '@/data/product';
import { getProductCommerce } from '@/lib/shopify/catalog';
import { resolveMediaList, resolveShopifyImages } from '@/lib/resolve-media';
import type { ResolvedImage } from '@/types/content';

/**
 * The gallery images this landing should show, or a hard failure.
 *
 * `composedBy` names the variant in the error so the operator is told which
 * section to fix, not merely that "something" was empty.
 *
 * COMMERCE PRECEDENCE IS PRESERVED EXACTLY: when the Shopify product carries
 * images they win, otherwise the locally authored `product.gallery` is
 * resolved. getProductCommerce() is memoized in lib/shopify/catalog.ts, so
 * calling it here costs no extra network round-trip — 05-buy-box.astro and
 * 15-sticky-bar.astro already await it in the same build.
 */
export async function galleryImages(composedBy: string): Promise<ResolvedImage[]> {
  const commerce = await getProductCommerce();

  const images =
    commerce.images.length > 0
      ? resolveShopifyImages(commerce.images, 'gallery')
      : await resolveMediaList(product.gallery, 'gallery');

  if (images.length === 0) {
    throw new Error(
      `GalleryStrip (variant "${composedBy}") was composed into this landing, but it resolved ` +
        'to zero images — neither the Shopify product nor src/data/product.ts `gallery` ' +
        'provided any. The section would render as empty padding.\n' +
        'FIX ONE OF THESE:\n' +
        '  - add at least one entry to `gallery` in src/data/product.ts, or\n' +
        '  - remove the media/GalleryStrip section from src/data/design.ts.\n' +
        'This should have been caught upstream: the capability declares ' +
        'requiresData: ["product.gallery"] at BOTH variants, and checkDesignSupport() ' +
        'rejects the pairing at design time and again at generation time. Reaching this ' +
        'throw means a DesignSpec bypassed both gates.',
    );
  }

  return images;
}

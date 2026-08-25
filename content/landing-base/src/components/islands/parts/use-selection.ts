import { useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { $cart, pruneStaleLine } from '@/stores/cart';
import { $selectedPackId, $selectedVariantId } from '@/stores/checkout';
import { projectPack } from '@/lib/shopify/pricing';
import type { ProductCommerce, VariantOption } from '@/lib/shopify/types';
import type { PricePack } from '@/types/content';

interface UseSelectionArgs {
  commerce: ProductCommerce;
  packs: PricePack[];
  bundleOfferActive: boolean;
}

export interface Selection {
  variant: VariantOption;
  pack: PricePack;
  projection: ReturnType<typeof projectPack>;
  totalCents: number;
  cart: ReturnType<typeof $cart.get>;
}

let prunedOnce = false;

/**
 * Whether this landing was GENERATED without commerce.
 *
 * Read from the same explicit `PUBLIC_COMMERCE_MODE` the server side uses, and
 * NOT inferred from `variants` being empty. The distinction is the whole point:
 *
 *   preview + 0 variants  -> a valid, non-purchasable page
 *   shopify + 0 variants  -> an ERROR, exactly as before
 *
 * Inferring from the empty list would turn a genuine Shopify failure into a
 * silent "looks fine" page, which is the failure mode this system forbids.
 * `PUBLIC_` vars are inlined into the client bundle by Vite, so the island can
 * read it without any extra prop threading through the Astro sections.
 */
function isPreviewMode(): boolean {
  return (import.meta.env.PUBLIC_COMMERCE_MODE as string | undefined)?.trim() === 'preview';
}

/**
 * Single source of truth for the (variant, pack) tuple + derived price.
 * Called by BOTH islands so they can never disagree (design decision #8).
 *
 * Returns `null` when the landing is in preview mode and therefore has NO
 * variant to select. `null` means "there is no selection", which is a real
 * state — deliberately not a placeholder object: a synthetic variant or a 0
 * price would put a number on screen that nobody set.
 */
export function useSelection({ commerce, packs, bundleOfferActive }: UseSelectionArgs): Selection | null {
  const selectedVariantId = useStore($selectedVariantId);
  const selectedPackId = useStore($selectedPackId);
  const cart = useStore($cart);

  useEffect(() => {
    if (prunedOnce) return;
    prunedOnce = true;
    pruneStaleLine(new Set(commerce.variants.map((v) => v.id)));
  }, [commerce]);

  const defaultPack = packs.find((p) => p.default) ?? packs[0];
  if (!defaultPack) {
    throw new Error('product.packs is empty — at least one pack with default:true is required');
  }

  const defaultVariant =
    commerce.variants.find((v) => v.id === commerce.defaultVariantId) ?? commerce.variants[0];
  if (!defaultVariant) {
    // Preview: no variants is the expected state, so there is no selection.
    if (isPreviewMode()) return null;
    // Shopify: unchanged. Zero variants here still means something upstream
    // failed and must be loud.
    throw new Error('commerce.variants is empty — build should have failed loudly before reaching this point');
  }

  const variant = commerce.variants.find((v) => v.id === selectedVariantId) ?? defaultVariant;
  const pack = packs.find((p) => p.id === selectedPackId) ?? defaultPack;

  const projection = projectPack(variant, pack, bundleOfferActive);
  const totalCents = cart ? cart.totalCents : projection.priceCents;

  return { variant, pack, projection, totalCents, cart };
}

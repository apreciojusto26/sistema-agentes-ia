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

interface Selection {
  variant: VariantOption;
  pack: PricePack;
  projection: ReturnType<typeof projectPack>;
  totalCents: number;
  cart: ReturnType<typeof $cart.get>;
}

let prunedOnce = false;

/**
 * Single source of truth for the (variant, pack) tuple + derived price.
 * Called by BOTH islands so they can never disagree (design decision #8).
 */
export function useSelection({ commerce, packs, bundleOfferActive }: UseSelectionArgs): Selection {
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

  // catalog.ts already resolves the preferred landing variant (the 6-film
  // option); trusting defaultVariantId keeps that decision in ONE place
  // instead of re-deciding it per island.
  const defaultVariant =
    commerce.variants.find((v) => v.id === commerce.defaultVariantId) ?? commerce.variants[0];
  if (!defaultVariant) {
    throw new Error('commerce.variants is empty — build should have failed loudly before reaching this point');
  }

  const variant = commerce.variants.find((v) => v.id === selectedVariantId) ?? defaultVariant;
  const pack = packs.find((p) => p.id === selectedPackId) ?? defaultPack;

  const projection = projectPack(variant, pack, bundleOfferActive);
  const totalCents = cart ? cart.totalCents : projection.priceCents;

  return { variant, pack, projection, totalCents, cart };
}

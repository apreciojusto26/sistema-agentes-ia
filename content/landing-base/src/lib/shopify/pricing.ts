import type { PackProjection, VariantOption } from '@/lib/shopify/types';
import type { PricePack } from '@/types/content';

/**
 * The ONLY place a pre-cart price is computed. Pure, shared by both islands
 * via use-selection.ts so BundleSelector and StickyAddToCart can never disagree.
 * Superseded by cart.cost once a real cart exists.
 */
export function projectPack(v: VariantOption, pack: PricePack, offerActive: boolean): PackProjection {
  const totalUnits = pack.units + pack.freeUnits;
  const claimsFreeUnits = offerActive && pack.freeUnits > 0;
  const paidUnits = claimsFreeUnits ? pack.units : totalUnits; // honest when BXGY is off
  const priceCents = v.unitPriceCents * paidUnits;
  const compareAtCents = (v.unitCompareAtCents ?? v.unitPriceCents) * totalUnits;

  return {
    packId: pack.id,
    totalUnits,
    paidUnits,
    priceCents,
    compareAtCents,
    savingsCents: Math.max(0, compareAtCents - priceCents),
    claimsFreeUnits,
  };
}

/** Suppresses "gratis" pack copy until BXGY is verified live in Shopify admin (design decision #9). */
export function packDisplayLabel(pack: PricePack, projection: PackProjection): string {
  return projection.claimsFreeUnits ? pack.label : `${projection.totalUnits} unidades`;
}

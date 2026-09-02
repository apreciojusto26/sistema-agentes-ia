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
  const discountPercent = pack.discountPercent ?? 0;
  if (discountPercent < 0 || discountPercent > 100) {
    throw new RangeError(`Pack discountPercent must be between 0 and 100; received ${discountPercent}`);
  }

  const basePriceCents = v.unitPriceCents * paidUnits;
  // BXGY wins when active: applying both would silently stack two promotions.
  // Otherwise round the final percentage-adjusted total to the nearest cent.
  const priceCents = claimsFreeUnits
    ? basePriceCents
    : Math.round(basePriceCents * ((100 - discountPercent) / 100));
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

/**
 * Badge copy derives from the same configuration that changes price. Once an
 * authoritative cart exists, suppress the claim unless Shopify confirms the
 * exact projected total.
 */
export function packDiscountBadge(
  pack: PricePack,
  projection: PackProjection,
  authoritativeTotalCents: number | null,
): string | null {
  if (!pack.discountPercent) return null;
  if (authoritativeTotalCents !== null && authoritativeTotalCents !== projection.priceCents) return null;
  return `${pack.discountPercent}% de descuento`;
}

/** Suppresses "gratis" pack copy until BXGY is verified live in Shopify admin (design decision #9). */
export function packDisplayLabel(pack: PricePack, projection: PackProjection): string {
  if (projection.claimsFreeUnits) return pack.label;
  return `${projection.totalUnits} ${projection.totalUnits === 1 ? 'unidad' : 'unidades'}`;
}

import type { CartSnapshot, PackProjection } from '@/lib/shopify/types';
import { formatPrice } from '@/lib/format';
import type { PricePack } from '@/types/content';

interface PriceRowProps {
  pack: PricePack;
  projection: PackProjection;
  cart: CartSnapshot | null;
}

/**
 * Props-driven — the projection (and, once a cart exists, cart.cost) is the
 * ONLY source of truth. Savings pill logic (design's PriceRow spec):
 *  - no cart:   show pill when projection.savingsCents > 0
 *  - with cart: show pill when cart.discountCents > 0
 *  - with cart, pack.freeUnits > 0, discountCents === 0: NO pill — the
 *    un-configured-BXGY state is surfaced via the shared aria-live region
 *    in BundleSelector, not here.
 */
export function PriceRow({ projection, cart }: PriceRowProps) {
  const totalCents = cart ? cart.totalCents : projection.priceCents;
  const compareAtCents = projection.compareAtCents;

  const showSavingsPill = cart ? cart.discountCents > 0 : projection.savingsCents > 0;
  const savingsCents = cart ? cart.discountCents : projection.savingsCents;

  const hasContent = compareAtCents > totalCents || (showSavingsPill && savingsCents > 0);
  if (!hasContent) return null;

  return (
    <div className="flex flex-wrap items-baseline gap-2">
      {compareAtCents > totalCents && (
        <span className="text-sm text-steel line-through tabular-nums">{formatPrice(compareAtCents)}</span>
      )}
      {showSavingsPill && savingsCents > 0 && (
        <span className="rounded-pill bg-grape-tint px-2.5 py-1 text-xs font-bold text-grape tabular-nums">
          Ahorrás {formatPrice(savingsCents)}
        </span>
      )}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useStore } from '@nanostores/react';
import { $cartStatus, checkout, syncCartLine } from '@/stores/cart';
import { $isLightboxOpen } from '@/stores/ui';
import { useSelection } from '@/components/islands/parts/use-selection';
import { PlaceholderShot } from '@/components/islands/parts/PlaceholderShot';
import { formatPrice } from '@/lib/format';
import { packDisplayLabel } from '@/lib/shopify/pricing';
import { centsToUnits, trackEvent } from '@/lib/analytics';
import type { ProductCommerce } from '@/lib/shopify/types';
import type { PricePack } from '@/types/content';
import type { ResolvedImage } from '@/types/content';

interface StickyAddToCartProps {
  commerce: ProductCommerce;
  packs: PricePack[];
  bundleOfferActive: boolean;
  ctaLabel: string;
  pendingLabel: string;
  soldOutLabel: string;
  checkoutLabel: string;
  thumb: ResolvedImage | null;
  /** R4: sentinel is the END of Hero (#hero-end), NOT #buybox-end. */
  sentinelId: string;
}

export function StickyAddToCart({
  commerce,
  packs,
  bundleOfferActive,
  ctaLabel,
  pendingLabel,
  soldOutLabel,
  checkoutLabel,
  thumb,
  sentinelId,
}: StickyAddToCartProps) {
  const [pastSentinel, setPastSentinel] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const isLightboxOpen = useStore($isLightboxOpen);
  const cartStatus = useStore($cartStatus);
  const { variant, pack, projection, totalCents, cart } = useSelection({ commerce, packs, bundleOfferActive });

  useEffect(() => {
    const sentinel = document.getElementById(sentinelId);
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        // Sentinel out of view above the viewport => scrolled past it => show sticky bar.
        setPastSentinel(!entry.isIntersecting && entry.boundingClientRect.top < 0);
      },
      { threshold: 0 },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [sentinelId]);

  const visible = pastSentinel && !isLightboxOpen && !dismissed;
  const isPending = cartStatus === 'creating' || cartStatus === 'updating' || cartStatus === 'restoring';
  const soldOut = !variant.availableForSale;
  // Mirror BundleSelector's decision logic so the sticky bar and buy box can
  // never disagree: checkout only when the live cart line matches the current
  // selection; otherwise add-to-cart (syncCartLine handles create/add/update).
  const inSync = !!cart?.line && cart.line.variantId === variant.id && cart.line.quantity === projection.totalUnits;

  const handleClick = () => {
    if (cart?.line && inSync) {
      checkout();
      return;
    }
    trackEvent('add_to_cart', {
      currency: commerce.currencyCode,
      value: centsToUnits(projection.priceCents),
      items: [
        {
          item_id: variant.id,
          item_name: commerce.title,
          price: centsToUnits(variant.unitPriceCents),
          quantity: projection.totalUnits,
        },
      ],
    });
    void syncCartLine(variant.id, projection.totalUnits);
  };

  const ctaText = soldOut ? soldOutLabel : isPending ? pendingLabel : cart?.line && inSync ? checkoutLabel : ctaLabel;

  return (
    <div
      data-show={visible}
      aria-hidden={!visible}
      inert={!visible ? true : undefined}
      className="fixed inset-x-0 bottom-0 z-40 translate-y-full border-t border-graphite/10 bg-surface/95 pb-[env(safe-area-inset-bottom)] shadow-sticky backdrop-blur transition-transform duration-300 motion-reduce:transition-none data-[show=true]:translate-y-0"
    >
      <div className="flex items-center gap-3 px-5 py-3">
        <div className="size-11 shrink-0 overflow-hidden rounded-tile">
          {thumb ? (
            thumb.placeholder ? (
              <PlaceholderShot ratio="1/1" alt={thumb.alt} rounded="rounded-tile" className="size-full" />
            ) : (
              <img src={thumb.src} alt="" aria-hidden="true" className="size-full object-cover" />
            )
          ) : (
            <PlaceholderShot ratio="1/1" alt={commerce.title} rounded="rounded-tile" className="size-full" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-graphite">{commerce.title}</p>
          <p className="truncate text-xs text-steel">
            {variant.title} · {packDisplayLabel(pack, projection)}
          </p>
        </div>

        <button
          type="button"
          onClick={handleClick}
          disabled={soldOut || isPending}
          tabIndex={visible ? 0 : -1}
          aria-busy={isPending}
          className="flex h-11 shrink-0 items-center justify-center gap-2 rounded-pill bg-rust px-4 font-display text-sm font-bold tracking-wide text-white shadow-lift transition active:scale-[.99] hover:bg-rust-dark disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span className="tabular-nums">{formatPrice(totalCents)}</span>
          <span>{ctaText}</span>
        </button>

        <button
          type="button"
          onClick={() => setDismissed(true)}
          tabIndex={visible ? 0 : -1}
          aria-label="Cerrar"
          className="flex size-9 shrink-0 items-center justify-center rounded-tile text-steel transition hover:bg-bone-dim hover:text-graphite"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="size-5"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// PRESENTATION of the buy action, not an implementation of it.
//
// This file used to carry its own copy of BundleSelector's commercial
// decisions, under a comment promising the two "can never disagree". They now
// SHARE that decision through useBuyAction() instead of mirroring it, which is
// the difference between an invariant and a hope. What is left here is the
// sticky bar: the sentinel observer, visibility, dismissal, thumbnail and CTA.
//
// parts/buy-action.contract.test.ts fails if that logic comes back.
import { useEffect, useState } from 'react';
import { useStore } from '@nanostores/react';
import { $isLightboxOpen } from '@/stores/ui';
import { useBuyAction } from '@/components/islands/parts/use-buy-action';
import { PlaceholderShot } from '@/components/islands/parts/PlaceholderShot';
import { formatPrice } from '@/lib/format';
import { packDisplayLabel } from '@/lib/shopify/pricing';
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
  // Same hook, same decision, different labels: the sticky bar says
  // `cta.sticky` where the buy box says `cta.primary`. Copy is a presentation
  // concern; which copy APPLIES is not.
  const {
    selection,
    ctaLabel: ctaText,
    ctaDisabled,
    ariaBusy,
    onCta,
  } = useBuyAction({
    commerce,
    packs,
    bundleOfferActive,
    cta: { primary: ctaLabel, checkout: checkoutLabel, pending: pendingLabel, soldOut: soldOutLabel },
  });

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

  // PREVIEW MODE — placed AFTER every hook so the hook order stays stable
  // across renders. The bar keeps its position in the layout so the page can
  // be evaluated as a whole, but carries no price and no cart action.
  // `useSelection` returns null only in preview; Shopify mode still throws on
  // an empty variant list, so this can never mask a real commerce failure. The
  // branch stays HERE rather than in the hook because the bar renders
  // unavailability as a bar, and the buy box renders it as a block.
  if (!selection) {
    return (
      <div
        data-show={visible}
        aria-hidden={!visible}
        inert={!visible ? true : undefined}
        className="fixed inset-x-0 bottom-0 z-40 translate-y-full border-t border-graphite/10 bg-surface/95 pb-[env(safe-area-inset-bottom)] shadow-sticky backdrop-blur transition-transform duration-300 motion-reduce:transition-none data-[show=true]:translate-y-0"
      >
        <div className="flex items-center gap-3 px-5 py-3">
          <p className="min-w-0 flex-1 truncate text-sm text-steel">Vista previa — compra no disponible</p>
          <button
            type="button"
            disabled
            aria-disabled="true"
            data-preview-cta="true"
            className="flex h-11 shrink-0 items-center justify-center gap-2 rounded-pill bg-rust px-4 font-display text-sm font-bold tracking-wide text-white shadow-lift disabled:cursor-not-allowed disabled:opacity-60"
          >
            No disponible
          </button>
        </div>
      </div>
    );
  }

  const { variant, pack, projection, totalCents } = selection;

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
          onClick={onCta}
          disabled={ctaDisabled}
          tabIndex={visible ? 0 : -1}
          aria-busy={ariaBusy}
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

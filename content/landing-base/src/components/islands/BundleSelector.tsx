import { useId, useMemo } from 'react';
import { useStore } from '@nanostores/react';
import { $cartError, $cartStatus, checkout, syncCartLine } from '@/stores/cart';
import { $selectedPackId, $selectedVariantId } from '@/stores/checkout';
import { useSelection } from '@/components/islands/parts/use-selection';
import { PriceRow } from '@/components/islands/parts/PriceRow';
import { VariantPicker } from '@/components/islands/parts/VariantPicker';
import { packDisplayLabel, projectPack } from '@/lib/shopify/pricing';
import { formatPrice } from '@/lib/format';
import { centsToUnits, trackEvent } from '@/lib/analytics';
import type { ProductCommerce } from '@/lib/shopify/types';
import type { PricePack, ProductErrorCopy } from '@/types/content';

interface BundleSelectorProps {
  commerce: ProductCommerce;
  packs: PricePack[];
  bundleOfferActive: boolean;
  variantGroupLabel: string;
  cta: { primary: string; checkout: string; pending: string; soldOut: string };
  errors: ProductErrorCopy;
  giftThresholdUnits: number;
  giftLabel: string;
}

export function BundleSelector({
  commerce,
  packs,
  bundleOfferActive,
  variantGroupLabel,
  cta,
  errors,
  giftThresholdUnits,
  giftLabel,
}: BundleSelectorProps) {
  const groupName = useId();
  const cartStatus = useStore($cartStatus);
  const cartError = useStore($cartError);
  const selection = useSelection({ commerce, packs, bundleOfferActive });

  // PREVIEW MODE: the landing was generated without commerce, so there is no
  // variant, no price and nothing to add to a cart. The buy box keeps its
  // place in the layout — the point of a preview is evaluating the whole page
  // — but renders a disabled control and NO monetary value. A 0, a struck-out
  // "was" price or a synthetic variant would all put a number on screen that
  // nobody set. `useSelection` returns null only in preview; in Shopify mode
  // an empty variant list still throws.
  if (!selection) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-steel">Vista previa — esta landing todavía no tiene producto conectado.</p>
        <button
          type="button"
          disabled
          aria-disabled="true"
          data-preview-cta="true"
          className="flex h-14 w-full items-center justify-center gap-2 rounded-pill bg-rust px-6 font-display text-base font-bold tracking-wide text-white shadow-lift disabled:cursor-not-allowed disabled:opacity-60"
        >
          Vista previa — compra no disponible
        </button>
      </div>
    );
  }

  const { variant, pack, projection, cart } = selection;

  const isPending = cartStatus === 'creating' || cartStatus === 'updating' || cartStatus === 'restoring';
  const soldOut = !variant.availableForSale;
  const inSync = !!cart?.line && cart.line.variantId === variant.id && cart.line.quantity === projection.totalUnits;

  let ctaLabel = cta.primary;
  let ctaDisabled = false;
  let ariaBusy = false;

  if (soldOut) {
    ctaLabel = cta.soldOut;
    ctaDisabled = true;
  } else if (isPending) {
    ctaLabel = cta.pending;
    ctaDisabled = true;
    ariaBusy = true;
  } else if (cart?.line && inSync) {
    ctaLabel = cta.checkout;
  }

  const handleCta = () => {
    if (ctaDisabled) return;
    if (cart?.line && inSync) {
      checkout();
    } else {
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
    }
  };

  const announcement = useMemo(() => {
    if (cartError) return errors[cartError] ?? errors.generic;
    if (cart?.line && pack.freeUnits > 0 && cart.discountCents === 0) return errors.noDiscount;
    return `${variant.title}. ${packDisplayLabel(pack, projection)}. Total: ${formatPrice(cart ? cart.totalCents : projection.priceCents)}.`;
  }, [cartError, cart, pack, variant, projection, errors]);

  const giftProgress = Math.min(1, pack.units / giftThresholdUnits);

  return (
    <div className="space-y-4">
      <PriceRow pack={pack} projection={projection} cart={cart} />

      <VariantPicker
        variants={commerce.variants}
        selectedId={variant.id}
        onSelect={(id) => $selectedVariantId.set(id)}
        label={variantGroupLabel}
      />

      <div role="radiogroup" aria-label="Elige tu pack" className="space-y-3">
        {packs.map((p) => {
          const checked = p.id === pack.id;
          const pProjection = projectPack(variant, p, bundleOfferActive);

          return (
            <label
              key={p.id}
              className="has-[:checked]:border-rust has-[:checked]:bg-rust-tint has-[:checked]:shadow-lift relative flex items-center gap-3 rounded-tile border-2 border-graphite/10 bg-white p-4 transition"
            >
              {p.popular && p.badge && (
                <span className="absolute -top-2.5 left-4 rounded-pill bg-rust px-2.5 py-0.5 text-[0.625rem] font-black uppercase tracking-widest text-white shadow-card">
                  {p.badge}
                </span>
              )}
              <input
                type="radio"
                name={groupName}
                value={p.id}
                checked={checked}
                onChange={() => $selectedPackId.set(p.id)}
                className="peer sr-only"
              />
              <span className="peer-checked:border-[6px] peer-checked:border-rust size-5 shrink-0 rounded-full border-2 border-steel-light" aria-hidden="true" />
              <span className="flex-1">
                <span className="block font-display font-bold text-graphite">{packDisplayLabel(p, pProjection)}</span>
                {p.sublabel && <span className="block text-xs text-steel">{p.sublabel}</span>}
              </span>
              <span className="text-right">
                <span className="block font-display font-bold tabular-nums text-graphite">
                  {formatPrice(pProjection.priceCents)}
                </span>
                {pProjection.compareAtCents > pProjection.priceCents && (
                  <span className="block text-xs text-steel line-through tabular-nums">
                    {formatPrice(pProjection.compareAtCents)}
                  </span>
                )}
              </span>
            </label>
          );
        })}
      </div>

      {bundleOfferActive && (
        <div>
          <div className="flex items-center justify-between text-xs font-medium text-steel">
            <span>{giftLabel}</span>
            <span className="tabular-nums">{Math.round(giftProgress * 100)}%</span>
          </div>
          <div className="mt-1 h-2 rounded-pill bg-graphite/10">
            <div
              className="h-full rounded-pill bg-gold transition-[width] duration-300"
              style={{ width: `${giftProgress * 100}%` }}
            />
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={handleCta}
        disabled={ctaDisabled}
        aria-busy={ariaBusy}
        className="flex h-14 w-full items-center justify-center gap-2 rounded-pill bg-rust px-6 font-display text-base font-bold tracking-wide text-white shadow-lift transition active:scale-[.99] hover:bg-rust-dark disabled:cursor-not-allowed disabled:opacity-60"
      >
        {ctaLabel}
      </button>
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}

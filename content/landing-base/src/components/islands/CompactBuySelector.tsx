// PRESENTATION of the buy action — the compact one.
//
// A SEPARATE COMPONENT, NOT A `presentation` PROP ON BundleSelector. That prop
// would have branched the whole DOM from inside one island, which is exactly
// the shape this design system forbids: `propsSchema` is a dial inside one
// composition, `variant` is the composition. A prop that swaps the pack control,
// the surface and the trust block is a variant wearing a prop's clothes.
//
// It duplicates NO commerce. Every commercial decision — availability, cart
// sync, in-flight status, CTA label, add-to-cart vs checkout — arrives from the
// same useBuyAction() BundleSelector and StickyAddToCart consume, and
// parts/buy-action.contract.test.ts fails if any of it reappears here. The
// shared primitives (PriceRow, VariantPicker) are reused as-is rather than
// re-styled copies.
//
// WHAT IS ACTUALLY DIFFERENT, in DOM terms:
//   BundleSelector  packs are a vertical stack of bordered tiles, each with an
//                   absolutely-positioned ribbon, a radio dot, a sublabel and a
//                   right-aligned price column; the gift offer is a meter.
//   here            packs are a horizontal segmented control of pills — no dot,
//                   no ribbon, no sublabel, label and price on one line; the
//                   gift offer is an inline badge.
import { useId, useMemo } from 'react';
import { useStore } from '@nanostores/react';
import { $cartError } from '@/stores/cart';
import { $selectedPackId, $selectedVariantId } from '@/stores/checkout';
import { useBuyAction } from '@/components/islands/parts/use-buy-action';
import { PriceRow } from '@/components/islands/parts/PriceRow';
import { VariantPicker } from '@/components/islands/parts/VariantPicker';
import { packDisplayLabel, projectPack } from '@/lib/shopify/pricing';
import { formatPrice } from '@/lib/format';
import type { ProductCommerce } from '@/lib/shopify/types';
import type { PricePack, ProductErrorCopy } from '@/types/content';

interface CompactBuySelectorProps {
  commerce: ProductCommerce;
  packs: PricePack[];
  bundleOfferActive: boolean;
  variantGroupLabel: string;
  cta: { primary: string; checkout: string; pending: string; soldOut: string };
  errors: ProductErrorCopy;
  giftThresholdUnits: number;
  giftLabel: string;
}

export function CompactBuySelector({
  commerce,
  packs,
  bundleOfferActive,
  variantGroupLabel,
  cta,
  errors,
  giftThresholdUnits,
  giftLabel,
}: CompactBuySelectorProps) {
  const groupName = useId();
  const cartError = useStore($cartError);
  const { selection, ctaLabel, ctaDisabled, ariaBusy, onCta } = useBuyAction({
    commerce,
    packs,
    bundleOfferActive,
    cta,
  });

  // PREVIEW MODE, same semantics as its siblings and rendered its own way: a
  // single line and a disabled control, with NO monetary value anywhere. The
  // signal is shared (`selection === null` from the hook); only the markup is
  // this component's own.
  if (!selection) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <p className="min-w-0 flex-1 text-sm text-steel">
          Vista previa — esta landing todavía no tiene producto conectado.
        </p>
        <button
          type="button"
          disabled
          aria-disabled="true"
          data-preview-cta="true"
          className="flex h-12 shrink-0 items-center justify-center rounded-pill bg-rust px-5 font-display text-sm font-bold tracking-wide text-white shadow-lift disabled:cursor-not-allowed disabled:opacity-60"
        >
          Vista previa — compra no disponible
        </button>
      </div>
    );
  }

  const { variant, pack, projection, cart } = selection;

  const announcement = useMemo(() => {
    if (cartError) return errors[cartError] ?? errors.generic;
    if (cart?.line && pack.freeUnits > 0 && cart.discountCents === 0) return errors.noDiscount;
    return `${variant.title}. ${packDisplayLabel(pack, projection)}. Total: ${formatPrice(cart ? cart.totalCents : projection.priceCents)}.`;
  }, [cartError, cart, pack, variant, projection, errors]);

  const giftUnlocked = bundleOfferActive && pack.units >= giftThresholdUnits;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <PriceRow pack={pack} projection={projection} cart={cart} />
        {giftUnlocked && (
          <span className="rounded-pill bg-gold-tint px-2.5 py-1 text-xs font-bold text-gold">{giftLabel}</span>
        )}
      </div>

      <VariantPicker
        variants={commerce.variants}
        selectedId={variant.id}
        onSelect={(id) => $selectedVariantId.set(id)}
        label={variantGroupLabel}
      />

      <div role="radiogroup" aria-label="Elige tu pack" className="flex flex-wrap gap-2">
        {packs.map((p) => {
          const checked = p.id === pack.id;
          const pProjection = projectPack(variant, p, bundleOfferActive);

          return (
            <label
              key={p.id}
              className="has-[:checked]:border-rust has-[:checked]:bg-rust-tint has-[:checked]:text-rust flex cursor-pointer items-baseline gap-2 rounded-pill border border-graphite/15 bg-white px-3.5 py-2 text-xs font-semibold text-graphite transition"
            >
              <input
                type="radio"
                name={groupName}
                value={p.id}
                checked={checked}
                onChange={() => $selectedPackId.set(p.id)}
                className="sr-only"
              />
              <span>{packDisplayLabel(p, pProjection)}</span>
              <span className="font-display font-bold tabular-nums">{formatPrice(pProjection.priceCents)}</span>
            </label>
          );
        })}
      </div>

      <button
        type="button"
        onClick={onCta}
        disabled={ctaDisabled}
        aria-busy={ariaBusy}
        className="flex h-12 w-full items-center justify-center rounded-pill bg-rust px-5 font-display text-sm font-bold tracking-wide text-white shadow-lift transition active:scale-[.99] hover:bg-rust-dark disabled:cursor-not-allowed disabled:opacity-60"
      >
        {ctaLabel}
      </button>
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}

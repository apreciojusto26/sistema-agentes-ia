// THE ONE BUY DECISION, shared by every presentation of it.
//
// WHY THIS EXISTS. BundleSelector and StickyAddToCart are two presentations of
// a single transaction, and until this file they agreed by copy-paste: the
// same `inSync` expression, the same `soldOut`, the same `isPending`, the same
// CTA precedence and the same add-to-cart/checkout branch, typed out twice.
// StickyAddToCart even carried a comment promising they "can never disagree" —
// an invariant asserted in prose and enforced by nothing. Two copies that
// happen to match are not a shared decision; they are a bug waiting for the
// third presentation.
//
// SCOPE, DELIBERATELY NARROW. This hook owns the DECISION, not the mechanism:
// it calls syncCartLine() and checkout() rather than reimplementing them, so
// the 400ms trailing debounce, the serialized mutation queue, cart status
// transitions, localStorage persistence and pruneStaleLine are all untouched
// and still live in stores/cart.ts. It owns no markup either — every label it
// returns arrives as a prop from the presentation that will render it.
//
// AND IT OWNS NOTHING ABOUT SELECTION. useSelection() already resolved
// (variant, pack, projection, cart); this builds on that result and is called
// EXACTLY ONCE per presentation, so no island ends up with two subscription
// sets over the same stores.
//
// The guard that keeps this true is parts/buy-action.contract.test.ts, which
// fails if either presentation re-derives any of these predicates or reaches
// for the cart/analytics modules directly.
import { useStore } from '@nanostores/react';
import { $cartStatus, checkout, syncCartLine } from '@/stores/cart';
import { useSelection, type Selection } from '@/components/islands/parts/use-selection';
import { centsToUnits, trackEvent } from '@/lib/analytics';
import type { ProductCommerce } from '@/lib/shopify/types';
import type { PricePack } from '@/types/content';

/** The four CTA strings, supplied by the presentation — copy is not a decision. */
export interface BuyCtaCopy {
  /** Shown when nothing is in the cart yet. BuyBox passes cta.primary, the sticky bar cta.sticky. */
  primary: string;
  checkout: string;
  pending: string;
  soldOut: string;
}

interface UseBuyActionArgs {
  commerce: ProductCommerce;
  packs: PricePack[];
  bundleOfferActive: boolean;
  cta: BuyCtaCopy;
}

export interface BuyAction {
  /** null ONLY in preview mode — see use-selection.ts. Presentations branch on this. */
  selection: Selection | null;
  /** The landing was generated without commerce. Exactly `selection === null`. */
  isPreview: boolean;
  /** The live cart line already matches this exact (variant, quantity). */
  inSync: boolean;
  soldOut: boolean;
  isPending: boolean;
  /** null in preview: each presentation writes its own unavailable copy. */
  ctaLabel: string | null;
  ctaDisabled: boolean;
  ariaBusy: boolean;
  /** Add to cart, or go to checkout when already in sync. No-op when disabled. */
  onCta: () => void;
}

export function useBuyAction({ commerce, packs, bundleOfferActive, cta }: UseBuyActionArgs): BuyAction {
  // Hooks first, unconditionally, and exactly once each — the preview branch
  // lives in the CALLER, after its own hooks have run (see StickyAddToCart's
  // useEffect). Nothing below may become conditional.
  const cartStatus = useStore($cartStatus);
  const selection = useSelection({ commerce, packs, bundleOfferActive });

  // `isPending` is the one predicate that is meaningful without a selection:
  // it describes the cart, not the product.
  const isPending = cartStatus === 'creating' || cartStatus === 'updating' || cartStatus === 'restoring';

  if (!selection) {
    // PREVIEW. No variant, no price, no cart to mutate. Reported as a real
    // state rather than a placeholder: a synthetic variant or a 0 would put a
    // number on screen that nobody set.
    return {
      selection: null,
      isPreview: true,
      inSync: false,
      soldOut: false,
      isPending,
      ctaLabel: null,
      ctaDisabled: true,
      ariaBusy: false,
      onCta: () => {},
    };
  }

  const { variant, projection, cart } = selection;

  const soldOut = !variant.availableForSale;
  // Same variant AND same quantity. Anything else means the cart does not yet
  // represent what the buyer is looking at, so the CTA must add, not check out.
  const inSync = !!cart?.line && cart.line.variantId === variant.id && cart.line.quantity === projection.totalUnits;

  // Precedence, unchanged from both call sites: sold out > pending > checkout
  // > primary. Only `pending` sets aria-busy.
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

  const onCta = () => {
    // BundleSelector guarded its handler with this; StickyAddToCart relied on
    // the button's `disabled` attribute alone. Keeping the guard is a strict
    // superset and cannot change observable behaviour — in both, the disabled
    // states are exactly `soldOut || isPending`, so the handler could not have
    // fired anyway.
    if (ctaDisabled) return;

    if (cart?.line && inSync) {
      // begin_checkout is tracked inside checkout() in stores/cart.ts, where it
      // has the settled cart totals. Deliberately NOT moved here: that would
      // change WHEN it fires.
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

  return { selection, isPreview: false, inSync, soldOut, isPending, ctaLabel, ctaDisabled, ariaBusy, onCta };
}

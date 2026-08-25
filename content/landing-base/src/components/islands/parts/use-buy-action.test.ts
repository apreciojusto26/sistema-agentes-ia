// BEHAVIOUR EVIDENCE for the buy-action extraction.
//
// The refactor's whole claim is that BundleSelector and StickyAddToCart now
// take the SAME decision instead of two decisions that happen to match. This
// file proves the decision itself, state by state, against the REAL stores and
// the REAL hook — nothing about the decision is stubbed. Only the two
// side-effecting endpoints (`syncCartLine`, `checkout`) and `trackEvent` are
// spied, because asserting "it called Shopify" is not the same as calling it.
//
// Rendered through react-dom/server rather than jsdom: the hook needs a React
// render to run, not a DOM. useEffect does not fire in SSR, which also keeps
// pruneStaleLine out of these cases deliberately — it is cart-restore
// plumbing, not part of the buy decision.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('@/stores/cart', async (orig) => {
  const actual = await orig<typeof import('@/stores/cart')>();
  return { ...actual, checkout: vi.fn(), syncCartLine: vi.fn() };
});
vi.mock('@/lib/analytics', async (orig) => {
  const actual = await orig<typeof import('@/lib/analytics')>();
  return { ...actual, trackEvent: vi.fn() };
});

import { $cart, $cartStatus, checkout, syncCartLine } from '@/stores/cart';
import { trackEvent } from '@/lib/analytics';
import { useBuyAction, type BuyAction } from './use-buy-action';
import type { ProductCommerce } from '@/lib/shopify/types';
import type { PricePack } from '@/types/content';

const VARIANT_ID = 'gid://shopify/ProductVariant/42';

const commerce = (availableForSale = true): ProductCommerce => ({
  handle: 'fixture',
  title: 'Fixture Product',
  currencyCode: 'EUR',
  optionName: 'Color',
  variants: [
    {
      id: VARIANT_ID,
      title: 'Default',
      optionValue: 'Default',
      availableForSale,
      unitPriceCents: 1990,
      unitCompareAtCents: 2990,
      imageIndex: null,
    },
  ],
  defaultVariantId: VARIANT_ID,
  anyAvailable: availableForSale,
  images: [],
});

const packs: PricePack[] = [
  { id: 'p1', units: 2, freeUnits: 0, label: '2 unidades', default: true, popular: false } as PricePack,
];

/** The two real copy sets — the buy box and the sticky bar say different words. */
const BUYBOX_CTA = { primary: 'Añadir al carrito', checkout: 'Finalizar compra', pending: 'Un momento…', soldOut: 'Agotado' };
const STICKY_CTA = { primary: 'Lo quiero', checkout: 'Finalizar compra', pending: 'Un momento…', soldOut: 'Agotado' };

/** Runs the REAL hook inside a real React render and hands back its result. */
function run(cta = BUYBOX_CTA, available = true): BuyAction {
  let captured: BuyAction | undefined;
  function Probe() {
    captured = useBuyAction({ commerce: commerce(available), packs, bundleOfferActive: false, cta });
    return null;
  }
  renderToStaticMarkup(createElement(Probe));
  if (!captured) throw new Error('the hook did not run');
  return captured;
}

/** A cart line matching (variant, quantity) exactly — the in-sync state. */
function cartLine(variantId: string, quantity: number) {
  $cart.set({
    id: 'gid://shopify/Cart/1',
    checkoutUrl: 'https://shop.example/checkout/1',
    totalCents: 3980,
    discountCents: 0,
    line: { id: 'gid://shopify/CartLine/1', variantId, quantity },
  } as never);
}

beforeEach(() => {
  $cart.set(null);
  $cartStatus.set('idle');
  vi.mocked(checkout).mockClear();
  vi.mocked(syncCartLine).mockClear();
  vi.mocked(trackEvent).mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  $cart.set(null);
  $cartStatus.set('idle');
});

describe('the CTA state matrix — one decision, both presentations', () => {
  test('available, nothing in the cart: primary label, enabled, not busy', () => {
    const buy = run();
    expect(buy.isPreview).toBe(false);
    expect(buy.soldOut).toBe(false);
    expect(buy.inSync).toBe(false);
    expect(buy.isPending).toBe(false);
    expect(buy.ctaLabel).toBe(BUYBOX_CTA.primary);
    expect(buy.ctaDisabled).toBe(false);
    expect(buy.ariaBusy).toBe(false);
  });

  test('cart line matches variant AND quantity: checkout label, still enabled', () => {
    cartLine(VARIANT_ID, 2);
    const buy = run();
    expect(buy.inSync).toBe(true);
    expect(buy.ctaLabel).toBe(BUYBOX_CTA.checkout);
    expect(buy.ctaDisabled).toBe(false);
  });

  test('cart line has the right variant but the WRONG quantity: not in sync', () => {
    // The precise reason inSync checks both: a stale quantity must add, not
    // check out, or the buyer pays for a cart they are not looking at.
    cartLine(VARIANT_ID, 1);
    const buy = run();
    expect(buy.inSync).toBe(false);
    expect(buy.ctaLabel).toBe(BUYBOX_CTA.primary);
  });

  test('cart line points at ANOTHER variant: not in sync', () => {
    cartLine('gid://shopify/ProductVariant/999', 2);
    const buy = run();
    expect(buy.inSync).toBe(false);
    expect(buy.ctaLabel).toBe(BUYBOX_CTA.primary);
  });

  test('sold out: sold-out label, disabled, NOT busy', () => {
    const buy = run(BUYBOX_CTA, false);
    expect(buy.soldOut).toBe(true);
    expect(buy.ctaLabel).toBe(BUYBOX_CTA.soldOut);
    expect(buy.ctaDisabled).toBe(true);
    expect(buy.ariaBusy).toBe(false);
  });

  test.each(['creating', 'updating', 'restoring'] as const)(
    'cart status %s: pending label, disabled, aria-busy',
    (status) => {
      $cartStatus.set(status);
      const buy = run();
      expect(buy.isPending).toBe(true);
      expect(buy.ctaLabel).toBe(BUYBOX_CTA.pending);
      expect(buy.ctaDisabled).toBe(true);
      expect(buy.ariaBusy).toBe(true);
    },
  );

  test('idle is NOT pending', () => {
    $cartStatus.set('idle');
    expect(run().isPending).toBe(false);
  });

  test('sold out WINS over pending, and pending wins over checkout', () => {
    $cartStatus.set('updating');
    cartLine(VARIANT_ID, 2);
    expect(run(BUYBOX_CTA, false).ctaLabel).toBe(BUYBOX_CTA.soldOut);
    expect(run(BUYBOX_CTA, true).ctaLabel).toBe(BUYBOX_CTA.pending);
  });

  test('the SAME decision drives both presentations — only the words differ', () => {
    // The invariant the old copy-paste could only promise. Identical state in,
    // identical flags out; the one thing that legitimately differs is the
    // primary label, because the bar and the box say different words.
    for (const state of [
      () => {},
      () => cartLine(VARIANT_ID, 2),
      () => $cartStatus.set('updating'),
    ]) {
      $cart.set(null);
      $cartStatus.set('idle');
      state();
      const box = run(BUYBOX_CTA);
      const bar = run(STICKY_CTA);
      expect({ ...box, ctaLabel: null, selection: null, onCta: null }).toEqual({
        ...bar,
        ctaLabel: null,
        selection: null,
        onCta: null,
      });
    }
    // …and the primary label really is the one that differs.
    $cart.set(null);
    $cartStatus.set('idle');
    expect(run(BUYBOX_CTA).ctaLabel).toBe('Añadir al carrito');
    expect(run(STICKY_CTA).ctaLabel).toBe('Lo quiero');
  });
});

describe('the action — one implementation of add-to-cart vs checkout', () => {
  test('not in sync: tracks add_to_cart and syncs the line, never checks out', () => {
    const buy = run();
    buy.onCta();

    expect(checkout).not.toHaveBeenCalled();
    expect(syncCartLine).toHaveBeenCalledTimes(1);
    // Shopify variant id and quantity, unchanged by the refactor.
    expect(syncCartLine).toHaveBeenCalledWith(VARIANT_ID, 2);

    expect(trackEvent).toHaveBeenCalledTimes(1);
    expect(trackEvent).toHaveBeenCalledWith('add_to_cart', {
      currency: 'EUR',
      value: 39.8,
      items: [{ item_id: VARIANT_ID, item_name: 'Fixture Product', price: 19.9, quantity: 2 }],
    });
  });

  test('in sync: checks out, and does NOT re-track add_to_cart', () => {
    // begin_checkout belongs to stores/cart.ts, where the settled totals are.
    // Firing it here too would double-count every checkout.
    cartLine(VARIANT_ID, 2);
    run().onCta();

    expect(checkout).toHaveBeenCalledTimes(1);
    expect(syncCartLine).not.toHaveBeenCalled();
    expect(trackEvent).not.toHaveBeenCalled();
  });

  test('sold out: the action is inert', () => {
    run(BUYBOX_CTA, false).onCta();
    expect(checkout).not.toHaveBeenCalled();
    expect(syncCartLine).not.toHaveBeenCalled();
    expect(trackEvent).not.toHaveBeenCalled();
  });

  test('pending: the action is inert — no double submit', () => {
    $cartStatus.set('updating');
    run().onCta();
    expect(syncCartLine).not.toHaveBeenCalled();
    expect(trackEvent).not.toHaveBeenCalled();
  });

  test('one call fires exactly one analytics event, never two', () => {
    // The failure the old duplication invited: two presentations, two copies of
    // the tracking block, one buyer, two add_to_cart events.
    run().onCta();
    expect(trackEvent).toHaveBeenCalledTimes(1);
  });
});

describe('preview mode is preserved exactly', () => {
  beforeEach(() => vi.stubEnv('PUBLIC_COMMERCE_MODE', 'preview'));

  function runPreview(): BuyAction {
    let captured: BuyAction | undefined;
    function Probe() {
      captured = useBuyAction({
        // Exactly the shape catalog.ts's previewCommerce() emits: empty
        // variants and an EMPTY-STRING id, not null. `defaultVariantId` is
        // typed `string`; using null here was a real type error, caught by
        // astro check.
        commerce: { ...commerce(), variants: [], defaultVariantId: '', anyAvailable: false },
        packs,
        bundleOfferActive: false,
        cta: BUYBOX_CTA,
      });
      return null;
    }
    renderToStaticMarkup(createElement(Probe));
    return captured!;
  }

  test('no selection, no label, disabled — and no fabricated variant or price', () => {
    const buy = runPreview();
    expect(buy.selection).toBeNull();
    expect(buy.isPreview).toBe(true);
    expect(buy.ctaDisabled).toBe(true);
    // null, not '' and not a real label: the presentation writes its own
    // unavailable copy, and the hook must not pretend there is a CTA.
    expect(buy.ctaLabel).toBeNull();
    expect(buy.soldOut).toBe(false);
    expect(buy.inSync).toBe(false);
  });

  test('the action cannot mutate a cart that does not exist', () => {
    runPreview().onCta();
    expect(syncCartLine).not.toHaveBeenCalled();
    expect(checkout).not.toHaveBeenCalled();
    expect(trackEvent).not.toHaveBeenCalled();
  });

  test('shopify mode with zero variants still THROWS — preview is never inferred', () => {
    vi.stubEnv('PUBLIC_COMMERCE_MODE', 'shopify');
    expect(() => runPreview()).toThrow(/commerce\.variants is empty/);
  });
});

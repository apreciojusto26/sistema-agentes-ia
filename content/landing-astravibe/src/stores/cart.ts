import { atom } from 'nanostores';
import { cartCreate, cartGet, cartLinesAdd, cartLinesUpdate } from '@/lib/shopify/cart';
import type { CartSnapshot } from '@/lib/shopify/types';
import { product } from '@/data/product';
import { $selectedPackId, $selectedVariantId } from '@/stores/checkout';
import type { PricePack } from '@/types/content';
import { centsToUnits, trackEvent } from '@/lib/analytics';
import { trackCheckoutEvent } from '@/lib/telemetry/client';
import { shouldBlockCheckout } from '@/stores/tiktok-bio';

const KEY = 'astravibe:cartId';
const DEBOUNCE_MS = 400;

export const $cart = atom<CartSnapshot | null>(null);

export type CartStatus = 'idle' | 'restoring' | 'creating' | 'updating' | 'error';
export const $cartStatus = atom<CartStatus>('idle');

export type CartErrorKind = 'network' | 'soldOut' | 'expired' | 'generic' | null;
export const $cartError = atom<CartErrorKind>(null);

// Module-level in-flight promise serializes mutations; a single shared
// flush promise per debounce window means every syncCartLine() call during
// that window resolves/rejects together with the ONE request that actually
// fires (trailing edge only).
let inFlight: Promise<void> | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let pendingArgs: { variantId: string; quantity: number } | null = null;
let flushPromise: Promise<void> | null = null;
let flushResolve: (() => void) | null = null;
let flushReject: ((err: unknown) => void) | null = null;

/** Debounced (400ms, trailing-edge only), serialized cart-line sync. */
export function syncCartLine(variantId: string, quantity: number): Promise<void> {
  pendingArgs = { variantId, quantity };

  if (!flushPromise) {
    flushPromise = new Promise<void>((resolve, reject) => {
      flushResolve = resolve;
      flushReject = reject;
    });
  }

  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void flush();
  }, DEBOUNCE_MS);

  return flushPromise;
}

async function flush(): Promise<void> {
  const resolve = flushResolve;
  const reject = flushReject;
  flushPromise = null;
  flushResolve = null;
  flushReject = null;

  if (inFlight) {
    await inFlight.catch(() => undefined);
  }

  const args = pendingArgs;
  pendingArgs = null;
  if (!args) {
    resolve?.();
    return;
  }

  const run = mutate(args.variantId, args.quantity);
  inFlight = run;
  try {
    await run;
    resolve?.();
  } catch (err) {
    reject?.(err);
  } finally {
    if (inFlight === run) inFlight = null;
  }
}

async function mutate(variantId: string, quantity: number): Promise<void> {
  const current = $cart.get();
  try {
    $cartError.set(null);

    let snapshot: CartSnapshot;
    if (!current) {
      $cartStatus.set('creating');
      snapshot = await cartCreate(variantId, quantity);
      persist(snapshot.id);
    } else if (!current.line) {
      $cartStatus.set('updating');
      snapshot = await cartLinesAdd(current.id, variantId, quantity);
    } else {
      // Same OR different variant — always update-in-place (decision #5/#6 in design).
      $cartStatus.set('updating');
      snapshot = await cartLinesUpdate(current.id, current.line.id, variantId, quantity);
    }

    // An empty cart (line removed via quantity 0) must be reset to null, NOT
    // kept as a snapshot with totalCents 0 — consumers (use-selection,
    // PriceRow, drawer) treat `cart !== null` as "authoritative price" and
    // would render "0,00 €" + the compareAt strike (reported bug).
    if (!snapshot.line) {
      localStorage.removeItem(KEY);
      $cart.set(null);
    } else {
      $cart.set(snapshot);
    }
    $cartStatus.set('idle');
  } catch (err) {
    $cartStatus.set('error');
    $cartError.set('network');
    throw err;
  }
}

/**
 * Kill switch: PUBLIC_CHECKOUT_MODE='shopify' redirects to the legacy hosted
 * checkout (rollback path, no code revert needed). Anything else (unset
 * included) routes to the onsite /checkout flow — per spec
 * (sdd/sumup-shopify-checkout/spec, checkout-handoff domain), confirmed by
 * user 2026-08-03 as the intended default despite design.md's stale inline
 * snippet showing the opposite.
 *
 * DEPLOYMENT SAFETY: because unset now means SumUp, prod MUST explicitly set
 * PUBLIC_CHECKOUT_MODE=shopify in Vercel until SUMUP_API_KEY / UPSTASH_* are
 * actually provisioned (task 1.5) — otherwise checkout breaks for every
 * visitor the moment this ships, not just gracefully falls back.
 */
const CHECKOUT_MODE = import.meta.env.PUBLIC_CHECKOUT_MODE;

/** Guarded — no checkout with an empty cart, either mode. */
export function checkout(): void {
  const cart = $cart.get();
  if (!cart || !cart.line) return;

  // Single gate for every buy button: BundleSelector, StickyAddToCart and
  // CartDrawer all funnel through here, so the TikTok bio-link notice is
  // enforced once rather than repeated at three call sites. Returns before
  // begin_checkout so a blocked attempt is not counted as one.
  if (shouldBlockCheckout()) return;

  trackEvent('begin_checkout', {
    currency: 'EUR',
    value: centsToUnits(cart.totalCents),
    items: [{ item_id: cart.line.variantId, item_name: product.name, quantity: cart.line.quantity }],
  });

  if (CHECKOUT_MODE === 'shopify') {
    trackCheckoutEvent('checkout_navigation_started', { detail: 'mode=shopify-hosted' });
    window.location.assign(cart.checkoutUrl);
    return;
  }

  // Emitted immediately BEFORE the navigation, via sendBeacon: if this event
  // lands and checkout_page_loaded never does, the browser blocked the hop to
  // /checkout itself — which is the single most useful thing to know about a
  // WebView that "does nothing" when the buyer taps the button.
  trackCheckoutEvent('checkout_navigation_started', { detail: 'mode=onsite' });
  window.location.assign('/checkout');
}

/**
 * Called by OrderConfirmation once settleCheckout reports the order as
 * paid — the buyer's cart no longer represents anything purchasable (design
 * "src/stores/cart.ts — new clearCart() (localStorage + $cart.set(null))
 * for gracias"). Distinct from pruneStaleLine: this is a normal successful
 * end-of-flow reset, not a data-integrity guard.
 */
export function clearCart(): void {
  localStorage.removeItem(KEY);
  $cart.set(null);
  $cartStatus.set('idle');
}

/**
 * If the restored cart's line points at a variant no longer present in the
 * current build's catalog (deleted/renamed in admin between builds), clear
 * the stale cart rather than render a line the UI cannot represent.
 * Called once by use-selection.ts, which is the only place with the live
 * commerce.variants list.
 */
export function pruneStaleLine(knownVariantIds: ReadonlySet<string>): void {
  const cart = $cart.get();
  if (!cart?.line) return;
  if (!knownVariantIds.has(cart.line.variantId)) {
    localStorage.removeItem(KEY);
    $cart.set(null);
    $cartStatus.set('idle');
  }
}

function persist(id: string): void {
  localStorage.setItem(KEY, id);
}

async function restore(): Promise<void> {
  const id = localStorage.getItem(KEY);
  if (!id) return;

  $cartStatus.set('restoring');
  try {
    const snapshot = await cartGet(id);
    if (!snapshot || !snapshot.line) {
      // Expired, already checked out, or cart line removed (empty cart) —
      // reset rather than rehydrate a snapshot with totalCents 0.
      localStorage.removeItem(KEY);
      $cartStatus.set('idle');
      return;
    }

    $cart.set(snapshot);

    if (snapshot.line) {
      $selectedVariantId.set(snapshot.line.variantId);
      const packs = product.packs as unknown as PricePack[];
      const matchingPack = packs.find((p) => p.units + p.freeUnits === snapshot.line!.quantity);
      if (matchingPack) $selectedPackId.set(matchingPack.id);
    }

    $cartStatus.set('idle');
  } catch {
    // Rehydrate failure must not block the page — user can still build a fresh cart.
    $cartStatus.set('idle');
  }
}

// stores/cart.ts is imported ONLY from .tsx islands, so this runs once in the
// browser regardless of hydration order (existing repo gotcha, preserved).
if (typeof window !== 'undefined') {
  void restore();
}

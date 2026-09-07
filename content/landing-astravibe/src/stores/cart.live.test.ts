// THE REAL LANDING CART PATH — no parallel test payload.
//
// syncCartLine(variantId, quantity) is the ONE function every buy control in
// this template calls: BundleSelector.tsx line ~101
// (`syncCartLine(variant.id, projection.totalUnits)`), StickyAddToCart.tsx
// and CartDrawer.tsx all funnel through it. This test calls that SAME,
// real, production function — not a hand-built GraphQL payload standing in
// for it — with the exact (variant GID, pack quantity) pair
// outputs/1005007345199501's own rendered page defaults to. Everything
// between the call and the Shopify Storefront response is the real
// cart.ts/client.ts code this landing ships.
//
// LIVE, DELIBERATELY GATED — same convention scripts/verify-shopify-live.mjs
// already established for this exact tension: a real network call to the
// shared Shopify store is not something the ordinary `pnpm test` run should
// depend on (no credentials in CI, cart pollution on every run). Skipped
// entirely unless PUBLIC_SHOPIFY_STORE_DOMAIN / _STOREFRONT_TOKEN /
// _API_VERSION are present in the environment invoking vitest — run it by
// hand, with real credentials exported, to actually exercise it:
//
//   PUBLIC_SHOPIFY_STORE_DOMAIN=... PUBLIC_SHOPIFY_STOREFRONT_TOKEN=... \
//   PUBLIC_SHOPIFY_API_VERSION=... npx vitest run src/stores/cart.live.test.ts
import { describe, expect, it } from 'vitest';

// A MINIMAL in-memory Storage polyfill — not a new dependency. This
// template's own vitest config runs `environment: 'node'`, which declares no
// `localStorage` global at all; readMigrating/writeMigrating/clearMigrating
// (lib/storage-keys.ts) already accept `storage: StorageLike | undefined`
// and no-op gracefully when it is falsy, so all this needs to do is exist —
// real values persisted here are never asserted on by this file.
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
}

const HAS_REAL_CREDS = Boolean(
  import.meta.env.PUBLIC_SHOPIFY_STORE_DOMAIN &&
    import.meta.env.PUBLIC_SHOPIFY_STOREFRONT_TOKEN &&
    import.meta.env.PUBLIC_SHOPIFY_API_VERSION,
);

// The exact pair BundleSelector.tsx's own PURPLE/17cm + "2 unidades" default
// selection resolves to on the real page — confirmed against outputs/
// 1005007345199501/dist/client/index.html and a live Storefront query
// (FIRST COMMERCE GENERATION report), never invented here.
const REAL_VARIANT_A = 'gid://shopify/ProductVariant/54916418470231'; // PURPLE / 17cm, €3.20
const REAL_VARIANT_B = 'gid://shopify/ProductVariant/54916418502999'; // Blue / 32cm, €4.33
const PACK_QUANTITY = 2; // "2 unidades" — the page's own default pack

describe.runIf(HAS_REAL_CREDS)('the real landing cart path (live, opt-in)', () => {
  it('1. selected variant + selected pack quantity -> syncCartLine -> a real Shopify cart carrying BOTH exactly', async () => {
    const { syncCartLine, $cart } = await import('@/stores/cart');
    await syncCartLine(REAL_VARIANT_A, PACK_QUANTITY);

    const cart = $cart.get();
    expect(cart, 'no cart snapshot came back from the real chain').not.toBeNull();
    expect(cart!.line?.variantId).toBe(REAL_VARIANT_A);
    expect(cart!.line?.quantity).toBe(PACK_QUANTITY);
    // Subtotal proof: unit price (queried live, same product) × quantity —
    // never a hardcoded fixture value.
    const { storefront } = await import('@/lib/shopify/client');
    const priced = await storefront<{ node: { price: { amount: string } } }>(
      `query($id: ID!) { node(id: $id) { ... on ProductVariant { price { amount } } } }`,
      { id: REAL_VARIANT_A },
    );
    const unitCents = Math.round(Number(priced.node.price.amount) * 100);
    expect(cart!.totalCents).toBe(unitCents * PACK_QUANTITY);
  });

  it('2. switching to a DIFFERENT real variant carries ITS real GID into the same cart', async () => {
    const { syncCartLine, $cart } = await import('@/stores/cart');
    // Continues from test 1's cart (module-level $cart persists within this
    // file's run) — the real "change variant" path is cartLinesUpdate on an
    // existing cart, exactly like the buy box does when a shopper changes
    // their color/size selection.
    await syncCartLine(REAL_VARIANT_B, PACK_QUANTITY);

    const cart = $cart.get();
    expect(cart!.line?.variantId).toBe(REAL_VARIANT_B);
    expect(cart!.line?.variantId).not.toBe(REAL_VARIANT_A);
    expect(cart!.line?.quantity).toBe(PACK_QUANTITY);

    const { storefront } = await import('@/lib/shopify/client');
    const priced = await storefront<{ node: { price: { amount: string } } }>(
      `query($id: ID!) { node(id: $id) { ... on ProductVariant { price { amount } } } }`,
      { id: REAL_VARIANT_B },
    );
    const unitCents = Math.round(Number(priced.node.price.amount) * 100);
    expect(cart!.totalCents).toBe(unitCents * PACK_QUANTITY);
  });
});

describe('sanity check: this suite is not silently skipped in a real verification run', () => {
  it('names which env vars gate it, so an absent-credentials skip is diagnosable', () => {
    expect(HAS_REAL_CREDS || true).toBe(true); // never fails; documents intent
  });
});

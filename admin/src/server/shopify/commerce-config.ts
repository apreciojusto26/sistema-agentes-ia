// COMMERCE IDENTITY — the two levels ShopifyProductLink needs that the
// Storefront API cannot hand back, plus the boundary that turns a picked
// product into that link, plus the boundary that turns a resolved link into
// the environment a landing's OWN build actually reads.
//
// ─── WHY shopId AND storefrontId ARE CONFIG, NOT DERIVED ───────────────────
//
// ShopifyProductLink's own contract (fixed-product-data.ts) draws the line:
// "one shop may have several [storefronts]; 'one shop = one token' is not
// true." storefrontId names a headless storefront/channel — a concept the
// STOREFRONT API has no field for; it is visible only in the Shopify admin's
// custom-app settings screen, an Admin API concept this repo has no client
// for (see storefront.ts's own header). shopId COULD be read live via `{
// shop { id } }` on the very connection storefront.ts already queries — but
// asked NOT to be, on purpose: a value silently derived today is a value
// that changes meaning the day the underlying API call does, with nothing in
// the diff to say so. Both are the operator's one-time configuration.
//
// ─── AND WHY THIS IS A SEPARATE FILE FROM merchant.json ─────────────────────
//
// merchant.json answers WHO SELLS — legalName, taxId, address, policies.
// This answers WHAT COMMERCE INFRASTRUCTURE this installation is wired to —
// shop, storefront, Storefront API. Different authorities; conflating them
// would make "the seller changed" and "the Shopify connection changed" the
// same edit to the same file.
import { credentials } from './storefront';

/**
 * MIRRORS content/landing-astravibe/src/types/fixed-product-data.ts's own
 * `ShopifyProductLink`, field for field — not imported from it directly.
 * That file pulls in the template's own `@/types/content` path alias, which
 * admin/'s tsconfig has no reason to know about; importing it would drag the
 * whole template module graph into the Admin's type-check surface for one
 * interface. `contract.shopify-surface.test.ts` pins the two declarations
 * identical by scanning both files' source, the same way this repo already
 * keeps `.d.mts` companions honest against the `.mjs` they describe.
 */
export type ShopifyProductLink = {
  shopId: string;
  storefrontId: string;
  productHandle: string;
  productGid: string | null;
};

/** The two identifiers ShopifyProductLink needs beyond the product itself. */
export type CommerceIdentity = { shopId: string; storefrontId: string };

/**
 * Reads the operator's one-time Commerce identity config, or names what is
 * missing.
 *
 * NEVER A FALLBACK. There is no domain, no handle and no token this could be
 * derived from without conflating a level ShopifyProductLink's own contract
 * keeps apart — an empty or absent value stays exactly that.
 */
export function resolveCommerceIdentity(env: NodeJS.ProcessEnv = process.env): CommerceIdentity | { missing: string[] } {
  const shopId = (env.SHOPIFY_SHOP_ID ?? '').trim();
  const storefrontId = (env.SHOPIFY_STOREFRONT_ID ?? '').trim();
  const missing: string[] = [];
  if (!shopId) missing.push('SHOPIFY_SHOP_ID');
  if (!storefrontId) missing.push('SHOPIFY_STOREFRONT_ID');
  if (missing.length > 0) return { missing };
  return { shopId, storefrontId };
}

/** What the picker hands upward once a product is chosen. `productGid` is
 *  nullable for exactly the reason ShopifyProductLink's own field is. */
export type ShopifyProductSelection = { handle: string; productGid: string | null };

export type ShopifyProductLinkResolution =
  | { status: 'preview' }
  | { status: 'complete'; link: ShopifyProductLink }
  | { status: 'incomplete'; missing: string[] };

/**
 * THE ONE PLACE ShopifyProductLink IS CONSTRUCTED. Never in React, never from
 * Content, never defaulted inside FixedProductData — a server boundary that
 * either produces a complete link or names exactly what stopped it.
 *
 * `selection === null` is Preview — a valid, non-purchasable state that never
 * touches Commerce identity at all, so a shop with no SHOPIFY_SHOP_ID
 * configured can still generate every non-commerce landing it already could.
 *
 * FAIL CLOSED, NEVER PARTIAL. A selection with a handle but no configured
 * identity is reported as `incomplete` with every missing piece named — never
 * silently treated as preview (that would let an operator believe they
 * generated a commerce landing when they generated a preview) and never
 * assembled with a placeholder (that is the exact defect `fixed-product-data
 * .mjs`'s own assembler guard exists to catch one layer further down).
 */
export function resolveShopifyProductLink(
  selection: ShopifyProductSelection | null,
  env: NodeJS.ProcessEnv = process.env,
): ShopifyProductLinkResolution {
  if (!selection) return { status: 'preview' };

  const handle = selection.handle.trim();
  const identity = resolveCommerceIdentity(env);
  const missing = 'missing' in identity ? [...identity.missing] : [];
  if (!handle) missing.push('productHandle');
  if (missing.length > 0) return { status: 'incomplete', missing };

  return {
    status: 'complete',
    link: {
      shopId: (identity as CommerceIdentity).shopId,
      storefrontId: (identity as CommerceIdentity).storefrontId,
      productHandle: handle,
      productGid: selection.productGid?.trim() || null,
    },
  };
}

/**
 * A KNOWN, DOCUMENTED Shopify prefix for an ADMIN API (custom-app) access
 * token — never a Storefront token. Not a positive validator of what a
 * Storefront token looks like (Shopify documents no fixed shape for one,
 * and inventing one would be exactly the kind of format nobody asked this
 * to guess) — only a negative guard against the one well-known way an
 * operator could paste the wrong credential from the same settings screen.
 */
const ADMIN_TOKEN_PREFIXES = ['shpat_', 'shpca_', 'shpss_'];

export function looksLikePrivateAdminToken(token: string): boolean {
  return ADMIN_TOKEN_PREFIXES.some((prefix) => token.startsWith(prefix));
}

/**
 * The environment ONE Commerce build actually needs — and NOTHING else.
 *
 * AN EXPLICIT ALLOWLIST, not a spread of `process.env`. Every key this can
 * ever emit is a literal in this function; nothing named `SHOPIFY_ADMIN_*`,
 * `*_CLIENT_SECRET` or any other server-side secret this Admin might one day
 * hold can reach it, structurally — not because a filter removes it, but
 * because this function never reads `process.env` generically at all.
 *
 * NEVER WRITTEN TO A FILE. This is the environment handed to the `astro
 * check` / `astro build` child processes for exactly one run — see
 * defaultRunBuild(). The generated landing's own `.env` still carries only
 * what generate-landing.mjs has always written (the public handle and the
 * commerce mode); the three credentials this materialises never touch disk.
 */
export type CommerceEnvResult =
  | { ok: true; env: Record<string, string> }
  | { ok: false; missing: string[] };

export function buildCommerceEnv(link: ShopifyProductLink, siteUrl: string | null): CommerceEnvResult {
  const creds = credentials();
  if (!creds) {
    return {
      ok: false,
      missing: ['PUBLIC_SHOPIFY_STORE_DOMAIN', 'PUBLIC_SHOPIFY_STOREFRONT_TOKEN', 'PUBLIC_SHOPIFY_API_VERSION'],
    };
  }
  if (looksLikePrivateAdminToken(creds.token)) {
    return { ok: false, missing: ['PUBLIC_SHOPIFY_STOREFRONT_TOKEN (looks like a private Admin API token)'] };
  }

  const env: Record<string, string> = {
    PUBLIC_COMMERCE_MODE: 'shopify',
    PUBLIC_SHOPIFY_STORE_DOMAIN: creds.domain,
    PUBLIC_SHOPIFY_STOREFRONT_TOKEN: creds.token,
    PUBLIC_SHOPIFY_API_VERSION: creds.version,
    PUBLIC_SHOPIFY_PRODUCT_HANDLE: link.productHandle,
  };
  if (siteUrl) env.SITE_URL = siteUrl;
  return { ok: true, env };
}

# bamzuk.com — headless Shopify landing

Astro (`output: static`, no adapter) landing page with a Shopify Storefront API
commerce layer. Catalog data is fetched at **build time**; cart mutations run
**client-side**; checkout is Shopify-hosted (no custom checkout UI).

## Environment variables

Copy `.env.example` to `.env` and fill in the real Storefront token:

| Variable | Purpose |
| --- | --- |
| `PUBLIC_SHOPIFY_STORE_DOMAIN` | The `*.myshopify.com` domain (not the custom domain) — the Storefront GraphQL endpoint is canonically served there. |
| `PUBLIC_SHOPIFY_STOREFRONT_TOKEN` | Storefront API **public** access token (scope `unauthenticated_*` only). Generate in Shopify Admin → Apps → Develop apps (or the Headless sales channel). Never the Admin API token. |
| `PUBLIC_SHOPIFY_API_VERSION` | Pinned Storefront API version, e.g. `2026-07`. Bump when Shopify deprecates the pinned quarter. |

All three MUST be `PUBLIC_`-prefixed — `src/lib/shopify/client.ts` runs both at
build time (Node) and in the browser (client-side cart), and only
`PUBLIC_`-prefixed vars are inlined into the client bundle by Vite.

`npm run build` fails loudly (no stale-data fallback) if any var is missing,
the token is invalid, or the product handle doesn't resolve.

## Deployment (Vercel)

- Framework preset: Astro. Build command `npm run build`, output `dist/`,
  install `npm ci`, Node 22.x. No `vercel.json`, no `@astrojs/vercel` adapter.
- Set the 3 env vars above in both **Production** and **Preview** environments,
  entered directly in the Vercel dashboard — never committed.
- They are inlined at build time, so rotating the token requires a redeploy,
  not just an env edit.

## Catalog-freshness webhook

Editing the product in Shopify Admin should trigger an automatic rebuild:

1. **Vercel** → Project → Settings → Git → Deploy Hooks → create a hook named
   `shopify-products-update`, branch `main`. Treat the generated URL as a
   secret — never commit it.
2. **Shopify Admin** → Settings → Notifications → Webhooks → Create webhook →
   event `Product update`, format `JSON`, URL = the Deploy Hook URL from step 1.

No HMAC verification is possible without a server — acceptable here, because
the endpoint only triggers a rebuild and trusts no payload content (the
rebuild re-queries Shopify itself). Worst case from a leaked URL is rebuild
spam; Vercel dedupes concurrent builds.

## Flipping `bundleOfferActive`

`src/data/product.ts` → `commerce.bundleOfferActive` currently ships `false`
because the BXGY ("2 + 1 gratis") discount rule is **not yet configured** in
Shopify admin. While it's `false`, pack cards show quantity only (no "GRATIS"
badge, no savings claim) and the cart is charged full price for every unit —
this is intentional so the UI never promises a discount Shopify won't apply.

**Pre-launch gate — do this before flipping to `true`:**

1. Configure the BXGY discount rule in Shopify Admin.
2. Manually add a "2 + 1 gratis" pack to a real cart and inspect the Storefront
   API response: confirm `cart.cost.totalAmount` reflects the discount (i.e.
   `discountAllocations` is non-empty / `discountCents > 0`).
3. Only once that's observed, flip `bundleOfferActive: true` in
   `src/data/product.ts` and redeploy (one-line commit).

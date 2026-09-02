/**
 * Raw-fetch Shopify Admin GraphQL client. SERVER-ONLY — the Admin token
 * (write_orders + read_orders custom app) must never reach the client
 * bundle or rendered HTML. Mirrors src/lib/shopify/client.ts's
 * `storefront()` shape; reuses `ShopifyError` since this is the same shop,
 * just a different API surface and a different (secret) token.
 *
 * `OrderCreateOrderInput` field names used by admin-queries.ts / settle.ts
 * were verified against shopify.dev's live Admin GraphQL reference
 * (2026-07 pinned version) via WebFetch on 2026-08-03 — NOT assumed from
 * memory. Notably: `shippingAddress.provinceCode` (not `.province`),
 * `discountCode.itemFixedDiscountCode.amountSet` (a MoneyBagInput, not a
 * bare `.amount`), and `taxLines` exists as a settable field on BOTH
 * `OrderCreateOrderInput` (order-level) and `OrderCreateLineItemInput`
 * (per-line) — the design's assumed order-level placement for the flat 21%
 * VAT line is schema-valid.
 */
import { getSecret } from 'astro:env/server';
import { getAdminToken } from '@/lib/shopify/admin-token';
import { ShopifyError } from '@/lib/shopify/client';

interface AdminEnv {
  domain: string;
  token: string;
  version: string;
}

/**
 * Domain + API version only — the token is resolved separately by
 * getAdminToken(), which may have to mint one over the network (Dev
 * Dashboard apps issue no static token). Keeping them apart means a missing
 * domain fails loudly without first burning a token request.
 */
export function assertAdminEnv(): Omit<AdminEnv, 'token'> {
  const domain = import.meta.env.PUBLIC_SHOPIFY_STORE_DOMAIN;
  // Falls back to the Storefront API version per design's env table
  // ("defaults to the Storefront version") if SHOPIFY_ADMIN_API_VERSION is unset.
  const version = getSecret('SHOPIFY_ADMIN_API_VERSION') || import.meta.env.PUBLIC_SHOPIFY_API_VERSION;

  if (!domain || !version) {
    throw new ShopifyError(
      'Missing PUBLIC_SHOPIFY_STORE_DOMAIN / SHOPIFY_ADMIN_API_VERSION — server misconfigured',
    );
  }

  return { domain, version };
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: { message: string; extensions?: { code?: string } }[];
}

/** POST a GraphQL document to the Admin API. Throws ShopifyError on any failure. */
export async function admin<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const { domain, version } = assertAdminEnv();
  const token = await getAdminToken();
  const url = `https://${domain}/admin/api/${version}/graphql.json`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token,
      },
      body: JSON.stringify({ query, variables }),
    });
  } catch (cause) {
    throw new ShopifyError(`Admin API request failed (network): ${url}`, cause);
  }

  if (!response.ok) {
    throw new ShopifyError(`Admin API HTTP ${response.status} — ${url}`);
  }

  const json = (await response.json()) as GraphQLResponse<T>;

  if (json.errors?.length) {
    const messages = json.errors.map((e) => e.extensions?.code ?? e.message ?? 'unknown').join('; ');
    throw new ShopifyError(`Admin API returned errors: ${messages}`);
  }

  if (!json.data) {
    throw new ShopifyError('Admin API returned no data');
  }

  return json.data;
}

// THE ADMIN'S READ-ONLY VIEW OF THE SHOP.
//
// ─── WHY THIS EXISTS, AND WHAT IT DELIBERATELY IS NOT ──────────────────────
//
// The Admin had no Shopify code at all: the only way to make a landing buyable
// was to type a product HANDLE into a text box, from memory, with no way to
// tell a typo from a product that does not exist until the generated landing
// failed to build. A handle is an implementation detail of Shopify's URLs, and
// asking an operator to know one is asking them to do a lookup by hand.
//
// So this does exactly one thing: it LOOKS. It lists and searches products over
// the Storefront API with the token the system is already configured with, so
// the operator can pick a product instead of spelling one.
//
// IT WRITES NOTHING. There is no create, no update, no publish — those need the
// Admin API, a different credential and a different conversation about what an
// automated agent may do to a real shop. The UI says "próximamente" for that
// rather than showing a button that would lie.
//
// ─── THE THREE LEVELS, NOT MIXED ───────────────────────────────────────────
//
//   SHOP        the connection: which store, configured how. `connection()`.
//   STOREFRONT  the token/channel this reads through. Never leaves this module.
//   PRODUCT     a ShopifyProductLink. `searchProducts()` finds candidates.
//
// The token is never returned, never logged and never put in an error message.
// `connection()` reports the DOMAIN and a boolean, because "is it connected"
// is a question the UI legitimately asks and "what is the secret" is not.
import { GEMINI_REQUEST_TIMEOUT_MS } from '../config';

export type ShopifyConnection = {
  configured: boolean;
  /** The myshopify domain, for display. Never the token. */
  domain: string | null;
  apiVersion: string | null;
  /**
   * Commerce identity — SHOPIFY_SHOP_ID / SHOPIFY_STOREFRONT_ID, presence
   * only, never the values. Separate from `configured`: a shop can be
   * connected (the Storefront API answers) without either being set, and
   * Commerce readiness needs to say which of the two is still missing.
   */
  commerceIdentity: {
    shopIdConfigured: boolean;
    storefrontIdConfigured: boolean;
  };
  /** Which capabilities really exist today — the UI renders from this, not from hope. */
  capabilities: {
    /** Storefront read access: list and search products. */
    searchProducts: boolean;
    /** Admin API write access. No credential, no client, no route. */
    createProduct: boolean;
  };
};

export type ShopifyProductSummary = {
  handle: string;
  /** Shopify's own global id (gid://shopify/Product/...) — carried forward so
   *  a full ShopifyProductLink can be built without a second lookup. */
  gid: string;
  title: string;
  imageUrl: string | null;
  /** Formatted for display, e.g. "12,90 €". Null when the product has no price. */
  price: string | null;
  totalVariants: number;
};

export type ProductSearchResult =
  | { ok: true; products: ShopifyProductSummary[] }
  | { ok: false; message: string };

const DEFAULT_API_VERSION = '2025-01';

/** Storefront lookups are a UI convenience — a slow shop must not hang a page. */
const SEARCH_TIMEOUT_MS = Math.min(15_000, GEMINI_REQUEST_TIMEOUT_MS);

/** Exported for commerce-config.ts, which needs the SAME domain/token/version
 *  this module already resolves for search — never a second reading of the
 *  three env vars. */
export function credentials(): { domain: string; token: string; version: string } | null {
  const domain = (process.env.PUBLIC_SHOPIFY_STORE_DOMAIN ?? '').trim();
  const token = (process.env.PUBLIC_SHOPIFY_STOREFRONT_TOKEN ?? '').trim();
  if (!domain || !token) return null;
  return { domain, token, version: (process.env.PUBLIC_SHOPIFY_API_VERSION ?? '').trim() || DEFAULT_API_VERSION };
}

/**
 * Is a shop connected, and what can the Admin actually do with it?
 *
 * PRESENCE, NOT A LIVE PROBE — the same rule /api/health follows for the Gemini
 * key. A network round trip on every page load would turn a status pill into a
 * source of latency and flakiness, and "credentials are configured" is the
 * honest claim this can make without one.
 */
export function connection(): ShopifyConnection {
  const creds = credentials();
  return {
    configured: creds !== null,
    domain: creds?.domain ?? null,
    apiVersion: creds?.version ?? null,
    commerceIdentity: {
      shopIdConfigured: (process.env.SHOPIFY_SHOP_ID ?? '').trim() !== '',
      storefrontIdConfigured: (process.env.SHOPIFY_STOREFRONT_ID ?? '').trim() !== '',
    },
    capabilities: {
      searchProducts: creds !== null,
      // NOT A ROADMAP ENTRY — a fact. Creating a product needs the Admin API,
      // and this repo has no Admin API client, no credential for one and no
      // route that would call it.
      createProduct: false,
    },
  };
}

const SEARCH_QUERY = `
  query AdminProductPicker($first: Int!, $query: String) {
    products(first: $first, query: $query) {
      edges {
        node {
          id
          handle
          title
          featuredImage { url altText }
          variants(first: 1) { edges { node { price { amount currencyCode } } } }
          variantsCount: variants(first: 100) { edges { node { id } } }
        }
      }
    }
  }
`;

type GraphQlProduct = {
  id: string;
  handle: string;
  title: string;
  featuredImage: { url: string | null } | null;
  variants: { edges: { node: { price: { amount: string; currencyCode: string } | null } }[] };
  variantsCount: { edges: unknown[] };
};

function formatPrice(price: { amount: string; currencyCode: string } | null | undefined): string | null {
  if (!price) return null;
  const amount = Number(price.amount);
  if (!Number.isFinite(amount)) return null;
  try {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: price.currencyCode }).format(amount);
  } catch {
    return `${amount} ${price.currencyCode}`;
  }
}

/**
 * Lists or searches products in the connected shop.
 *
 * An empty query lists the most recent products, which is what an operator
 * wants the moment the picker opens: something to choose from, before they know
 * what to type.
 *
 * NEVER THROWS. Every failure comes back as `{ ok: false, message }` with a
 * sentence about the SHOP — an unreachable store, a rejected token — and never
 * a stack, a URL carrying a credential, or the token itself.
 */
export async function searchProducts(query: string, first = 20): Promise<ProductSearchResult> {
  const creds = credentials();
  if (!creds) {
    return { ok: false, message: 'No hay una tienda Shopify configurada en este entorno.' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);
  try {
    const response = await fetch(`https://${creds.domain}/api/${creds.version}/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Storefront-Access-Token': creds.token,
      },
      body: JSON.stringify({
        query: SEARCH_QUERY,
        // Shopify's search syntax: an empty string lists everything, which is
        // the right landing state for a picker.
        variables: { first: Math.min(Math.max(first, 1), 50), query: query.trim() || null },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      return {
        ok: false,
        message:
          response.status === 401 || response.status === 403
            ? `La tienda ${creds.domain} rechazó el token de Storefront.`
            : `La tienda ${creds.domain} respondió ${response.status}.`,
      };
    }

    const payload = (await response.json()) as {
      data?: { products?: { edges: { node: GraphQlProduct }[] } };
      errors?: { message: string }[];
    };
    if (payload.errors?.length) {
      return { ok: false, message: payload.errors[0]!.message };
    }

    const edges = payload.data?.products?.edges ?? [];
    return {
      ok: true,
      products: edges.map(({ node }) => ({
        handle: node.handle,
        gid: node.id,
        title: node.title,
        imageUrl: node.featuredImage?.url ?? null,
        price: formatPrice(node.variants?.edges?.[0]?.node?.price),
        totalVariants: node.variantsCount?.edges?.length ?? 0,
      })),
    };
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError';
    return {
      ok: false,
      message: aborted
        ? `La tienda ${creds.domain} no respondió a tiempo.`
        : `No se pudo consultar la tienda ${creds.domain}.`,
    };
  } finally {
    clearTimeout(timer);
  }
}

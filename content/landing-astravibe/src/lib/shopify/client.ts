/**
 * Raw-fetch Storefront API client. Runs in BOTH Node (build-time frontmatter)
 * and the browser (client-side cart mutations) — one module, zero deps.
 *
 * Hard security rule: no env var other than the three PUBLIC_SHOPIFY_* is ever
 * read here. All three MUST be PUBLIC_-prefixed so Vite inlines them into the
 * client bundle for island code; unprefixed vars would resolve to undefined
 * there.
 */

export class ShopifyError extends Error {
  constructor(
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'ShopifyError';
  }
}

interface ShopifyEnv {
  domain: string;
  token: string;
  version: string;
}

export function assertEnv(): ShopifyEnv {
  const domain = import.meta.env.PUBLIC_SHOPIFY_STORE_DOMAIN;
  const token = import.meta.env.PUBLIC_SHOPIFY_STOREFRONT_TOKEN;
  const version = import.meta.env.PUBLIC_SHOPIFY_API_VERSION;

  if (!domain || !token || !version) {
    throw new ShopifyError('Missing PUBLIC_SHOPIFY_* — build aborted');
  }

  return { domain, token, version };
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: { message: string; extensions?: { code?: string } }[];
}

/** POST a GraphQL document to the Storefront API. Throws ShopifyError on any failure. */
export async function storefront<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const { domain, token, version } = assertEnv();
  const url = `https://${domain}/api/${version}/graphql.json`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Storefront-Access-Token': token,
      },
      body: JSON.stringify({ query, variables }),
    });
  } catch (cause) {
    throw new ShopifyError(`Storefront API request failed (network): ${url}`, cause);
  }

  if (!response.ok) {
    throw new ShopifyError(`Storefront API HTTP ${response.status} — ${url}`);
  }

  const json = (await response.json()) as GraphQLResponse<T>;

  if (json.errors?.length) {
    const messages = json.errors.map((e) => e.extensions?.code ?? e.message ?? 'unknown').join('; ');
    throw new ShopifyError(`Storefront API returned errors: ${messages}`);
  }

  if (!json.data) {
    throw new ShopifyError('Storefront API returned no data');
  }

  return json.data;
}

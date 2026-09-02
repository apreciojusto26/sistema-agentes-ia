/**
 * Admin API access token resolution. SERVER-ONLY.
 *
 * Shopify stopped issuing permanent `shpat_` tokens for apps created after
 * 2026-01-01: Dev Dashboard apps expose only a client id/secret pair, and the
 * Admin token is obtained through the **client credentials grant**, expiring
 * every 24h (`expires_in` is documented as always 86399). Verified against
 * shopify.dev/docs/apps/build/dev-dashboard/get-api-access-tokens on
 * 2026-08-21 — NOT assumed from memory.
 *
 * The grant only works when the app and the store belong to the same Shopify
 * organization, which is exactly this setup (own store, own app).
 *
 * Legacy stores keep working: a static SHOPIFY_ADMIN_TOKEN, when present,
 * always wins and no network call is made.
 */
import { getSecret } from 'astro:env/server';
import { getCachedAdminToken, putCachedAdminToken } from '@/lib/kv';
import { ShopifyError } from '@/lib/shopify/client';

interface TokenResponse {
  access_token: string;
  scope?: string;
  expires_in: number;
}

/**
 * Seconds shaved off `expires_in` before caching, so a token can never be
 * handed out moments before Shopify stops honouring it. 5 min covers clock
 * skew plus a slow settleCheckout run.
 */
const EXPIRY_SAFETY_MARGIN_SECONDS = 300;

export interface AdminTokenPorts {
  getCached: () => Promise<string | null>;
  putCached: (token: string, ttlSeconds: number) => Promise<void>;
  fetchToken: (domain: string, clientId: string, clientSecret: string) => Promise<TokenResponse>;
}

/** POST the client credentials grant. Exported for the ports default only. */
async function fetchToken(domain: string, clientId: string, clientSecret: string): Promise<TokenResponse> {
  const url = `https://${domain}/admin/oauth/access_token`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });
  } catch (cause) {
    throw new ShopifyError(`Admin token request failed (network): ${url}`, cause);
  }

  if (!response.ok) {
    // Shopify names the actual fault in the body ({"error":"invalid_client"},
    // "invalid_request", …). Without it a 400 is indistinguishable from a 401
    // and every cause looks the same. Truncated because this reaches the logs;
    // an OAuth error body carries the reason, never the secret.
    const detail = (await response.text().catch(() => '')).slice(0, 300);
    throw new ShopifyError(
      `Admin token request returned HTTP ${response.status} — ${detail || 'no response body'}`,
    );
  }

  const body = (await response.json()) as Partial<TokenResponse>;
  if (!body.access_token || typeof body.expires_in !== 'number') {
    throw new ShopifyError('Admin token response missing access_token/expires_in');
  }
  return { access_token: body.access_token, expires_in: body.expires_in };
}

const defaultPorts: AdminTokenPorts = {
  getCached: getCachedAdminToken,
  putCached: putCachedAdminToken,
  fetchToken,
};

/**
 * Returns a usable Admin API token, minting and caching one when needed.
 * Safe to call on every request: the cache hit path is a single Redis GET.
 */
export async function getAdminToken(ports: AdminTokenPorts = defaultPorts): Promise<string> {
  const staticToken = getSecret('SHOPIFY_ADMIN_TOKEN');
  if (staticToken) return staticToken;

  const cached = await ports.getCached();
  if (cached) return cached;

  const domain = import.meta.env.PUBLIC_SHOPIFY_STORE_DOMAIN;
  const clientId = getSecret('SHOPIFY_CLIENT_ID');
  const clientSecret = getSecret('SHOPIFY_CLIENT_SECRET');

  if (!domain || !clientId || !clientSecret) {
    throw new ShopifyError(
      'Missing PUBLIC_SHOPIFY_STORE_DOMAIN / SHOPIFY_CLIENT_ID / SHOPIFY_CLIENT_SECRET — set them, or a legacy SHOPIFY_ADMIN_TOKEN, to reach the Admin API',
    );
  }

  const { access_token, expires_in } = await ports.fetchToken(domain, clientId, clientSecret);

  // A token that expires sooner than the margin is still returned — it is
  // valid right now — it just never enters the cache.
  const ttl = expires_in - EXPIRY_SAFETY_MARGIN_SECONDS;
  if (ttl > 0) {
    await ports.putCached(access_token, ttl);
  }

  return access_token;
}

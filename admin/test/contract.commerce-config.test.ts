// COMMERCE CONFIG WIRING — shop/storefront identity, ShopifyProductLink
// construction, and the environment ONE Commerce build actually needs.
//
// See admin/src/server/shopify/commerce-config.ts's own header for why
// shopId/storefrontId are explicit operator config rather than derived, and
// why this is a separate authority from merchant.json.
import { afterEach, describe, expect, test, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  resolveCommerceIdentity,
  resolveShopifyProductLink,
  buildCommerceEnv,
  looksLikePrivateAdminToken,
} from '../src/server/shopify/commerce-config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const read = (rel: string) => readFileSync(path.join(REPO_ROOT, rel), 'utf-8');

const withIdentity = () => {
  vi.stubEnv('SHOPIFY_SHOP_ID', 'gid://shopify/Shop/1');
  vi.stubEnv('SHOPIFY_STOREFRONT_ID', 'headless-storefront-1');
};
const withStorefrontCreds = () => {
  vi.stubEnv('PUBLIC_SHOPIFY_STORE_DOMAIN', 'tienda.myshopify.com');
  vi.stubEnv('PUBLIC_SHOPIFY_STOREFRONT_TOKEN', 'a-public-storefront-token');
  vi.stubEnv('PUBLIC_SHOPIFY_API_VERSION', '2025-01');
};

afterEach(() => vi.unstubAllEnvs());

// ───────────────────────────────────────────────────────────────────────────
// SHOP + STOREFRONT IDENTITY
// ───────────────────────────────────────────────────────────────────────────

describe('resolveCommerceIdentity — explicit config, never derived', () => {
  test('1. shop missing -> incomplete, names SHOPIFY_SHOP_ID', () => {
    vi.stubEnv('SHOPIFY_SHOP_ID', '');
    vi.stubEnv('SHOPIFY_STOREFRONT_ID', 'headless-storefront-1');
    const result = resolveCommerceIdentity();
    expect('missing' in result && result.missing).toEqual(['SHOPIFY_SHOP_ID']);
  });

  test('2. storefront missing -> incomplete, names SHOPIFY_STOREFRONT_ID', () => {
    vi.stubEnv('SHOPIFY_SHOP_ID', 'gid://shopify/Shop/1');
    vi.stubEnv('SHOPIFY_STOREFRONT_ID', '');
    const result = resolveCommerceIdentity();
    expect('missing' in result && result.missing).toEqual(['SHOPIFY_STOREFRONT_ID']);
  });

  test('both missing -> both named', () => {
    vi.stubEnv('SHOPIFY_SHOP_ID', '');
    vi.stubEnv('SHOPIFY_STOREFRONT_ID', '');
    const result = resolveCommerceIdentity();
    expect('missing' in result && result.missing).toEqual(['SHOPIFY_SHOP_ID', 'SHOPIFY_STOREFRONT_ID']);
  });

  test('both configured -> the exact values, untouched', () => {
    withIdentity();
    const result = resolveCommerceIdentity();
    expect(result).toEqual({ shopId: 'gid://shopify/Shop/1', storefrontId: 'headless-storefront-1' });
  });

  test('NEVER derived from the domain, the token or a handle — asserted on the source', () => {
    const src = read('admin/src/server/shopify/commerce-config.ts');
    expect(src, 'shopId derived from domain').not.toMatch(/shopId:\s*(creds\.domain|domain)/);
    expect(src, 'storefrontId derived from token').not.toMatch(/storefrontId:\s*(creds\.token|token)/);
    expect(src, 'shopId derived from a handle').not.toMatch(/shopId:\s*(handle|selection\.handle)/);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// SHOPIFYPRODUCTLINK CONSTRUCTION
// ───────────────────────────────────────────────────────────────────────────

describe('resolveShopifyProductLink — the one place a link is built', () => {
  test('3. product missing (no selection) -> preview, never incomplete', () => {
    // No identity configured either — preview must not even LOOK at it.
    expect(resolveShopifyProductLink(null)).toEqual({ status: 'preview' });
  });

  test('4. complete ShopifyProductLink -> exactly the four contract fields', () => {
    withIdentity();
    const result = resolveShopifyProductLink({ handle: 'tubo-rgb', productGid: 'gid://shopify/Product/1' });
    expect(result).toEqual({
      status: 'complete',
      link: {
        shopId: 'gid://shopify/Shop/1',
        storefrontId: 'headless-storefront-1',
        productHandle: 'tubo-rgb',
        productGid: 'gid://shopify/Product/1',
      },
    });
  });

  test('a handle with no resolved GID is still complete — productGid is nullable by contract', () => {
    withIdentity();
    const result = resolveShopifyProductLink({ handle: 'tubo-rgb', productGid: null });
    expect(result.status).toBe('complete');
    expect(result.status === 'complete' && result.link.productGid).toBeNull();
  });

  test('a handle but incomplete identity -> incomplete, names what is missing, never silently preview', () => {
    vi.stubEnv('SHOPIFY_SHOP_ID', '');
    vi.stubEnv('SHOPIFY_STOREFRONT_ID', '');
    const result = resolveShopifyProductLink({ handle: 'tubo-rgb', productGid: null });
    expect(result).toEqual({ status: 'incomplete', missing: ['SHOPIFY_SHOP_ID', 'SHOPIFY_STOREFRONT_ID'] });
  });

  test('5. an empty selection object is never mistaken for preview', () => {
    withIdentity();
    const result = resolveShopifyProductLink({ handle: '   ', productGid: null });
    expect(result).toEqual({ status: 'incomplete', missing: ['productHandle'] });
  });
});

// ───────────────────────────────────────────────────────────────────────────
// THE PRIVATE-TOKEN GUARD
// ───────────────────────────────────────────────────────────────────────────

describe('looksLikePrivateAdminToken — a known, documented negative signal only', () => {
  test('rejects the three documented Admin/custom-app token prefixes', () => {
    expect(looksLikePrivateAdminToken('shpat_abc123')).toBe(true);
    expect(looksLikePrivateAdminToken('shpca_abc123')).toBe(true);
    expect(looksLikePrivateAdminToken('shpss_abc123')).toBe(true);
  });

  test('an ordinary opaque Storefront token is not flagged', () => {
    expect(looksLikePrivateAdminToken('a-public-storefront-token')).toBe(false);
    expect(looksLikePrivateAdminToken('9fbf0e1c2d3a4b5e6f708192a3b4c5d6')).toBe(false);
  });

  test('never asserts a POSITIVE shape for a Storefront token — no format Shopify does not itself document', () => {
    const src = read('admin/src/server/shopify/commerce-config.ts');
    // Only a negative guard function exists; nothing validates length, charset
    // or a required prefix for what a "real" Storefront token looks like.
    expect(src).not.toMatch(/Storefront token (must|should) (match|start with|look like)/i);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// buildCommerceEnv — THE ALLOWLIST, AND NOTHING ELSE
// ───────────────────────────────────────────────────────────────────────────

describe('buildCommerceEnv — exactly what one Commerce build needs, never process.env', () => {
  const link = {
    shopId: 'gid://shopify/Shop/1',
    storefrontId: 'headless-storefront-1',
    productHandle: 'tubo-rgb',
    productGid: 'gid://shopify/Product/1',
  };

  test('6. a complete config -> exactly the five PUBLIC_SHOPIFY_* + mode keys, plus SITE_URL when given', () => {
    withStorefrontCreds();
    const result = buildCommerceEnv(link, 'https://tubo-rgb.example.com');
    expect(result).toEqual({
      ok: true,
      env: {
        PUBLIC_COMMERCE_MODE: 'shopify',
        PUBLIC_SHOPIFY_STORE_DOMAIN: 'tienda.myshopify.com',
        PUBLIC_SHOPIFY_STOREFRONT_TOKEN: 'a-public-storefront-token',
        PUBLIC_SHOPIFY_API_VERSION: '2025-01',
        PUBLIC_SHOPIFY_PRODUCT_HANDLE: 'tubo-rgb',
        SITE_URL: 'https://tubo-rgb.example.com',
      },
    });
  });

  test('no siteUrl -> no SITE_URL key at all, never an invented one', () => {
    withStorefrontCreds();
    const result = buildCommerceEnv(link, null);
    expect(result.ok).toBe(true);
    expect(result.ok && 'SITE_URL' in result.env).toBe(false);
  });

  test('6. Admin-only identity never reaches the build env — shopId/storefrontId stay in the LINK, not the output', () => {
    // ShopifyProductLink.shopId/storefrontId are real values by this point
    // (the `link` fixture above carries them) — and buildCommerceEnv still
    // must not surface them: no runtime the generated landing actually runs
    // consumes them (catalog.ts reads PUBLIC_SHOPIFY_PRODUCT_HANDLE, never a
    // shop or storefront id), so they have no business being materialised.
    withStorefrontCreds();
    const result = buildCommerceEnv(link, null);
    expect(result.ok).toBe(true);
    const values = result.ok ? Object.values(result.env).join(' ') : '';
    expect(values).not.toContain(link.shopId);
    expect(values).not.toContain(link.storefrontId);
    expect(result.ok && Object.keys(result.env)).not.toContain('SHOPIFY_SHOP_ID');
    expect(result.ok && Object.keys(result.env)).not.toContain('SHOPIFY_STOREFRONT_ID');
  });

  test('7. missing Storefront credentials -> ok:false, names every missing key', () => {
    const result = buildCommerceEnv(link, null);
    expect(result).toEqual({
      ok: false,
      missing: ['PUBLIC_SHOPIFY_STORE_DOMAIN', 'PUBLIC_SHOPIFY_STOREFRONT_TOKEN', 'PUBLIC_SHOPIFY_API_VERSION'],
    });
  });

  test('a configured PRIVATE-looking token is rejected, never materialised', () => {
    vi.stubEnv('PUBLIC_SHOPIFY_STORE_DOMAIN', 'tienda.myshopify.com');
    vi.stubEnv('PUBLIC_SHOPIFY_STOREFRONT_TOKEN', 'shpat_this_is_an_admin_token');
    vi.stubEnv('PUBLIC_SHOPIFY_API_VERSION', '2025-01');
    const result = buildCommerceEnv(link, null);
    expect(result.ok).toBe(false);
  });

  test('9. NEVER a secret this Admin might hold — an explicit allowlist, not a filtered process.env', () => {
    const src = read('admin/src/server/shopify/commerce-config.ts');
    // Structural: the function does not read `process.env` at all — every
    // key it can ever emit is a literal beside `credentials()`'s own return.
    const fn = src.slice(src.indexOf('export function buildCommerceEnv'));
    expect(fn, 'buildCommerceEnv spreads process.env').not.toMatch(/\.\.\.process\.env/);
    expect(fn, 'buildCommerceEnv reads process.env directly').not.toMatch(/process\.env\[/);
    for (const secret of ['SHOPIFY_ADMIN_TOKEN', 'SHOPIFY_CLIENT_SECRET', 'GEMINI_API_KEY', 'PUBLIC_SHOPIFY_STOREFRONT_ID']) {
      expect(fn, `${secret} appears inside buildCommerceEnv`).not.toContain(secret);
    }
  });
});

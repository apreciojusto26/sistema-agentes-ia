// WHAT THE ADMIN CAN HONESTLY SAY ABOUT SHOPIFY.
//
// The Admin had no Shopify code at all. The only way to make a landing buyable
// was to type a product HANDLE into an unlabelled box behind "Opciones
// avanzadas" — from memory, with a typo indistinguishable from a product that
// does not exist until the generated landing failed to build.
//
// This suite pins the two halves of the fix:
//
//   WHAT IS REAL   a read-only Storefront lookup, so a product is CHOSEN.
//   WHAT IS NOT    creating a product. No Admin API client, no credential, no
//                  route — and therefore a disabled button that says so, not a
//                  live-looking one that would lie.
//
// AND THE TOKEN NEVER LEAVES. Half of these assertions exist because a status
// endpoint is exactly the kind of place a credential ends up by accident.
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connection, searchProducts } from '../src/server/shopify/storefront';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

const TOKEN = 'shpat_never_this_value_anywhere';

const withShop = () => {
  vi.stubEnv('PUBLIC_SHOPIFY_STORE_DOMAIN', 'tienda.myshopify.com');
  vi.stubEnv('PUBLIC_SHOPIFY_STOREFRONT_TOKEN', TOKEN);
  vi.stubEnv('PUBLIC_SHOPIFY_API_VERSION', '2025-01');
};
const withoutShop = () => {
  vi.stubEnv('PUBLIC_SHOPIFY_STORE_DOMAIN', '');
  vi.stubEnv('PUBLIC_SHOPIFY_STOREFRONT_TOKEN', '');
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

// ───────────────────────────────────────────────────────────────────────────
// THE CONNECTION
// ───────────────────────────────────────────────────────────────────────────

describe('the shop connection reports what is true and nothing more', () => {
  test('configured: the domain is reported, the token never is', () => {
    withShop();
    const c = connection();
    expect(c.configured).toBe(true);
    expect(c.domain).toBe('tienda.myshopify.com');
    // The whole object, stringified — the way it reaches the browser.
    expect(JSON.stringify(c), 'the storefront token reached the client').not.toContain(TOKEN);
    expect(Object.keys(c)).not.toContain('token');
  });

  test('unconfigured: not connected, and no capability claimed', () => {
    withoutShop();
    const c = connection();
    expect(c.configured).toBe(false);
    expect(c.domain).toBeNull();
    expect(c.capabilities.searchProducts).toBe(false);
  });

  test('creating a product is FALSE, and it is a fact rather than a roadmap', () => {
    withShop();
    // Asserted against the repository, not against a constant: if an Admin API
    // client ever appears, this test should be the thing that notices.
    expect(connection().capabilities.createProduct).toBe(false);
    const server = readFileSync(
      path.join(REPO_ROOT, 'admin/src/server/shopify/storefront.ts'),
      'utf-8',
    );
    for (const write of ['productCreate', 'productUpdate', 'productPublish', 'X-Shopify-Access-Token']) {
      expect(server, `${write} appeared in a read-only module`).not.toContain(write);
    }
  });

  test('it makes no network call — presence is the claim, not a probe', () => {
    // The same rule /api/health follows for the Gemini key. A round trip on
    // every page load turns a status pill into latency and flakiness.
    withShop();
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    connection();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// THE LOOKUP
// ───────────────────────────────────────────────────────────────────────────

describe('the product lookup', () => {
  beforeEach(withShop);

  const respond = (body: unknown, ok = true, status = 200) =>
    vi.fn().mockResolvedValue({ ok, status, json: async () => body });

  test('returns products an operator can choose between', async () => {
    const fetchSpy = respond({
      data: {
        products: {
          edges: [
            {
              node: {
                handle: 'tubo-rgb',
                title: 'Tubo de luz RGB',
                featuredImage: { url: 'https://cdn.shopify.com/a.jpg' },
                variants: { edges: [{ node: { price: { amount: '12.90', currencyCode: 'EUR' } } }] },
                variantsCount: { edges: [{ node: { id: '1' } }, { node: { id: '2' } }] },
              },
            },
          ],
        },
      },
    });
    vi.stubGlobal('fetch', fetchSpy);

    const result = await searchProducts('tubo');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.products).toEqual([
      {
        handle: 'tubo-rgb',
        title: 'Tubo de luz RGB',
        imageUrl: 'https://cdn.shopify.com/a.jpg',
        price: expect.stringContaining('12,90'),
        totalVariants: 2,
      },
    ]);
  });

  test('the token travels in the header and never in the URL', async () => {
    const fetchSpy = respond({ data: { products: { edges: [] } } });
    vi.stubGlobal('fetch', fetchSpy);
    await searchProducts('x');
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).not.toContain(TOKEN);
    expect((init.headers as Record<string, string>)['X-Shopify-Storefront-Access-Token']).toBe(TOKEN);
  });

  test('an empty query lists rather than searching — a picker needs something to show', async () => {
    const fetchSpy = respond({ data: { products: { edges: [] } } });
    vi.stubGlobal('fetch', fetchSpy);
    await searchProducts('   ');
    const body = JSON.parse((fetchSpy.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.variables.query).toBeNull();
  });

  test('with no shop configured it refuses, and does not call anything', async () => {
    withoutShop();
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const result = await searchProducts('x');
    expect(result.ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test.each([
    [401, /rechazó el token/],
    [500, /respondió 500/],
  ])('a %i from the shop becomes a sentence, never a throw', async (status, expected) => {
    vi.stubGlobal('fetch', respond({}, false, status));
    const result = await searchProducts('x');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toMatch(expected);
    expect(result.message, 'the token leaked into an error message').not.toContain(TOKEN);
  });

  test('a network failure is reported, not thrown at the route', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error(`connect ECONNREFUSED ${TOKEN}`)));
    const result = await searchProducts('x');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    // The cause is summarised rather than echoed — an error string is exactly
    // where a credential ends up in a log.
    expect(result.message).not.toContain(TOKEN);
    expect(result.message).toMatch(/No se pudo consultar la tienda/);
  });

  test('GraphQL-level errors surface as the shop said them', async () => {
    vi.stubGlobal('fetch', respond({ errors: [{ message: 'Field is not defined' }] }));
    const result = await searchProducts('x');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toBe('Field is not defined');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// THE BOUNDARY IT DOES NOT CROSS
// ───────────────────────────────────────────────────────────────────────────

describe('the Admin does not grow a second commerce implementation', () => {
  test('nothing here touches the landing template\'s Shopify code', () => {
    // The template's src/lib/shopify is protected by scope-boundaries and runs
    // in the LANDING's runtime. This module talks to the same shop for a
    // different reason and shares no code with it, on purpose.
    const server = readFileSync(
      path.join(REPO_ROOT, 'admin/src/server/shopify/storefront.ts'),
      'utf-8',
    );
    expect(server).not.toContain('landing-astravibe');
    expect(server).not.toContain('content/');
  });

  test('the route writes nothing', () => {
    const route = readFileSync(path.join(REPO_ROOT, 'admin/src/server/routes/shopify.ts'), 'utf-8');
    expect(route).toContain("app.get('/api/shopify/status'");
    expect(route).toContain("app.get('/api/shopify/products'");
    expect(route, 'a write route appeared on a read-only surface').not.toMatch(/app\.(post|put|patch|delete)\(/);
  });
});

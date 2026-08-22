// Preview Mode runtime.
//
// THE INVARIANT UNDER TEST, and the reason this file exists:
//
//   preview + 0 variants -> a valid, non-purchasable page
//   shopify + 0 variants -> an ERROR
//
// "Zero variants" must NEVER become globally acceptable. If it did, a genuine
// Shopify failure would render a page that merely looks fine, which is exactly
// the silent degradation this system forbids. The mode therefore comes from an
// explicit PUBLIC_COMMERCE_MODE, never from the variant list being empty.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveCommerceMode } from '@/lib/shopify/catalog';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, '../..');

const read = (rel: string) => readFileSync(path.join(SRC, rel), 'utf-8');

describe('resolveCommerceMode', () => {
  it('is preview ONLY for the exact explicit value', () => {
    expect(resolveCommerceMode({ PUBLIC_COMMERCE_MODE: 'preview' })).toBe('preview');
    expect(resolveCommerceMode({ PUBLIC_COMMERCE_MODE: '  preview  ' })).toBe('preview');
  });

  it('defaults to shopify, so anything generated before this existed keeps failing closed', () => {
    expect(resolveCommerceMode({})).toBe('shopify');
    expect(resolveCommerceMode({ PUBLIC_COMMERCE_MODE: '' })).toBe('shopify');
    expect(resolveCommerceMode({ PUBLIC_COMMERCE_MODE: 'shopify' })).toBe('shopify');
  });

  it('is NEVER inferred from a missing token or handle', () => {
    // A landing with no credentials at all is still `shopify` — that is what
    // keeps "the credentials are broken" a hard error instead of a preview.
    expect(
      resolveCommerceMode({ PUBLIC_SHOPIFY_PRODUCT_HANDLE: undefined, PUBLIC_SHOPIFY_STOREFRONT_TOKEN: undefined }),
    ).toBe('shopify');
  });
});

describe('getProductCommerce', () => {
  const realFetch = globalThis.fetch;

  beforeEach(() => vi.resetModules());
  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.unstubAllEnvs();
  });

  it('preview mode makes NO network call and invents no variant', async () => {
    const spy = vi.fn();
    globalThis.fetch = spy as unknown as typeof fetch;
    vi.stubEnv('PUBLIC_COMMERCE_MODE', 'preview');

    const { getProductCommerce } = await import('@/lib/shopify/catalog');
    const commerce = await getProductCommerce();

    expect(spy).not.toHaveBeenCalled();
    expect(commerce.variants).toEqual([]);
    expect(commerce.anyAvailable).toBe(false);
    expect(commerce.defaultVariantId).toBe('');
    expect(commerce.handle).toBe('');
  });

  it('preview mode carries the REAL product name, not a placeholder', async () => {
    vi.stubEnv('PUBLIC_COMMERCE_MODE', 'preview');
    const { getProductCommerce } = await import('@/lib/shopify/catalog');
    const { product } = await import('@/data/product');

    const commerce = await getProductCommerce();
    expect(commerce.title).toBe(product.name);
    expect(commerce.title.length).toBeGreaterThan(0);
  });

  it('preview mode emits NO monetary value at all', async () => {
    vi.stubEnv('PUBLIC_COMMERCE_MODE', 'preview');
    const { getProductCommerce } = await import('@/lib/shopify/catalog');
    const commerce = await getProductCommerce();

    // No variant means no unitPriceCents anywhere: a 0 would render "0,00 €",
    // a price nobody set.
    const serialised = JSON.stringify(commerce);
    expect(serialised).not.toContain('unitPriceCents');
    expect(commerce.variants).toHaveLength(0);
  });

  it('shopify mode FAILS rather than falling back to preview', async () => {
    // Environment-independent on purpose: depending on whether a handle is
    // resolvable here, the failure is either "missing handle" or a Storefront
    // transport error. WHICH error is not the point — the point is that it
    // rejects instead of quietly returning an empty-variant commerce.
    vi.stubEnv('PUBLIC_COMMERCE_MODE', 'shopify');
    const { getProductCommerce } = await import('@/lib/shopify/catalog');

    let resolved: unknown = null;
    let threw = false;
    try {
      resolved = await getProductCommerce();
    } catch {
      threw = true;
    }

    expect(threw, 'shopify mode resolved instead of failing').toBe(true);
    expect(resolved).toBeNull();
  });

  it('an UNSET mode behaves like shopify and fails without a handle', async () => {
    const { getProductCommerce } = await import('@/lib/shopify/catalog');
    await expect(getProductCommerce()).rejects.toThrow();
  });
});

describe('use-selection keeps the two modes apart', () => {
  const src = () => read('components/islands/parts/use-selection.ts');

  it('returns null in preview instead of a synthetic selection', () => {
    expect(src()).toMatch(/if \(isPreviewMode\(\)\) return null/);
    expect(src()).toContain('Selection | null');
  });

  it('still throws for shopify mode with zero variants', () => {
    expect(src()).toContain("throw new Error('commerce.variants is empty");
  });

  it('reads the mode from the explicit env var, not from the empty list', () => {
    expect(src()).toContain('PUBLIC_COMMERCE_MODE');
    // The forbidden shortcut: treating an empty list as "must be preview".
    expect(src()).not.toMatch(/variants\.length === 0\s*\)\s*return/);
  });

  it('fabricates no id, price or variant object', () => {
    const s = src();
    expect(s).not.toMatch(/unitPriceCents:\s*0/);
    expect(s).not.toMatch(/id:\s*['"]preview/);
    expect(s).not.toMatch(/availableForSale:\s*true/);
  });
});

describe('the purchase controls render unavailable, not fake', () => {
  const bundle = () => read('components/islands/BundleSelector.tsx');
  const sticky = () => read('components/islands/StickyAddToCart.tsx');

  it('BundleSelector tolerates no selection and disables its CTA', () => {
    const s = bundle();
    expect(s).toMatch(/if \(!selection\)/);
    expect(s).toContain('data-preview-cta');
    expect(s).toContain('disabled');
  });

  it('StickyAddToCart tolerates no selection and disables its CTA', () => {
    const s = sticky();
    expect(s).toMatch(/if \(!selection\)/);
    expect(s).toContain('data-preview-cta');
    expect(s).toContain('aria-disabled');
  });

  it('neither preview branch renders a price', () => {
    // The preview branch must not reach for formatPrice or a projection.
    for (const [name, s] of [['BundleSelector', bundle()], ['StickyAddToCart', sticky()]] as const) {
      const branch = s.slice(s.indexOf('if (!selection)'), s.indexOf('const { variant'));
      expect(branch, `${name} preview branch renders a price`).not.toContain('formatPrice');
      expect(branch, `${name} preview branch renders a projection`).not.toContain('projection');
    }
  });

  it('the guard sits AFTER every hook, so hook order stays stable', () => {
    // React requires an unconditional hook sequence. In StickyAddToCart the
    // early return must come after its useEffect, not next to useSelection.
    const s = sticky();
    expect(s.indexOf('useEffect(')).toBeLessThan(s.indexOf('if (!selection)'));
  });
});

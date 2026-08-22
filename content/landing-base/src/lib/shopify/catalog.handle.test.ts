// Fase 5 — which Shopify product a landing sells.
//
// Before this phase the handle was a literal inside fetchProductCommerce(),
// so EVERY generated landing fetched the base template's star projector no
// matter what product it advertised, while `commerce.shopifyHandle` in the
// data layer looked like the knob and was read by nobody.
//
// The property these tests protect is narrow and absolute: a landing without
// an explicit handle must FAIL, never inherit one.
import { describe, expect, it } from 'vitest';
import { resolveProductHandle } from '@/lib/shopify/catalog';
import { ShopifyError } from '@/lib/shopify/client';

describe('resolveProductHandle', () => {
  it('uses the landing\'s own PUBLIC_SHOPIFY_PRODUCT_HANDLE', () => {
    expect(resolveProductHandle({ PUBLIC_SHOPIFY_PRODUCT_HANDLE: 'selfie-vlog-monitor' })).toBe('selfie-vlog-monitor');
  });

  it('two landings resolve to two different products', () => {
    expect(resolveProductHandle({ PUBLIC_SHOPIFY_PRODUCT_HANDLE: 'handle-a' })).toBe('handle-a');
    expect(resolveProductHandle({ PUBLIC_SHOPIFY_PRODUCT_HANDLE: 'handle-b' })).toBe('handle-b');
  });

  it('THROWS when no handle is configured — never a silent fallback', () => {
    expect(() => resolveProductHandle({})).toThrow(ShopifyError);
    expect(() => resolveProductHandle({})).toThrow(/PUBLIC_SHOPIFY_PRODUCT_HANDLE/);
  });

  it('treats blank and whitespace-only as absent', () => {
    expect(() => resolveProductHandle({ PUBLIC_SHOPIFY_PRODUCT_HANDLE: '' })).toThrow(ShopifyError);
    expect(() => resolveProductHandle({ PUBLIC_SHOPIFY_PRODUCT_HANDLE: '   ' })).toThrow(ShopifyError);
  });

  it('trims a handle that arrived with stray whitespace', () => {
    expect(resolveProductHandle({ PUBLIC_SHOPIFY_PRODUCT_HANDLE: '  spaced-handle \n' })).toBe('spaced-handle');
  });

  describe('the template literal is unreachable without the explicit switch', () => {
    it('is NOT used when the compat flag is absent', () => {
      expect(() => resolveProductHandle({})).toThrow();
    });

    it('is NOT used for any truthy-ish value other than exactly "1"', () => {
      for (const v of ['0', 'true', 'yes', '', 'TRUE']) {
        expect(() => resolveProductHandle({ PUBLIC_SHOPIFY_TEMPLATE_COMPAT: v })).toThrow(ShopifyError);
      }
    });

    it('is used ONLY with PUBLIC_SHOPIFY_TEMPLATE_COMPAT="1", so `pnpm dev` on the base template still works', () => {
      expect(resolveProductHandle({ PUBLIC_SHOPIFY_TEMPLATE_COMPAT: '1' })).toMatch(/^usb-mini-galaxy-star-projector/);
    });

    it('an explicit handle WINS over the compat switch', () => {
      // A generated landing that somehow inherited the compat flag must still
      // sell its own product, never the template's.
      expect(
        resolveProductHandle({ PUBLIC_SHOPIFY_PRODUCT_HANDLE: 'my-real-product', PUBLIC_SHOPIFY_TEMPLATE_COMPAT: '1' }),
      ).toBe('my-real-product');
    });
  });
});

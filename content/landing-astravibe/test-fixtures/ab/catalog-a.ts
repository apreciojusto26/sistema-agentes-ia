// A: TWO variants, both available, one of them the "popular" 6.
// Materializes: available, popular, checked, unchecked.
import type { ProductCommerce } from '@/lib/shopify/types';
export { parseProjectionCount, toCustomerTitle } from '../../src/lib/shopify/catalog';

const FIXTURE: ProductCommerce = {
  handle: 'fixture-a', title: 'Nordika — Difusor de aromas cerámico', currencyCode: 'EUR',
  optionName: 'Acabado',
  variants: [
    { id: 'gid://fixture-a/V/1', title: '1 proyecciones', projectionCount: 1, optionValue: 'Blanco', availableForSale: true, unitPriceCents: 2900, unitCompareAtCents: 3900, imageIndex: 0 },
    { id: 'gid://fixture-a/V/6', title: '6 proyecciones', projectionCount: 6, optionValue: 'Arena', availableForSale: true, unitPriceCents: 3400, unitCompareAtCents: null, imageIndex: 1 },
  ],
  defaultVariantId: 'gid://fixture-a/V/6', anyAvailable: true,
  images: [
    { url: 'https://fixture.invalid/a1.jpg', altText: 'A1', width: 1200, height: 1200 },
    { url: 'https://fixture.invalid/a2.jpg', altText: 'A2', width: 1200, height: 1200 },
  ],
};
export function getProductCommerce(): Promise<ProductCommerce> { return Promise.resolve(FIXTURE); }
export function resolveCommerceMode(): 'preview' | 'shopify' { return 'shopify'; }
export function resolveProductHandle(): string { return FIXTURE.handle; }

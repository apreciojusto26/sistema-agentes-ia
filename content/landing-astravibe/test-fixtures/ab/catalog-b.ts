// B: FOUR variants against A's two, and a sold-out one among them.
// Materializes: available, SOLD OUT, popular, non-popular, checked, unchecked.
// Together with A this covers every state the A/B pair is asked to show; the
// full 8-state space is proved at the component, not here.
//
// Different image dimensions from A's on purpose — 1600x900 rather than
// 1200x1200 — so media intrinsics vary between the two builds.
import type { ProductCommerce } from '@/lib/shopify/types';
export { parseProjectionCount, toCustomerTitle } from '../../src/lib/shopify/catalog';

const FIXTURE: ProductCommerce = {
  handle: 'fixture-b', title: 'Roble & Sal — Tabla de corte de roble macizo', currencyCode: 'EUR',
  optionName: 'Tamaño',
  variants: [
    { id: 'gid://fixture-b/V/1', title: '1 proyecciones', projectionCount: 1, optionValue: 'Pequeña', availableForSale: true, unitPriceCents: 4900, unitCompareAtCents: null, imageIndex: 0 },
    { id: 'gid://fixture-b/V/2', title: '2 proyecciones', projectionCount: 2, optionValue: 'Mediana', availableForSale: false, unitPriceCents: 5900, unitCompareAtCents: 6900, imageIndex: 1 },
    { id: 'gid://fixture-b/V/6', title: '6 proyecciones', projectionCount: 6, optionValue: 'Grande', availableForSale: true, unitPriceCents: 6900, unitCompareAtCents: null, imageIndex: 2 },
    { id: 'gid://fixture-b/V/9', title: '9 proyecciones', projectionCount: 9, optionValue: 'XL', availableForSale: false, unitPriceCents: 8900, unitCompareAtCents: null, imageIndex: null },
  ],
  defaultVariantId: 'gid://fixture-b/V/6', anyAvailable: true,
  images: [
    { url: 'https://fixture.invalid/b1.jpg', altText: 'B1', width: 1600, height: 900 },
    { url: 'https://fixture.invalid/b2.jpg', altText: 'B2', width: 1600, height: 900 },
    { url: 'https://fixture.invalid/b3.jpg', altText: 'B3', width: 1600, height: 900 },
  ],
};
export function getProductCommerce(): Promise<ProductCommerce> { return Promise.resolve(FIXTURE); }
export function resolveCommerceMode(): 'preview' | 'shopify' { return 'shopify'; }
export function resolveProductHandle(): string { return FIXTURE.handle; }

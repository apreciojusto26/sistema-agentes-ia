import { storefront, ShopifyError } from '@/lib/shopify/client';
import { moneyToCents } from '@/lib/shopify/money';
import { PRODUCT_QUERY } from '@/lib/shopify/queries';
import type { ProductCommerce, VariantOption } from '@/lib/shopify/types';

interface ProductQueryResponse {
  product: {
    handle: string;
    title: string;
    options: { name: string; values: string[] }[];
    variants: {
      nodes: {
        id: string;
        title: string;
        availableForSale: boolean;
        selectedOptions: { name: string; value: string }[];
        price: { amount: string; currencyCode: string };
        compareAtPrice: { amount: string } | null;
        image: { url: string } | null;
      }[];
    };
    images: {
      nodes: { url: string; altText: string | null; width: number; height: number }[];
    };
  } | null;
}

/**
 * Shopify's own variant titles ("1 Random Slides", "6 Slides", "24 Slides")
 * are supplier language. Buyers do not shop for "slides" — they shop for how
 * many scenes the thing projects, so the count is parsed here and the visible
 * title rewritten ONCE, at the boundary. Every surface that shows a variant
 * (buy box, sticky bar, cart drawer, checkout summary) inherits it.
 */
export function parseProjectionCount(shopifyTitle: string): number | null {
  const match = /^\s*(\d+)\b/.exec(shopifyTitle);
  if (!match) return null;
  const count = Number.parseInt(match[1]!, 10);
  return Number.isFinite(count) && count > 0 ? count : null;
}

export function toCustomerTitle(shopifyTitle: string, count: number | null): string {
  if (count === null) return shopifyTitle;
  return `${count} ${count === 1 ? 'proyección' : 'proyecciones'}`;
}

/**
 * The variant a buyer lands on. Preferring the middle option is deliberate:
 * opening on the most expensive one reads as an upsell and depresses
 * add-to-cart, while the cheapest anchors the product low. Falls back to
 * Shopify's first available variant when the 6-film option is gone.
 */
const PREFERRED_DEFAULT_PROJECTIONS = 6;

let memoizedFetch: Promise<ProductCommerce> | null = null;

/**
 * BUILD-time only. Module-memoized promise guarantees ONE network call per
 * build even though 05-buy-box.astro and 15-sticky-bar.astro both await it.
 * Throws loud on any failure — NO stale-data fallback (per spec).
 */
export function getProductCommerce(): Promise<ProductCommerce> {
  if (!memoizedFetch) {
    memoizedFetch = fetchProductCommerce();
  }
  return memoizedFetch;
}

async function fetchProductCommerce(): Promise<ProductCommerce> {
  const handle =
    'usb-mini-galaxy-star-projector-star-with-24-sliding-projection-films-starry-space-atmosphere-nightlight-kid-car-home-decoration';

  const data = await storefront<ProductQueryResponse>(PRODUCT_QUERY, { handle });

  if (!data.product) {
    throw new ShopifyError(`Product not found for handle "${handle}" — build aborted`);
  }

  const { product } = data;
  const variantNodes = product.variants.nodes;

  if (variantNodes.length === 0) {
    throw new ShopifyError('Product has 0 variants — build aborted');
  }
  if (variantNodes.length >= 20) {
    throw new ShopifyError('Product has >= 20 variants — pagination not implemented, build aborted');
  }

  const currencyCode = variantNodes[0]!.price.currencyCode;
  if (currencyCode !== 'EUR') {
    throw new ShopifyError(`Expected currencyCode EUR, got "${currencyCode}" — build aborted`);
  }

  const images = product.images.nodes;

  const variants: VariantOption[] = variantNodes.map((node) => {
    const optionValue = node.selectedOptions[0]?.value ?? node.title;
    const imageIndex = node.image ? images.findIndex((img) => img.url === node.image!.url) : -1;
    const projectionCount = parseProjectionCount(node.title);

    return {
      id: node.id,
      title: toCustomerTitle(node.title, projectionCount),
      projectionCount,
      optionValue,
      availableForSale: node.availableForSale,
      unitPriceCents: moneyToCents(node.price.amount),
      unitCompareAtCents: node.compareAtPrice ? moneyToCents(node.compareAtPrice.amount) : null,
      imageIndex: imageIndex >= 0 ? imageIndex : null,
    };
  });

  const preferredDefault = variants.find(
    (v) => v.availableForSale && v.projectionCount === PREFERRED_DEFAULT_PROJECTIONS,
  );
  const firstAvailable = variants.find((v) => v.availableForSale);
  const defaultVariantId = (preferredDefault ?? firstAvailable ?? variants[0]!).id;

  return {
    handle: product.handle,
    title: product.title,
    currencyCode: 'EUR',
    optionName: product.options[0]?.name ?? '',
    variants,
    defaultVariantId,
    anyAvailable: variants.some((v) => v.availableForSale),
    images: images.map((img) => ({
      url: img.url,
      altText: img.altText,
      width: img.width,
      height: img.height,
    })),
  };
}

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

    return {
      id: node.id,
      title: node.title,
      optionValue,
      availableForSale: node.availableForSale,
      unitPriceCents: moneyToCents(node.price.amount),
      unitCompareAtCents: node.compareAtPrice ? moneyToCents(node.compareAtPrice.amount) : null,
      imageIndex: imageIndex >= 0 ? imageIndex : null,
    };
  });

  const firstAvailable = variants.find((v) => v.availableForSale);
  const defaultVariantId = firstAvailable ? firstAvailable.id : variants[0]!.id;

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

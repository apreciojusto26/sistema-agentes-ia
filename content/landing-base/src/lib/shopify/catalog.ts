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

/**
 * The base template's own product. Kept ONLY so `pnpm dev` and the existing
 * tests inside content/landing-base still have something to resolve — it is
 * reachable exclusively through the explicit compatibility switch below and
 * is never a fallback for a generated landing.
 */
const TEMPLATE_COMPAT_HANDLE =
  'usb-mini-galaxy-star-projector-star-with-24-sliding-projection-films-starry-space-atmosphere-nightlight-kid-car-home-decoration';

/**
 * Resolves which Shopify product this landing sells.
 *
 * Until Fase 5 the handle above was hardcoded here, so EVERY generated
 * landing — whatever product it advertised — fetched the star projector's
 * price and variants. `commerce.shopifyHandle` in the data layer looked like
 * the knob but was read by nobody: dead data.
 *
 * FAIL-CLOSED. A missing handle throws. The template literal is reachable
 * only when `PUBLIC_SHOPIFY_TEMPLATE_COMPAT` is explicitly "1", which
 * generate-landing.mjs never writes into a generated output. Falling back
 * silently would reintroduce exactly the contamination this replaces: a
 * landing for product B quietly selling product A.
 *
 * Exported so the wiring can be tested without a network call.
 */
export function resolveProductHandle(
  // Indexed rather than a named-property shape: `ImportMetaEnv` declares no
  // properties in common with a literal type, so a structural annotation
  // fails `astro check` with ts(2559).
  env: Record<string, string | undefined> = import.meta.env as unknown as Record<string, string | undefined>,
): string {
  const handle = env.PUBLIC_SHOPIFY_PRODUCT_HANDLE?.trim();
  if (handle) return handle;

  if (env.PUBLIC_SHOPIFY_TEMPLATE_COMPAT === '1') return TEMPLATE_COMPAT_HANDLE;

  throw new ShopifyError(
    'Missing PUBLIC_SHOPIFY_PRODUCT_HANDLE — this landing declares no Shopify product, so there is nothing to price or sell. ' +
      'Set it in the landing\'s .env (generate-landing.mjs --shopify-handle writes it), or set PUBLIC_SHOPIFY_TEMPLATE_COMPAT=1 ' +
      'to build the base template against its own demo product. No silent fallback exists on purpose.',
  );
}

async function fetchProductCommerce(): Promise<ProductCommerce> {
  const handle = resolveProductHandle();

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

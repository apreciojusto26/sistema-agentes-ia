import { storefront, ShopifyError } from '@/lib/shopify/client';
import { product as generatedProduct } from '@/data/product';
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

/**
 * The handle this TEMPLATE was built against. Reachable only through an
 * explicit opt-in — never in a generated landing. See resolveProductHandle().
 */
const TEMPLATE_COMPAT_HANDLE =
  'usb-mini-galaxy-star-projector-star-with-24-sliding-projection-films-starry-space-atmosphere-nightlight-kid-car-home-decoration';

/**
 * Which Shopify product this landing sells.
 *
 * THE HANDLE ABOVE USED TO BE HARDCODED INSIDE fetchProductCommerce(). This
 * template is the canonical source every Fixed landing is copied from, so that
 * one literal meant every generated landing — whatever product it advertised —
 * fetched the star projector's price, variants and images. A landing for a
 * coffee grinder would have priced and sold a galaxy projector. Meanwhile
 * `commerce.shopifyHandle` in the data layer looked like the knob and was read
 * by nobody: dead data.
 *
 * FAIL-CLOSED. A missing handle throws. The template literal is reachable only
 * when PUBLIC_SHOPIFY_TEMPLATE_COMPAT is explicitly "1", which no generated
 * output ever sets. A silent fallback would reintroduce exactly the
 * contamination this replaces.
 *
 * Exported so the wiring is testable without a network call.
 */
export function resolveProductHandle(
  // Indexed rather than a named-property shape: `ImportMetaEnv` declares no
  // properties in common with a literal type, so a structural annotation fails
  // astro check with ts(2559).
  env: Record<string, string | undefined> = import.meta.env as unknown as Record<string, string | undefined>,
): string {
  const handle = env.PUBLIC_SHOPIFY_PRODUCT_HANDLE?.trim();
  if (handle) return handle;

  if (env.PUBLIC_SHOPIFY_TEMPLATE_COMPAT === '1') return TEMPLATE_COMPAT_HANDLE;

  throw new ShopifyError(
    'Missing PUBLIC_SHOPIFY_PRODUCT_HANDLE — this landing declares no Shopify product, so there is nothing to price or sell. ' +
      "Set it in the landing's .env (generate-landing.mjs --shopify-handle writes it), or set PUBLIC_SHOPIFY_TEMPLATE_COMPAT=1 " +
      'to build this template against its own demo product. No silent fallback exists on purpose.',
  );
}

/**
 * Which commerce posture this landing was GENERATED with.
 *
 * Read from an explicit PUBLIC_COMMERCE_MODE, never inferred from a missing
 * token. Inference would make "the credentials are broken" and "this landing
 * was never meant to sell" indistinguishable, and the first of those has to
 * stay a hard error.
 *
 * Defaults to `shopify`, so anything built before this existed keeps its
 * fail-closed behaviour instead of silently becoming a preview.
 */
export function resolveCommerceMode(
  env: Record<string, string | undefined> = import.meta.env as unknown as Record<string, string | undefined>,
): 'preview' | 'shopify' {
  return env.PUBLIC_COMMERCE_MODE?.trim() === 'preview' ? 'preview' : 'shopify';
}

/**
 * The commerce shape for a landing generated WITHOUT commerce.
 *
 * Carries the product's real name and nothing else. `variants` is empty on
 * purpose: there is no trustworthy price for a product never linked to
 * Shopify, and emitting a 0 would render "0,00 €" — a fabricated price. An
 * empty variant list makes every purchase control resolve to its unavailable
 * state instead, which is the truth.
 */
function previewCommerce(): ProductCommerce {
  return {
    handle: '',
    title: generatedProduct.name,
    currencyCode: 'EUR',
    optionName: generatedProduct.variantGroupLabel ?? '',
    variants: [],
    defaultVariantId: '',
    anyAvailable: false,
    images: [],
  };
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
  // PREVIEW MODE: no handle, no token, no network. This is NOT a fallback — it
  // is reachable only when the landing was explicitly generated this way. A
  // commerce landing whose Shopify call fails still throws, and must: the
  // forbidden path is "commerce requested -> Shopify fails -> show preview".
  if (resolveCommerceMode() === 'preview') return previewCommerce();

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

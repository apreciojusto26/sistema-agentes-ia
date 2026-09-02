/**
 * Shopify Storefront API domain types.
 * Shared by build-time catalog fetch (lib/shopify/catalog.ts) and client-side
 * cart mutations (lib/shopify/cart.ts). Never assume uniform pricing across
 * variants — always read unitPriceCents off the specific VariantOption.
 */

export interface VariantOption {
  id: string; // gid://shopify/ProductVariant/...
  title: string; // customer-facing: '6 proyecciones' (see catalog.ts)
  /**
   * How many projection films the variant ships, parsed ONCE from Shopify's
   * own title. Everything that used to match `/^24\s+slides?$/i` compares this
   * instead: renaming the customer-facing copy can no longer silently break
   * the default selection or the "Más elegido" badge.
   */
  projectionCount: number | null;
  optionValue: string; // selectedOptions[0].value ("Emitting Color")
  availableForSale: boolean;
  unitPriceCents: number; // PER-VARIANT — never assume uniform
  unitCompareAtCents: number | null;
  imageIndex: number | null; // index into ProductCommerce.images
}

export interface ProductCommerce {
  handle: string;
  title: string; // Shopify title — used in buy box <h2> + sticky bar
  currencyCode: 'EUR'; // asserted at build
  optionName: string; // 'Emitting Color' (mislabeled in admin — see copy note)
  variants: VariantOption[]; // Shopify admin order PRESERVED
  defaultVariantId: string; // first availableForSale, else variants[0].id
  anyAvailable: boolean;
  images: { url: string; altText: string | null; width: number; height: number }[];
}

export interface PackProjection {
  packId: string;
  totalUnits: number; // what actually goes in the cart
  paidUnits: number;
  priceCents: number; // projection ONLY — superseded by cart.cost
  compareAtCents: number;
  savingsCents: number; // 0 => render no savings pill
  claimsFreeUnits: boolean; // false unless bundleOfferActive && pack.freeUnits > 0
}

export interface CartSnapshot {
  id: string; // gid://shopify/Cart/...
  checkoutUrl: string;
  totalQuantity: number;
  subtotalCents: number;
  totalCents: number; // AUTHORITATIVE
  discountCents: number; // sum of discountAllocations; 0 => BXGY did not fire
  line: { id: string; variantId: string; quantity: number } | null;
}

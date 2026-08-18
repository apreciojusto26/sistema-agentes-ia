// Hand-written declarations for product-normalizer.mjs (design ADR-2 /
// #436 ADR-3/N1). Gives admin/ full types with zero build coupling — nothing
// else in the repo typechecks scripts/. Keep in sync manually with the
// JSDoc typedefs in product-normalizer.mjs; drift is caught at runtime by
// admin/test/no-duplicated-contract.test.ts-style guards on the adapter.
//
// NOTE: named ".d.mts" (not ".d.ts") — the extension TypeScript's Node-style
// resolution matches for a ".mjs" import specifier, same precedent as
// content-contract.d.mts.

export interface CanonicalImage {
  url: string | null;
  localPath: string | null;
  order: number;
}

export interface CanonicalReview {
  text: string | null;
  rating: number | null;
  author: string | null;
  dateRaw: string | null;
  variant: string | null;
}

export interface CanonicalVariantOption {
  name: string | null;
  selected: string | null;
  options: string[];
}

export interface CanonicalProduct {
  identity: {
    productId: string | null;
    sourceUrl: string | null;
    sourceItemId: null;
    name: string | null;
    brand: string | null;
  };
  commerceFacts: {
    variantOptions: CanonicalVariantOption[];
  };
  socialProof: {
    rating: number | null;
    reviewCount: number | null;
    reviews: CanonicalReview[];
  };
  media: {
    images: CanonicalImage[];
    videos: [];
  };
  specifications: [];
  description: {
    raw: string | null;
  };
  provenance: {
    scrapedAt: string | null;
    scrapeJobId: null;
  };
}

/**
 * Normalizes raw scraper/legacy input into a fixed-shape CanonicalProduct.
 * Pure, synchronous, total — never throws, never mutates `raw`.
 */
export declare function normalizeProduct(raw: unknown): CanonicalProduct;

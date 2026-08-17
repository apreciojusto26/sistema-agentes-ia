// Hand-written declarations for content-contract.mjs (design §5). Gives
// admin/ full types with zero build coupling — nothing else in the repo
// typechecks scripts/. Keep in sync manually; drift is caught at runtime by
// admin/test/contract.generate-landing.test.ts Group D and
// admin/test/no-duplicated-contract.test.ts.
//
// NOTE: named ".d.mts" (not ".d.ts" as design §5 literally says) — that is
// the extension TypeScript's Node-style resolution matches for a ".mjs"
// import specifier. A plain ".d.ts" beside content-contract.mjs is silently
// NOT picked up and produces TS7016 "implicitly has an any type" on any
// consumer, even under moduleResolution "Bundler". Verified empirically
// during apply (Batch B, B3) before locking in this filename.

export declare const ALLOWED_PRODUCT_FIELDS: readonly string[];
export declare const REQUIRED_PRODUCT_FIELDS: readonly string[];
export declare const FAQ_FIELDS: readonly string[];
export declare const TESTIMONIAL_REQUIRED_FIELDS: readonly string[];
export declare const TESTIMONIAL_ALL_FIELDS: readonly string[];

export declare const DEFAULT_ERRORS: {
  network: string;
  soldOut: string;
  expired: string;
  noDiscount: string;
  generic: string;
};

export type ContentIssueCode =
  | 'missing-top-level'
  | 'product-commerce-forbidden'
  | 'product-unknown-fields'
  | 'product-missing-fields'
  | 'faq-not-array'
  | 'faq-missing-fields'
  | 'testimonials-not-array'
  | 'testimonials-missing-fields'
  | 'testimonials-unknown-fields'
  | 'testimonial-bad-variant'
  | 'product-id-invalid';

export interface ContentIssue {
  code: ContentIssueCode;
  path: string;
  message: string;
  fields?: string[];
}

export declare class ContentContractError extends Error {
  code?: ContentIssueCode;
  path?: string;
  constructor(message: string, options?: { code?: ContentIssueCode; path?: string });
}

export declare function validateProduct(product: unknown): void;
export declare function validateFaq(faq: unknown): void;
export declare function validateTestimonials(testimonials: unknown): void;
export declare function validateContent(input: unknown): void;
export declare function collectContentErrors(input: unknown): ContentIssue[];

// Thin re-export adapter over scripts/lib/product-normalizer.mjs (design
// ADR-2). This is NOT a re-implementation — normalizeProduct's projection
// logic must never be duplicated here. Same no-duplication convention as
// admin/src/server/validation/content.ts and
// admin/src/server/validation/product-id.ts.
//
// The server runs under tsx with no compile step (design §1 judgment call 2
// of the content-contract precedent), so this relative import stays valid
// at runtime; moduleResolution "Bundler" (admin/tsconfig.server.json)
// resolves the sibling product-normalizer.d.mts for types. NOTE: named
// ".d.mts", not ".d.ts" — TypeScript's extension-matching rule for a ".mjs"
// import specifier looks for "<name>.d.mts", not "<name>.d.ts".
export { normalizeProduct } from '../../../../scripts/lib/product-normalizer.mjs';

export type {
  CanonicalImage,
  CanonicalReview,
  CanonicalVariantOption,
  CanonicalProduct,
} from '../../../../scripts/lib/product-normalizer.mjs';

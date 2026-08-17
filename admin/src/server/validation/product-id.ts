// Thin re-export adapter over scripts/lib/product-id.cjs (design D1).
// This is NOT a re-implementation — PRODUCT_ID_RE/newProductId/isProductId
// must never be duplicated here. Same no-duplication convention as
// admin/src/server/validation/content.ts (guarded there by
// admin/test/no-duplicated-contract.test.ts).
//
// The server runs under tsx with no compile step (design §1 judgment call 2
// of the content-contract precedent), so this relative import stays valid
// at runtime; moduleResolution "Bundler" (admin/tsconfig.server.json)
// resolves the sibling product-id.d.cts for types. NOTE: named ".d.cts",
// not ".d.ts" — TypeScript's extension-matching rule for a ".cjs" import
// specifier looks for "<name>.d.cts", not "<name>.d.ts".
export { PRODUCT_ID_RE, newProductId, isProductId } from '../../../../scripts/lib/product-id.cjs';

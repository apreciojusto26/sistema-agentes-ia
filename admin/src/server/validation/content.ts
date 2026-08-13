// Thin re-export adapter over scripts/lib/content-contract.mjs (spec R6).
// This is NOT a re-implementation — no field whitelist may be duplicated
// here. Guarded by admin/test/no-duplicated-contract.test.ts.
//
// The server runs under tsx with no compile step (design §1 judgment call 2),
// so this relative import stays valid at runtime; moduleResolution "Bundler"
// (admin/tsconfig.server.json) resolves the sibling content-contract.d.mts
// for types. NOTE: named ".d.mts", not ".d.ts" as design §5 literally says —
// TypeScript's extension-matching rule for a ".mjs" import specifier looks
// for "<name>.d.mts", not "<name>.d.ts" (verified: ".d.ts" produces TS7016
// "implicitly has an any type" even though the file sits right beside the
// .mjs and is in tsconfig.server.json's "include").
export {
  ALLOWED_PRODUCT_FIELDS,
  REQUIRED_PRODUCT_FIELDS,
  FAQ_FIELDS,
  TESTIMONIAL_REQUIRED_FIELDS,
  TESTIMONIAL_ALL_FIELDS,
  DEFAULT_ERRORS,
  ContentContractError,
  validateProduct,
  validateFaq,
  validateTestimonials,
  validateContent,
  collectContentErrors,
} from '../../../../scripts/lib/content-contract.mjs';

export type { ContentIssue, ContentIssueCode } from '../../../../scripts/lib/content-contract.mjs';

// Hand-written declarations for product-id.cjs (design D1). Gives admin/
// full types with zero build coupling — nothing else in the repo typechecks
// scripts/. Keep in sync manually; drift is caught at runtime by any
// contract test importing both sides (see
// admin/test/no-duplicated-contract.test.ts pattern for content-contract).
//
// NOTE: named ".d.cts" (not ".d.ts"), mirroring content-contract.d.mts's
// ".d.mts" rationale — TypeScript's Node-style resolution matches a sibling
// "<name>.d.cts" for a ".cjs" import specifier. A plain ".d.ts" beside
// product-id.cjs is not picked up and produces TS7016 "implicitly has an
// any type" on any consumer, even under moduleResolution "Bundler".

export declare const PRODUCT_ID_RE: RegExp;

export declare function newProductId(): string;
export declare function isProductId(value: unknown): value is string;

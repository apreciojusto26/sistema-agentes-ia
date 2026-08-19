// Thin re-export adapter over scripts/lib/design-contract.mjs and
// design-registry.mjs (agents.MD §5.7). This is NOT a re-implementation — no
// capability list, family list, density list or token list may be duplicated
// here. Guarded by admin/test/no-duplicated-contract.test.ts.
//
// Mirrors validation/content.ts exactly: the server runs under tsx with no
// compile step, so these relative imports stay valid at runtime;
// moduleResolution "Bundler" (admin/tsconfig.server.json) resolves the sibling
// .d.mts files for types. NOTE: the declaration files are named ".d.mts", not
// ".d.ts" — TypeScript's extension-matching rule for a ".mjs" import specifier
// looks for "<name>.d.mts" (see the note in content-contract.d.mts).
//
// NOT WIRED TO ANY ROUTE YET (Fase 1, deliberate): no JobKind 'design' exists,
// no Design Agent produces a DesignSpec, and the generation pipeline is
// unchanged. This adapter exists so the contract has its admin-side seam ready
// — the same way validation/content.ts existed before the Content Agent job did.
export {
  DESIGN_SPEC_SCHEMA,
  ALLOWED_SPEC_FIELDS,
  ALLOWED_DESIGN_FIELDS,
  ALLOWED_SECTION_FIELDS,
  UNSUPPORTED_CAPABILITY_CODES,
  DesignContractError,
  collectDesignErrors,
  validateDesignSpec,
  checkDesignSupport,
} from '../../../../scripts/lib/design-contract.mjs';

export type {
  DesignSpec,
  DesignSpecSection,
  DesignSpecTextToken,
  DesignIssue,
  DesignIssueCode,
  DesignSupportResult,
} from '../../../../scripts/lib/design-contract.mjs';

export {
  DESIGN_FAMILIES,
  DESIGN_DENSITIES,
  THEME_GROUPS,
  THEME_TOKENS,
  THEME_TEXT_FIELDS,
  PROTECTED_STRUCTURAL_TOKENS,
  REGISTRY,
  listCategories,
  listTypes,
  listVariants,
  resolveCapability,
  capabilityKey,
} from '../../../../scripts/lib/design-registry.mjs';

export type {
  DesignFamily,
  DesignDensity,
  ThemeGroup,
  PropRule,
  RegistryEntry,
} from '../../../../scripts/lib/design-registry.mjs';

// Hand-written declarations for design-contract.mjs (agents.MD §5.7). Gives
// admin/ full types with zero build coupling — nothing else in the repo
// typechecks scripts/. Keep in sync manually; drift is caught at runtime by
// admin/test/contract.design-spec.test.ts.
//
// NOTE: named ".d.mts" (not ".d.ts") for the same resolution reason documented
// in content-contract.d.mts and design-registry.d.mts.

import type { DesignFamily, DesignDensity, RegistryEntry, ThemeGroup } from './design-registry.mjs';

export interface DesignSpecSection {
  category: string;
  type: string;
  variant: string;
  /** Must equal the entry's own array position — contiguous from 0, no gaps. */
  order: number;
  /** Omitted in v1: every production capability declares propsSchema: {}. */
  props?: Record<string, unknown>;
}

export interface DesignSpecTextToken {
  size?: string;
  lineHeight?: string;
  letterSpacing?: string;
}

export interface DesignSpec {
  schema: 1;
  productId: string;
  design: { family: DesignFamily; density: DesignDensity };
  /** Optional — a spec that overrides no tokens keeps the template's own @theme. */
  theme?: Partial<{
    colors: Record<string, string>;
    fonts: Record<string, string>;
    radius: Record<string, string>;
    shadow: Record<string, string>;
    text: Record<string, DesignSpecTextToken>;
  }>;
  sections: DesignSpecSection[];
}

export type DesignIssueCode =
  | 'spec-not-object'
  | 'schema-invalid'
  | 'product-id-invalid'
  | 'spec-unknown-fields'
  | 'missing-top-level'
  | 'design-not-object'
  | 'design-family-invalid'
  | 'design-density-invalid'
  | 'design-unknown-fields'
  | 'theme-not-object'
  | 'theme-unknown-group'
  | 'theme-group-not-object'
  | 'theme-unknown-token'
  | 'theme-token-invalid'
  | 'theme-text-invalid'
  | 'sections-not-array'
  | 'section-not-object'
  | 'section-unknown-fields'
  | 'section-order-invalid'
  | 'section-unknown-category'
  | 'section-unknown-type'
  | 'section-unknown-variant'
  | 'section-family-incompatible'
  | 'section-density-incompatible'
  | 'section-props-unknown'
  | 'section-props-invalid'
  | 'section-duplicate-type'
  | 'section-incompatible-pair'
  | 'hero-missing'
  | 'hero-duplicated'
  | 'hero-not-first'
  | 'conversion-missing';

export interface DesignIssue {
  code: DesignIssueCode;
  path: string;
  message: string;
  fields?: string[];
  /** Present on capability-existence issues: the `category/type/variant` that was requested. */
  capability?: string;
}

/** agents.MD §6.3. There is deliberately no fourth (fallback/best-effort) outcome. */
export type DesignSupportResult =
  | { status: 'pass' }
  | { status: 'unsupported_design'; missingCapability?: string; issues: DesignIssue[] }
  | { status: 'invalid'; issues: DesignIssue[] };

export declare const DESIGN_SPEC_SCHEMA: 1;
export declare const ALLOWED_SPEC_FIELDS: readonly string[];
export declare const ALLOWED_DESIGN_FIELDS: readonly string[];
export declare const ALLOWED_SECTION_FIELDS: readonly string[];
export declare const UNSUPPORTED_CAPABILITY_CODES: readonly DesignIssueCode[];

export declare class DesignContractError extends Error {
  code?: DesignIssueCode;
  path?: string;
  constructor(message: string, options?: { code?: DesignIssueCode; path?: string });
}

export declare function collectDesignErrors(
  input: unknown,
  registry?: readonly RegistryEntry[],
): DesignIssue[];
export declare function validateDesignSpec(
  input: unknown,
  registry?: readonly RegistryEntry[],
): void;
export declare function checkDesignSupport(
  input: unknown,
  registry?: readonly RegistryEntry[],
): DesignSupportResult;

export type { DesignFamily, DesignDensity, ThemeGroup, RegistryEntry };

// Hand-written declarations for design-registry.mjs (agents.MD §5.7). Gives
// admin/ full types with zero build coupling — nothing else in the repo
// typechecks scripts/. Keep in sync manually; drift is caught at runtime by
// admin/test/contract.design-spec.test.ts and the anti-drift assertions in
// admin/test/no-duplicated-contract.test.ts.
//
// NOTE: named ".d.mts" (not ".d.ts") — that is the extension TypeScript's
// Node-style resolution matches for a ".mjs" import specifier. A plain ".d.ts"
// beside the .mjs is silently NOT picked up and produces TS7016 on any
// consumer, even under moduleResolution "Bundler". Same precedent as
// content-contract.d.mts and product-normalizer.d.mts.

export type DesignFamily =
  | 'minimal' | 'premium' | 'editorial' | 'ecommerce' | 'bold'
  | 'tech' | 'soft' | 'energetic' | 'luxury';

export type DesignDensity = 'compact' | 'balanced' | 'airy';

export type ThemeGroup = 'colors' | 'fonts' | 'radius' | 'shadow' | 'text';

/** A single prop rule inside a capability's propsSchema. */
export interface PropRule {
  type?: 'string' | 'number' | 'boolean';
  required?: boolean;
  enum?: unknown[];
}

export interface RegistryEntry {
  category: string;
  type: string;
  variant: string;
  /** Import specifier the RENDERER resolves. Never accepted as agent input. */
  component: string;
  propsSchema: Record<string, PropRule>;
  /** '*' = no family restriction declared (the honest v1 state). */
  familiesAllowed: '*' | DesignFamily[];
  /** '*' = no density restriction declared (the honest v1 state). */
  densityAllowed: '*' | DesignDensity[];
  /** Canonical `category/type/variant` keys this capability cannot coexist with. */
  incompatibleWith: string[];
}

export declare const DESIGN_FAMILIES: readonly DesignFamily[];
export declare const DESIGN_DENSITIES: readonly DesignDensity[];
export declare const THEME_GROUPS: readonly ThemeGroup[];
export declare const THEME_TOKENS: Record<ThemeGroup, readonly string[]>;
export declare const THEME_TEXT_FIELDS: readonly string[];
export declare const PROTECTED_STRUCTURAL_TOKENS: readonly string[];
export declare const REGISTRY: readonly RegistryEntry[];

export declare function listCategories(registry?: readonly RegistryEntry[]): string[];
export declare function listTypes(category: string, registry?: readonly RegistryEntry[]): string[];
export declare function listVariants(
  category: string,
  type: string,
  registry?: readonly RegistryEntry[],
): string[];
export declare function resolveCapability(
  category: string,
  type: string,
  variant: string,
  registry?: readonly RegistryEntry[],
): RegistryEntry | null;
export declare function capabilityKey(category: string, type: string, variant: string): string;

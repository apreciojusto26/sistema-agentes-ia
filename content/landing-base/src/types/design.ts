// Runtime DesignSpec / registry types for the generated landing (Design System
// Fase 2, agents.MD §5.7).
//
// These MIRROR the build-time declarations in scripts/lib/design-registry.d.mts
// and scripts/lib/design-contract.d.mts. They are a deliberate, guarded
// duplication: content/landing-base is COPIED wholesale into outputs/{slug}/ by
// generate-landing.mjs's copyTemplate(), so at runtime it cannot reach
// scripts/lib at all. The compensating control is
// admin/test/contract.design-registry-parity.test.ts, which fails the build if
// the two registries ever diverge. Do NOT "fix" this by importing from
// scripts/ — a generated landing has no such path.
//
// Nothing here may invent a field the build-time contract does not have: the
// validator in scripts/lib/design-contract.mjs is the authority on what a
// valid DesignSpec is, and it rejects unknown keys.

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
  /**
   * Import specifier the RENDERER resolves (`@/...`). Never accepted as agent
   * input — index.astro maps it through an eager import.meta.glob.
   */
  component: string;
  propsSchema: Record<string, PropRule>;
  /** '*' = no family restriction declared. */
  familiesAllowed: '*' | DesignFamily[];
  /** '*' = no density restriction declared. */
  densityAllowed: '*' | DesignDensity[];
  /** Canonical `category/type/variant` keys this capability cannot coexist with. */
  incompatibleWith: string[];
}

export interface DesignSpecSection {
  category: string;
  type: string;
  variant: string;
  /** Must equal the entry's own array position — contiguous from 0, no gaps. */
  order: number;
  /** Design decisions only, never content. Legacy sections accept none. */
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

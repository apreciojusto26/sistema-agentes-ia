// Shared DesignSpec contract (agents.MD §5.7 "DesignSpec v1"): validates the
// shape of a design spec against the REAL capabilities declared in
// design-registry.mjs. Single source of truth for both a future CLI/renderer
// and the admin backend (admin/src/server/validation/design.ts, a thin
// re-export adapter — see admin/test/no-duplicated-contract.test.ts). No
// capability list may be duplicated anywhere else in the repo.
//
// Deliberately mirrors scripts/lib/content-contract.mjs's architecture, not a
// parallel one:
//   - fail-fast (validateDesignSpec): throws DesignContractError on the FIRST
//     issue.
//   - collect-all (collectDesignErrors): never throws, returns every issue.
// Check order within and across validators is load-bearing: it must stay
// identical in both modes, because the FIRST issue in collect-all mode must
// equal what fail-fast throws.
//
// NOT WIRED TO THE PIPELINE (Fase 1, deliberate). scripts/generate-content.mjs
// can still emit an unvalidated `design` key that generate-landing.mjs's
// patchThemeBlock() applies with a console.warn-and-continue fallback. That
// gap is documented in agents.MD §5.7 and closes in a later phase; changing it
// here would alter production behavior inside a purely contractual change.
//
// Pure: no filesystem, no network, no LLM, no new dependencies. The only
// import is the EXISTING product-id source of truth — PRODUCT_ID_RE is never
// re-implemented (same rule content-contract.mjs follows).

import { isProductId } from './product-id.cjs';
import {
  DESIGN_FAMILIES,
  DESIGN_DENSITIES,
  THEME_GROUPS,
  THEME_TOKENS,
  THEME_TEXT_FIELDS,
  REGISTRY,
  resolveCapability,
  capabilityKey,
  listCategories,
  listTypes,
  listVariants,
} from './design-registry.mjs';

/** The only schema version this contract understands. Bump = a new, reviewed migration. */
export const DESIGN_SPEC_SCHEMA = 1;

export const ALLOWED_SPEC_FIELDS = ['schema', 'productId', 'design', 'theme', 'sections'];
export const ALLOWED_DESIGN_FIELDS = ['family', 'density'];
export const ALLOWED_SECTION_FIELDS = ['category', 'type', 'variant', 'order', 'props'];

/**
 * Issue codes that mean "the design system cannot express this", as opposed to
 * "this document is malformed". Only these map to agents.MD §6.3's
 * unsupported_design escape hatch.
 */
export const UNSUPPORTED_CAPABILITY_CODES = [
  'section-unknown-category',
  'section-unknown-type',
  'section-unknown-variant',
];

export class DesignContractError extends Error {
  constructor(message, { code, path } = {}) {
    super(message);
    this.name = 'DesignContractError';
    this.code = code;
    this.path = path;
  }
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// --- top level --------------------------------------------------------------

function collectTopLevelIssues(input) {
  const issues = [];

  if (!isPlainObject(input)) {
    issues.push({
      code: 'spec-not-object',
      path: '',
      message: `DesignSpec must be a plain object, got ${Array.isArray(input) ? 'array' : typeof input}`,
    });
    return issues;
  }

  if (input.schema !== DESIGN_SPEC_SCHEMA) {
    issues.push({
      code: 'schema-invalid',
      path: 'schema',
      message: `DesignSpec "schema" must be exactly ${DESIGN_SPEC_SCHEMA}, got ${JSON.stringify(input.schema)}`,
    });
  }

  // Required here (unlike content.json's optional one): agents.MD §8 "Every
  // artifact MUST contain productId". Format check reuses isProductId — the
  // regex itself is never re-declared.
  if (!isProductId(input.productId)) {
    issues.push({
      code: 'product-id-invalid',
      path: 'productId',
      message: `DesignSpec "productId" is required and must match prd_{base36ts}-{rand8}, got ${JSON.stringify(input.productId)}`,
    });
  }

  const unknown = Object.keys(input).filter((k) => !ALLOWED_SPEC_FIELDS.includes(k));
  if (unknown.length) {
    issues.push({
      code: 'spec-unknown-fields',
      path: '',
      message: `DesignSpec has fields outside the contract: ${unknown.join(', ')}`,
      fields: unknown,
    });
  }

  if (!('design' in input)) {
    issues.push({ code: 'missing-top-level', path: 'design', message: 'DesignSpec is missing top-level "design"' });
  }
  if (!('sections' in input)) {
    issues.push({ code: 'missing-top-level', path: 'sections', message: 'DesignSpec is missing top-level "sections"' });
  }

  return issues;
}

// --- design.family / design.density -----------------------------------------

function collectDesignIssues(design) {
  const issues = [];

  if (!isPlainObject(design)) {
    issues.push({
      code: 'design-not-object',
      path: 'design',
      message: `DesignSpec "design" must be an object, got ${Array.isArray(design) ? 'array' : typeof design}`,
    });
    return issues;
  }

  if (!DESIGN_FAMILIES.includes(design.family)) {
    issues.push({
      code: 'design-family-invalid',
      path: 'design.family',
      message: `design.family must be one of: ${DESIGN_FAMILIES.join(', ')} — got ${JSON.stringify(design.family)}`,
    });
  }

  if (!DESIGN_DENSITIES.includes(design.density)) {
    issues.push({
      code: 'design-density-invalid',
      path: 'design.density',
      message: `design.density must be one of: ${DESIGN_DENSITIES.join(', ')} — got ${JSON.stringify(design.density)}`,
    });
  }

  const unknown = Object.keys(design).filter((k) => !ALLOWED_DESIGN_FIELDS.includes(k));
  if (unknown.length) {
    issues.push({
      code: 'design-unknown-fields',
      path: 'design',
      message: `design has fields outside the contract: ${unknown.join(', ')}`,
      fields: unknown,
    });
  }

  return issues;
}

// --- theme ------------------------------------------------------------------

/** `theme` is optional: a spec that overrides no tokens keeps the template's own @theme. */
function collectThemeIssues(theme) {
  const issues = [];

  if (!isPlainObject(theme)) {
    issues.push({
      code: 'theme-not-object',
      path: 'theme',
      message: `DesignSpec "theme" must be an object, got ${Array.isArray(theme) ? 'array' : typeof theme}`,
    });
    return issues;
  }

  const unknownGroups = Object.keys(theme).filter((g) => !THEME_GROUPS.includes(g));
  if (unknownGroups.length) {
    issues.push({
      code: 'theme-unknown-group',
      path: 'theme',
      message: `theme has groups the renderer cannot apply: ${unknownGroups.join(', ')} (supported: ${THEME_GROUPS.join(', ')})`,
      fields: unknownGroups,
    });
  }

  for (const group of THEME_GROUPS) {
    if (!(group in theme)) continue;

    const entries = theme[group];
    if (!isPlainObject(entries)) {
      issues.push({
        code: 'theme-group-not-object',
        path: `theme.${group}`,
        message: `theme.${group} must be an object of token overrides, got ${Array.isArray(entries) ? 'array' : typeof entries}`,
      });
      continue;
    }

    for (const [key, value] of Object.entries(entries)) {
      if (!THEME_TOKENS[group].includes(key)) {
        issues.push({
          code: 'theme-unknown-token',
          path: `theme.${group}.${key}`,
          message: `theme.${group}.${key} is not a token declared in the template's @theme block (known: ${THEME_TOKENS[group].join(', ')})`,
        });
        continue;
      }

      if (group === 'text') {
        issues.push(...collectTextTokenIssues(key, value));
        continue;
      }

      if (typeof value !== 'string' || value.trim() === '') {
        issues.push({
          code: 'theme-token-invalid',
          path: `theme.${group}.${key}`,
          message: `theme.${group}.${key} must be a non-empty string value, got ${JSON.stringify(value)}`,
        });
      }
    }
  }

  return issues;
}

/** A `text` token is a {size, lineHeight, letterSpacing} triple — exactly what patchThemeBlock() consumes. */
function collectTextTokenIssues(key, value) {
  const issues = [];

  if (!isPlainObject(value)) {
    issues.push({
      code: 'theme-text-invalid',
      path: `theme.text.${key}`,
      message: `theme.text.${key} must be an object with ${THEME_TEXT_FIELDS.join('/')}, got ${Array.isArray(value) ? 'array' : typeof value}`,
    });
    return issues;
  }

  const unknown = Object.keys(value).filter((f) => !THEME_TEXT_FIELDS.includes(f));
  if (unknown.length) {
    issues.push({
      code: 'theme-text-invalid',
      path: `theme.text.${key}`,
      message: `theme.text.${key} has fields outside the contract: ${unknown.join(', ')} (allowed: ${THEME_TEXT_FIELDS.join(', ')})`,
      fields: unknown,
    });
  }

  for (const field of THEME_TEXT_FIELDS) {
    if (!(field in value)) continue;
    if (typeof value[field] !== 'string' || value[field].trim() === '') {
      issues.push({
        code: 'theme-text-invalid',
        path: `theme.text.${key}.${field}`,
        message: `theme.text.${key}.${field} must be a non-empty string, got ${JSON.stringify(value[field])}`,
      });
    }
  }

  return issues;
}

// --- sections ---------------------------------------------------------------

function collectSectionsIssues(sections, design, registry) {
  const issues = [];

  if (!Array.isArray(sections) || sections.length === 0) {
    issues.push({
      code: 'sections-not-array',
      path: 'sections',
      message: 'DesignSpec "sections" must be a non-empty array',
    });
    return issues;
  }

  sections.forEach((section, i) => {
    issues.push(...collectSectionIssues(section, i, design, registry));
  });

  issues.push(...collectStructuralIssues(sections, registry));

  return issues;
}

function collectSectionIssues(section, i, design, registry) {
  const issues = [];
  const at = `sections[${i}]`;

  if (!isPlainObject(section)) {
    issues.push({
      code: 'section-not-object',
      path: at,
      message: `${at} must be an object, got ${Array.isArray(section) ? 'array' : typeof section}`,
    });
    return issues;
  }

  const unknown = Object.keys(section).filter((k) => !ALLOWED_SECTION_FIELDS.includes(k));
  if (unknown.length) {
    issues.push({
      code: 'section-unknown-fields',
      path: at,
      message: `${at} has fields outside the contract: ${unknown.join(', ')}`,
      fields: unknown,
    });
  }

  // `order` must equal the array position: contiguous from 0, no duplicates,
  // no gaps, and no ambiguity about which of the two orderings wins. The
  // renderer therefore never has to reconcile them.
  if (section.order !== i) {
    issues.push({
      code: 'section-order-invalid',
      path: `${at}.order`,
      message: `${at}.order must equal its array position (${i}), got ${JSON.stringify(section.order)}`,
    });
  }

  const { category, type, variant } = section;

  if (!listCategories(registry).includes(category)) {
    issues.push({
      code: 'section-unknown-category',
      path: `${at}.category`,
      message: `${at}.category "${category}" is not a registered category (known: ${listCategories(registry).join(', ')})`,
      capability: capabilityKey(category, type, variant),
    });
    return issues; // type/variant cannot be meaningfully resolved under an unknown category
  }

  if (!listTypes(category, registry).includes(type)) {
    issues.push({
      code: 'section-unknown-type',
      path: `${at}.type`,
      message: `${at}.type "${type}" is not registered under category "${category}" (known: ${listTypes(category, registry).join(', ')})`,
      capability: capabilityKey(category, type, variant),
    });
    return issues;
  }

  if (!listVariants(category, type, registry).includes(variant)) {
    issues.push({
      code: 'section-unknown-variant',
      path: `${at}.variant`,
      message: `${at}.variant "${variant}" is not registered for ${category}/${type} (known: ${listVariants(category, type, registry).join(', ')})`,
      capability: capabilityKey(category, type, variant),
    });
    return issues;
  }

  const capability = resolveCapability(category, type, variant, registry);

  if (capability.familiesAllowed !== '*' && !capability.familiesAllowed.includes(design?.family)) {
    issues.push({
      code: 'section-family-incompatible',
      path: at,
      message: `${capabilityKey(category, type, variant)} is not available for design.family "${design?.family}" (allowed: ${capability.familiesAllowed.join(', ')})`,
    });
  }

  if (capability.densityAllowed !== '*' && !capability.densityAllowed.includes(design?.density)) {
    issues.push({
      code: 'section-density-incompatible',
      path: at,
      message: `${capabilityKey(category, type, variant)} is not available for design.density "${design?.density}" (allowed: ${capability.densityAllowed.join(', ')})`,
    });
  }

  issues.push(...collectPropsIssues(section.props, capability, at));

  return issues;
}

/**
 * Props validation. Every production capability declares `propsSchema: {}`
 * today (no section component takes props), so ANY supplied prop is rejected —
 * that is the truthful current behavior, not a stub. The engine below is
 * exercised against a fixture registry in the contract tests.
 */
function collectPropsIssues(props, capability, at) {
  const issues = [];
  const schema = capability.propsSchema ?? {};

  if (props === undefined) {
    const missingRequired = Object.entries(schema)
      .filter(([, rule]) => rule?.required)
      .map(([name]) => name);
    if (missingRequired.length) {
      issues.push({
        code: 'section-props-invalid',
        path: `${at}.props`,
        message: `${at}.props is missing required props: ${missingRequired.join(', ')}`,
        fields: missingRequired,
      });
    }
    return issues;
  }

  if (!isPlainObject(props)) {
    issues.push({
      code: 'section-props-invalid',
      path: `${at}.props`,
      message: `${at}.props must be an object, got ${Array.isArray(props) ? 'array' : typeof props}`,
    });
    return issues;
  }

  const unknown = Object.keys(props).filter((k) => !(k in schema));
  if (unknown.length) {
    issues.push({
      code: 'section-props-unknown',
      path: `${at}.props`,
      message: `${at}.props has props this capability does not accept: ${unknown.join(', ')} (accepted: ${Object.keys(schema).join(', ') || 'none'})`,
      fields: unknown,
    });
  }

  for (const [name, rule] of Object.entries(schema)) {
    if (!(name in props)) {
      if (rule?.required) {
        issues.push({
          code: 'section-props-invalid',
          path: `${at}.props.${name}`,
          message: `${at}.props.${name} is required`,
        });
      }
      continue;
    }

    const value = props[name];

    if (rule?.type && typeof value !== rule.type) {
      issues.push({
        code: 'section-props-invalid',
        path: `${at}.props.${name}`,
        message: `${at}.props.${name} must be of type ${rule.type}, got ${typeof value}`,
      });
      continue;
    }

    if (Array.isArray(rule?.enum) && !rule.enum.includes(value)) {
      issues.push({
        code: 'section-props-invalid',
        path: `${at}.props.${name}`,
        message: `${at}.props.${name} must be one of: ${rule.enum.join(', ')} — got ${JSON.stringify(value)}`,
      });
    }
  }

  return issues;
}

// --- structural invariants --------------------------------------------------

/**
 * Composition invariants only. Deliberately NOT here: anything about the shell
 * (UtilityBar/SiteHeader/SiteFooter/StickyBar/CartDrawer). The shell is not
 * addressable through sections[] at all — enforcing its presence is the
 * renderer's job, and putting renderer logic in the contract would blur the
 * layer boundary this phase exists to draw.
 */
function collectStructuralIssues(sections, registry) {
  const issues = [];
  const known = sections.filter((s) => isPlainObject(s) && resolveCapability(s.category, s.type, s.variant, registry));

  const heroes = known.filter((s) => s.category === 'hero');
  if (heroes.length === 0) {
    issues.push({
      code: 'hero-missing',
      path: 'sections',
      message: 'sections must contain exactly one hero section (agents.MD §5.3 — Hero is mandatory)',
    });
  } else if (heroes.length > 1) {
    issues.push({
      code: 'hero-duplicated',
      path: 'sections',
      message: `sections must contain exactly one hero section, got ${heroes.length}`,
    });
  } else if (!(isPlainObject(sections[0]) && sections[0].category === 'hero')) {
    issues.push({
      code: 'hero-not-first',
      path: 'sections[0]',
      message: 'the hero section must be the first entry in sections (agents.MD §5.3 layout boundary)',
    });
  }

  if (!known.some((s) => s.category === 'conversion')) {
    issues.push({
      code: 'conversion-missing',
      path: 'sections',
      message: 'sections must contain at least one conversion section — a landing with no conversion surface is a defect, not a design choice',
    });
  }

  // "Exactly one variant per slot": a `type` may appear only once. Two
  // sections sharing a CATEGORY is legitimate (UgcStrip + ReviewsReel are both
  // socialProof); the same TYPE twice is not.
  const seen = new Map();
  known.forEach((s) => seen.set(s.type, (seen.get(s.type) ?? 0) + 1));
  const duplicated = [...seen.entries()].filter(([, n]) => n > 1).map(([type]) => type);
  if (duplicated.length) {
    issues.push({
      code: 'section-duplicate-type',
      path: 'sections',
      message: `each registered type may appear at most once, duplicated: ${duplicated.join(', ')}`,
      fields: duplicated,
    });
  }

  // Symmetric: declaring A incompatible with B rejects the pair regardless of
  // which side declared it, so a registry author cannot half-express a rule.
  known.forEach((a, ai) => {
    const aKey = capabilityKey(a.category, a.type, a.variant);
    const aEntry = resolveCapability(a.category, a.type, a.variant, registry);
    known.forEach((b, bi) => {
      if (bi <= ai) return;
      const bKey = capabilityKey(b.category, b.type, b.variant);
      const bEntry = resolveCapability(b.category, b.type, b.variant, registry);
      const conflict =
        (aEntry.incompatibleWith ?? []).includes(bKey) || (bEntry.incompatibleWith ?? []).includes(aKey);
      if (conflict) {
        issues.push({
          code: 'section-incompatible-pair',
          path: 'sections',
          message: `${aKey} and ${bKey} are registered as incompatible and cannot appear in the same landing`,
        });
      }
    });
  });

  return issues;
}

// --- public API: collect-all (never throws) ---------------------------------

/**
 * Returns EVERY issue found. `registry` is injectable so the contract tests can
 * exercise constraint mechanisms (props, incompatibilities) that the production
 * registry truthfully does not declare yet — the fixture never leaks into
 * production capabilities.
 */
export function collectDesignErrors(input, registry = REGISTRY) {
  const issues = [...collectTopLevelIssues(input)];

  if (!isPlainObject(input)) return issues;

  if ('design' in input) issues.push(...collectDesignIssues(input.design));
  if ('theme' in input) issues.push(...collectThemeIssues(input.theme));
  if ('sections' in input) issues.push(...collectSectionsIssues(input.sections, input.design, registry));

  return issues;
}

// --- public API: fail-fast (throws on the first issue) ----------------------

export function validateDesignSpec(input, registry = REGISTRY) {
  const [first] = collectDesignErrors(input, registry);
  if (first) throw new DesignContractError(first.message, { code: first.code, path: first.path });
}

// --- public API: support check (agents.MD §6.3) -----------------------------

/**
 * The explicit, deterministic verdict a future Design Agent loop consumes.
 *
 *   { status: 'pass' }
 *   { status: 'unsupported_design', missingCapability, issues }
 *   { status: 'invalid', issues }
 *
 * `unsupported_design` is reserved for "this capability does not exist in the
 * design system" (agents.MD §6.3/§14 — the developer must then expand the
 * design system deliberately). A malformed document is `invalid` instead:
 * conflating the two would let a schema typo read as a missing feature.
 *
 * There is NO fourth outcome. No fallback component, no nearest-variant
 * substitution, no best-effort render.
 */
export function checkDesignSupport(input, registry = REGISTRY) {
  const issues = collectDesignErrors(input, registry);
  if (issues.length === 0) return { status: 'pass' };

  const missing = issues.find((issue) => UNSUPPORTED_CAPABILITY_CODES.includes(issue.code));
  if (missing) {
    return { status: 'unsupported_design', missingCapability: missing.capability, issues };
  }

  return { status: 'invalid', issues };
}

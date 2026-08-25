// The ONE accessor AND the ONE value interpreter for product/Comparison.
//
// THICKER THAN THE OTHER SHARED MODULES, and for a real reason. UgcStrip's and
// Faq's accessors only carry a guard because there is nothing else to share.
// Here there IS: `ComparisonRow.ours` and `.rival` are `boolean | string`, so
// every variant has to answer "what does `true` mean, what does `false` mean,
// what does a string mean". Two variants answering that separately is how you
// end up with a table where `false` is a cross and a card panel where `false`
// is the word "No" — the same data claiming two different things about the
// product. `comparisonValue()` answers it once.
//
// The SEMANTICS live here. The PRESENTATION does not: the legacy table paints
// `ours` icons `text-rust` and `rival` icons `text-steel-light`, which is a
// per-side styling choice belonging to the component. This module says "icon,
// positive" or "text"; the component decides what that looks like.
import { product } from '@/data/product';
import { ICONS } from '@/lib/icons';
import type { ComparisonRow } from '@/types/content';

/** Section framing. Declared once so both variants introduce the comparison identically. */
export const COMPARISON_EYEBROW = 'Comparativa';
export const COMPARISON_RIVAL_LABEL = 'Otros';
export const COMPARISON_FEATURE_LABEL = 'Característica';

/**
 * The brand both variants label the "ours" side with, read in ONE place so
 * neither component reaches into product.* on its own.
 */
export function comparisonBrand(): string {
  return product.brand;
}

/** Legacy heading, verbatim. Kept here so both variants title the section the same way. */
export function comparisonHeading(brand: string): string {
  return `${brand} vs. lámparas decorativas comunes`;
}

/**
 * How a comparison cell is to be understood — the single interpretation both
 * variants render from.
 *
 *   true   -> the product HAS this, drawn as a check
 *   false  -> it does NOT, drawn as a cross
 *   string -> a real value, shown as text (never coerced into an icon)
 */
export type ComparisonValue =
  | { kind: 'icon'; positive: boolean; viewBox: string; path: string }
  | { kind: 'text'; text: string };

export function comparisonValue(raw: boolean | string): ComparisonValue {
  if (typeof raw === 'boolean') {
    const icon = raw ? ICONS.check : ICONS.cross;
    return { kind: 'icon', positive: raw, viewBox: icon.viewBox, path: icon.path };
  }
  return { kind: 'text', text: raw };
}

/**
 * The comparison rows this landing should show, or a hard failure.
 *
 * `composedBy` names the variant in the error so the operator is told which
 * section to fix, not merely that "something" was empty.
 *
 * NOTE ON `product.brand`: both variants read it for the heading and the
 * "ours" column, and it is deliberately NOT declared in `requiresData`. It is
 * already in REQUIRED_PRODUCT_FIELDS (content-contract.mjs), so it can never
 * be absent from a validated content.json — and the requiresData grammar
 * evaluates non-empty ARRAYS, which a brand string is not. Declaring it would
 * be redundant metadata that the evaluator would then wrongly report unmet.
 */
export function comparisonRows(composedBy: string): ComparisonRow[] {
  // WIDENED ON PURPOSE — product.ts is authored `as const satisfies Product`,
  // so the emptiness check reads as statically impossible against the
  // template's own literal. A generated landing rewrites it and can be empty.
  const rows: ComparisonRow[] = [...product.comparison];

  if (rows.length === 0) {
    throw new Error(
      `Comparison (variant "${composedBy}") was composed into this landing, but ` +
        '`comparison` in src/data/product.ts is empty — the section would render column ' +
        'headers with nothing to compare.\n' +
        'FIX ONE OF THESE:\n' +
        '  - add at least one row to `comparison` in src/data/product.ts, or\n' +
        '  - remove the product/Comparison section from src/data/design.ts.\n' +
        'This should have been caught upstream: the capability declares ' +
        'requiresData: ["product.comparison"] at BOTH variants, and checkDesignSupport() ' +
        'rejects the pairing at design time and again at generation time. Reaching this ' +
        'throw means a DesignSpec bypassed both gates.',
    );
  }

  return rows;
}

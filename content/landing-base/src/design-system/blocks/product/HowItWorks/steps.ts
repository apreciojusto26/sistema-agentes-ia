// The ONE accessor for product/HowItWorks, shared by every variant.
//
// Thin, like blocks/conversion/Faq/faq-items.ts and
// blocks/social-proof/UgcStrip/ugc-items.ts: there is no mapping to share.
// `product.steps` is a plain HowToStep[] and neither variant filters, sorts,
// renumbers or truncates it — the `step` number is AUTHORED DATA, never
// derived from the array index, so the two compositions cannot disagree about
// what step 2 is.
//
// What IS shared, and must never diverge:
//   1. the emptiness guard, so a new variant cannot become the quiet way
//      around the data gate;
//   2. the section framing copy, so the two variants can never drift into
//      introducing the same process differently. It is template copy, not
//      Content Agent output, so it belongs to the capability.
import { product } from '@/data/product';
import type { HowToStep } from '@/types/content';

/** Section framing. Declared once so both variants are provably identical here. */
export const STEPS_EYEBROW = 'Cómo funciona';
export const STEPS_HEADING = 'Tan simple como se ve';

/**
 * The process steps this landing should show, or a hard failure.
 *
 * `composedBy` names the variant in the error so the operator is told which
 * section to fix, not merely that "something" was empty.
 */
export function howItWorksSteps(composedBy: string): HowToStep[] {
  // WIDENED ON PURPOSE — src/data/product.ts is authored `as const satisfies
  // Product`, so within THIS template `product.steps` has a fixed tuple type
  // and the check below reads as statically impossible. It is not:
  // generate-landing.mjs rewrites product.ts per landing and that array can be
  // empty. The function's contract is over HowToStep[].
  const steps: HowToStep[] = [...product.steps];

  if (steps.length === 0) {
    throw new Error(
      `HowItWorks (variant "${composedBy}") was composed into this landing, but \`steps\` in ` +
        'src/data/product.ts is empty — the section would render a heading explaining a ' +
        'process with no steps under it.\n' +
        'FIX ONE OF THESE:\n' +
        '  - add at least one entry to `steps` in src/data/product.ts, or\n' +
        '  - remove the product/HowItWorks section from src/data/design.ts.\n' +
        'This should have been caught upstream: the capability declares ' +
        'requiresData: ["product.steps"] at BOTH variants, and checkDesignSupport() rejects ' +
        'the pairing at design time and again at generation time. Reaching this throw means ' +
        'a DesignSpec bypassed both gates.',
    );
  }

  return steps;
}

// The ONE accessor for conversion/Faq, shared by every variant.
//
// Thin, for the same reason blocks/social-proof/UgcStrip/ugc-items.ts is thin:
// there is no mapping to share. `faq` is a plain FaqItem[] and neither variant
// filters, sorts or truncates it. What IS shared, and must never diverge:
//
//   1. the emptiness guard — so a new variant cannot become the quiet way
//      around the data gate;
//   2. the section framing copy — so the two variants can never drift into
//      saying different things above the same questions. The heading is not
//      Content Agent output (it is not in content.json), it is template copy,
//      and it belongs to the capability rather than to one composition.
import { faq } from '@/data/faq';
import { policy, policyFaq } from '@/lib/policy';
import type { FaqItem } from '@/types/content';

/** Section framing. Declared once so both variants are provably identical here. */
export const FAQ_EYEBROW = 'Preguntas frecuentes';
export const FAQ_HEADING = 'Todo lo que necesitas saber';

/**
 * The FAQ entries this landing should show, or a hard failure.
 *
 * `composedBy` names the variant in the error so the operator is told which
 * section to fix, not merely that "something" was empty.
 */
export function faqItems(composedBy: string): FaqItem[] {
  // WIDENED ON PURPOSE — same reasoning as UgcStrip's ugc-items.ts: a
  // generated landing rewrites src/data/faq.ts and that array can be empty,
  // even where the template's own literal never is.
  const items: FaqItem[] = [...faq];

  // The emptiness guard checks the PRODUCT half only, deliberately. That is
  // what requiresData: ["faq"] promises upstream, and appending derived policy
  // answers must not become a way for a landing with zero generated questions
  // to slip past the gate looking full.
  if (items.length === 0) {
    throw new Error(
      `Faq (variant "${composedBy}") was composed into this landing, but src/data/faq.ts ` +
        'is empty — the section would render a heading with no questions under it.\n' +
        'FIX ONE OF THESE:\n' +
        '  - add at least one entry to src/data/faq.ts, or\n' +
        '  - remove the conversion/Faq section from src/data/design.ts.\n' +
        'This should have been caught upstream: the capability declares ' +
        'requiresData: ["faq"] at BOTH variants, and checkDesignSupport() rejects the ' +
        'pairing at design time and again at generation time. Reaching this throw means ' +
        'a DesignSpec bypassed both gates.',
    );
  }

  // POLICY FAQ, APPENDED FROM FACTS.
  //
  // The generated array used to answer "¿Qué garantía tiene?" with free prose
  // carrying its own number — "30 días de garantía de devolución… te devolvemos
  // el importe" — while merchant config said 14. That answer was the hardest
  // contradiction to fix, because the number lived inside a sentence rather
  // than in a field.
  //
  // It is not detected and reconciled afterwards; it is no longer generated.
  // The content contract and the system instruction put returns, shipping and
  // guarantees outside the Product FAQ's scope, and the answers below are built
  // from merchant config. The two halves cannot contradict each other because
  // they cannot both answer the same question.
  //
  // In preview (no merchant) there are no policy facts and nothing is appended.
  return policy ? [...items, ...policyFaq(policy)] : items;
}

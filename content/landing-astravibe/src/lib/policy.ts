// POLICY VIEW MODEL — the ONE place commercial-policy facts turn into words.
//
// Every policy claim a visitor can read used to have its own author. Five of
// them, all the Content Agent: product.guarantee.{days,title,text,points},
// product.badges, product.trustTicker, the FAQ answer, and
// product.shipping.etaLabel. None was backed by anything. The scraper supplies
// no guarantee and no shipping signal, the system instruction had no rule about
// either, and the only shaping influence was the few-shot example's `days: 30`.
//
// The result shipped a page that contradicted itself: the trust ticker renders
// in the UtilityBar on EVERY page, so /legal/devoluciones displayed "Garantía de
// 30 días" in its own header while its body, correctly reading merchant config,
// said "Disponés de 14 días".
//
// So facts come from merchant config and words are derived from facts, here.
// Change returnsWindowDays and every surface moves together, because there is
// only one sentence-builder for each claim.
//
// THREE DISTINCTIONS THIS MODULE REFUSES TO BLUR:
//
//   returns window        what the merchant configured. NOT a guarantee.
//   commercial guarantee  an ADDITIONAL promise, optional, absent by default.
//                         Absent means absent, never 30.
//   statutory rights      not modelled at all. Jurisdiction-dependent legal
//                         rights are a separate layer with a separate source;
//                         nothing here infers one from `country`.
//
// PREVIEW. `merchant` is null until --merchant is passed, and then `policy` is
// null too. Surfaces render no policy claim rather than a plausible-looking
// default: a preview that invents "30 días" to look finished is the exact
// failure this layer exists to prevent.
import { merchant } from '@/data/merchant';

export interface PolicyFacts {
  returns: {
    windowDays: number;
    shippingPaidBy: 'merchant' | 'customer';
  };
  /** null = the merchant configured none. Never a default. */
  commercialGuarantee: { days: number } | null;
  shipping: {
    carrierName: string;
    etaLabel: string;
  };
}

export const policy: PolicyFacts | null = merchant
  ? {
      returns: {
        windowDays: merchant.returnsWindowDays,
        shippingPaidBy: merchant.returnShippingPaidBy,
      },
      commercialGuarantee:
        merchant.commercialGuaranteeDays === null
          ? null
          : { days: merchant.commercialGuaranteeDays },
      shipping: {
        carrierName: merchant.carrierName,
        etaLabel: merchant.shippingEtaLabel,
      },
    }
  : null;

// --- derived copy ----------------------------------------------------------
// Every string below is built from a fact above and nothing else. No adjective
// that implies a condition ("simple", "sin preguntas", "completo"), because no
// configured fact supports one.

/** Headline for the returns window. Says "devoluciones", never "garantía". */
export function returnsHeadline(p: PolicyFacts): string {
  return `Devoluciones durante ${p.returns.windowDays} días`;
}

/** Who pays the return leg — the claim the page used to make by omission. */
export function returnShippingLine(p: PolicyFacts): string {
  return p.returns.shippingPaidBy === 'merchant'
    ? 'El coste del envío de devolución lo asumimos nosotros.'
    : 'El coste del envío de devolución corre a cargo del comprador.';
}

/** Present ONLY when the merchant configured an additional guarantee. */
export function commercialGuaranteeHeadline(p: PolicyFacts): string | null {
  return p.commercialGuarantee ? `Garantía de ${p.commercialGuarantee.days} días` : null;
}

export function shippingLine(p: PolicyFacts): string {
  return p.shipping.etaLabel;
}

/**
 * The policy half of the trust ticker and of any policy badge row. Product
 * copy still comes from the Content Agent; these do not, which is why the two
 * are concatenated at the call site instead of being one array the model can
 * write into.
 */
export function policyTickerItems(p: PolicyFacts): string[] {
  const items = [returnsHeadline(p), p.shipping.etaLabel];
  const guarantee = commercialGuaranteeHeadline(p);
  if (guarantee) items.push(guarantee);
  return items;
}

/**
 * POLICY FAQ, built from facts rather than generated. The Product FAQ still
 * comes from the Content Agent and is forbidden from covering these topics, so
 * the two never contradict: they cannot both answer the same question.
 *
 * The questions are a fixed vocabulary. The answers carry only configured
 * facts and point at the legal pages for conditions — because "conditions" is
 * exactly what no field in merchant config currently states.
 */
export function policyFaq(p: PolicyFacts): { id: string; question: string; answer: string }[] {
  const items = [
    {
      id: 'policy-returns',
      question: '¿Puedo devolverlo si no me convence?',
      answer:
        `Disponés de ${p.returns.windowDays} días desde la recepción para solicitar la devolución. ` +
        `${returnShippingLine(p)} Podés consultar el detalle en la página de Devoluciones.`,
    },
    {
      id: 'policy-shipping',
      question: '¿Cuánto tarda el envío?',
      answer:
        `${p.shipping.etaLabel}. El transporte lo realiza ${p.shipping.carrierName}. ` +
        'Es una estimación y puede variar según el destino.',
    },
  ];

  if (p.commercialGuarantee) {
    items.push({
      id: 'policy-guarantee',
      question: '¿Tiene garantía?',
      answer:
        `Este producto tiene una garantía comercial de ${p.commercialGuarantee.days} días, ` +
        'además del plazo de devolución.',
    });
  }

  return items;
}

// The ONE accessor for conversion/BuyBox, shared by every variant.
//
// WHAT IT OWNS: the derived DISPLAY values the buy box computes before it can
// render anything, plus the framing strings. It owns no commercial decision —
// that is parts/use-buy-action.ts, reached from inside the islands — and it
// owns no markup.
//
// WHY IT EXISTS. `giftThresholdUnits` is the interesting one: it is not a field,
// it is a RULE ("the popular pack's paid units, or 2"). Card and compact both
// draw a gift meter against that threshold, and a threshold that differed
// between them would mean the same landing telling a buyer two different things
// about the same offer. Same for the rating format: 4,7 in one place and 4.7 in
// the other is a defect nobody would file and everybody would notice.
//
// NO FAIL-CLOSED GUARD, and for once that is not a judgement call: useSelection()
// already throws on an empty variant list outside preview, and BundleSelector
// throws on empty packs. Adding a third guard here would duplicate a check that
// already fails loudly one layer down.
import { product } from '@/data/product';

/** Section framing. Declared once so the variants can never drift apart on it. */
export const BUYBOX_SCARCITY_LABEL = 'Se agota rápido';
export const BUYBOX_GIFT_LABEL = 'Progreso hacia tu unidad gratis';
/** The payment methods drawn as decorative logos — `aria-hidden`, never a claim. */
export const BUYBOX_PAYMENT_LOGOS = ['Visa', 'Mastercard', 'PayPal'] as const;

export interface BuyBoxDisplay {
  /** Units that count as "gift unlocked" on the meter. A RULE, not a field. */
  giftThresholdUnits: number;
  /**
   * es-ES decimal comma, e.g. "4,7", or NULL when the scraper found no rating.
   *
   * Nullable because ratingAverage is PROJECTED from
   * CanonicalProduct.socialProof.rating now, and that field is genuinely
   * nullable. It used to be model-written, so it was always a number — always a
   * plausible one, and never necessarily the product's.
   */
  ratingLabel: string | null;
  /** es-ES grouped, e.g. "1234" -> "1.234", or NULL. Same reason. */
  ratingCountLabel: string | null;
}

/**
 * `variant` is accepted but unused: it exists so a future variant cannot quietly
 * introduce a SECOND rule for any of these without touching this signature.
 */
export function buyBoxDisplay(_variant: 'card' | 'compact'): BuyBoxDisplay {
  const popularPack = product.packs.find((p) => p.popular) ?? product.packs[0];

  return {
    giftThresholdUnits: popularPack?.units ?? 2,
    ratingLabel:
      product.ratingAverage === null ? null : product.ratingAverage.toFixed(1).replace('.', ','),
    ratingCountLabel:
      product.ratingCount === null
        ? null
        : new Intl.NumberFormat('es-ES').format(product.ratingCount),
  };
}

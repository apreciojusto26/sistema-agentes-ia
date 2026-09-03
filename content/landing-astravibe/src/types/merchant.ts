/**
 * Seller identity + commercial policy. Mirrors MERCHANT_REQUIRED_FIELDS in
 * scripts/lib/merchant.mjs, which owns the validation.
 *
 * `shippingEtaLabel` used to be absent here with the note "it already exists as
 * product.shipping.etaLabel and two sources for one sentence is how they drift
 * apart". The premise was wrong: the scraper supplies no shipping signal, so
 * that per-product field was not a second source of truth, it was a guess the
 * model copied out of the few-shot example. It lives here now.
 *
 * Nothing on this object is ever agent-written. Presentation reads it through
 * lib/policy.ts, never directly.
 */
export interface Merchant {
  legalName: string;
  taxId: string;
  address: string;
  contactEmail: string;
  /** Jurisdiction, stated explicitly. Never inferred from a hardcoded tax rate. */
  country: string;
  /** The returns window. NOT a guarantee, and not a statutory right. */
  returnsWindowDays: number;
  carrierName: string;
  /** Delivery estimate, stated by the merchant. Never inferred, never generated. */
  shippingEtaLabel: string;
  /** Who pays the return leg. "Free returns" is a claim, so it is configured. */
  returnShippingPaidBy: 'merchant' | 'customer';
  /** Falls back to contactEmail when the merchant has no separate DPO. */
  dataControllerEmail: string;
  /**
   * An ADDITIONAL satisfaction guarantee, separate from the returns window and
   * never implied by it. `null` means the merchant has not configured one — it
   * does not mean 30, and there is no default.
   */
  commercialGuaranteeDays: number | null;
}

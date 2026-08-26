/**
 * Seller identity + commercial policy. Mirrors MERCHANT_REQUIRED_FIELDS in
 * scripts/lib/merchant.mjs, which owns the validation.
 *
 * Deliberately small: seven facts the legal pages actually consume, plus one
 * optional. `shippingEtaLabel` is absent on purpose — it already exists as
 * `product.shipping.etaLabel` and two sources for one sentence is how they
 * drift apart.
 */
export interface Merchant {
  legalName: string;
  taxId: string;
  address: string;
  contactEmail: string;
  /** Jurisdiction, stated explicitly. Never inferred from a hardcoded tax rate. */
  country: string;
  returnsWindowDays: number;
  carrierName: string;
  /** Falls back to contactEmail when the merchant has no separate DPO. */
  dataControllerEmail: string;
}

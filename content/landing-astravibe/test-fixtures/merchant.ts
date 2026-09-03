// HERMETIC MERCHANT CONFIG — the commerce profile's policy facts.
//
// The COMMERCE canonical profile is defined as a production-ready landing, and
// that includes resolvable policy: a returns window, a carrier, a delivery
// estimate, and who pays the return leg. src/data/merchant.ts ships `null`
// (preview), so sealing the commerce structure needs a configured merchant
// that no real seller's details end up inside.
//
// Every value here is obviously fictional. `commercialGuaranteeDays` is set on
// purpose — see the note below.
import type { Merchant } from '@/types/merchant';

export const merchant: Merchant | null = {
  legalName: 'Fixture Comercial S.L.',
  taxId: 'B00000000',
  address: 'Calle Ficticia 1, 00000 Ciudad',
  contactEmail: 'fixture@example.invalid',
  country: 'España',
  returnsWindowDays: 14,
  carrierName: 'Transportista de fixture',
  shippingEtaLabel: 'Envío de 3 a 5 días hábiles',
  returnShippingPaidBy: 'merchant',
  dataControllerEmail: 'fixture@example.invalid',
  /**
   * SET, and that is a structural decision rather than a detail.
   *
   * `commercialGuaranteeDays` is OPTIONAL, and its presence adds DOM: a third
   * cell in the guarantee section, a row in /legal/devoluciones, a sentence in
   * /legal/terminos and an item in the trust ticker. So a merchant with one and
   * a merchant without one produce different structures WITHIN the commerce
   * profile.
   *
   * The canonical profile therefore pins it as PRESENT. That is not a claim
   * that every commerce landing has a guarantee — it is the statement that the
   * sealed structure is the one where this capability exists, and a landing
   * without it is a different, documented shape rather than a regression.
   */
  commercialGuaranteeDays: 30,
};

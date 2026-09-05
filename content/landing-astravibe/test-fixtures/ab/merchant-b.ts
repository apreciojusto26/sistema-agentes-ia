// B has NO commercial guarantee — `commercialGuaranteeDays: null`. The
// OPTIONAL<CommercialGuaranteeCell> slot stays declared in the grammar; only
// B's capability signature differs. Different returns window and carrier too,
// so value variability is exercised alongside capability absence.
import type { Merchant } from '@/types/merchant';
export const merchant: Merchant | null = {
  legalName: 'Roble y Sal S.L.', tradeName: 'Roble', phone: '+34 922 222 222', taxId: 'B22222222', address: 'Avenida Inventada 9, 11111 Villa',
  contactEmail: 'b@example.invalid', country: 'España', returnsWindowDays: 30,
  carrierName: 'Transportista B', shippingEtaLabel: 'Envío de 24 a 48 horas',
  returnShippingPaidBy: 'customer', dataControllerEmail: 'b@example.invalid',
  commercialGuaranteeDays: null,
};

// A HAS a commercial guarantee. Fictional details throughout.
import type { Merchant } from '@/types/merchant';
export const merchant: Merchant | null = {
  legalName: 'Nordika Home S.L.', taxId: 'B11111111', address: 'Calle Ficticia 1, 00000 Ciudad',
  contactEmail: 'a@example.invalid', country: 'España', returnsWindowDays: 14,
  carrierName: 'Transportista A', shippingEtaLabel: 'Envío de 3 a 5 días hábiles',
  returnShippingPaidBy: 'merchant', dataControllerEmail: 'a@example.invalid',
  commercialGuaranteeDays: 30,
};

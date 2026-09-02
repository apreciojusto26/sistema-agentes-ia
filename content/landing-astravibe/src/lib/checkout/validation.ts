/**
 * Hand-rolled email/phone/address validation — no zod (matches the
 * codebase's "one module, zero deps" posture, see src/lib/shopify/pricing.ts).
 * Shared verbatim by the CheckoutForm island (client) and
 * POST /api/checkout/session (server) — same rules, same error shape,
 * both sides of the spec's "missing field blocks payment" requirement.
 */

export interface ShippingAddress {
  firstName: string;
  lastName: string;
  address1: string;
  address2: string; // '' when unused — always present so forms stay controlled inputs
  city: string;
  provinceCode: string; // '' when the country has no meaningful region/state
  countryCode: string; // ISO 3166-1 alpha-2, e.g. "ES"
  zip: string;
}

export interface CheckoutFormData {
  email: string;
  phone: string;
  address: ShippingAddress;
}

type AddressField = `address.${keyof ShippingAddress}`;
export type CheckoutFormField = 'email' | 'phone' | AddressField;

export type ValidationResult =
  | { valid: true }
  | { valid: false; errors: Partial<Record<CheckoutFormField, string>> };

// Loose RFC 5322-ish check — good enough to catch typos, not a full grammar.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// E.164-ish: optional leading '+', 8-15 digits total. Buyers are Spain-first
// but nothing here hardcodes +34 — DSers/carriers just need a dialable number.
const PHONE_RE = /^\+?[0-9]{8,15}$/;

const REQUIRED_ADDRESS_FIELDS: (keyof ShippingAddress)[] = [
  'firstName',
  'lastName',
  'address1',
  'city',
  'countryCode',
  'zip',
];

export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

export function isValidPhone(value: string): boolean {
  return PHONE_RE.test(value.trim().replace(/[\s-]/g, ''));
}

/** Validates the full checkout form. Field keys match spec scenario wording ("missing field blocks payment"). */
export function validateCheckoutForm(data: CheckoutFormData): ValidationResult {
  const errors: Partial<Record<CheckoutFormField, string>> = {};

  if (!isValidEmail(data.email)) {
    errors.email = 'Introduce un email válido.';
  }
  // Phone is OPTIONAL (checkout-friction pass 2026-08-21): still validated when
  // supplied, never blocks payment when blank. Carriers use it for delivery
  // notices, so the field stays prominent with a hint — flip it back by
  // dropping the `.trim()` guard if fulfillment ever needs it hard-required.
  if (data.phone.trim() && !isValidPhone(data.phone)) {
    errors.phone = 'Introduce un teléfono válido.';
  }

  for (const field of REQUIRED_ADDRESS_FIELDS) {
    const value = data.address[field];
    if (!value || !value.trim()) {
      errors[`address.${field}` as CheckoutFormField] = 'Este campo es obligatorio.';
    }
  }

  return Object.keys(errors).length > 0 ? { valid: false, errors } : { valid: true };
}

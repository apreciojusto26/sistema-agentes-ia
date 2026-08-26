// MERCHANT CONFIG — the seller's identity and commercial policy, kept strictly
// apart from product content.
//
// THREE LAYERS, NEVER MIXED:
//   merchant identity   who is selling (legal name, tax id, address, contact)
//   policy facts        the terms they commit to (returns window, carrier)
//   product content     CanonicalProduct / content.json — written by agents
//
// This layer is NEVER written by an agent and never lives in content.json. A
// Content Agent that could invent a tax id would be a liability, not a feature.
//
// NO FALLBACKS, EVER. There is no default legal name, no placeholder email, no
// "[TU EMPRESA]". A missing fact makes the landing incomplete; it never makes
// up a value. That is the whole point of this module.
//
// FIELD AUDIT (the nine originally proposed, checked against the pages that
// actually consume them):
//
//   legalName          REQUIRED  terms, contact, legal notice, privacy
//   taxId              REQUIRED  legal notice — the one identifier that page is for
//   address            REQUIRED  contact, legal notice, privacy
//   contactEmail       REQUIRED  contact, terms, returns
//   country            REQUIRED  terms (jurisdiction), legal notice. NEVER inferred
//                                from VAT_RATE=0.21 in sumup/settle.ts — that is a
//                                tax rate someone hardcoded, not a legal identity.
//   returnsWindowDays  REQUIRED  returns
//   carrierName        REQUIRED  shipping
//
//   dataControllerEmail  OPTIONAL — falls back to contactEmail. GDPR allows a
//                        separate controller/DPO contact but does not require
//                        one, and demanding it would block every merchant who
//                        does not have a DPO. The fallback is stated on the
//                        page, not hidden.
//
//   shippingEtaLabel     REMOVED — it already exists as `product.shipping.etaLabel`
//                        in the content contract. Adding a merchant copy would
//                        create two sources of truth for one sentence, and the
//                        per-product one is the more specific.
//
// So: 7 required, 1 optional. Not nine "just in case".

export const MERCHANT_REQUIRED_FIELDS = [
  'legalName',
  'taxId',
  'address',
  'contactEmail',
  'country',
  'returnsWindowDays',
  'carrierName',
];

export const MERCHANT_OPTIONAL_FIELDS = ['dataControllerEmail'];

export const MERCHANT_ALL_FIELDS = [...MERCHANT_REQUIRED_FIELDS, ...MERCHANT_OPTIONAL_FIELDS];

/** Which legal page each field is load-bearing for — used in the error message. */
export const MERCHANT_FIELD_PAGES = {
  legalName: 'aviso-legal, contacto, terminos, privacidad',
  taxId: 'aviso-legal',
  address: 'aviso-legal, contacto, privacidad',
  contactEmail: 'contacto, terminos, devoluciones',
  country: 'terminos, aviso-legal',
  returnsWindowDays: 'devoluciones',
  carrierName: 'envios',
  dataControllerEmail: 'privacidad',
};

/** Values a merchant might paste from a template and that must never ship. */
const PLACEHOLDER_PATTERNS = [
  /\[.*\]/, // [TU EMPRESA]
  /example\.(com|org|net)/i,
  /tu[ -]?empresa/i,
  /your[ -]?company/i,
  /12345678[A-Z]?/,
  /lorem ipsum/i,
  /xxx+/i,
  /TODO|FIXME|placeholder/i,
];

/**
 * Validates a merchant config. Returns `issues` — never throws, never fills in
 * a default.
 *
 * @param {unknown} input
 * @returns {{code: string, field?: string, message: string}[]}
 */
export function collectMerchantIssues(input) {
  const issues = [];
  if (input === null || input === undefined) {
    issues.push({
      code: 'merchant-missing',
      message:
        'No merchant config was supplied. Legal pages need the seller identity ' +
        'and cannot invent it. Pass --merchant <path-to-json>.',
    });
    return issues;
  }
  if (typeof input !== 'object' || Array.isArray(input)) {
    issues.push({ code: 'merchant-not-an-object', message: 'merchant config must be a JSON object' });
    return issues;
  }

  for (const field of MERCHANT_REQUIRED_FIELDS) {
    const value = input[field];
    const empty =
      value === undefined ||
      value === null ||
      (typeof value === 'string' && value.trim() === '');
    if (empty) {
      issues.push({
        code: 'merchant-field-missing',
        field,
        message:
          `merchant.${field} is required and missing. Affects: ${MERCHANT_FIELD_PAGES[field]}. ` +
          'Supply it in the merchant config JSON — no default exists and none will be invented.',
      });
    }
  }

  if (input.returnsWindowDays !== undefined) {
    const n = input.returnsWindowDays;
    if (!Number.isInteger(n) || n <= 0) {
      issues.push({
        code: 'merchant-field-invalid',
        field: 'returnsWindowDays',
        message: `merchant.returnsWindowDays must be a positive integer, got ${JSON.stringify(n)}`,
      });
    }
  }

  for (const field of ['contactEmail', 'dataControllerEmail']) {
    const v = input[field];
    if (typeof v === 'string' && v.trim() !== '' && !/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(v.trim())) {
      issues.push({
        code: 'merchant-field-invalid',
        field,
        message: `merchant.${field} is not a valid email address: ${JSON.stringify(v)}`,
      });
    }
  }

  const unknown = Object.keys(input).filter((k) => !MERCHANT_ALL_FIELDS.includes(k));
  if (unknown.length) {
    issues.push({
      code: 'merchant-unknown-fields',
      message: `merchant config carries unknown fields: ${unknown.join(', ')}`,
    });
  }

  // Placeholders are worse than absence: an absent field blocks READY, a
  // pasted "[TU EMPRESA]" would publish.
  for (const field of MERCHANT_ALL_FIELDS) {
    const v = input[field];
    if (typeof v !== 'string') continue;
    const hit = PLACEHOLDER_PATTERNS.find((re) => re.test(v));
    if (hit) {
      issues.push({
        code: 'merchant-placeholder',
        field,
        message:
          `merchant.${field} looks like an unfilled template value (${JSON.stringify(v)}). ` +
          'Publishing it would be worse than leaving it empty.',
      });
    }
  }

  return issues;
}

/** True when every required fact is present and valid. */
export function isMerchantComplete(input) {
  return collectMerchantIssues(input).length === 0;
}

/**
 * Normalises for the renderer. `dataControllerEmail` falls back to
 * `contactEmail` — the only derivation in this module, and it is stated on the
 * privacy page rather than silently substituted.
 */
export function normalizeMerchant(input) {
  if (!input) return null;
  return {
    legalName: input.legalName,
    taxId: input.taxId,
    address: input.address,
    contactEmail: input.contactEmail,
    country: input.country,
    returnsWindowDays: input.returnsWindowDays,
    carrierName: input.carrierName,
    dataControllerEmail: input.dataControllerEmail ?? input.contactEmail,
  };
}

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
//   shippingEtaLabel     REQUIRED. THIS REVERSES AN EARLIER DECISION, recorded
//                        rather than quietly rewritten. It used to say:
//                        "REMOVED — it already exists as product.shipping.etaLabel
//                        in the content contract. Adding a merchant copy would
//                        create two sources of truth for one sentence, and the
//                        per-product one is the more specific."
//
//                        The reasoning was sound and the premise was false. The
//                        per-product one is not more specific, it is INVENTED:
//                        product-normalizer.mjs carries no shipping signal at
//                        all, so the scraper never supplies a delivery estimate.
//                        Every "Envío en 24-48h" ever rendered was copied from
//                        the few-shot example. There were never two sources of
//                        truth for that sentence — there was one guess and one
//                        empty slot.
//
//   returnShippingPaidBy REQUIRED  devoluciones. Who bears the cost of the
//                        return leg. Modelled as an enum rather than a boolean
//                        because "free returns" is a claim, not a default, and
//                        the page previously implied it by saying nothing.
//                        Exactly two values are publishable as a fact; a policy
//                        that genuinely varies by reason cannot be stated in one
//                        sentence, so it is not given a third enum value that
//                        would render as a half-truth.
//
//   freeShippingOverCents  OPTIONAL. The order total above which this STORE
//                        ships free, in cents. `0` means free on every order;
//                        ABSENT MEANS THE MERCHANT OFFERS NO THRESHOLD, and
//                        the cart then draws no free-shipping progress bar and
//                        claims nothing.
//
//                        IT LIVES HERE BECAUSE IT IS A PRICING DECISION, not a
//                        sentence about the product. It reached the landing
//                        through content.json until F3, which made a model the
//                        author of a commercial threshold — and a model asked
//                        for one supplies a confident 4900 for a store that
//                        offers no free shipping at all. The Version A seal in
//                        contract.commercial-policy.test.ts forbids the word
//                        'shipping' in content-contract.mjs precisely to keep
//                        that door shut, and it is right to.
//
//                        NOT EXPOSED ON THE RENDERED `Merchant` OBJECT. The
//                        legal pages do not state it; the cart does, through
//                        product.ts's `shipping.freeOverCents` slot, which the
//                        Fixed assembler fills FROM HERE. One render copy, one
//                        author — see normalizeMerchant below.
//
//   packs                OPTIONAL. The bundle definitions this store sells:
//                        how it PACKAGES what Shopify lists. They reached the
//                        landing through content.json until F3, which made a
//                        language model the author of prices, discount
//                        percentages and which bundle is flagged "popular" —
//                        commercial decisions an operator makes once, and the
//                        kind of number a model will happily invent.
//
//                        Shopify remains the pricing AUTHORITY: every figure a
//                        pack displays is projected from the Shopify unit
//                        price. What lives here is the packaging, not the
//                        price of a unit.
//
//                        OPTIONAL at this layer, load-bearing at the next one:
//                        FIXED_GRAMMAR seals buy/packs with min 1 and
//                        zero: 'invalid-input', so a Fixed landing with no
//                        packs does not pass structural validation. The
//                        generator says so in its TODO block rather than
//                        inventing one.
//
//   commercialGuaranteeDays  OPTIONAL. A satisfaction/money-back guarantee is
//                        NOT the returns window and is not implied by it.
//                        ABSENT MEANS ABSENT — the merchant has not configured
//                        an additional commercial guarantee. It does not mean
//                        30, and there is no default. This field exists because
//                        the landing used to assert a 30-day "garantía" that no
//                        one had configured, while the returns page said 14.
//
// So: 9 required, 4 optional.

export const MERCHANT_REQUIRED_FIELDS = [
  'legalName',
  // THE COMMERCIAL NAME, and it is required by the same article as the legal
  // one: LSSI-CE art. 10.1.a asks for "nombre o denominación social" AND the
  // name the business trades under. It lived hardcoded in src/data/legal.ts as
  // 'Bamzuk', a second authority for a fact the merchant config already owned
  // half of — so a landing for any operator stated Bamzuk's commercial name on
  // its legal notice, and the site header used it as the shop's logo.
  'tradeName',
  'taxId',
  'address',
  'contactEmail',
  'country',
  'returnsWindowDays',
  'carrierName',
  'shippingEtaLabel',
  'returnShippingPaidBy',
];

export const MERCHANT_OPTIONAL_FIELDS = [
  // OPTIONAL, and the reason is the law rather than convenience. LSSI-CE art.
  // 10.1.b asks for contact data allowing "comunicación directa y efectiva";
  // an email satisfies that, and a merchant without a published phone must not
  // be blocked from publishing. It was hardcoded in legal.ts too.
  'phone',
  'dataControllerEmail',
  'commercialGuaranteeDays',
  'freeShippingOverCents',
  'packs',
];

export const MERCHANT_ALL_FIELDS = [...MERCHANT_REQUIRED_FIELDS, ...MERCHANT_OPTIONAL_FIELDS];

/** Which legal page each field is load-bearing for — used in the error message. */
export const MERCHANT_FIELD_PAGES = {
  legalName: 'aviso-legal, contacto, terminos, privacidad',
  tradeName: 'aviso-legal, el título de las páginas legales, la cabecera y el pie',
  phone: 'aviso-legal, contacto',
  taxId: 'aviso-legal',
  address: 'aviso-legal, contacto, privacidad',
  contactEmail: 'contacto, terminos, devoluciones',
  country: 'terminos, aviso-legal',
  returnsWindowDays: 'devoluciones',
  carrierName: 'envios',
  shippingEtaLabel: 'envios, y la trust copy de BuyBox',
  returnShippingPaidBy: 'devoluciones',
  dataControllerEmail: 'privacidad',
  commercialGuaranteeDays: 'la sección Guarantee, cuando el merchant la configura',
  freeShippingOverCents: 'la barra de envío gratis del carrito y del checkout',
  packs: 'el BuyBox, el BundleSelector y la sticky bar',
};

/** Who bears the cost of the return leg. Closed domain — see the field audit. */
export const RETURN_SHIPPING_PAYERS = ['merchant', 'customer'];

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

  // An optional commercial guarantee is still a POSITIVE integer when present.
  // Absent is the honest state; 0 or a fraction is a misconfiguration that would
  // publish "garantía de 0 días".
  if (input.commercialGuaranteeDays !== undefined && input.commercialGuaranteeDays !== null) {
    const n = input.commercialGuaranteeDays;
    if (!Number.isInteger(n) || n <= 0) {
      issues.push({
        code: 'merchant-field-invalid',
        field: 'commercialGuaranteeDays',
        message: `merchant.commercialGuaranteeDays must be a positive integer when present, got ${JSON.stringify(n)}`,
      });
    }
  }

  // A threshold in CENTS, and `0` is meaningful here in a way it is not for a
  // guarantee: it means free shipping on every order. Negative is nonsense and
  // a float would render a fractional cent, so both are rejected rather than
  // rounded — a silently rounded price is how a store advertises a number it
  // does not honour.
  if (input.freeShippingOverCents !== undefined && input.freeShippingOverCents !== null) {
    const n = input.freeShippingOverCents;
    if (!Number.isInteger(n) || n < 0) {
      issues.push({
        code: 'merchant-field-invalid',
        field: 'freeShippingOverCents',
        message:
          'merchant.freeShippingOverCents must be a non-negative integer number of cents when present ' +
          `(0 = free on every order), got ${JSON.stringify(n)}`,
      });
    }
  }

  // Packs are structure, not prose. Validated against the real PricePack: an
  // id the selector keys on, a label a buyer reads, `units` (paid) and
  // `freeUnits` (the "2+1 GRATIS" half). A pack with no `units` renders a
  // bundle whose price cannot be computed, and the BuyBox would print whatever
  // `undefined * unitPrice` formats to.
  if (input.packs !== undefined && input.packs !== null) {
    if (!Array.isArray(input.packs)) {
      issues.push({
        code: 'merchant-field-invalid',
        field: 'packs',
        message: `merchant.packs must be an array when present, got ${JSON.stringify(input.packs)}`,
      });
    } else if (input.packs.length === 0) {
      // Not "no packs offered". FIXED_GRAMMAR seals buy/packs at min 1, so an
      // empty array is a landing that fails structural validation — say it
      // here, where it is still cheap to fix.
      issues.push({
        code: 'merchant-field-invalid',
        field: 'packs',
        message:
          'merchant.packs is an empty array. Omit the field entirely if this store has no bundles; ' +
          'an empty list is not a configuration, and a Fixed landing needs at least one pack.',
      });
    } else {
      input.packs.forEach((pack, i) => {
        if (pack === null || typeof pack !== 'object' || Array.isArray(pack)) {
          issues.push({
            code: 'merchant-field-invalid',
            field: `packs[${i}]`,
            message: `merchant.packs[${i}] must be an object`,
          });
          return;
        }
        for (const key of ['id', 'label']) {
          if (typeof pack[key] !== 'string' || pack[key].trim() === '') {
            issues.push({
              code: 'merchant-field-invalid',
              field: `packs[${i}].${key}`,
              message: `merchant.packs[${i}].${key} must be a non-empty string`,
            });
          }
        }
        if (!Number.isInteger(pack.units) || pack.units <= 0) {
          issues.push({
            code: 'merchant-field-invalid',
            field: `packs[${i}].units`,
            message:
              `merchant.packs[${i}].units must be a positive integer — it is the multiplier the Shopify ` +
              `unit price is projected through, got ${JSON.stringify(pack.units)}`,
          });
        }
        if (!Number.isInteger(pack.freeUnits) || pack.freeUnits < 0) {
          issues.push({
            code: 'merchant-field-invalid',
            field: `packs[${i}].freeUnits`,
            message:
              `merchant.packs[${i}].freeUnits must be a non-negative integer (0 when the pack gives ` +
              `nothing away), got ${JSON.stringify(pack.freeUnits)}`,
          });
        }
      });

      // "Exactly one pack MUST have default: true" is stated in the PricePack
      // type and enforced nowhere. Two defaults makes the selected pack depend
      // on iteration order; none makes the BuyBox open with nothing chosen.
      const defaults = input.packs.filter((p) => p && p.default === true).length;
      if (defaults !== 1) {
        issues.push({
          code: 'merchant-field-invalid',
          field: 'packs',
          message: `exactly one merchant pack must have default: true, found ${defaults}`,
        });
      }
    }
  }

  // Closed domain. A free string here would put whatever someone typed onto the
  // returns page as a statement of who pays.
  if (input.returnShippingPaidBy !== undefined) {
    if (!RETURN_SHIPPING_PAYERS.includes(input.returnShippingPaidBy)) {
      issues.push({
        code: 'merchant-field-invalid',
        field: 'returnShippingPaidBy',
        message: `merchant.returnShippingPaidBy must be one of ${RETURN_SHIPPING_PAYERS.join(' | ')}, got ${JSON.stringify(input.returnShippingPaidBy)}`,
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
 * The store's free-shipping threshold, in cents, or `null` when it offers none.
 *
 * READ THIS RATHER THAN THE RAW OBJECT. `undefined` and `null` are the same
 * answer — the merchant configured no threshold — and callers that check only
 * one of them are how "no free shipping" turns into a progress bar to nowhere.
 *
 * @param {unknown} input a merchant config, or null
 * @returns {number | null}
 */
export function merchantFreeShippingOverCents(input) {
  if (!input || typeof input !== 'object') return null;
  const v = input.freeShippingOverCents;
  return v === undefined || v === null ? null : v;
}

/**
 * The store's bundle definitions, or `[]` when it has configured none.
 *
 * `[]` IS NOT A WORKING LANDING and this function does not pretend otherwise —
 * FIXED_GRAMMAR seals buy/packs at min 1. It is the honest report of an
 * unconfigured merchant, and the generator surfaces it as a TODO rather than
 * inventing a bundle to fill the region.
 *
 * @param {unknown} input a merchant config, or null
 * @returns {object[]}
 */
export function merchantPacks(input) {
  if (!input || typeof input !== 'object' || !Array.isArray(input.packs)) return [];
  return input.packs;
}

/**
 * Normalises for the renderer. `dataControllerEmail` falls back to
 * `contactEmail` — the only derivation in this module, and it is stated on the
 * privacy page rather than silently substituted.
 *
 * `freeShippingOverCents` AND `packs` ARE DELIBERATELY ABSENT from the result.
 * Both are valid merchant config fields, but neither is a legal-page fact: the
 * cart states the threshold through product.ts's `shipping.freeOverCents` and
 * the BuyBox states the bundles through `product.packs`, and the Fixed
 * assembler fills both from this same config. Emitting them here too would put
 * one number in two generated modules, and two copies of a price is how they
 * drift.
 */
export function normalizeMerchant(input) {
  if (!input) return null;
  return {
    legalName: input.legalName,
    tradeName: input.tradeName,
    // Absent stays absent — the pages that show it say so rather than
    // rendering an empty row that reads like a missing value.
    phone: input.phone ?? null,
    taxId: input.taxId,
    address: input.address,
    contactEmail: input.contactEmail,
    country: input.country,
    returnsWindowDays: input.returnsWindowDays,
    shippingEtaLabel: input.shippingEtaLabel,
    returnShippingPaidBy: input.returnShippingPaidBy,
    commercialGuaranteeDays:
      input.commercialGuaranteeDays === undefined ? null : input.commercialGuaranteeDays,
    carrierName: input.carrierName,
    dataControllerEmail: input.dataControllerEmail ?? input.contactEmail,
  };
}

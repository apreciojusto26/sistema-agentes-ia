// WHY THE EXTRACTION FAILED, in words a person can act on.
//
// The Admin used to show the symptom:
//
//     page.waitForSelector: Timeout 30000ms exceeded
//     waiting for locator('h1') to be visible
//
// True, and useless. The first live smoke against a Leroy Merlin URL failed
// exactly that way, and the real cause was a DataDome interstitial served with
// HTTP 403 — 774 bytes, no product markup, no h1 to wait for. The timeout was
// the consequence of never having been shown the page.
//
// ─── EVIDENCE, NOT PATTERN-MATCHING ON THE MESSAGE ────────────────────────
//
// An h1 timeout is NOT anti-bot. It is also a slow page, a redesign, a
// redirect, a network hiccup. Classifying every one of them as a block would
// tell an operator to stop trying when the real answer might be "retry" — and
// would quietly hide a genuine selector regression behind a reassuring label.
//
// So the classifier decides on what the RESPONSE actually was: the status code
// and markers in the body. With no such evidence it stays generic and hands
// back the technical error, which is the honest answer to "we do not know".
//
// ─── SCOPE ────────────────────────────────────────────────────────────────
//
// Classification and wording. Nothing here retries, bypasses, solves a
// challenge, changes a selector or lets a pipeline continue past a failure.

/**
 * Vendors whose challenge pages are identifiable from the body they serve.
 * Each marker is a string the vendor itself puts there — not a guess about
 * what a blocked page might look like.
 */
const CHALLENGE_VENDORS = [
  { name: 'DataDome', markers: ['captcha-delivery.com', 'datadome'] },
  { name: 'Cloudflare', markers: ['cf-browser-verification', 'cf_chl_opt', '__cf_chl'] },
  { name: 'Akamai', markers: ['_abck', 'akam-sw.js'] },
  { name: 'Imperva/Incapsula', markers: ['_incapsula_resource', 'incap_ses'] },
  { name: 'PerimeterX', markers: ['px-captcha', '_pxhd'] },
];

/** Wording that is generic across vendors, used when only the status says block. */
const BLOCKING_STATUSES = [401, 403, 407, 429];

const SCRAPE_FAILURE_CODES = ['ANTI_BOT', 'SCRAPE_FAILED'];

/**
 * Classifies an extraction failure from the evidence the run actually has.
 *
 * @param {object} evidence
 * @param {number|null} [evidence.status]      HTTP status of the product page response
 * @param {string|null}  [evidence.bodySample] a prefix of the response body
 * @param {string}       [evidence.message]    the raw technical error
 * @param {string|null}  [evidence.url]
 * @returns {{
 *   code: 'ANTI_BOT' | 'SCRAPE_FAILED',
 *   vendor: string | null,
 *   status: number | null,
 *   title: string,
 *   message: string,
 *   technical: string,
 *   evidence: string[],
 * }}
 */
function classifyScrapeFailure({ status = null, bodySample = null, message = '', url = null } = {}) {
  const body = typeof bodySample === 'string' ? bodySample.toLowerCase() : '';
  const evidence = [];

  const vendor = CHALLENGE_VENDORS.find((v) => v.markers.some((m) => body.includes(m))) ?? null;
  if (vendor) evidence.push(`marcadores de ${vendor.name} en la respuesta`);
  if (typeof status === 'number') evidence.push(`HTTP ${status}`);

  const statusBlocks = typeof status === 'number' && BLOCKING_STATUSES.includes(status);

  // A page that clearly IS a challenge, or a status whose only meaning here is
  // refusal. Either alone is evidence; neither is inferred from the timeout.
  if (vendor || statusBlocks) {
    return {
      code: 'ANTI_BOT',
      vendor: vendor?.name ?? null,
      status,
      title: 'No pudimos acceder al producto',
      message:
        'El proveedor bloqueó la extracción automática mediante su sistema anti-bot. ' +
        'El producto no fue procesado.',
      technical: message,
      evidence,
    };
  }

  // NOT ENOUGH EVIDENCE. An h1 timeout with a 200 is a page that loaded and did
  // not have what we expected — a redesign, a slow render, a different layout.
  // Calling that a block would send the operator away from a product they could
  // still get, and would bury a real selector regression.
  return {
    code: 'SCRAPE_FAILED',
    vendor: null,
    status,
    title: 'No pudimos extraer el producto',
    message:
      'La página respondió, pero no encontramos los datos del producto donde esperábamos. ' +
      'Puede ser un cambio en la web del proveedor o un problema temporal.',
    technical: message,
    evidence,
  };
}

/** The human half, for a caller that only needs the copy. */
function scrapeFailureSummary(classification) {
  return { title: classification.title, message: classification.message, code: classification.code };
}

// CommonJS, matching events.cjs and product-id.cjs: scraper/scrape.js is CJS
// and needs this at require-time, while ESM consumers import it by specifier
// exactly as they do those two.
module.exports = { SCRAPE_FAILURE_CODES, classifyScrapeFailure, scrapeFailureSummary };

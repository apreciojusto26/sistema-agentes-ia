// Single source of truth for productId minting/validation (design D1).
// `.cjs`, not `.mjs` (mirrors the events.cjs rationale, design D1): the
// primary consumer is scraper/scrape.js, plain CommonJS with no arg parser
// and no build step — a `.cjs` module is require-able there AND
// import-able from ESM (generate-landing.mjs already does
// `import events from './lib/events.cjs'`), and typeable from admin/ TS via
// a sibling `.d.cts` (see product-id.d.cts). The reverse (an `.mjs` source
// of truth) is not synchronously requireable from scrape.js without a
// rewrite of scrape.js itself, which is out of scope for this change.
//
// Format: `prd_{base36ts}-{rand8}`. The base36-millisecond-timestamp prefix
// mirrors newJobId() (admin/src/server/jobs/registry.ts) so productIds sort
// ≈ chronologically like job ids already do.

const { randomUUID } = require('node:crypto');

const PRODUCT_ID_RE = /^prd_[0-9a-z]{6,12}-[0-9a-f]{8}$/;

/**
 * Mint a new productId. One call per generation lineage (design D2: minted
 * once at scrape-job creation, or self-minted by a standalone scrape.js
 * invocation with no --product-id/LG_PRODUCT_ID).
 * @returns {string}
 */
function newProductId() {
  return `prd_${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
}

/**
 * @param {unknown} value
 * @returns {value is string}
 */
function isProductId(value) {
  return typeof value === 'string' && PRODUCT_ID_RE.test(value);
}

module.exports = { newProductId, isProductId, PRODUCT_ID_RE };

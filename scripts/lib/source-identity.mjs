// SOURCE PRODUCT IDENTITY — which product this is, as opposed to which RUN this is.
//
// ─── THE DEFECT THIS EXISTS TO FIX ─────────────────────────────────────────
//
// `productId` (prd_{base36ts}-{rand8}) is minted once per SCRAPE JOB, in
// JobRegistry.createScrapeJob. Scrape the same AliExpress item twice and you
// get two productIds — so the second run of the same product looked, to the
// lineage guard in generate-landing.mjs, exactly like a DIFFERENT product
// trying to take over an existing output directory, and was refused:
//
//   outputs/1005007345199501 belongs to a different product lineage
//   (existing productId prd_mto7a4ia-e40e4b7d,
//    content.json has prd_mtoiv4y5-0a148ae9).
//
// The guard was right to fire and its rule was wrong. `productId` is RUN
// IDENTITY. Running the same product again does not make it another product.
//
// ─── WHAT IS AND IS NOT IDENTITY ───────────────────────────────────────────
//
//   PRODUCT IDENTITY   provider + externalProductId. Stable forever. This.
//   RUN IDENTITY       productId, jobId, scrapedAt. New every execution.
//   NOT IDENTITY       the slug. It is an output PATH an operator may set by
//                      hand, and "the folder name matches" is not evidence of
//                      anything. It is never consulted here.
//
// ─── WHY THE URL, AND NOT THE SCRAPER'S OWN itemId ─────────────────────────
//
// product-normalizer.mjs hard-nulls `identity.sourceItemId` and NEVER reads an
// `itemId` key out of raw scraper output (DECISION-2, the structural fix for
// the #429 §12 masking bug). That rule is not weakened here and must not be:
// this module derives identity from the SOURCE URL — the value the operator
// supplied and the system validated before any scrape was spawned — so nothing
// a scraper emits can claim an identity for a product it did not fetch.
//
// ─── GENERIC BY CONSTRUCTION ───────────────────────────────────────────────
//
// The core knows about `SourceProductIdentity`, not about AliExpress. A
// provider contributes a matcher and a resolver; everything else — the lineage
// guard, the manifest, the tests — works in terms of the shape. Adding a second
// marketplace is adding an entry to PROVIDERS, and nothing else.

/**
 * @typedef {Object} SourceProductIdentity
 * @property {string} provider          stable provider id, e.g. 'aliexpress'
 * @property {string} externalProductId the provider's own id for the product
 * @property {string} canonicalUrl      the URL with tracking removed
 */

/**
 * AliExpress.
 *
 * IDENTITY IS THE ITEM NUMBER, AND NOTHING ELSE ON THE URL.
 *
 * A product link carries a page of recommendation context — `spm`, `gps-id`,
 * `scm`, `scm_id`, `scm-url`, `pvid`, `_t`, `tpp_buckets`, `pdp_ext_f`,
 * `pdp_npi`, `utparam-url`, `aff_*`, `algo_*` — describing how the visitor
 * ARRIVED, not what they arrived at. Two people reaching item 1005007345199501
 * from a feed and from a search have different URLs and the same product.
 *
 * THE LOCALE HOST IS NOT IDENTITY EITHER. es.aliexpress.com, www.aliexpress.com
 * and aliexpress.us serve the same item number; the host decides language and
 * currency, which are presentation. It is kept on `canonicalUrl` because that
 * is where the scrape actually went, and dropped from the identity because a
 * regeneration from the Spanish page is not a different product from the
 * English one.
 */
const aliexpress = {
  id: 'aliexpress',
  // Deliberately the same shapes admin/src/server/validation/aliexpress-url.ts
  // enforces at the HTTP boundary, and that module imports them from here so
  // the two can never drift into disagreeing about what a product link is.
  hostPattern: /(^|\.)aliexpress\.(com|us|ru)$/i,
  shortHostPattern: /^a\.aliexpress\.com$/i,
  itemPathPattern: /^\/(?:item|i)\/(\d{6,})\.html$/,

  resolve(url) {
    if (this.shortHostPattern.test(url.hostname)) return null; // a.aliexpress.com hides the item id
    if (!this.hostPattern.test(url.hostname)) return null;
    const match = this.itemPathPattern.exec(url.pathname);
    if (!match) return null;
    return {
      provider: this.id,
      externalProductId: match[1],
      canonicalUrl: `https://${url.hostname.toLowerCase()}/item/${match[1]}.html`,
    };
  },
};

/** Every provider whose products this system can identify. */
export const PROVIDERS = [aliexpress];

/**
 * Resolves a source URL to a stable product identity, or `null`.
 *
 * `null` IS A REAL ANSWER AND IT MUST NOT BE PAPERED OVER. A URL no provider
 * recognises has no provable identity, and a caller that treats "unknown" as
 * "probably the same" is exactly the failure this module was written against.
 *
 * @param {unknown} sourceUrl
 * @returns {SourceProductIdentity|null}
 */
export function resolveSourceIdentity(sourceUrl) {
  if (typeof sourceUrl !== 'string' || sourceUrl.trim() === '') return null;
  let url;
  try {
    url = new URL(sourceUrl.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  for (const provider of PROVIDERS) {
    const identity = provider.resolve(url);
    if (identity) return identity;
  }
  return null;
}

/**
 * Do two identities name the same product?
 *
 * PROVABLY, or not at all. Two `null`s are not a match — they are two unknowns,
 * and answering "yes" to that is how a stale directory gets overwritten by a
 * product nobody checked.
 *
 * @param {SourceProductIdentity|null} a
 * @param {SourceProductIdentity|null} b
 * @returns {boolean}
 */
export function sameSourceProduct(a, b) {
  if (!a || !b) return false;
  return a.provider === b.provider && a.externalProductId === b.externalProductId;
}

/** `aliexpress:1005007345199501` — for messages and manifests. */
export function formatSourceIdentity(identity) {
  return identity ? `${identity.provider}:${identity.externalProductId}` : 'unknown';
}

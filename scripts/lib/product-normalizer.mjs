// Canonical Product contract: normalizes raw scraper output (product.json,
// scraper/scrape.js L470-483) into a fixed-shape, honest-about-absence
// CanonicalProduct (design "Product Normalizer — Canonical Product Contract").
//
// `normalizeProduct` is a pure, synchronous, TOTAL function — it never
// throws, never mutates its input, never reads the clock or any entropy
// source, and performs zero I/O. It has no consumer in this change
// (DECISION 12 / ADR-4): its tests are its only caller. Wiring into the job
// pipeline is a deferred follow-up (design §14, N1).
//
// Zero imports on purpose (design §11 "Zero dependency footprint" /
// scope-boundaries.test.ts precedent): this file must not `import`/`require`
// anything, including Node builtins.
//
// `productId` is transported, never validated (ADR-6): this module does NOT
// import product-id.cjs, does NOT reference PRODUCT_ID_RE/isProductId/
// newProductId. A malformed productId survives byte-identical — format
// enforcement belongs to the closed layer described in ADR-6, not here.

/**
 * @typedef {Object} CanonicalImage
 * @property {string|null} url
 * @property {string|null} localPath
 * @property {number} order
 */

/**
 * @typedef {Object} CanonicalReview
 * @property {string|null} text
 * @property {number|null} rating
 * @property {string|null} author
 * @property {string|null} dateRaw
 * @property {string|null} variant
 */

/**
 * @typedef {Object} CanonicalVariantOption
 * @property {string|null} name
 * @property {string|null} selected
 * @property {string[]} options
 */

/**
 * @typedef {Object} CanonicalProduct
 * @property {Object} identity
 * @property {string|null} identity.productId
 * @property {string|null} identity.sourceUrl
 * @property {null} identity.sourceItemId
 * @property {string|null} identity.name
 * @property {string|null} identity.brand
 * @property {Object} commerceFacts
 * @property {CanonicalVariantOption[]} commerceFacts.variantOptions
 * @property {Object} socialProof
 * @property {number|null} socialProof.rating
 * @property {number|null} socialProof.reviewCount
 * @property {CanonicalReview[]} socialProof.reviews
 * @property {Object} media
 * @property {CanonicalImage[]} media.images
 * @property {[]} media.videos
 * @property {[]} specifications
 * @property {Object} description
 * @property {string|null} description.raw
 * @property {Object} provenance
 * @property {string|null} provenance.scrapedAt
 * @property {null} provenance.scrapeJobId
 */

// --- micro-helpers (design §9) — applied uniformly, no per-field fallbacks --

/** @param {unknown} v @returns {string|null} */
function str(v) {
  return typeof v === 'string' ? v : null;
}

/** @param {unknown} v @returns {number|null} */
function num(v) {
  // ADR-7: no coercion. typeof-gate + finiteness only. Never Number(v),
  // parseFloat(v), unary +v, never string trimming.
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** @param {unknown} v @returns {unknown[]} */
function arr(v) {
  return Array.isArray(v) ? v : [];
}

/** @param {unknown} v @returns {Record<string, unknown>} */
function obj(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

// --- composite projectors ----------------------------------------------

/**
 * @param {unknown} item
 * @returns {CanonicalVariantOption}
 */
function projectVariantOption(item) {
  const o = obj(item);
  return {
    name: str(o.name),
    selected: str(o.selected),
    // Shallow copy via filter — the output array never aliases raw's array,
    // so mutating the output must not mutate raw (design §9).
    options: arr(o.options).filter((x) => typeof x === 'string'),
  };
}

/**
 * @param {unknown} item
 * @returns {CanonicalReview}
 */
function projectReview(item) {
  const o = obj(item);
  // Exactly 5 keys, fixed literal (ADR-8): a spread would risk leaking
  // location/title/verified/purchaseVerified/helpfulCount/reviewImages if
  // raw ever carried them. dateRaw is the raw `date` field, verbatim —
  // never ISO-parsed/reformatted (DECISION-7).
  return {
    text: str(o.text),
    rating: num(o.rating),
    author: str(o.author),
    dateRaw: str(o.date),
    variant: str(o.variant),
  };
}

// --- media.images join (ADR-5, REVISED — conservative all-null-batch) ---

// Exactly the producer's own encoding (scraper/scrape.js L455:
// `img_${index}`), extension varies by content-type negotiation
// (scrape.js EXTENSION_BY_MIME) so any lowercase extension is accepted.
// No `i` flag: an uppercase basename is by definition not producer-written.
const IMG_BASENAME_RE = /^img_(\d+)\.[a-z0-9]+$/;

/**
 * Basename of a path string without importing node:path (zero-import
 * constraint, design §11). Handles both POSIX and Windows separators.
 * @param {string} p
 * @returns {string}
 */
function basename(p) {
  const parts = p.split(/[\\/]/);
  return parts[parts.length - 1];
}

/**
 * Attempts to recover an index -> localImages-entry map for the WHOLE
 * batch. Returns `null` if the batch is non-conforming (ADR-5): any
 * non-matching basename, any out-of-range captured index, or any
 * duplicate captured index falsifies the "this array came from the
 * L453-467 loop" assumption for the entire array, not just one entry.
 * @param {unknown[]} localImagesRaw
 * @param {number} imagesLength
 * @returns {Map<number, string> | null}
 */
function recoverLocalImageIndex(localImagesRaw, imagesLength) {
  const byIndex = new Map();
  for (const entry of localImagesRaw) {
    if (typeof entry !== 'string') return null;
    const match = IMG_BASENAME_RE.exec(basename(entry));
    if (!match) return null;
    const idx = parseInt(match[1], 10);
    if (idx < 0 || idx >= imagesLength) return null;
    if (byIndex.has(idx)) return null;
    byIndex.set(idx, entry);
  }
  return byIndex;
}

/**
 * @param {unknown} rawImages
 * @param {unknown} rawLocalImages
 * @returns {CanonicalImage[]}
 */
function projectImages(rawImages, rawLocalImages) {
  const images = arr(rawImages);
  const localImagesRaw = arr(rawLocalImages);
  // Batch-level conformance gate (ADR-5 step 2). An empty/absent
  // localImages is vacuously conforming and yields an empty map, which
  // already produces all-null localPath below — no special case needed.
  const byIndex = recoverLocalImageIndex(localImagesRaw, images.length);

  // Spine: media.images is driven solely by images[]. order = i always.
  // URLs are never dropped, reordered, or deduped in either branch.
  return images.map((url, i) => ({
    url: str(url),
    localPath: byIndex ? byIndex.get(i) ?? null : null,
    order: i,
  }));
}

// --- entry point ----------------------------------------------------------

/**
 * Normalizes raw scraper/legacy input into a fixed-shape CanonicalProduct.
 * Pure, synchronous, total — never throws, never mutates `raw`.
 * @param {unknown} raw
 * @returns {CanonicalProduct}
 */
export function normalizeProduct(raw) {
  // Entry: the single place totality is established. A null/string/array/
  // number/undefined root becomes {} here, so every field downstream takes
  // its default — nothing below needs its own root guard (design §9).
  const p = obj(raw);

  // Closed object literal, never {...DEFAULTS, ...found}: a spread would
  // let an unexpected raw key leak into the output (design §9).
  return {
    identity: {
      productId: str(p.productId),
      sourceUrl: str(p.sourceUrl),
      // Always literal null — NEVER read from raw, even if a hand-patched
      // adversarial input carries an `itemId` key (DECISION-2; this is the
      // structural fix for the #429 §12 masking bug).
      sourceItemId: null,
      name: str(p.title),
      brand: str(p.brand),
    },
    commerceFacts: {
      variantOptions: arr(p.variants).map(projectVariantOption),
    },
    socialProof: {
      rating: num(p.rating),
      reviewCount: num(p.reviewCount),
      reviews: arr(p.reviews).map(projectReview),
    },
    media: {
      images: projectImages(p.images, p.localImages),
      // No video extraction exists anywhere in the pipeline (spec §6 FACT).
      videos: [],
    },
    // No structured source for specifications exists (DECISION-3). MUST
    // NOT run regex/heuristics/LLM inference over description/reviews.
    specifications: [],
    description: {
      raw: str(p.description),
    },
    provenance: {
      scrapedAt: str(p.scrapedAt),
      // Always literal null — NEVER read from raw (DECISION-2), same
      // rationale as identity.sourceItemId above.
      scrapeJobId: null,
    },
  };
}

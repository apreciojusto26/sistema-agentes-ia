// THE ASSET PIPELINE'S OUTPUT — the only authority for what the Fixed page SHOWS.
//
// WHY THIS FILE EXISTS. FixedProductData.media has three fields — gallery,
// heroExtras and ugcStrip — and until now not one of them had a named owner.
// `gallery` arrived through content.json, which made the Content Agent the
// authority for which photographs a landing displays; the other two arrived
// through nothing at all, because generate-landing.mjs read them as
// `product.heroExtras ?? []` while content-contract.mjs rejected any
// content.json that carried them. The fallback was not a fallback. It was the
// only reachable branch, and every Fixed landing generated since the template
// switch shipped an empty hero-clip list and an empty UGC strip.
//
// The fix is not to let content.json carry them. A model choosing which media
// exists is the same defect class as a model inventing a brand: it is a claim
// about the world, and the asset pipeline is the part of this system that
// actually knows. So media gets a contract of its own, with a real owner.
//
// ALL THREE FIELDS ARE REQUIRED, and `[]` is a valid value for the two clip
// lists. That is deliberate. An OPTIONAL field defaulted to `[]` reads exactly
// the same in the output as a field nobody supplied — which is the bug this
// module was written to end. Requiring the key makes "this product has no own
// clips" an ASSERTION BY THE ASSET PIPELINE rather than a silence nobody
// noticed. The pipeline is machinery, not a model; spelling out an empty array
// costs it nothing.
//
// REQUIRED HERE IS NOT THE SAME AS RENDERED. Whether the page draws a UGC
// region at all is a capability question owned by ASTRAVIBE_FIXED_STRUCTURAL_
// GRAMMAR_V1, which seals the optional slots. This file answers only "who says
// what the media is". Source ownership and render cardinality are different
// questions and are kept in different files on purpose.

/** The three media slots FixedProductData.media declares. */
export const ASSET_OUTPUT_FIELDS = ['gallery', 'heroExtras', 'ugcStrip'];

/**
 * Keys that would mean the asset pipeline had started writing copy.
 *
 * A caption is text, and text is the Content Agent's. The boundary is only
 * worth declaring if something checks it, so these are rejected by name rather
 * than left to review.
 */
export const ASSET_OUTPUT_FORBIDDEN_FIELDS = [
  'tagline',
  'subtagline',
  'cta',
  'trustTicker',
  'benefits',
  'faq',
  'steps',
  'comparison',
  'packs',
  'shipping',
  'freeShippingOverCents',
];

/** A media reference: `asset` names a key in the generated images module. */
function collectMediaRefIssues(value, where) {
  const issues = [];
  if (!Array.isArray(value)) {
    issues.push({
      code: 'asset-field-not-an-array',
      field: where,
      message: `assetOutput.${where} must be an array (use [] for none), got ${JSON.stringify(value)}`,
    });
    return issues;
  }
  value.forEach((item, i) => {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) {
      issues.push({
        code: 'asset-item-not-an-object',
        field: `${where}[${i}]`,
        message: `assetOutput.${where}[${i}] must be an object`,
      });
      return;
    }
    // `asset` is the lookup key resolveMedia() uses against images.ts. Without
    // it the renderer silently substitutes an empty placeholder, which is how
    // a missing photo becomes a blank frame instead of an error.
    if (typeof item.asset !== 'string' || item.asset.trim() === '') {
      issues.push({
        code: 'asset-item-missing-key',
        field: `${where}[${i}]`,
        message:
          `assetOutput.${where}[${i}] has no \`asset\` key. resolveMedia() would return an empty ` +
          'placeholder and the page would render a blank frame rather than fail.',
      });
    }
  });
  return issues;
}

/**
 * Validates an asset-pipeline output. Returns `issues` — never throws, never
 * fills in a default.
 *
 * @param {unknown} input
 * @returns {{code: string, field?: string, message: string}[]}
 */
export function collectAssetOutputIssues(input) {
  const issues = [];
  if (input === null || input === undefined) {
    issues.push({
      code: 'asset-output-missing',
      message:
        'No asset output was supplied. The Fixed page renders a gallery, hero clips and a UGC ' +
        'strip, and the Content Agent is not allowed to decide what they contain.',
    });
    return issues;
  }
  if (typeof input !== 'object' || Array.isArray(input)) {
    issues.push({ code: 'asset-output-not-an-object', message: 'asset output must be a JSON object' });
    return issues;
  }

  for (const field of ASSET_OUTPUT_FIELDS) {
    if (!(field in input)) {
      issues.push({
        code: 'asset-field-missing',
        field,
        message:
          `assetOutput.${field} is required. Pass [] to state that this product has none — an ` +
          'omitted key and an empty list must not look the same, which is the defect this contract ends.',
      });
      continue;
    }
    issues.push(...collectMediaRefIssues(input[field], field));
  }

  // The gallery is the one list with a floor: a product page with no
  // photographs is not a page, and the template's stock shots must never be
  // what fills the gap.
  if (Array.isArray(input.gallery) && input.gallery.length === 0) {
    issues.push({
      code: 'asset-gallery-empty',
      field: 'gallery',
      message:
        'assetOutput.gallery is empty. A landing with no product photography would fall back to the ' +
        "template's stock images, which belong to a different product.",
    });
  }

  const forbidden = Object.keys(input).filter((k) => ASSET_OUTPUT_FORBIDDEN_FIELDS.includes(k));
  if (forbidden.length) {
    issues.push({
      code: 'asset-output-writes-copy',
      fields: forbidden,
      message:
        `asset output carries fields it has no authority over: ${forbidden.join(', ')}. ` +
        'The asset pipeline assigns media; it does not write copy or set commercial policy.',
    });
  }

  const unknown = Object.keys(input).filter(
    (k) => !ASSET_OUTPUT_FIELDS.includes(k) && !ASSET_OUTPUT_FORBIDDEN_FIELDS.includes(k),
  );
  if (unknown.length) {
    issues.push({
      code: 'asset-output-unknown-fields',
      fields: unknown,
      message: `asset output carries unknown fields: ${unknown.join(', ')}`,
    });
  }

  return issues;
}

/** True when the asset output states all three slots and every ref is usable. */
export function isAssetOutputComplete(input) {
  return collectAssetOutputIssues(input).length === 0;
}

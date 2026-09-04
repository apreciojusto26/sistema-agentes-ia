// THE ASSET PIPELINE'S OUTPUT — the only authority for what the Fixed page SHOWS.
//
// WHY THIS FILE EXISTS. FixedProductData.media has slots that until F3 had no
// named owner: `gallery` arrived through content.json, which made a language
// model the authority for which photographs a landing shows, and the rest
// arrived through nothing at all — generate-landing.mjs read them as `?? []`
// while content-contract.mjs rejected any document that carried them, so the
// fallback was the only reachable branch.
//
// A model choosing which media EXISTS is the same defect class as a model
// inventing a brand: it is a claim about the world, made by the part of the
// system least able to check it. So media gets a contract of its own.
//
// ─── `productMediaStrip` IS NOT `ugcStrip`, AND THAT IS A CORRECTION ───────
//
// The template's field is called `ugcStrip`, and F3 inherited the name into the
// Fixed contract along with the assumption behind it. An audit of what the
// region actually RENDERS found that assumption false:
//
//   09-ugc-strip.astro emits NO visible text — no heading, no author, no
//   rating, no attribution, no "clientes". It is a silent scrolling band of
//   media, and the template's own entries carry alts describing the PRODUCT
//   ("AstraVibe encendido proyectando estrellas junto al producto").
//
// It makes no claim of customer provenance, so it is not user-generated
// content — it is a PRODUCT MEDIA MARQUEE that was misnamed. The factual rule
// is unchanged and still binding: supplier media must never be PRESENTED as
// customer content. A band that presents nothing as anything does not violate
// it, and filling it with the product's own photography states only the truth.
//
// The template keeps its field name — it is frozen, and renaming it would
// widen the change for nothing. The mapping is one line at the assembler:
//
//   FixedAssetOutput.productMediaStrip  ->  product.ts `ugcStrip`
//
// A REAL UGC section would need real provenance and is a different capability
// entirely. Nothing here should be read as having built one.
//
// ─── SOURCE OWNERSHIP IS NOT RENDER CARDINALITY ────────────────────────────
//
// How many items a region needs is sealed by ASTRAVIBE_FIXED_STRUCTURAL_
// GRAMMAR_V1. This file answers only "who is allowed to say, and is the thing
// they said a shape Astro can render". The two questions live in two files
// because collapsing them is how a capability flag turns into a content field.

/** Aspect ratios the template's MediaRef accepts. A free string renders broken. */
export const ASSET_RATIOS = ['1/1', '4/5', '3/4', '4/3', '16/9', '9/16'];

/** Media slot lists. Every one of them is the asset pipeline's to fill. */
export const ASSET_OUTPUT_LISTS = ['gallery', 'heroExtras', 'productMediaStrip'];

/** Every slot the output declares, lists plus the step assignment map. */
export const ASSET_OUTPUT_FIELDS = [...ASSET_OUTPUT_LISTS, 'stepMedia'];

/**
 * Keys that would mean the asset pipeline had started writing copy or setting
 * commercial policy. Rejected by name, because a boundary nothing checks is a
 * comment.
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

/** Alt text that would assert a customer took the photograph. */
const CUSTOMER_CLAIM = /\b(cliente|clienta|comprador|compradora|customer|buyer|enviad[ao] por|foto de un[ao]?)\b/i;

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * Validates one MediaRef by SHAPE, not by key presence.
 *
 * THE DISTINCTION IS LOAD-BEARING. The content contract checks that a key
 * exists and stops there, which is how a steps array missing `media` reached
 * Astro and crashed the build with "Cannot read properties of undefined". A
 * media contract that only counted keys would let the same class of defect
 * through, one layer further down.
 */
function collectMediaIssues(media, where, { requireAlt = true } = {}) {
  const issues = [];
  const at = (code, message) => issues.push({ code, field: where, message });

  if (!isObject(media)) {
    at('asset-media-not-an-object', `${where} must be a media object, got ${JSON.stringify(media)}`);
    return issues;
  }

  // `asset` is the lookup key resolveMedia() uses. Without it the renderer
  // substitutes an empty placeholder and the page shows a blank frame with no
  // error anywhere — the silent degradation this contract exists to end.
  if (typeof media.asset !== 'string' || media.asset.trim() === '') {
    at(
      'asset-media-missing-key',
      `${where} has no \`asset\` key. resolveMedia() would return an empty placeholder ` +
        'and the page would render a blank frame rather than fail.',
    );
  }

  if (requireAlt && typeof media.alt !== 'string') {
    at('asset-media-missing-alt', `${where}.alt must be a string — it is what a screen reader reads`);
  }
  if (typeof media.alt === 'string' && CUSTOMER_CLAIM.test(media.alt)) {
    // The factual rule, made mechanical. The strip may show supplier media; it
    // may never SAY a customer supplied it.
    at(
      'asset-media-false-provenance',
      `${where}.alt claims customer provenance (${JSON.stringify(media.alt)}) for media the ` +
        'pipeline took from the product listing. Describe the product, not an imagined buyer.',
    );
  }

  if (!ASSET_RATIOS.includes(media.ratio)) {
    at(
      'asset-media-bad-ratio',
      `${where}.ratio must be one of ${ASSET_RATIOS.join(' | ')}, got ${JSON.stringify(media.ratio)}`,
    );
  }

  if (media.kind !== undefined && media.kind !== 'image' && media.kind !== 'video') {
    at('asset-media-bad-kind', `${where}.kind must be 'image' or 'video' when present, got ${JSON.stringify(media.kind)}`);
  }

  // A poster is a video's still frame. On an image it is a field nothing reads,
  // which means someone believed it did something.
  if (media.poster !== undefined) {
    if (media.kind !== 'video') {
      at('asset-media-poster-on-image', `${where}.poster is only meaningful on kind: 'video'`);
    } else if (typeof media.poster !== 'string' || media.poster.trim() === '') {
      at('asset-media-bad-poster', `${where}.poster must be a non-empty asset key when present`);
    }
  }

  return issues;
}

/**
 * Validates an asset-pipeline output. Returns `issues` — never throws, never
 * fills in a default.
 *
 * @param {unknown} input
 * @returns {{code: string, field?: string, fields?: string[], message: string}[]}
 */
export function collectAssetOutputIssues(input) {
  const issues = [];
  if (input === null || input === undefined) {
    issues.push({
      code: 'asset-output-missing',
      message:
        'No asset output was supplied. The Fixed page renders a gallery, a media strip and a photo ' +
        'per how-it-works step, and the Content Agent is not allowed to decide what they contain.',
    });
    return issues;
  }
  if (!isObject(input)) {
    issues.push({ code: 'asset-output-not-an-object', message: 'asset output must be a JSON object' });
    return issues;
  }

  for (const field of ASSET_OUTPUT_FIELDS) {
    if (!(field in input)) {
      issues.push({
        code: 'asset-field-missing',
        field,
        message:
          `assetOutput.${field} is required. State it explicitly — an omitted key and an empty one ` +
          'must not look the same, which is the defect this contract ends.',
      });
    }
  }

  for (const field of ASSET_OUTPUT_LISTS) {
    const list = input[field];
    if (list === undefined) continue;
    if (!Array.isArray(list)) {
      issues.push({
        code: 'asset-field-not-an-array',
        field,
        message: `assetOutput.${field} must be an array (use [] for none), got ${JSON.stringify(list)}`,
      });
      continue;
    }
    list.forEach((media, i) => issues.push(...collectMediaIssues(media, `${field}[${i}]`)));
  }

  // Gallery has a floor: a product page with no photographs is not a page, and
  // the template's stock shots must never be what fills the gap.
  if (Array.isArray(input.gallery)) {
    if (input.gallery.length === 0) {
      issues.push({
        code: 'asset-gallery-empty',
        field: 'gallery',
        message:
          'assetOutput.gallery is empty. A landing with no product photography would fall back to the ' +
          "template's stock images, which belong to a different product.",
      });
    }
    input.gallery.forEach((media, i) => {
      if (isObject(media) && (typeof media.id !== 'string' || media.id.trim() === '')) {
        issues.push({
          code: 'asset-gallery-missing-id',
          field: `gallery[${i}]`,
          message: `assetOutput.gallery[${i}].id must be a non-empty string — GalleryImage requires it`,
        });
      }
    });
  }

  // The strip's floor comes from the grammar, not from taste: FIXED_GRAMMAR
  // seals ugc/track at min 1, so an empty strip renders an empty marquee and
  // the page no longer conforms. A product with a gallery always has at least
  // one asset that can also feed the strip, so this can only fire on a caller
  // that filtered everything out.
  if (Array.isArray(input.productMediaStrip) && input.productMediaStrip.length === 0) {
    issues.push({
      code: 'asset-strip-empty',
      field: 'productMediaStrip',
      message:
        'assetOutput.productMediaStrip is empty. The sealed grammar requires at least one item in that ' +
        'region, and an empty marquee is a blank band on the page.',
    });
  }

  // ─── step media ─────────────────────────────────────────────────────────
  //
  // KEYED BY STRUCTURAL SLOT, never by copy. A key derived from a heading is a
  // key a model writes, and the day it rewrites "Cómo usarlo" the assignment
  // silently detaches from the step it was for.
  if (input.stepMedia !== undefined) {
    if (!isObject(input.stepMedia)) {
      issues.push({
        code: 'asset-step-media-not-an-object',
        field: 'stepMedia',
        message: 'assetOutput.stepMedia must be an object keyed by step slot (step-0, step-1, …)',
      });
    } else {
      for (const [slot, media] of Object.entries(input.stepMedia)) {
        if (!/^step-\d+$/.test(slot)) {
          issues.push({
            code: 'asset-step-slot-invalid',
            field: `stepMedia.${slot}`,
            message:
              `"${slot}" is not a step slot. Slots are positional (step-0, step-1, …) because the ` +
              'template knows positions and a copy-derived key moves when the copy is rewritten.',
          });
          continue;
        }
        issues.push(...collectMediaIssues(media, `stepMedia.${slot}`));
      }
    }
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

/** True when every slot is stated and every ref is a shape Astro can render. */
export function isAssetOutputComplete(input) {
  return collectAssetOutputIssues(input).length === 0;
}

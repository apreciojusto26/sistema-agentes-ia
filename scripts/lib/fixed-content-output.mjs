// THE FIXED CONTENT PROJECTION — what the Content Agent may decide for a Fixed
// landing, and nothing more.
//
// WHY A SECOND CONTRACT RATHER THAN AN EDIT TO THE FIRST. content-contract.mjs
// describes the Version A document, and Version A is still a real flow with
// real tests. It is also pinned line-for-line by scope-boundaries.test.ts,
// which is not an obstacle to work around — it is the tripwire that stopped
// F3B from quietly widening the Content Agent's authority in the first place.
//
// So Version A keeps its document, and Fixed gets a PROJECTION of it: the same
// input, narrowed to the slots a Fixed page actually fills. Narrowing is not a
// preference here. Every field this module drops is one an authority other
// than the Content Agent owns, or one the Fixed page does not render at all.
//
// ─── WHAT LEAVES, AND WHO TAKES IT ─────────────────────────────────────────
//
//   packs        -> merchant config. Bundle definitions are MERCHANDISING: how
//                   this store packages what Shopify sells. They carry prices,
//                   discounts and a "popular" flag, which are commercial
//                   decisions an operator makes once — not sentences about the
//                   product, and not something to spend model tokens inventing.
//   gallery      -> asset pipeline
//   heroExtras   -> asset pipeline
//   ugcStrip     -> asset pipeline (as `productMediaStrip`; see that contract)
//   step media   -> asset pipeline. The Content Agent writes a step's TITLE
//                   and TEXT; which photograph illustrates it is a media
//                   decision, and filenames are not copy.
//   reviews      -> CanonicalProduct.socialProof. An author, a star rating and
//   testimonials    a review body are an assertion about a stranger's
//                   experience. The scraper already collects real ones; a model
//                   writing them is fabricating evidence.
//   shipping     -> merchant config
//
// ─── WHAT LEAVES BECAUSE NOTHING RENDERS IT ────────────────────────────────
//
//   benefits, heroPills, specs, badges, offer, ugc, comparisonRival
//
// Removed from the Fixed contract in F3A after a field-level sweep of the
// mounted page found no consumer. They remain valid Version A fields; they are
// simply not projected.
//
// A DROPPED FIELD IS NOT AN IGNORED FIELD. `projectFixedContent` drops the
// Version A extras because the Version A document legitimately carries them —
// that is a translation between two contracts. But anything handed DIRECTLY to
// the assembler as a Fixed content output is REJECTED if it carries a slot
// this module does not own, because there the extra field means a caller
// believes the Content Agent decides it.

/** Slots a Fixed page fills from the Content Agent, and only from it. */
export const FIXED_CONTENT_FIELDS = [
  'brand',
  'name',
  'tagline',
  'subtagline',
  'cta',
  'variantGroupLabel',
  'errors',
  'commerceMessages',
  'trustTicker',
  'ratingAverage',
  'ratingCount',
  'steps',
  'comparison',
  // Top-level in content.json, not inside `product` — but they are the same
  // author's work and FixedProductData reads them, so the projection carries
  // them. `reviews` is the testimonials list narrowed to FixedReview: `id` and
  // `variant` are dropped because the Fixed page picks its own layout, and a
  // content field that chooses a layout is the drift F3A removed.
  'faq',
];

/** Slots owned by another authority. Named so the guard can reject them. */
export const FIXED_CONTENT_FOREIGN_FIELDS = [
  // SOCIAL PROOF IS THE SCRAPE'S. A card with an author, a star rating and a
  // body asserts a stranger's experience, and a language model cannot have one.
  // scripts/lib/fixed-social-proof.mjs projects these from CanonicalReview.
  'reviews',
  'testimonials',
  'featuredTestimonial',
  'packs',
  'gallery',
  'heroExtras',
  'ugcStrip',
  'shipping',
  'freeShippingOverCents',
  'freeOverCents',
  'guarantee',
  'commercialGuarantee',
  'commercialGuaranteeDays',
  'returns',
  'returnsWindowDays',
];

/** Version A fields the Fixed page renders nowhere. Dropped, never rejected. */
export const VERSION_A_ONLY_FIELDS = [
  'benefits',
  'heroPills',
  'specs',
  'badges',
  'offer',
  'ugc',
  'comparisonRival',
];

// ─── ITEM SHAPES ──────────────────────────────────────────────────────────
//
// content-contract.mjs validates that a COLLECTION KEY exists and, for
// testimonials, which keys each item carries. It does not check that the values
// inside an item are usable — which is how a `steps` array missing `media`
// reached Astro and aborted a build with "Cannot read properties of undefined".
//
// The renderer is the wrong place to find out. Every rule below is derived from
// a real consumer in landing-astravibe, not from copying the historical types:
//
//   faq          FaqItem      { id, question, answer }            faq.ts
//   testimonials Testimonial  { id, author, rating, date, body,   testimonials.ts
//                               variant, title?, media? }
//   comparison   ComparisonRow{ feature, ours, rival }            10-comparison
//   steps        HowToStep    { step, title, text } + asset media 06-how-it-works
//
// SHAPE, NOT SEMANTICS. A non-empty string is checkable; whether an answer
// answers its question is not, and a regex pretending otherwise would only
// reject honest copy.

/** Stars is a closed domain: 1-5, integral. A 4.5 renders half a glyph. */
export const TESTIMONIAL_RATINGS = [1, 2, 3, 4, 5];

/** Layout slots, not product variants — the names collide, the meanings do not. */
export const TESTIMONIAL_LAYOUTS = ['quote', 'card', 'reel'];

const isFilledString = (v) => typeof v === 'string' && v.trim() !== '';

/** A comparison cell is a claim (boolean) or a value (string). Never a third thing. */
const isComparisonCell = (v) => typeof v === 'boolean' || isFilledString(v);

/**
 * Validates the collections a Fixed page renders, item by item.
 *
 * @param {object} content a Fixed content output
 * @returns {{code: string, path: string, message: string}[]}
 */
export function collectFixedItemIssues(content) {
  const issues = [];
  const at = (code, where, message) => issues.push({ code, path: where, message });
  const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

  // ─── faq ───────────────────────────────────────────────────────────────
  if (content?.faq !== undefined) {
    if (!Array.isArray(content.faq)) {
      at('content-faq-not-an-array', 'faq', 'faq must be an array');
    } else {
      content.faq.forEach((item, i) => {
        if (!isObj(item)) return at('content-faq-item-invalid', `faq[${i}]`, `faq[${i}] must be an object`);
        for (const key of ['question', 'answer']) {
          if (!isFilledString(item[key])) {
            at('content-faq-item-invalid', `faq[${i}].${key}`, `faq[${i}].${key} must be a non-empty string`);
          }
        }
      });
    }
  }

  // ─── reviews ───────────────────────────────────────────────────────────
  if (content?.reviews !== undefined) {
    if (!Array.isArray(content.reviews)) {
      at('content-review-not-an-array', 'reviews', 'reviews must be an array');
    } else {
      content.reviews.forEach((item, i) => {
        if (!isObj(item)) {
          return at('content-review-item-invalid', `reviews[${i}]`, `reviews[${i}] must be an object`);
        }
        // `author` may be '' — a source that recorded none is a real state, and
        // the mask IS the provenance. It must still be a string.
        if (typeof item.author !== 'string') {
          at('content-review-item-invalid', `reviews[${i}].author`, `reviews[${i}].author must be a string`);
        }
        if (!isFilledString(item.body)) {
          at('content-review-item-invalid', `reviews[${i}].body`, `reviews[${i}].body must be a non-empty string`);
        }
        if (!TESTIMONIAL_RATINGS.includes(item.rating)) {
          at(
            'content-review-item-invalid',
            `reviews[${i}].rating`,
            `reviews[${i}].rating must be one of ${TESTIMONIAL_RATINGS.join(', ')} — Stars is a closed ` +
              `domain and a fractional value renders half a glyph, got ${JSON.stringify(item.rating)}`,
          );
        }
        // THE DATE IS THE PROVIDER'S OWN STRING, not ISO. scrape.js reads
        // "25 AGO 2025" out of a meta line and product-normalizer's DECISION-7
        // forbids reformatting it, so demanding ISO here would demand a
        // precision the source never gave — and the only way to satisfy it
        // would be to invent one. It must be a string; '' is a real answer for
        // a review whose meta line did not parse.
        if (typeof item.date !== 'string') {
          at(
            'content-review-item-invalid',
            `reviews[${i}].date`,
            `reviews[${i}].date must be a string — the provider's own text, or '' when it published none. ` +
              `Got ${JSON.stringify(item.date)}`,
          );
        }
        // MEDIA IS THE ASSET LAYER'S, here as everywhere else. `Testimonial.media`
        // has no consumer in the mounted page at all, so a ref here would be a
        // file nobody renders chosen by an authority that does not own media.
        if ('media' in item) {
          at(
            'content-review-media-forbidden',
            `reviews[${i}].media`,
            `reviews[${i}] carries media. Media comes from the asset pipeline, and no mounted section ` +
              'reads a testimonial media ref at all.',
          );
        }
        for (const banned of ['location', 'verified']) {
          if (banned in item) {
            at(
              'content-review-item-invalid',
              `reviews[${i}].${banned}`,
              `reviews[${i}].${banned} was removed in F2 — nothing upstream can supply it, so it could ` +
                'only be invented about a stranger.',
            );
          }
        }
      });
    }
  }

  // ─── comparison ────────────────────────────────────────────────────────
  if (content?.comparison !== undefined) {
    if (!Array.isArray(content.comparison)) {
      at('content-comparison-not-an-array', 'comparison', 'comparison must be an array');
    } else {
      content.comparison.forEach((row, i) => {
        if (!isObj(row)) {
          return at('content-comparison-item-invalid', `comparison[${i}]`, `comparison[${i}] must be an object`);
        }
        if (!isFilledString(row.feature)) {
          at(
            'content-comparison-item-invalid',
            `comparison[${i}].feature`,
            `comparison[${i}].feature must be a non-empty string`,
          );
        }
        for (const cell of ['ours', 'rival']) {
          if (!isComparisonCell(row[cell])) {
            at(
              'content-comparison-item-invalid',
              `comparison[${i}].${cell}`,
              `comparison[${i}].${cell} must be a boolean or a non-empty string. The sealed grammar knows ` +
                `exactly those two cell shapes; a third renders a cell no R-shape matches and the whole ` +
                `region stops collapsing, got ${JSON.stringify(row[cell])}`,
            );
          }
        }
      });
    }
  }

  // ─── steps ─────────────────────────────────────────────────────────────
  if (content?.steps !== undefined) {
    if (!Array.isArray(content.steps)) {
      at('content-step-not-an-array', 'steps', 'steps must be an array');
    } else {
      content.steps.forEach((step, i) => {
        if (!isObj(step)) return at('content-step-item-invalid', `steps[${i}]`, `steps[${i}] must be an object`);
        for (const key of ['title', 'text']) {
          if (!isFilledString(step[key])) {
            at('content-step-item-invalid', `steps[${i}].${key}`, `steps[${i}].${key} must be a non-empty string`);
          }
        }
        if (step.step !== undefined && !Number.isInteger(step.step)) {
          at(
            'content-step-item-invalid',
            `steps[${i}].step`,
            `steps[${i}].step must be an integer when present, got ${JSON.stringify(step.step)}`,
          );
        }
        // The F4 boundary, restated where a content document is checked. The
        // projection drops it; a caller building a Fixed content output by hand
        // gets told instead.
        if ('media' in step) {
          at(
            'content-step-media-forbidden',
            `steps[${i}].media`,
            `steps[${i}] carries media. Which photograph illustrates a step is an asset decision — the ` +
              'Content Agent writes the title and the text.',
          );
        }
      });
    }
  }

  return issues;
}

/** Copy slots with no honest default — absence makes the page incomplete. */
const REQUIRED = ['name', 'tagline', 'subtagline', 'cta', 'variantGroupLabel', 'trustTicker'];

/**
 * Narrows a Version A content document to the Fixed projection.
 *
 * TRANSLATION, NOT VALIDATION. It is the one place allowed to see both shapes,
 * and it exists so the generator can keep accepting the documents every
 * historical fixture and the live Content Agent produce, without any of the
 * foreign slots inside them reaching FixedProductData.
 *
 * `packs` IS DROPPED HERE RATHER THAN REJECTED, and the distinction matters.
 * A Version A content.json is REQUIRED to carry packs — content-contract.mjs
 * lists it and scope-boundaries pins that file line for line — so a document
 * arriving with packs is not a caller overstepping, it is the historical format
 * doing what it has always done. What must not happen is that value reaching
 * the page, and it does not: merchant config supplies the packs Fixed renders,
 * and a caller who hands the ASSEMBLER a content output with packs in it still
 * gets an error, because there the field means something different.
 *
 * @param {object} content a content.json (`{product, faq, testimonials}`)
 * @returns {object} the Fixed content output
 */
export function projectFixedContent(content) {
  const product = content?.product ?? content ?? {};
  const out = {};
  for (const field of FIXED_CONTENT_FIELDS) {
    if (field in product) out[field] = product[field];
  }

  // STEPS LOSE THEIR MEDIA HERE, the same way packs are dropped: a Version A
  // content.json legitimately carries `step.media`, so its presence is the
  // historical format behaving correctly rather than a caller overstepping.
  // What must not happen is a model choosing the photograph, and it does not —
  // the assembler takes step media from the asset output and refuses to build
  // a step that has none.
  if (Array.isArray(out.steps)) {
    out.steps = out.steps.map(({ media, ...copy }) => copy);
  }
  if (Array.isArray(content?.faq)) out.faq = content.faq;
  // `testimonials` IS DELIBERATELY NOT PROJECTED. A Version A content.json
  // carries them and its own contract still requires them, so their presence is
  // the historical format behaving correctly — but they do not reach a Fixed
  // page. Social proof is projected from the scrape by fixed-social-proof.mjs.
  return out;
}

/**
 * Validates a Fixed content output. Returns `issues` — never throws.
 *
 * @param {unknown} input
 * @returns {{code: string, fields?: string[], message: string}[]}
 */
export function collectFixedContentIssues(input) {
  const issues = [];
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    issues.push({
      code: 'fixed-content-not-an-object',
      message: 'the Fixed content output must be an object of copy and narrative slots',
    });
    return issues;
  }

  const foreign = FIXED_CONTENT_FOREIGN_FIELDS.filter((f) => f in input);
  if (foreign.length) {
    issues.push({
      code: 'fixed-content-foreign-authority',
      fields: foreign,
      message:
        `the Fixed content output carries slots the Content Agent does not own: ${foreign.join(', ')}. ` +
        'Media comes from the asset pipeline; packs, thresholds and policy terms come from merchant config.',
    });
  }

  const missing = REQUIRED.filter((f) => !(f in input));
  if (missing.length) {
    issues.push({
      code: 'fixed-content-missing-fields',
      fields: missing,
      message: `the Fixed content output is missing required copy: ${missing.join(', ')}`,
    });
  }

  issues.push(...collectFixedItemIssues(input));

  const unknown = Object.keys(input).filter(
    (k) => !FIXED_CONTENT_FIELDS.includes(k) && !FIXED_CONTENT_FOREIGN_FIELDS.includes(k),
  );
  if (unknown.length) {
    issues.push({
      code: 'fixed-content-unknown-fields',
      fields: unknown,
      message:
        `the Fixed content output carries fields no Fixed section renders: ${unknown.join(', ')}. ` +
        'A slot nobody reads is text a model was asked to write for no one.',
    });
  }

  return issues;
}

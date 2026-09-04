// SOCIAL PROOF COMES FROM THE SCRAPE, OR IT DOES NOT EXIST.
//
// A card showing an author, a star rating and a review body is an assertion
// about a stranger's experience. Until now a language model wrote every one of
// them: generate-content.mjs asked for `testimonials`, nothing projected
// `CanonicalProduct.socialProof.reviews`, and the real reviews the scraper had
// already collected sat unused while invented ones shipped.
//
// F2 removed the DECORATIONS — the "✓ Compra verificada" pill, the "· Madrid"
// that no source could supply, the named personas in the template's own data.
// It did not remove the fabrication underneath. This does.
//
// ─── WHAT THE SOURCE ACTUALLY GIVES ───────────────────────────────────────
//
// CanonicalReview is `{ text, rating, author, dateRaw, variant }`, every field
// nullable, projected by product-normalizer.mjs from what scrape.js reads out
// of the provider's review modal:
//
//   text     the review node's own text
//   rating   COUNTED filled stars, capped at 5 — null when no star box exists
//   author   from a "Autor | 25 AGO 2025" meta line — null when it does not match
//   dateRaw  the same line's date half, VERBATIM. "25 AGO 2025", not ISO, and
//            product-normalizer's DECISION-7 forbids reformatting it
//   variant  the purchased SKU ("Color: Gris") — NOT a layout choice
//
// THE DEPENDENCY RUNS ONE WAY. The Fixed representation is shaped by what
// CanonicalReview can prove, never by what the legacy `Testimonial` type asks
// for. A field the source cannot supply is a field this module leaves out —
// it does not invent one to satisfy a shape.
//
// ─── TWO WORDS CALLED `variant` ───────────────────────────────────────────
//
// `CanonicalReview.variant` is the option the buyer purchased.
// `Testimonial.variant` is a RENDERING SLOT — 'quote' feeds the featured
// section, 'reel' feeds the carousel. Same word, unrelated meanings. The layout
// slot is assigned HERE, deterministically, because where a real review is
// displayed is a layout decision and not a claim about anybody.

/** Stars is a closed domain in the template; a counted star box gives an integer. */
const RATINGS = [1, 2, 3, 4, 5];

/**
 * Is this canonical review usable as displayed social proof?
 *
 * TEXT AND RATING ARE BOTH REQUIRED, because the card renders both: a review
 * with no body is an empty quotation mark, and one with no rating would draw a
 * star row the source never counted. An author is NOT required — absence is a
 * real state the display layer already handles.
 */
export function isDisplayableReview(review) {
  return (
    review !== null &&
    typeof review === 'object' &&
    typeof review.text === 'string' &&
    review.text.trim() !== '' &&
    RATINGS.includes(review.rating)
  );
}

/** Why a canonical review was not shown. Reported, never silently dropped. */
export function describeRejection(review) {
  if (review === null || typeof review !== 'object') return 'not an object';
  if (typeof review.text !== 'string' || review.text.trim() === '') return 'no review text';
  if (!RATINGS.includes(review.rating)) return `no usable star rating (${JSON.stringify(review.rating)})`;
  return 'unknown';
}

/**
 * Picks the review to feature.
 *
 * DETERMINISTIC, and stated rather than left to chance: the highest rating
 * first, then the longest body, then the earliest position. Same scrape, same
 * quote, every time — a random pick would make two builds of one product show
 * different customers.
 *
 * The body is never rewritten. A "polished" quote is a sentence the customer
 * did not write, attributed to them by name.
 */
export function selectFeatured(displayable) {
  if (displayable.length === 0) return null;
  return [...displayable]
    .map((review, index) => ({ review, index }))
    .sort(
      (a, b) =>
        b.review.rating - a.review.rating ||
        b.review.text.trim().length - a.review.text.trim().length ||
        a.index - b.index,
    )[0].review;
}

/**
 * Projects the scrape's reviews into the Fixed social-proof shape.
 *
 * @param {object} canonicalProduct
 * @returns {{
 *   capability: boolean,
 *   testimonials: object[],
 *   featured: object | null,
 *   audit: {found: number, displayable: number, rejected: {reason: string}[]},
 * }}
 */
export function projectFixedSocialProof(canonicalProduct) {
  const found = Array.isArray(canonicalProduct?.socialProof?.reviews)
    ? canonicalProduct.socialProof.reviews
    : [];

  const displayable = found.filter(isDisplayableReview);
  const rejected = found.filter((r) => !isDisplayableReview(r)).map((r) => ({ reason: describeRejection(r) }));
  const featured = selectFeatured(displayable);

  const toTestimonial = (review, i, layout) => ({
    // Positional and stable. Not derived from the text, which would change the
    // id whenever a translation or a trim changed a character.
    id: `r${i + 1}`,
    // RAW, mask included. `reviewerDisplayName()` in the template decides how an
    // absent or masked author is presented; rewriting it here would destroy the
    // provenance the mask IS.
    author: typeof review.author === 'string' ? review.author : '',
    rating: review.rating,
    // THE PROVIDER'S OWN STRING, verbatim — "25 AGO 2025", not ISO. Parsing it
    // into a date would invent a precision the source never gave, and
    // product-normalizer's DECISION-7 forbids reformatting it. No mounted
    // section renders this field at all; it is carried because the template's
    // type declares it, and carrying the truth costs nothing.
    date: typeof review.dateRaw === 'string' ? review.dateRaw : '',
    body: review.text.trim(),
    // The LAYOUT slot, assigned here. Never the purchased SKU, and never a
    // model's choice.
    variant: layout,
  });

  const testimonials = [];
  let position = 0;
  if (featured) testimonials.push(toTestimonial(featured, position++, 'quote'));
  for (const review of displayable) {
    if (review === featured) continue;
    testimonials.push(toTestimonial(review, position++, 'reel'));
  }

  return {
    // ONE BINDING, NOT A FLAG. The capability IS whether real reviews survived,
    // so `capability: true` with an empty list is unrepresentable.
    capability: testimonials.length > 0,
    testimonials,
    featured: featured ? testimonials[0] : null,
    audit: { found: found.length, displayable: displayable.length, rejected },
  };
}

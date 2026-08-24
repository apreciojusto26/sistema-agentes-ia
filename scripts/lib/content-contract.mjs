// Shared content contract (spec R6): validates the shape of content.json.
// Single source of truth for both the CLI (scripts/generate-landing.mjs) and
// the admin backend (admin/src/server/validation/content.ts, a thin re-export
// adapter — see admin/test/no-duplicated-contract.test.ts). No field whitelist
// may be duplicated anywhere else in the repo.
//
// Two consumption modes, sharing one implementation:
//   - fail-fast (validateProduct/Faq/Testimonials/Content): throws
//     ContentContractError on the FIRST issue, matching generate-landing.mjs's
//     pre-extraction process.exit(1) behavior byte-for-byte.
//   - collect-all (collectContentErrors): never throws, returns every issue
//     found — used by the admin's staged-content validation UI.
//
// Check order within each validator is load-bearing: it must exactly match
// the order the CLI checked before extraction, because the FIRST issue in
// collect-all mode must equal what fail-fast throws.
//
// Product identity (design "Product Identity + Generation Isolation", Fase 4):
// an OPTIONAL top-level `productId` is format-checked here (never required —
// absence is never an error). It rides top-level, NEVER inside `product` —
// ALLOWED_PRODUCT_FIELDS / the product.* whitelist is intentionally untouched.

import { isProductId } from './product-id.cjs';

export const ALLOWED_PRODUCT_FIELDS = [
  'brand', 'name', 'tagline', 'subtagline',
  'ratingAverage', 'ratingCount', 'ratingBreakdown',
  'badges', 'trustTicker', 'offer', 'benefits', 'heroPills',
  'specs', 'packs', 'gallery', 'steps', 'comparison',
  'guarantee', 'shipping', 'ugc', 'cta', 'variantGroupLabel', 'errors',
];
// errors has a sane default (translation-only field) so it's not required input.
export const REQUIRED_PRODUCT_FIELDS = ALLOWED_PRODUCT_FIELDS.filter((f) => f !== 'errors');

export const FAQ_FIELDS = ['id', 'question', 'answer'];
export const TESTIMONIAL_REQUIRED_FIELDS = ['id', 'author', 'rating', 'date', 'body', 'verified', 'variant'];

/**
 * The testimonial variants the RENDERER actually consumes. Every entry here is
 * backed by a real selector in a real component — verified repo-wide:
 *
 *   'quote' -> 07-featured-testimonial.astro          `.find(t => t.variant === 'quote')`
 *              social-proof/FeaturedQuote/Default.astro  (same selector)
 *   'reel'  -> 10-reviews-reel.astro                  `.filter(t => t.variant === 'reel')`
 *
 * `'card'` USED TO BE HERE and was removed: no component in the template or in
 * any generated landing ever selected it. Three of the four testimonials the
 * first live generation produced were `card` — perfectly contract-valid, and
 * rendered by nothing. Data the system accepts but can never display is not a
 * feature, it is a silent budget leak on every Gemini call.
 *
 * Adding a variant back here is only correct once a component selects it.
 * This list drives THREE things — the enum check, the coverage rule, and the
 * Content Agent's prompt — so it can never drift from what ships.
 */
export const TESTIMONIAL_VARIANTS = ['quote', 'reel'];
export const TESTIMONIAL_ALL_FIELDS = ['id', 'author', 'location', 'rating', 'date', 'title', 'body', 'verified', 'variant'];

export const DEFAULT_ERRORS = {
  network: 'No pudimos conectar con la tienda. Probá de nuevo en unos segundos.',
  soldOut: 'Esta variante está agotada por el momento.',
  expired: 'Tu carrito expiró. Elegí tu opción de nuevo para continuar.',
  noDiscount: 'El total mostrado es el precio final calculado por la tienda.',
  generic: 'Algo salió mal. Probá de nuevo.',
};

export class ContentContractError extends Error {
  constructor(message, { code, path } = {}) {
    super(message);
    this.name = 'ContentContractError';
    this.code = code;
    this.path = path;
  }
}

// --- collect-all (never throws) --------------------------------------------

function collectProductIssues(product) {
  const issues = [];
  const keys = Object.keys(product);

  if (keys.includes('commerce')) {
    issues.push({
      code: 'product-commerce-forbidden',
      path: 'product',
      message:
        'content.json product includes "commerce" — this field is NEVER agent-generated ' +
        '(agents.MD §1: shopifyHandle/bundleOfferActive are provisioned outside the Content Agent). ' +
        'Remove it; the script always injects a placeholder that must be filled in manually.',
    });
  }

  const unknown = keys.filter((k) => k !== 'commerce' && !ALLOWED_PRODUCT_FIELDS.includes(k));
  if (unknown.length) {
    issues.push({
      code: 'product-unknown-fields',
      path: 'product',
      message: `content.json product has fields outside the agent-writable contract: ${unknown.join(', ')}`,
      fields: unknown,
    });
  }

  const missing = REQUIRED_PRODUCT_FIELDS.filter((f) => !(f in product));
  if (missing.length) {
    issues.push({
      code: 'product-missing-fields',
      path: 'product',
      message: `content.json product is missing required fields: ${missing.join(', ')}`,
      fields: missing,
    });
  }

  return issues;
}

function collectFaqIssues(faq) {
  const issues = [];
  if (!Array.isArray(faq) || faq.length === 0) {
    issues.push({
      code: 'faq-not-array',
      path: 'faq',
      message: 'content.json "faq" must be a non-empty array',
    });
    return issues;
  }
  faq.forEach((item, i) => {
    const missing = FAQ_FIELDS.filter((f) => !(f in item));
    if (missing.length) {
      issues.push({
        code: 'faq-missing-fields',
        path: `faq[${i}]`,
        message: `faq[${i}] is missing fields: ${missing.join(', ')}`,
        fields: missing,
      });
    }
  });
  return issues;
}

function collectTestimonialsIssues(testimonials) {
  const issues = [];
  if (!Array.isArray(testimonials) || testimonials.length === 0) {
    issues.push({
      code: 'testimonials-not-array',
      path: 'testimonials',
      message: 'content.json "testimonials" must be a non-empty array',
    });
    return issues;
  }
  testimonials.forEach((item, i) => {
    const missing = TESTIMONIAL_REQUIRED_FIELDS.filter((f) => !(f in item));
    if (missing.length) {
      issues.push({
        code: 'testimonials-missing-fields',
        path: `testimonials[${i}]`,
        message: `testimonials[${i}] is missing fields: ${missing.join(', ')}`,
        fields: missing,
      });
    }
    const unknown = Object.keys(item).filter((k) => !TESTIMONIAL_ALL_FIELDS.includes(k));
    if (unknown.length) {
      issues.push({
        code: 'testimonials-unknown-fields',
        path: `testimonials[${i}]`,
        message: `testimonials[${i}] has fields outside the contract: ${unknown.join(', ')}`,
        fields: unknown,
      });
    }
    if (!TESTIMONIAL_VARIANTS.includes(item.variant)) {
      issues.push({
        code: 'testimonial-bad-variant',
        path: `testimonials[${i}].variant`,
        message: `testimonials[${i}].variant must be ${TESTIMONIAL_VARIANTS.map((v) => `'${v}'`).join(' | ')}, got "${item.variant}"`,
      });
    }
  });

  // COVERAGE, not just membership. The enum check above accepts a set of
  // testimonials that is 100% valid and still leaves a section empty: the
  // first live generation returned 1 quote + 3 card + ZERO reel, so
  // 10-reviews-reel.astro rendered its dark band, its wave dividers and its
  // carousel arrows around an empty track. Membership was never the
  // guarantee the renderer needed — coverage is.
  //
  // Emitted as a per-variant issue so the Content Agent's retry loop gets a
  // correction it can act on ("falta reel"), not a vague rejection.
  for (const variant of TESTIMONIAL_VARIANTS) {
    if (!testimonials.some((t) => t.variant === variant)) {
      issues.push({
        code: 'testimonials-variant-uncovered',
        path: 'testimonials',
        message:
          `content.json "testimonials" has no entry with variant "${variant}". ` +
          `Every variant in the contract is rendered by a real section, so a missing one ` +
          `ships a visibly empty section. Add at least one testimonial with variant "${variant}".`,
        variant,
      });
    }
  }

  return issues;
}

// Format-only check for the OPTIONAL top-level `productId` (design D1):
// absent => never an error; present => must match PRODUCT_ID_RE via
// isProductId. Runs first in both collect-all and fail-fast so the FIRST
// issue in either mode stays in sync (see header comment on check order).
function collectTopLevelIssues(input) {
  const issues = [];
  if (input.productId !== undefined && !isProductId(input.productId)) {
    issues.push({
      code: 'product-id-invalid',
      path: 'productId',
      message: `content.json "productId" is present but invalid: expected format prd_{base36ts}-{rand8}, got ${JSON.stringify(input.productId)}`,
    });
  }
  return issues;
}

export function collectContentErrors(input) {
  const issues = [];

  issues.push(...collectTopLevelIssues(input));

  if (!input.product) {
    issues.push({ code: 'missing-top-level', path: 'product', message: 'content.json is missing top-level "product"' });
  }
  if (!input.faq) {
    issues.push({ code: 'missing-top-level', path: 'faq', message: 'content.json is missing top-level "faq"' });
  }
  if (!input.testimonials) {
    issues.push({ code: 'missing-top-level', path: 'testimonials', message: 'content.json is missing top-level "testimonials"' });
  }

  if (input.product) issues.push(...collectProductIssues(input.product));
  if (input.faq) issues.push(...collectFaqIssues(input.faq));
  if (input.testimonials) issues.push(...collectTestimonialsIssues(input.testimonials));

  return issues;
}

// --- fail-fast (throws ContentContractError on the first issue) ------------

function throwFirst(issues) {
  const [first] = issues;
  if (first) throw new ContentContractError(first.message, { code: first.code, path: first.path });
}

export function validateProduct(product) {
  throwFirst(collectProductIssues(product));
}

export function validateFaq(faq) {
  throwFirst(collectFaqIssues(faq));
}

export function validateTestimonials(testimonials) {
  throwFirst(collectTestimonialsIssues(testimonials));
}

export function validateContent(input) {
  throwFirst(collectTopLevelIssues(input));

  if (!input.product) {
    throw new ContentContractError('content.json is missing top-level "product"', { code: 'missing-top-level', path: 'product' });
  }
  if (!input.faq) {
    throw new ContentContractError('content.json is missing top-level "faq"', { code: 'missing-top-level', path: 'faq' });
  }
  if (!input.testimonials) {
    throw new ContentContractError('content.json is missing top-level "testimonials"', { code: 'missing-top-level', path: 'testimonials' });
  }

  validateProduct(input.product);
  validateFaq(input.faq);
  validateTestimonials(input.testimonials);
}

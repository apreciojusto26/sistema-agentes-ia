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
    if (!['quote', 'card', 'reel'].includes(item.variant)) {
      issues.push({
        code: 'testimonial-bad-variant',
        path: `testimonials[${i}].variant`,
        message: `testimonials[${i}].variant must be 'quote' | 'card' | 'reel', got "${item.variant}"`,
      });
    }
  });
  return issues;
}

export function collectContentErrors(input) {
  const issues = [];

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

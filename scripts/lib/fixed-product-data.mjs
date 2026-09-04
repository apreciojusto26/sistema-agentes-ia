// THE ASSEMBLER — the one place where the Fixed sources meet.
//
// FixedProductData was defined as a TYPE in F3A and nothing built one. The
// generator went on projecting content.json straight onto the template's
// `Product` shape, which is why three fields ended up with no author at all:
// media arrived through the Content Agent or not at all, and the store's
// free-shipping threshold arrived through nothing.
//
// A contract that names its authorities but has no runtime boundary is a
// comment. This file is the boundary.
//
//   canonicalProduct     the scrape. Factual: brand, name, rating aggregate.
//   contentOutput        the Content Agent. Copy and narrative. NOTHING ELSE.
//   assetOutput          the asset pipeline. Media, and only media.
//   merchantConfig       the operator. Commercial policy, never a model.
//   shopifyProductLink   which product this landing sells, or null for preview.
//
// WHY THE GUARDS REJECT RATHER THAN IGNORE. Ignoring a field the caller had no
// right to send is indistinguishable, in the output, from the caller never
// sending it — and that is exactly the failure this layer was written to end.
// A content output carrying `gallery` is a Content Agent that believes it
// chooses photographs. Silently dropping it leaves that belief in place and
// leaves the next author to rediscover the boundary from scratch.
//
// SOURCE OWNERSHIP IS NOT RENDER CARDINALITY. Whether the page draws a UGC
// region at all is sealed by ASTRAVIBE_FIXED_STRUCTURAL_GRAMMAR_V1. This file
// answers only "who is allowed to say". The two questions live in two files on
// purpose, because collapsing them is how a capability flag turns into a
// content field.
import { collectAssetOutputIssues } from './fixed-asset-output.mjs';
import { collectFixedContentIssues, FIXED_CONTENT_FOREIGN_FIELDS } from './fixed-content-output.mjs';
import { collectMerchantIssues, merchantFreeShippingOverCents, merchantPacks } from './merchant.mjs';
import { DEFAULT_ERRORS } from './content-contract.mjs';

/**
 * Media slots. The asset pipeline owns every one of them.
 *
 * `gallery` is here for the same reason the other two are. It reached the page
 * through content.json, which made a language model the authority for which
 * photographs a landing shows — a claim about the world, decided by the part
 * of the system least able to check it.
 */
export const CONTENT_FORBIDDEN_MEDIA_FIELDS = ['gallery', 'heroExtras', 'ugcStrip'];

/**
 * Commercial and policy facts. The merchant owns every one of them.
 *
 * These are the names the Version A seal in contract.commercial-policy.test.ts
 * keeps out of content-contract.mjs, restated at the assembly boundary so the
 * rule holds for a caller that builds a content output by hand.
 */
// DERIVED, never restated. These two lists were written out by hand and had
// already drifted by one entry — `freeOverCents` was forbidden here and absent
// from the projection, so the assembler delegated a check it then failed to
// make. Whatever the projection calls foreign and is not media is commercial.
export const CONTENT_FORBIDDEN_COMMERCIAL_FIELDS = FIXED_CONTENT_FOREIGN_FIELDS.filter(
  (f) => !CONTENT_FORBIDDEN_MEDIA_FIELDS.includes(f),
);

export class FixedAssemblyError extends Error {
  constructor(message, issues) {
    super(message);
    this.name = 'FixedAssemblyError';
    this.issues = issues;
  }
}

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * Validates every source against the authority it is allowed to speak for.
 *
 * @returns {{code: string, source: string, message: string, fields?: string[]}[]}
 */
export function collectAssemblyIssues({
  canonicalProduct,
  contentOutput,
  assetOutput,
  merchantConfig = null,
  shopifyProductLink = null,
} = {}) {
  const issues = [];

  // ─── content: copy and narrative, nothing else ──────────────────────────
  //
  // Delegated to fixed-content-output.mjs, which owns the Fixed projection.
  // Restating the field lists here would give the boundary two definitions,
  // and the one that drifts is always the copy nobody remembers exists.
  if (!isObject(contentOutput)) {
    issues.push({
      code: 'content-output-missing',
      source: 'contentOutput',
      message: 'contentOutput must be an object carrying the Content Agent copy and narrative',
    });
  } else {
    for (const issue of collectFixedContentIssues(contentOutput)) {
      const media = (issue.fields ?? []).filter((f) => CONTENT_FORBIDDEN_MEDIA_FIELDS.includes(f));
      const commercial = (issue.fields ?? []).filter((f) =>
        CONTENT_FORBIDDEN_COMMERCIAL_FIELDS.includes(f),
      );
      // Kept as distinct codes because they are distinct mistakes, and the
      // guards that assert them read differently.
      if (issue.code === 'fixed-content-foreign-authority' && media.length) {
        issues.push({
          code: 'content-writes-media',
          source: 'contentOutput',
          fields: media,
          message:
            `contentOutput carries media it has no authority over: ${media.join(', ')}. ` +
            'Media comes from the asset pipeline — a model does not decide which photographs exist.',
        });
      }
      if (issue.code === 'fixed-content-foreign-authority' && commercial.length) {
        issues.push({
          code: 'content-writes-commercial',
          source: 'contentOutput',
          fields: commercial,
          message:
            `contentOutput carries commercial configuration it has no authority over: ${commercial.join(', ')}. ` +
            'Packs, thresholds, guarantees and returns terms are merchant configuration, not copy.',
        });
      }
      if (issue.code !== 'fixed-content-foreign-authority') {
        issues.push({ ...issue, source: 'contentOutput' });
      }
    }
  }

  // ─── assets: media, and only media ──────────────────────────────────────
  for (const issue of collectAssetOutputIssues(assetOutput)) {
    issues.push({ ...issue, source: 'assetOutput' });
  }

  // ─── the step merge, checked BEFORE anything is written ─────────────────
  //
  // 06-how-it-works.astro renders <Media media={step.media} /> with no guard,
  // and the content contract validates key presence rather than item shape —
  // so a step without media used to reach Astro and abort the build with
  // "Cannot read properties of undefined". The error belongs here, where it can
  // say which step and why.
  const steps = Array.isArray(contentOutput?.steps) ? contentOutput.steps : [];
  const stepMedia = isObject(assetOutput?.stepMedia) ? assetOutput.stepMedia : {};
  steps.forEach((step, i) => {
    if (!isObject(step) || typeof step.title !== 'string' || typeof step.text !== 'string') {
      issues.push({
        code: 'step-copy-invalid',
        source: 'contentOutput',
        message: `contentOutput.steps[${i}] must carry a string title and text — it is the step's copy`,
      });
    }
    if (!stepMedia[`step-${i}`]) {
      issues.push({
        code: 'step-media-missing',
        source: 'assetOutput',
        message:
          `no media is assigned to step-${i}. The how-it-works section renders a photograph per step ` +
          'and cannot draw one that was never assigned.',
      });
    }
  });
  for (const slot of Object.keys(stepMedia)) {
    const index = Number(slot.slice('step-'.length));
    if (Number.isInteger(index) && index >= steps.length) {
      issues.push({
        code: 'step-media-orphaned',
        source: 'assetOutput',
        message:
          `stepMedia.${slot} is assigned to a step that does not exist — the copy has ${steps.length}. ` +
          'An assignment nothing renders is media the operator believes is on the page.',
      });
    }
  }

  // ─── merchant: optional overall, but never half-configured ──────────────
  //
  // A landing with no merchant config is a legitimate state — it is a preview
  // that has not been assigned a seller yet, and merchant.ts stays null. What
  // is NOT legitimate is a partial one, so the moment a config is supplied it
  // is validated in full by its own module rather than field-by-field here.
  if (merchantConfig !== null && merchantConfig !== undefined) {
    for (const issue of collectMerchantIssues(merchantConfig)) {
      issues.push({ ...issue, source: 'merchantConfig' });
    }
  }

  // ─── canonical: the factual floor ───────────────────────────────────────
  if (!isObject(canonicalProduct)) {
    issues.push({
      code: 'canonical-missing',
      source: 'canonicalProduct',
      message: 'canonicalProduct must be an object — brand and name are factual, never authored',
    });
  }

  // ─── commerce link: all four levels, or none ────────────────────────────
  //
  // FAIL CLOSED. A link missing its storefront is not "mostly a link": it is a
  // page that would try to reach Shopify, fail, and fall back to showing source
  // numbers. Preview is the ABSENCE of a link, and it has to be stated by
  // passing null, never reached by supplying a broken one.
  if (shopifyProductLink !== null && shopifyProductLink !== undefined) {
    if (!isObject(shopifyProductLink)) {
      issues.push({
        code: 'commerce-link-not-an-object',
        source: 'shopifyProductLink',
        message: 'shopifyProductLink must be an object or null (null = preview)',
      });
    } else {
      const missing = ['shopId', 'storefrontId', 'productHandle'].filter(
        (f) => typeof shopifyProductLink[f] !== 'string' || shopifyProductLink[f].trim() === '',
      );
      if (missing.length) {
        issues.push({
          code: 'commerce-link-incomplete',
          source: 'shopifyProductLink',
          fields: missing,
          message:
            `shopifyProductLink is missing ${missing.join(', ')}. Commerce fails closed: an incomplete ` +
            'link must never degrade to preview, because the page would already be offering a cart.',
        });
      }
    }
  }

  return issues;
}

/**
 * Builds a FixedProductData from its five authorities.
 *
 * Throws rather than returning a partial document. There is no half-assembled
 * landing worth rendering, and a caller that could ignore the return value is a
 * caller that will.
 *
 * @throws {FixedAssemblyError}
 */
export function assembleFixedProductData(sources = {}) {
  const issues = collectAssemblyIssues(sources);
  if (issues.length) {
    throw new FixedAssemblyError(
      `FixedProductData could not be assembled: ${issues.map((i) => i.message).join(' | ')}`,
      issues,
    );
  }

  const {
    canonicalProduct,
    contentOutput,
    assetOutput,
    merchantConfig = null,
    shopifyProductLink = null,
  } = sources;

  // Brand resolution, in the order F3A fixed: the scrape, then an explicitly
  // configured merchant brand, then absence. `null` is a real answer and the
  // Content Agent never appears in this chain.
  const brand =
    canonicalProduct?.identity?.brand ??
    canonicalProduct?.brand ??
    merchantConfig?.legalName ??
    null;

  return {
    identity: {
      brand,
      name: canonicalProduct?.identity?.name ?? canonicalProduct?.name ?? contentOutput.name,
    },
    copy: {
      tagline: contentOutput.tagline,
      subtagline: contentOutput.subtagline,
      cta: contentOutput.cta,
      variantGroupLabel: contentOutput.variantGroupLabel,
      // `errors` became `commerceMessages` in F3A: the contents are a failed
      // fetch, a sold-out variant, an expired cart — commerce UI messages, not
      // product objections. The old key is still what content.json carries.
      commerceMessages: contentOutput.commerceMessages ?? contentOutput.errors ?? DEFAULT_ERRORS,
      trustTicker: contentOutput.trustTicker,
    },
    socialProof: {
      ratingAverage: contentOutput.ratingAverage ?? null,
      ratingCount: contentOutput.ratingCount ?? null,
      reviews: contentOutput.reviews ?? [],
      featuredTestimonial: contentOutput.featuredTestimonial ?? null,
    },
    narrative: {
      // THE MERGE. Copy from the Content Agent, photograph from the asset
      // pipeline, joined by POSITION — never by a copy-derived key, which
      // would detach the moment a heading is rewritten. Done here rather than
      // inside the Astro component so a missing assignment is a contract error
      // with a step number on it, not a stack trace from a prerender.
      steps: (contentOutput.steps ?? []).map((step, i) => ({
        ...step,
        media: assetOutput.stepMedia[`step-${i}`],
      })),
      comparison: contentOutput.comparison ?? [],
      faq: contentOutput.faq ?? [],
    },
    media: {
      gallery: assetOutput.gallery,
      heroExtras: assetOutput.heroExtras,
      // `ugcStrip` IS THE LEGACY TEMPLATE FIELD NAME, kept because AstraVibe is
      // frozen. The region it feeds has no heading, no author, no rating and no
      // attribution — it is a product media marquee that was misnamed, and the
      // Fixed contract calls it `productMediaStrip`. Nothing here claims a
      // customer supplied anything.
      ugcStrip: assetOutput.productMediaStrip,
    },
    commercial: {
      // FROM THE MERCHANT, NEVER FROM CONTENT. `contentOutput.packs` is not
      // read here and cannot be: the Fixed projection rejects the key outright,
      // so a caller that supplies it gets an error rather than a landing whose
      // prices a model chose.
      packs: merchantPacks(merchantConfig),
      freeShippingOverCents: merchantFreeShippingOverCents(merchantConfig),
    },
    shopifyProductLink: shopifyProductLink ?? null,
  };
}

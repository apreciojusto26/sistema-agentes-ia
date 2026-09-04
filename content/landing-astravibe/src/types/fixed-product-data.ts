// THE FIXED CONTRACT — what fills AstraVibe, never how AstraVibe is designed.
//
// Structure is frozen: ASTRAVIBE_FIXED_STRUCTURAL_GRAMMAR_V1 seals the regions,
// the item shapes, the optional slots and the layout. So nothing here may name
// a component, a variant, a section order, a class, a breakpoint or a token.
// If a field would change how the page LOOKS rather than what it SAYS, it does
// not belong in this file.
//
// ─── BUILT FROM AN AUDIT, NOT FROM THE OLD data/*.ts ──────────────────────
//
// Every group below exists because a mounted component reads it. Six fields
// that the previous contract carried were removed after a field-level sweep
// found no consumer on the rendered page at all:
//
//   benefits    declared "exactly 4 -> 2x2 grid" — rendered nowhere
//   heroPills   declared "exactly 3"             — rendered nowhere
//   specs                                        — rendered nowhere
//   badges                                       — named only in a comment
//   offer       countdown copy                   — rendered nowhere
//   ugc         read only by 13-results-gallery.astro, which index.astro
//               does not mount
//
// They are not kept as optional. A contract field with no consumer is a slot
// the Content Agent fills with text nobody reads, and this pipeline does not
// generate dead content.
//
// REMOVED HERE IS NOT REMOVED FROM THE FACTS. CanonicalProduct keeps its
// specifications and raw description: they ground comparison rows, FAQ answers
// and step copy even though V1 renders no section for them. "Not displayed" and
// "not useful" are different claims.
import type { ComparisonRow, HowToStep, MediaRef, PricePack, Stars } from '@/types/content';

// ───────────────────────────────────────────────────────────────────────────
// IDENTITY — factual, never authored
// ───────────────────────────────────────────────────────────────────────────

export interface FixedIdentity {
  /**
   * The product's brand.
   *
   * FACTUAL AUTHORITY ONLY, and `null` is a real answer. Resolution order is
   * CanonicalProduct.identity.brand, then an explicitly configured merchant
   * brand, then absence. The Content Agent may NEVER supply this: a brand is a
   * claim about who makes the thing, and a model inventing one is the same
   * defect class as the invented reviewer names F2 removed.
   */
  brand: string | null;
  /** Product name. Factual, from the source listing. */
  name: string;
}

// ───────────────────────────────────────────────────────────────────────────
// COPY — the Content Agent's entire surface
// ───────────────────────────────────────────────────────────────────────────

export interface FixedCopy {
  tagline: string;
  subtagline: string;
  /** Button and status labels. */
  cta: { primary: string; sticky: string; checkout: string; pending: string; soldOut: string };
  /** Customer-facing label for the variant option group. */
  variantGroupLabel: string;
  /**
   * WAS `errors`, which read like product objections or pain points. It is
   * neither: these are commerce UI messages — a failed fetch, a sold-out
   * variant, an expired cart. Renamed so the contract says what it holds.
   */
  commerceMessages: { network: string; soldOut: string; expired: string; noDiscount: string; generic: string };
  /**
   * The PRODUCT half of the utility-bar ticker only.
   *
   * The policy half — returns window, delivery estimate, commercial guarantee —
   * is derived from merchant config by lib/policy.ts and concatenated at the
   * render. Keeping them apart is what stops a model writing "Garantía de 30
   * días" into a copy array, which is how a legal page once scrolled a promise
   * its own body contradicted.
   */
  trustTicker: string[];
}

// ───────────────────────────────────────────────────────────────────────────
// SOCIAL PROOF — factual, and absent when unsupported
// ───────────────────────────────────────────────────────────────────────────

/**
 * A review this landing may show. Bounded by CanonicalReview, which carries
 * `{ text, rating, author, dateRaw, variant }` and NOTHING else — no location,
 * no purchase-verification signal. Both were removed in F2 because nothing
 * upstream can supply them.
 */
export interface FixedReview {
  /** RAW author as the source gave it, mask included, or '' when none. */
  author: string;
  rating: Stars;
  date: string;
  title?: string;
  body: string;
}

export interface FixedSocialProof {
  /** Aggregate rating. `null` means the source published none — not zero. */
  ratingAverage: number | null;
  ratingCount: number | null;
  reviews: FixedReview[];
  /**
   * The pull-quote. OPTIONAL by contract and by grammar — the sealed
   * OPTIONAL<FeaturedTestimonial> slot exists whether or not a product fills
   * it. Absent when no real review is suitable; never generated to fill the
   * template.
   */
  featuredTestimonial: FixedReview | null;
}

// ───────────────────────────────────────────────────────────────────────────
// NARRATIVE — wording by the Content Agent, grounded in facts
// ───────────────────────────────────────────────────────────────────────────

export interface FixedNarrative {
  steps: HowToStep[];
  comparison: ComparisonRow[];
  /**
   * `comparisonRival` is NOT here. It named the generic alternative for the
   * comparison heading in the other template; the Fixed page labels that
   * column in its own markup, so the field has no consumer — the same audit
   * rule that removed benefits, specs and the rest.
   */
  faq: { question: string; answer: string }[];
}

// ───────────────────────────────────────────────────────────────────────────
// MEDIA — assigned by the asset pipeline
// ───────────────────────────────────────────────────────────────────────────

export interface FixedMedia {
  gallery: (MediaRef & { id: string; caption?: string })[];
  /** Own clips appended after the catalogue shots in the hero. */
  heroExtras: MediaRef[];
  /** The scrolling strip. */
  ugcStrip: MediaRef[];
}

// ───────────────────────────────────────────────────────────────────────────
// COMMERCIAL — merchandising configuration, not Shopify
// ───────────────────────────────────────────────────────────────────────────

export interface FixedCommercial {
  /**
   * Bundle definitions. Configured by the operator, NOT read from Shopify:
   * Shopify sells variants, and packs are how this store merchandises them.
   * Every price they display is still projected from the Shopify unit price,
   * so Shopify remains the pricing authority in commerce.
   */
  packs: PricePack[];
  /** `0` = free on every order. `null` = no free-shipping threshold offered. */
  freeShippingOverCents: number | null;
}

// ───────────────────────────────────────────────────────────────────────────
// COMMERCE LINK — three levels, deliberately separate
// ───────────────────────────────────────────────────────────────────────────

/**
 * Which Shopify product this landing sells.
 *
 * NO CREDENTIALS. A shop's admin connection and a storefront's public token
 * are configuration, held server-side; this is a payload that ships with a
 * landing. It carries identity and references, never secret material.
 *
 * THREE LEVELS, because collapsing them is how a system ends up asking an
 * operator for a token per product:
 *
 *   shop        the store — domain and admin/app connection
 *   storefront  a headless storefront, each with its OWN public token. One
 *               shop may have several; "one shop = one token" is not true.
 *   product     this link
 *
 * The Shopify API version is neither: it is runtime configuration for the
 * whole system.
 */
export interface ShopifyProductLink {
  shopId: string;
  storefrontId: string;
  productHandle: string;
  /** Shopify's global id, when the link was made by id rather than handle. */
  productGid: string | null;
}

// ───────────────────────────────────────────────────────────────────────────
// THE CONTRACT
// ───────────────────────────────────────────────────────────────────────────

/**
 * PREVIEW vs COMMERCE is decided by ONE field.
 *
 * `shopifyProductLink === null` is a preview: a valid, non-purchasable page.
 * It needs no Shopify, no storefront token, and NO PRICE — the provider's
 * price is not this store's selling price, and inventing one to fill the
 * layout is the failure this whole layer exists to prevent. The template
 * already renders an honest preview state.
 *
 * With a link, Shopify is the sole authority for price, compare-at, variants,
 * variant ids, availability and cart identity. There is no fallback to source
 * data: "commerce requested -> Shopify unavailable -> show source numbers" is
 * the forbidden path.
 */
export interface FixedProductData {
  identity: FixedIdentity;
  copy: FixedCopy;
  socialProof: FixedSocialProof;
  narrative: FixedNarrative;
  media: FixedMedia;
  commercial: FixedCommercial;
  shopifyProductLink: ShopifyProductLink | null;
}

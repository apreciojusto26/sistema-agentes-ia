export type AspectRatio = '1/1' | '4/5' | '3/4' | '4/3' | '16/9' | '9/16';
export type Stars = 1 | 2 | 3 | 4 | 5;

export type IconName =
  | 'shield'
  | 'truck'
  | 'star'
  | 'check'
  | 'cross'
  | 'chevron'
  | 'camera'
  | 'knife'
  | 'board'
  | 'lock'
  | 'hook'
  | 'sparkle'
  | 'gift'
  | 'clock';

/** Any image/video slot. asset === null => render PlaceholderShot. */
export interface MediaRef {
  asset: string | null; // key into src/data/images.ts (image) OR src/data/videos.ts (video)
  alt: string; // real alt, or '[PLACEHOLDER] <desc>' when asset === null
  ratio: AspectRatio;
  label?: string; // text drawn inside the placeholder box
  kind?: 'image' | 'video'; // default 'image'
  poster?: string; // video poster frame asset key (video only)
}

export interface GalleryImage extends MediaRef {
  id: string;
  caption?: string;
}

/**
 * Fully build-time-resolved image, ready to hand to a React island as a plain prop
 * (islands cannot call astro:assets' getImage() themselves). Astro resolves this via
 * getImage()/astro:assets before passing it down.
 */
export interface ResolvedImage {
  id: string;
  src: string;
  srcset?: string;
  width: number;
  height: number;
  alt: string;
  ratio: AspectRatio;
  placeholder: boolean;
  /** 'video' makes carousel/lightbox render <video> instead of <img>. */
  kind?: 'image' | 'video';
  /**
   * Frame shown before a video can play — without it the slide is a black box.
   * Explicitly `| undefined`: exactOptionalPropertyTypes is on, so a resolver
   * that computes "maybe a poster" cannot assign to a bare optional.
   */
  poster?: string | undefined;
}

/**
 * Structure only — NO price fields. Prices are derived per-variant at render
 * via lib/shopify/pricing.ts#projectPack, never baked here. See types/content.ts
 * split note: PricePack lost priceCents/compareAtCents in the headless-shopify change.
 */
export interface PricePack {
  id: string; // 'x1' | 'x2' | 'x3'
  units: number; // paid units
  freeUnits: number; // 2+1 GRATIS -> units:2, freeUnits:1
  label: string; // 'Pack 2 + 1 GRATIS'
  sublabel?: string; // 'El que más se lleva'
  discountPercent?: number; // applied to the Shopify-derived unit total; never a hardcoded price
  badge?: string; // 'Más popular'
  popular?: boolean; // drives ribbon + default border emphasis
  freeGift?: boolean; // toggles the gift progress bar to 100%
  default?: boolean; // exactly one pack MUST have default: true
}

export interface BenefitItem {
  id: string;
  icon: IconName;
  title: string;
  text: string;
}

export interface SpecItem {
  label: string;
  value: string;
}

export interface HowToStep {
  step: number;
  title: string;
  text: string;
  media: MediaRef;
}

export interface ComparisonRow {
  feature: string;
  ours: boolean | string;
  rival: boolean | string;
}

export interface Guarantee {
  days: number;
  title: string;
  text: string;
  points: string[];
}

/**
 * A review this landing is allowed to show.
 *
 * The shape is bounded by CanonicalReview (`scripts/lib/product-normalizer
 * .d.mts`), which carries exactly `{ text, rating, author, dateRaw, variant }`.
 * Two fields that used to live here were REMOVED because nothing upstream can
 * ever supply them, and a field that cannot be sourced can only be invented:
 *
 *   `location`  CanonicalReview has no location at all. Every "· Madrid" this
 *               template rendered was written by hand.
 *   `verified`  CanonicalReview has no purchase-verification signal. Every
 *               "✓ Compra verificada" was an unbacked claim about a stranger's
 *               transaction.
 *
 * They are gone from the TYPE, not hidden at the render, so a future component
 * cannot read them back and a future data file cannot set them.
 */
export interface Testimonial {
  id: string;
  /**
   * RAW author exactly as the source gave it — marketplace masks included
   * (`Y***t`) — or `''` when the source recorded none. Never rewritten here:
   * the mask IS the provenance. Components render `reviewerDisplayName()`
   * from lib/reviewer-identity.ts instead of this value.
   */
  author: string;
  rating: Stars;
  date: string; // ISO 'YYYY-MM-DD'
  title?: string;
  body: string;
  media?: MediaRef;
  variant: 'quote' | 'card' | 'reel'; // featured | ugc grid | dark carousel
}

export interface FaqItem {
  id: string;
  question: string;
  answer: string;
}

/**
 * Locally authored marketing content — everything EXCEPT commerce fields, which
 * now come from the Shopify Storefront fetch (see lib/shopify/catalog.ts).
 * This is today's `Product` minus sku/currency/basePriceCents/compareAtCents.
 */
export interface ProductContent {
  brand: string;
  name: string;
  tagline: string;
  subtagline: string;
  /**
   * Aggregate rating, straight from CanonicalProduct.socialProof.
   *
   * NULLABLE, and that is the whole point. `ratingAverage: 4.9` with no source
   * is a fabricated claim about 128 strangers; `null` is the honest state for a
   * product whose listing published no rating. Renderers must therefore treat
   * absence as ABSENCE OF CLAIM — no `?? 0`, no "Sin valoraciones todavía", no
   * placeholder stars. The section simply does not make the statement.
   */
  ratingAverage: number | null;
  ratingCount: number | null;
  /**
   * `ratingBreakdown: Record<Stars, number>` WAS HERE AND IS NOT COMING BACK.
   *
   * It fed the five-bar histogram in 13-real-results.astro with the numbers
   * 5★:120, 4★:4, 3★:2, 2★:1, 1★:1 — a distribution nothing ever measured.
   * CanonicalProduct carries `socialProof.rating` and `socialProof.reviewCount`
   * and no histogram, because marketplaces publish an average and a count, not
   * a breakdown.
   *
   * AND IT CANNOT BE DERIVED. An average does not determine a distribution:
   * 4.9 over 128 reviews is satisfied by many different shapes, so any formula
   * that "reconstructs" one is inventing precision. It is equally off-limits to
   * ask a model for it, infer it, or approximate it.
   *
   * A breakdown may only ever be COUNTED from individual reviews that carry
   * real star values, and then it describes that sample and nothing more — see
   * 13-real-results.astro for why this template's own ten reviews do not
   * qualify.
   */
  badges: string[]; // 'Envío 24-48h', 'Acero inoxidable'
  trustTicker: string[]; // marquee items in UtilityBar
  offer: { durationMinutes: number; label: string; expiredLabel: string };
  benefits: BenefitItem[]; // exactly 4 -> 2x2 grid
  heroPills: string[]; // exactly 3
  specs: SpecItem[];
  packs: PricePack[];
  gallery: GalleryImage[];
  /** Own clips appended after the Shopify catalogue shots in the hero. */
  heroExtras: MediaRef[];
  /** Still photos for the scrolling marquee (09-ugc-strip). */
  ugcStrip: MediaRef[];
  steps: HowToStep[]; // exactly 3, uses the REAL photos
  comparison: ComparisonRow[];
  /**
   * `guarantee: Guarantee` AND `shipping.etaLabel` WERE HERE. Both were
   * marketing copy, and both were policy.
   *
   * The guarantee object said `days: 30`, "te devolvemos el dinero. Sin
   * vueltas.", and listed "Devolución simple dentro de los 30 días",
   * "Reembolso completo, sin preguntas". Nothing configured any of it: the
   * scraper supplies no returns window and no guarantee, so the 30 and every
   * condition-implying adjective — "simple", "completo", "sin preguntas" —
   * were written by whoever wrote the copy. `etaLabel` had the same problem:
   * "Envío de 8 días hábiles" is a promise the merchant makes, not a fact
   * about the product.
   *
   * Commercial policy now comes from src/data/merchant.ts and is turned into
   * words in ONE place, src/lib/policy.ts. Change the configured fact and
   * every surface moves together, because there is a single sentence-builder
   * per claim — and with no merchant configured there is no policy, so the
   * surfaces state nothing rather than defaulting to a plausible 30.
   *
   * `freeOverCents` STAYS. It is not a promise about returns or delivery: it
   * is the store's own pricing threshold, which the cart reads to draw its
   * free-shipping progress. Keeping it here is deliberate, not an oversight.
   */
  shipping: { freeOverCents: number | null };
  /**
   * `ugc: MediaRef[]` WAS HERE, required, and read by exactly one file:
   * 13-results-gallery.astro, which src/pages/index.astro never mounted. The
   * section is deleted with it. A required field whose only consumer is dead
   * code forces every generated product to supply media that never reaches a
   * visitor — the same audit rule that removed benefits, specs and the rest.
   *
   * The strip that IS rendered keeps its own field, `ugcStrip`.
   */
  cta: { primary: string; sticky: string; checkout: string; pending: string; soldOut: string };
  /** Customer-facing label for the 9-value variant option group. NOT `optionName`
   *  from Shopify (admin says "Emitting Color" — would confuse buyers). */
  variantGroupLabel: string;
}

export interface ProductErrorCopy {
  network: string;
  soldOut: string;
  expired: string;
  noDiscount: string;
  generic: string;
}

/**
 * ProductContent + the two things sourced outside marketing copy: the Shopify
 * handle to fetch at build time, and the BXGY merchandising claim flag.
 */
export type Product = ProductContent & {
  commerce: {
    shopifyHandle: string;
    bundleOfferActive: boolean;
  };
  errors: ProductErrorCopy;
};

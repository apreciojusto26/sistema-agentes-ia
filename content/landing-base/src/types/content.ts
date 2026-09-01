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


export interface Testimonial {
  id: string;
  /**
   * RAW author exactly as the source gave it — marketplace masks included
   * (`Y***t`). Never rewritten here: the mask IS the provenance. Components
   * render `reviewerDisplayName()` from lib/reviewer-identity.ts instead.
   */
  author: string;
  rating: Stars;
  date: string; // ISO 'YYYY-MM-DD'
  title?: string;
  body: string;
  media?: MediaRef;
  // Only variants a component actually SELECTS live here. 'card' was removed:
  // nothing in this template ever read it. Mirrors TESTIMONIAL_VARIANTS in
  // scripts/lib/content-contract.mjs (contract.testimonial-variants.test.ts
  // keeps the two honest).
  variant: 'quote' | 'reel'; // featured block | dark carousel
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
   * PROJECTED from CanonicalProduct.socialProof.rating by generate-content.mjs,
   * never written by the model. `null` when the scraper found none — surfaces
   * degrade rather than invent a number.
   */
  ratingAverage: number | null;
  /** PROJECTED from CanonicalProduct.socialProof.reviewCount. Same rules. */
  ratingCount: number | null;
  badges: string[]; // 'Envío 24-48h', 'Acero inoxidable'
  trustTicker: string[]; // marquee items in UtilityBar
  offer: { durationMinutes: number; label: string; expiredLabel: string };
  benefits: BenefitItem[]; // exactly 4 -> 2x2 grid
  heroPills: string[]; // exactly 3
  specs: SpecItem[];
  packs: PricePack[];
  gallery: GalleryImage[];
  steps: HowToStep[]; // exactly 3, uses the REAL photos
  comparison: ComparisonRow[];
  /**
   * The GENERIC alternative this product is compared against — "almohadas
   * convencionales", "sacacorchos manuales". Content, not design: the Content
   * Agent infers it from CanonicalProduct's category.
   *
   * It exists because the comparison heading used to be a template literal
   * (`${brand} vs. lámparas decorativas comunes`), so every landing ever
   * generated claimed to beat a decorative lamp whatever it actually sold.
   * Never a brand — a category.
   */
  comparisonRival: string;
  ugc: MediaRef[]; // strip + RealResults grid
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

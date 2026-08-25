// FROZEN INPUT for the historical-markup golden.
//
// The golden must measure MARKUP, not content. src/data/* is real template
// content and it changes for legitimate reasons — this phase alone rewrote
// testimonials.ts — so a golden rendered against it would go red on a copy
// edit and prove nothing about structure.
//
// Every media ref uses `asset: null` on purpose: that routes Media.astro and
// ProductGallery down their PlaceholderShot branch, which emits deterministic
// markup with no hashed asset URLs. See the golden test's header for what that
// does and does not cover.
import type { ComparisonRow, FaqItem, HowToStep, MediaRef, Testimonial } from '@/types/content';

const media = (alt: string, ratio: string): MediaRef => ({ asset: null, alt, ratio } as MediaRef);

export const GOLDEN_DATA = {
  // conversion/BuyBox is the first frozen capability that needs a REAL commerce
  // boundary: it mounts BundleSelector, whose useSelection() throws on an empty
  // variant list outside preview mode. Two variants, both available, with
  // different prices — a single uniform variant would have frozen a page that
  // cannot show per-variant pricing, which is exactly what VariantPicker is for.
  //
  // Adding these fields is ADDITIVE and provably inert: the nine references
  // frozen before BuyBox are re-rendered against this same object on every run,
  // and they stay byte-locked.
  commerce: {
    handle: 'golden',
    title: 'Golden Commerce Title',
    currencyCode: 'EUR',
    optionName: 'Color',
    variants: [
      {
        id: 'gid://shopify/ProductVariant/golden-1',
        title: 'Golden Variant One',
        optionValue: 'One',
        availableForSale: true,
        unitPriceCents: 1990,
        unitCompareAtCents: 2990,
        imageIndex: null,
      },
      {
        id: 'gid://shopify/ProductVariant/golden-2',
        title: 'Golden Variant Two',
        optionValue: 'Two',
        availableForSale: true,
        unitPriceCents: 2190,
        unitCompareAtCents: null,
        imageIndex: null,
      },
    ],
    defaultVariantId: 'gid://shopify/ProductVariant/golden-1',
    anyAvailable: true,
    images: [],
  },
  product: {
    brand: 'GoldenBrand',
    // hero/Hero reads these three and nothing else beyond `gallery`. Added when
    // Hero joined the golden; none of the six earlier sections reads them, which
    // their unchanged fixtures prove mechanically.
    tagline: 'Golden tagline',
    subtagline: 'Golden subtagline.',
    heroPills: ['Golden pill one', 'Golden pill two', 'Golden pill three'],
    // --- conversion/BuyBox's inputs ------------------------------------------
    ratingAverage: 4.7,
    ratingCount: 1234, // four digits on purpose: BuyBox formats it with Intl
    variantGroupLabel: 'Golden group label',
    commerce: { bundleOfferActive: true }, // exercises the gift meter branch
    packs: [
      { id: 'g-x1', units: 1, freeUnits: 0, label: 'Golden pack one', sublabel: 'Golden sublabel one', default: true, popular: false },
      { id: 'g-x2', units: 2, freeUnits: 1, label: 'Golden pack two', sublabel: 'Golden sublabel two', badge: 'Golden badge', popular: true, freeGift: true, default: false },
    ],
    cta: {
      primary: 'Golden primary',
      sticky: 'Golden sticky',
      checkout: 'Golden checkout',
      pending: 'Golden pending',
      soldOut: 'Golden sold out',
    },
    errors: {
      network: 'Golden network error.',
      soldOut: 'Golden sold-out error.',
      expired: 'Golden expired error.',
      noDiscount: 'Golden no-discount notice.',
      generic: 'Golden generic error.',
    },
    shipping: { etaLabel: 'Golden shipping eta', freeOverCents: 2900 },
    guarantee: { days: 30, title: 'Golden guarantee title', text: 'Golden guarantee text.', points: ['Golden point one', 'Golden point two', 'Golden point three'] },
    benefits: [
      { id: 'g-b1', icon: 'check', title: 'Golden benefit one', text: 'Golden benefit one text.' },
      { id: 'g-b2', icon: 'star', title: 'Golden benefit two', text: 'Golden benefit two text.' },
      { id: 'g-b3', icon: 'shield', title: 'Golden benefit three', text: 'Golden benefit three text.' },
      { id: 'g-b4', icon: 'truck', title: 'Golden benefit four', text: 'Golden benefit four text.' },
    ],
    gallery: [
      media('golden gallery one', '4/5'),
      media('golden gallery two', '4/5'),
      media('golden gallery three', '4/5'),
    ],
    ugc: [
      media('golden ugc one', '9/16'),
      media('golden ugc two', '9/16'),
      media('golden ugc three', '9/16'),
    ],
    steps: [
      { step: 1, title: 'Golden step one', text: 'Golden step one text.', media: media('golden step one', '4/3') },
      { step: 2, title: 'Golden step two', text: 'Golden step two text.', media: media('golden step two', '4/3') },
      { step: 3, title: 'Golden step three', text: 'Golden step three text.', media: media('golden step three', '4/3') },
    ] as HowToStep[],
    // All THREE readings of `boolean | string`, so the golden pins how each is
    // drawn rather than only the happy path.
    comparison: [
      { feature: 'Golden feature true', ours: true, rival: false },
      { feature: 'Golden feature false', ours: false, rival: true },
      { feature: 'Golden feature text', ours: 'Golden ours text', rival: 'Golden rival text' },
    ] as ComparisonRow[],
  },
  testimonials: [
    { id: 'g-quote', author: 'Golden Quote', location: 'Nowhere', rating: 5, date: '2026-01-01', title: 'Golden title', body: 'Golden quote body.', verified: true, variant: 'quote' },
    { id: 'g-reel-1', author: 'Golden Reel One', location: 'Nowhere', rating: 5, date: '2026-01-02', body: 'Golden reel body one.', verified: true, variant: 'reel' },
    { id: 'g-reel-2', author: 'Golden Reel Two', location: 'Nowhere', rating: 4, date: '2026-01-03', body: 'Golden reel body two.', verified: false, variant: 'reel' },
  ] as Testimonial[],
  faq: [
    { id: 'g-q1', question: 'Golden question one?', answer: 'Golden answer one.' },
    { id: 'g-q2', question: 'Golden question two?', answer: 'Golden answer two.' },
  ] as FaqItem[],
};

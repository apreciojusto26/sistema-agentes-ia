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
  commerce: {
    handle: 'golden',
    title: 'Golden',
    currencyCode: 'EUR',
    optionName: 'Color',
    variants: [],
    defaultVariantId: null,
    anyAvailable: false,
    images: [],
  },
  product: {
    brand: 'GoldenBrand',
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

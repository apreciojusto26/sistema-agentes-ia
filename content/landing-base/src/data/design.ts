// Default DesignSpec for the template (Design System Fase 2).
//
// This file is what makes the flexible content area render AT ALL. It ships
// with content/landing-base so the template is renderable standalone
// (`pnpm dev` here must work), exactly the way src/data/product.ts ships with
// fixture content. generate-landing.mjs's copyTemplate() copies it into every
// outputs/{slug}/, and its `write-design` stage OVERWRITES it only when
// --design is passed.
//
// CRITICAL — this default MUST reproduce the legacy page exactly: the same 11
// capabilities, all variant 'default', in the same order index.astro used to
// hardcode, with no props. A generation WITHOUT --design has to be
// byte-equivalent to the pre-Fase-2 output. Changing this list changes what
// every legacy generation renders.
//
// The 3 Fase 2 building blocks are registered capabilities but are deliberately
// NOT in this default: they are opt-in through an explicit DesignSpec.
import type { DesignSpec } from '@/types/design';

export const design: DesignSpec = {
  schema: 1,
  // Placeholder identity for the un-generated template. Real generations get a
  // minted productId written by the `write-design` stage. Format-valid on
  // purpose (prd_{base36ts}-{rand8}) so the template's own spec passes the
  // Fase 1 contract instead of being a permanently-invalid document.
  productId: 'prd_template00-0000f0f0',
  design: {
    family: 'premium',
    density: 'balanced',
  },
  // No theme overrides: the template keeps its own @theme block in
  // src/styles/global.css untouched.
  sections: [
    { category: 'hero', type: 'Hero', variant: 'default', order: 0 },
    { category: 'media', type: 'GalleryStrip', variant: 'strip', order: 1 },
    { category: 'conversion', type: 'BuyBox', variant: 'card', order: 2 },
    { category: 'product', type: 'HowItWorks', variant: 'horizontal-timeline', order: 3 },
    { category: 'socialProof', type: 'FeaturedTestimonial', variant: 'default', order: 4 },
    { category: 'conversion', type: 'Faq', variant: 'accordion', order: 5 },
    { category: 'socialProof', type: 'UgcStrip', variant: 'strip', order: 6 },
    { category: 'socialProof', type: 'ReviewsReel', variant: 'carousel', order: 7 },
    { category: 'product', type: 'Comparison', variant: 'table', order: 8 },
    { category: 'conversion', type: 'Guarantee', variant: 'default', order: 9 },
    { category: 'socialProof', type: 'RealResults', variant: 'default', order: 10 },
  ],
};

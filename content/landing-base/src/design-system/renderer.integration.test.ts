// Integrated proof for the real Fase 2 render chain:
// DesignSpec fixture -> index.astro -> runtime registry -> real block modules.
// Only the external commerce boundary and the input data module are replaced;
// the renderer, registry and components under test are never mocked.
import { describe, expect, test, vi } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import reactServer from '@astrojs/react/server.js';

vi.mock('@/data/design', async () => ({
  design: (await import('../../../../admin/test/fixtures/design-spec/building-blocks.json')).default,
}));

// conversion/Guarantee reads merchant config through lib/policy.ts. Without a
// merchant the section renders nothing at all — the deliberate preview state —
// so this integration spec configures one.
vi.mock('@/data/merchant', () => ({
  merchant: {
    legalName: 'Fixture Merchant',
    taxId: 'B0',
    address: 'A',
    contactEmail: 'f@test.invalid',
    country: 'C',
    returnsWindowDays: 14,
    carrierName: 'Fixture Carrier',
    shippingEtaLabel: 'Fixture eta',
    returnShippingPaidBy: 'customer',
    dataControllerEmail: 'f@test.invalid',
    commercialGuaranteeDays: null,
  },
}));

vi.mock('@/lib/shopify/catalog', () => ({
  getProductCommerce: async () => ({
    handle: 'fixture',
    title: 'Fixture',
    currencyCode: 'EUR',
    optionName: 'Color',
    variants: [
      {
        id: 'gid://shopify/ProductVariant/1',
        title: 'Default',
        optionValue: 'Default',
        availableForSale: true,
        unitPriceCents: 1000,
        unitCompareAtCents: null,
        imageIndex: null,
      },
    ],
    defaultVariantId: 'gid://shopify/ProductVariant/1',
    anyAvailable: true,
    images: [],
  }),
}));

import IndexPage from '@/pages/index.astro';

const container = await AstroContainer.create({
  renderers: [{ name: '@astrojs/react', ssr: reactServer }] as any,
});

describe('DesignSpec -> index.astro -> registry -> building blocks', () => {
  test('renders the selected blocks, prop differences and DesignSpec order', async () => {
    const html = await container.renderToString(IndexPage);

    // Each capability is located by something only IT can emit, never by a
    // shared asset. `/sello-garantia.webp` used to stand in for the guarantee
    // block, and that was a coincidence rather than an identification: two
    // capabilities rendered that image, so the indexOf would happily return
    // whichever came first. Now the anchored section tag with its tone-specific
    // surface names one capability, one tone, one element.
    //
    // That asset is gone entirely since — it had "GARANTIA 30 DIAS" baked into
    // its pixels — which is why nothing here can go back to matching on it.
    const GUARANTEE_PLAIN = '<section id="guarantee" class="py-12 md:py-16 bg-bone">';

    const productHero = html.indexOf('lg:grid lg:grid-cols-2 lg:items-center lg:gap-10');
    const featuredQuote = html.indexOf('font-display text-6xl text-graphite/15');
    const guarantee = html.indexOf(GUARANTEE_PLAIN);

    expect(productHero).toBeGreaterThan(-1);
    expect(featuredQuote).toBeGreaterThan(productHero);
    expect(guarantee).toBeGreaterThan(featuredQuote);

    // …and it is UNAMBIGUOUS: exactly one match, and exactly one guarantee
    // anchor in the whole page. A second capability growing this id — the
    // defect that merging Guarantee and ProductGuarantee removed — fails here
    // even if the ordering above still held.
    expect(html.split(GUARANTEE_PLAIN).length - 1, 'guarantee block matched twice').toBe(1);
    expect(html.split('id="guarantee"').length - 1, 'two guarantee anchors in one page').toBe(1);
    expect(html, 'the gold surface leaked into a plain-tone spec').not.toContain(
      '<section id="guarantee" class="bg-gold-tint py-12 md:py-16">',
    );

    expect(html).toContain('text-center');
    expect(html).toContain('justify-center');
    expect(html).toContain('bg-bone-dim');
    expect(html).toContain('text-steel');
    expect(html).not.toContain('undefined');
  });
});

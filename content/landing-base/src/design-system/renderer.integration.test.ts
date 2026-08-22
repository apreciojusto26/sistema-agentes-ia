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

    const productHero = html.indexOf('lg:grid lg:grid-cols-2 lg:items-center lg:gap-10');
    const featuredQuote = html.indexOf('font-display text-6xl text-graphite/15');
    const productGuarantee = html.indexOf('/sello-garantia.webp');

    expect(productHero).toBeGreaterThan(-1);
    expect(featuredQuote).toBeGreaterThan(productHero);
    expect(productGuarantee).toBeGreaterThan(featuredQuote);

    expect(html).toContain('text-center');
    expect(html).toContain('justify-center');
    expect(html).toContain('bg-bone-dim');
    expect(html).toContain('text-steel');
    expect(html).not.toContain('undefined');
  });
});

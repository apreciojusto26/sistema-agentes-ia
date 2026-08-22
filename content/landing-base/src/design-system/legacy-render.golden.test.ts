// Runtime golden for the legacy path. The fixture is the exact index.astro at
// HEAD 2074c93; rendering both pages with the same deterministic commerce
// boundary proves the default DesignSpec preserves the legacy composition.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test, vi } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import reactServer from '@astrojs/react/server.js';

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

import CurrentIndex from '@/pages/index.astro';
import LegacyIndex2074c93 from './test-fixtures/LegacyIndex2074c93.astro';

const render = async (Component: any) => {
  const container = await AstroContainer.create({
    renderers: [{ name: '@astrojs/react', ssr: reactServer }] as any,
  });
  return container.renderToString(Component);
};

describe('legacy runtime golden at 2074c93', () => {
  test('the golden fixture is byte-locked to HEAD 2074c93 index.astro', () => {
    const fixturePath = fileURLToPath(
      new URL('./test-fixtures/LegacyIndex2074c93.astro', import.meta.url),
    );
    const hash = createHash('sha256').update(readFileSync(fixturePath)).digest('hex');
    expect(hash).toBe('5cccf3305947f505290acec2b4da9486028d6ebc3f9122847a2d0f71f697426a');
  });

  test('the default DesignSpec renders byte-identically to the static legacy page', async () => {
    expect(await render(CurrentIndex)).toBe(await render(LegacyIndex2074c93));
  });
});

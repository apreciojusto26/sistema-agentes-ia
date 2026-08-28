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
    // UPDATED CONSCIOUSLY, ONCE, by the cookie-consent phase. The fixture's
    // section composition is unchanged; only the page-level analytics chrome
    // moved — the inline window.gtag('view_item') block became the ViewItem
    // island — and the SAME change was applied to index.astro in the same
    // commit. See the fixture's own header for why leaving the old block would
    // have pinned an un-consented analytics event as a requirement.
    expect(hash).toBe('a398a3fa8262f1253623be845decfb51b45d00c2f114775c9ddd16f1e4af4e5f');
  });

  test('the default DesignSpec renders byte-identically to the static legacy page', async () => {
    expect(await render(CurrentIndex)).toBe(await render(LegacyIndex2074c93));
  });
});

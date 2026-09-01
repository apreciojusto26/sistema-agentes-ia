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
    // UPDATED CONSCIOUSLY, TWICE.
    //
    // FIRST by the cookie-consent phase. The fixture's section composition was
    // unchanged; only the page-level analytics chrome moved — the inline
    // window.gtag('view_item') block became the ViewItem island — and the SAME
    // change was applied to index.astro in the same commit. Leaving the old
    // block would have pinned an un-consented analytics event as a requirement.
    //
    // SECOND by the RealResults integrity removal, and this one DOES change the
    // composition: `<RealResults />` is gone (previous hash a398a3fa…). The
    // section drew a rating histogram from product.ratingBreakdown, a field with
    // no canonical source, and a UGC grid rendering the same product.ugc entries
    // as the socialProof/UgcStrip this page already composes at order 6 — so
    // every legacy landing showed that collection twice, once under the claim
    // "Resultados reales".
    //
    // Nothing replaces it, on purpose. Fewer sections is the correct outcome
    // when one of them was duplicating another's data under a claim the data
    // does not support. This is the same principle as the first edit: a
    // byte-lock records what the page WAS, and it cannot be a reason to keep
    // rendering something incorrect.
    expect(hash).toBe('449a17bfb6beaf5ce53a3af6681791c0ebee61be009d394144ce2c470189aa0f');
  });

  test('the default DesignSpec renders byte-identically to the static legacy page', async () => {
    expect(await render(CurrentIndex)).toBe(await render(LegacyIndex2074c93));
  });
});

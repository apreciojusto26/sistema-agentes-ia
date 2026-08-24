// Structural variants — media/GalleryStrip/{strip,grid}.
//
// These assertions RENDER both blocks and read the resulting HTML. Source
// scanning cannot tell a real structural change from two files that merely
// differ, and the claim being defended is that these two produce genuinely
// different compositions from the same images.
//
// The commerce boundary is stubbed the way legacy-render.golden.test.ts stubs
// it, so rendering is deterministic and makes no network call. `images: []`
// on the stub is deliberate: it forces the resolver down its LOCAL branch,
// which is the branch a generated landing actually uses in preview mode.
import { describe, expect, test, vi } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import reactServer from '@astrojs/react/server.js';

vi.mock('@/lib/shopify/catalog', () => ({
  getProductCommerce: async () => ({
    handle: 'fixture',
    title: 'Fixture',
    currencyCode: 'EUR',
    optionName: 'Color',
    variants: [],
    defaultVariantId: null,
    anyAvailable: false,
    images: [],
  }),
}));

import { product } from '@/data/product';
import Strip from './Strip.astro';
import Grid from './Grid.astro';
import { galleryImages } from './gallery-images';

const render = async (Component: unknown) => {
  const container = await AstroContainer.create({
    renderers: [{ name: '@astrojs/react', ssr: reactServer }] as never,
  });
  return container.renderToString(Component as never);
};

describe('both variants render the SAME images', () => {
  test('the fixture gallery actually has images to render', () => {
    // Guards everything below: an empty gallery would make these pass vacuously.
    expect(product.gallery.length).toBeGreaterThan(2);
  });

  test('both resolve through the shared resolver, to the same list', async () => {
    const forStrip = await galleryImages('strip');
    const forGrid = await galleryImages('grid');
    expect(forGrid).toEqual(forStrip);
    expect(forStrip).toHaveLength(product.gallery.length);
  });

  test.each([
    ['strip', Strip],
    ['grid', Grid],
  ])('%s renders alt text from product.gallery', async (_name, Component) => {
    const html = await render(Component);
    const alts = product.gallery.map((g) => g.alt);
    // Strip shows one image at a time (thumbnails carry aria-hidden), so the
    // shared guarantee is that the gallery's OWN copy reaches the document.
    expect(alts.some((alt) => html.includes(alt))).toBe(true);
  });

  test('neither variant renders an empty section', async () => {
    for (const [name, Component] of [
      ['strip', Strip],
      ['grid', Grid],
    ] as const) {
      const html = await render(Component);
      expect(html.length, `${name} rendered almost nothing`).toBeGreaterThan(400);
    }
  });
});

describe('the two compositions are genuinely different', () => {
  test('strip ships an interactive island; grid ships none', async () => {
    const strip = await render(Strip);
    const grid = await render(Grid);

    expect(strip, 'strip lost its island').toContain('astro-island');
    expect(grid, 'grid hydrates something — it must be fully static').not.toContain('astro-island');
  });

  test('strip renders a thumbnail rail; grid does not', async () => {
    const strip = await render(Strip);
    const grid = await render(Grid);

    expect(strip).toContain('role="tablist"');
    expect(strip).toContain('Miniaturas de producto');
    expect(strip).toContain('overflow-x-auto');

    expect(grid, 'grid has a thumbnail tablist').not.toContain('role="tablist"');
    expect(grid, 'grid has a horizontal scroller').not.toContain('overflow-x-auto');
    expect(grid, 'grid has a lightbox trigger').not.toContain('Ampliar imagen');
  });

  test('grid lays out a responsive multi-column grid; strip does not', async () => {
    const grid = await render(Grid);
    const strip = await render(Strip);

    expect(grid).toMatch(/grid-cols-1[^"]*md:grid-cols-2[^"]*lg:grid-cols-3/);
    expect(strip, 'strip grew a column grid').not.toContain('md:grid-cols-2');
  });

  test('grid shows EVERY image at once; strip shows one plus thumbnails', async () => {
    const grid = await render(Grid);
    const strip = await render(Strip);

    const gridItems = [...grid.matchAll(/<li\b/g)].length;
    expect(gridItems, 'grid did not render one <li> per image').toBe(product.gallery.length);

    // The strip's large image is a single <img> outside the thumbnail rail;
    // its thumbnails are decorative (aria-hidden) rather than gallery items.
    expect(strip).toContain('aria-hidden="true"');
    expect([...strip.matchAll(/<li\b/g)].length, 'strip is a list').toBe(0);
  });

  test('the two HTML outputs are not the same document', async () => {
    expect(await render(Strip)).not.toBe(await render(Grid));
  });
});

describe('the shared resolver is fail-closed for BOTH variants', () => {
  /** Starves the REAL module: no Shopify images and an empty local gallery. */
  async function starved() {
    vi.resetModules();
    vi.doMock('@/lib/shopify/catalog', () => ({
      getProductCommerce: async () => ({ images: [] }),
    }));
    vi.doMock('@/data/product', () => ({ product: { ...product, gallery: [] } }));
    const mod = await import('./gallery-images');
    return mod.galleryImages;
  }

  test('throws when the gallery resolves to zero images', async () => {
    const galleryImagesStarved = await starved();
    await expect(galleryImagesStarved('strip')).rejects.toThrow(/resolved to zero images/);
    vi.doUnmock('@/data/product');
    vi.doUnmock('@/lib/shopify/catalog');
    vi.resetModules();
  });

  test('BOTH variants hit the same guard, and it names the one composed', async () => {
    const galleryImagesStarved = await starved();
    await expect(galleryImagesStarved('strip')).rejects.toThrow(/variant "strip"/);
    await expect(galleryImagesStarved('grid')).rejects.toThrow(/variant "grid"/);
    vi.doUnmock('@/data/product');
    vi.doUnmock('@/lib/shopify/catalog');
    vi.resetModules();
  });
});

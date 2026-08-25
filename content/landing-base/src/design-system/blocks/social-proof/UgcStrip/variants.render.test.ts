// Structural variants — socialProof/UgcStrip/{strip,grid}.
//
// These assertions RENDER both blocks and read the resulting HTML. Source
// scanning cannot tell a real structural change from two files that merely
// differ, and the claim being defended is that these two produce genuinely
// different compositions from the same UGC.
//
// Unlike the other two converted capabilities, NEITHER variant hydrates
// anything — Media.astro is a plain Astro component — so there is no island to
// count here. The difference is purely compositional, and that is exactly what
// these tests measure.
import { afterEach, describe, expect, test, vi } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import reactServer from '@astrojs/react/server.js';

import { product } from '@/data/product';
import type { MediaRef } from '@/types/content';
import Strip from './Strip.astro';
import Grid from './Grid.astro';
import { ugcItems } from './ugc-items';

// Same widening as ugc-items.ts: the template authors product `as const`, so
// `kind` is absent from the literal type of the non-video entries even though
// MediaRef declares it.
const ugc: MediaRef[] = [...product.ugc];

const render = async (Component: unknown) => {
  const container = await AstroContainer.create({
    renderers: [{ name: '@astrojs/react', ssr: reactServer }] as never,
  });
  return container.renderToString(Component as never);
};

describe('both variants consume the SAME product.ugc', () => {
  test('the fixture actually has UGC to render', () => {
    // Guards everything below: an empty list would make these pass vacuously.
    expect(product.ugc.length).toBeGreaterThan(2);
  });

  test('the shared accessor returns product.ugc verbatim for either variant', () => {
    expect(ugcItems('strip')).toEqual(product.ugc);
    expect(ugcItems('grid')).toEqual(product.ugc);
  });

  test.each([
    ['strip', Strip],
    ['grid', Grid],
  ])('%s renders one media element per UGC piece', async (_name, Component) => {
    const html = await render(Component);
    // Media.astro renders <img>/<video>, or a placeholder when the asset is
    // unresolved. Either way there is exactly one media slot per piece.
    const slots = [...html.matchAll(/aspect-\[9\/16\]|aspect-ratio:9 \/ 16/g)].length;
    expect(slots).toBeGreaterThanOrEqual(product.ugc.length);
  });

  test('both carry the same alt copy — same content, different layout', async () => {
    const strip = await render(Strip);
    const grid = await render(Grid);

    // Video pieces render as <video>, which carries no alt — that is
    // Media.astro's behaviour and it is correct, so the shared guarantee is
    // asserted over the pieces that DO have alt text.
    const described = ugc.filter((item) => item.kind !== 'video');
    expect(described.length, 'the fixture has no non-video UGC to check').toBeGreaterThan(1);

    for (const item of described) {
      expect(strip, `strip lost "${item.alt}"`).toContain(item.alt);
      expect(grid, `grid lost "${item.alt}"`).toContain(item.alt);
    }

    // …and the video pieces still reach both documents, just as <video>.
    const videos = ugc.filter((item) => item.kind === 'video');
    expect(videos.length).toBeGreaterThan(0);
    expect([...strip.matchAll(/<video\b/g)].length, 'strip dropped a video').toBe(videos.length);
    expect([...grid.matchAll(/<video\b/g)].length, 'grid dropped a video').toBe(videos.length);
  });

  test('the 9:16 ratio survives in BOTH — layout never overrules the medium', async () => {
    for (const [name, Component] of [
      ['strip', Strip],
      ['grid', Grid],
    ] as const) {
      const html = await render(Component);
      expect(html, `${name} cropped UGC away from 9:16`).toMatch(/9\/16|9 \/ 16/);
      expect(html, `${name} cropped UGC square`).not.toContain('aspect-square');
    }
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
  test('strip is a horizontal scroller; grid is not', async () => {
    const strip = await render(Strip);
    const grid = await render(Grid);

    expect(strip).toContain('overflow-x-auto');
    expect(strip).toContain('snap-x');
    expect(strip).toContain('snap-start');
    expect(strip).toContain('shrink-0');

    expect(grid, 'grid scrolls horizontally').not.toContain('overflow-x-auto');
    expect(grid, 'grid snaps like a strip').not.toContain('snap-x');
    expect(grid, 'grid has strip-style snap items').not.toContain('snap-start');
    expect(grid, 'grid pins item widths like a strip').not.toContain('shrink-0');
  });

  test('grid wraps into a responsive mosaic; strip is one row', async () => {
    const grid = await render(Grid);
    const strip = await render(Strip);

    expect(grid).toMatch(/grid-cols-2[^"]*md:grid-cols-4/);
    expect(grid, 'the mosaic lost its focal piece').toContain('md:col-span-2');
    expect(grid).toContain('md:row-span-2');

    expect(strip, 'strip grew a column grid').not.toContain('md:grid-cols-4');
    expect(strip, 'strip grew a spanning lead tile').not.toContain('col-span-2');
  });

  test('grid is a list of items; strip is a flex row of divs', async () => {
    const grid = await render(Grid);
    const strip = await render(Strip);

    expect([...grid.matchAll(/<li\b/g)].length, 'one <li> per UGC piece').toBe(product.ugc.length);
    expect([...strip.matchAll(/<li\b/g)].length, 'strip is a list').toBe(0);
    expect(strip).toContain('flex gap-3');
  });

  test('the two HTML outputs are not the same document', async () => {
    expect(await render(Strip)).not.toBe(await render(Grid));
  });
});

describe('the shared accessor is fail-closed for BOTH variants', () => {
  /** Starves the REAL module: product.ugc emptied. */
  async function starved() {
    vi.resetModules();
    vi.doMock('@/data/product', () => ({ product: { ...product, ugc: [] } }));
    const mod = await import('./ugc-items');
    return mod.ugcItems;
  }

  afterEach(() => {
    vi.doUnmock('@/data/product');
    vi.resetModules();
  });

  test('throws when product.ugc is empty', async () => {
    const ugcItemsStarved = await starved();
    expect(() => ugcItemsStarved('strip')).toThrow(/`ugc` in src\/data\/product\.ts is empty/);
  });

  test('BOTH variants hit the same guard, and it names the one composed', async () => {
    const ugcItemsStarved = await starved();
    expect(() => ugcItemsStarved('strip')).toThrow(/variant "strip"/);
    expect(() => ugcItemsStarved('grid')).toThrow(/variant "grid"/);
  });
});

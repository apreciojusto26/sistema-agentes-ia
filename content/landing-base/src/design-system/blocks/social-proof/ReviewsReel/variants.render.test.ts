// Structural variants v1 — socialProof/ReviewsReel/{carousel,grid}.
//
// These assertions RENDER the two blocks and read the resulting HTML. Nothing
// here scans source text: the claim being defended is "these two variants
// produce genuinely different compositions from the same content", and source
// scanning cannot tell the difference between a real structural change and two
// files that happen to differ.
//
// The commerce boundary is stubbed exactly as legacy-render.golden.test.ts
// stubs it, so rendering stays deterministic and makes no network call.
import { afterEach, describe, expect, test, vi } from 'vitest';
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

import { testimonials } from '@/data/testimonials';
import Carousel from './Carousel.astro';
import Grid from './Grid.astro';
import { REEL_VARIANT, reelReviews } from './reel-reviews';

const render = async (Component: unknown) => {
  const container = await AstroContainer.create({
    renderers: [{ name: '@astrojs/react', ssr: reactServer }] as never,
  });
  return container.renderToString(Component as never);
};

const reel = testimonials.filter((t) => t.variant === REEL_VARIANT);
/** First reel review. Non-null by the guard test below, which runs first. */
const firstReel = reel[0]!;

describe('both variants render the SAME reviews', () => {
  test('the fixture data actually has reel reviews to render', () => {
    // Guards every assertion below: if this were empty they would all pass
    // vacuously while proving nothing.
    expect(reel.length).toBeGreaterThan(1);
  });

  test.each([
    ['carousel', Carousel],
    ['grid', Grid],
  ])('%s renders every reel review body verbatim', async (_name, Component) => {
    const html = await render(Component);
    for (const review of reel) {
      expect(html, `missing review ${review.id}`).toContain(review.body);
      expect(html, `missing author of ${review.id}`).toContain(review.author);
    }
  });

  test('neither variant renders a testimonial of another variant', async () => {
    const others = testimonials.filter((t) => t.variant !== REEL_VARIANT);
    expect(others.length).toBeGreaterThan(0);

    for (const Component of [Carousel, Grid]) {
      const html = await render(Component);
      for (const other of others) {
        expect(html, `leaked ${other.id}`).not.toContain(other.body);
      }
    }
  });

  test('no variant renders an empty section', async () => {
    // The defect that started all of this: chrome around nothing.
    for (const [name, Component] of [
      ['carousel', Carousel],
      ['grid', Grid],
    ] as const) {
      const html = await render(Component);
      expect(html.length, `${name} rendered almost nothing`).toBeGreaterThan(500);
      expect(html, `${name} rendered no review text`).toContain(firstReel.body);
    }
  });
});

describe('the two compositions are genuinely different', () => {
  test('carousel ships an interactive island; grid ships none', async () => {
    const carousel = await render(Carousel);
    const grid = await render(Grid);

    // `astro-island` is the hydration boundary: its presence means JS is
    // shipped and the component is interactive at runtime.
    expect(carousel, 'carousel lost its island').toContain('astro-island');
    expect(grid, 'grid hydrates something — it must be fully static').not.toContain('astro-island');
  });

  test('carousel renders navigation controls', async () => {
    const html = await render(Carousel);
    expect(html).toContain('aria-roledescription="carousel"');
    expect(html).toContain('aria-label="Reseña anterior"');
    expect(html).toContain('aria-label="Reseña siguiente"');
    expect(html).toContain('role="tablist"');
  });

  test('grid renders NO navigation controls', async () => {
    const html = await render(Grid);
    expect(html, 'grid is a carousel').not.toContain('aria-roledescription="carousel"');
    expect(html, 'grid has prev control').not.toContain('aria-label="Reseña anterior"');
    expect(html, 'grid has next control').not.toContain('aria-label="Reseña siguiente"');
    expect(html, 'grid has a dot tablist').not.toContain('role="tablist"');
    expect(html, 'grid has a scroll track').not.toContain('snap-mandatory');
  });

  test('grid lays out a responsive multi-column grid; carousel does not', async () => {
    const grid = await render(Grid);
    const carousel = await render(Carousel);

    expect(grid).toMatch(/grid-cols-1[^"]*md:grid-cols-2[^"]*lg:grid-cols-3/);
    expect(carousel, 'carousel grew a column grid').not.toContain('md:grid-cols-2');
  });

  test('the two HTML outputs are not the same document', async () => {
    expect(await render(Carousel)).not.toBe(await render(Grid));
  });
});

describe('the shared backstop covers BOTH variants', () => {
  /**
   * Starves the REAL module.
   *
   * reel-reviews.ts reads its data through a STATIC import, so the only honest
   * way to test the empty case is to mock that data module and re-import the
   * real implementation. Re-stating the guard inline here would assert on a
   * copy of the code and prove nothing about what ships.
   */
  async function starved() {
    vi.resetModules();
    vi.doMock('@/data/testimonials', () => ({ testimonials: [] }));
    const mod = await import('./reel-reviews');
    return mod.reelReviews;
  }

  afterEach(() => {
    vi.doUnmock('@/data/testimonials');
    vi.resetModules();
  });

  test('throws when there is no reel testimonial', async () => {
    const reelReviewsStarved = await starved();
    expect(() => reelReviewsStarved('carousel')).toThrow(/no testimonial with variant "reel"/);
  });

  test('BOTH variants hit the same guard — neither can bypass it', async () => {
    const reelReviewsStarved = await starved();
    expect(() => reelReviewsStarved('carousel')).toThrow();
    expect(() => reelReviewsStarved('grid')).toThrow();
  });

  test('the guard names the variant that was composed', async () => {
    const reelReviewsStarved = await starved();
    expect(() => reelReviewsStarved('grid')).toThrow(/variant "grid"/);
    expect(() => reelReviewsStarved('carousel')).toThrow(/variant "carousel"/);
  });

  test('and returns every reel review when the data IS present', () => {
    expect(reelReviews('carousel')).toEqual(reel);
    expect(reelReviews('grid')).toEqual(reel);
  });
});

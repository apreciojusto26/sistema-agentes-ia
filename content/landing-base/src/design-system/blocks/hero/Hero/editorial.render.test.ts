// hero/Hero/editorial — the THIRD structural variant, and the first with no
// historical markup behind it.
//
// Two claims, kept apart on purpose:
//
//   1. Editorial is a real VARIANT, not a prop in disguise. It differs from
//      default and split in DOM shape, media count and layout, AND it puts four
//      pieces of product data on screen that no other hero shows.
//   2. It degrades on real data. 1 / 2 / 3+ gallery images each produce a
//      complete composition — no empty cell, no invented placeholder, no
//      out-of-range read — WITHOUT a `product.gallery>=3` grammar existing.
//
// Deliberately NOT in the historical golden: this variant has no history to
// preserve. Freezing today's output as a "historical" reference would be a
// fiction, and the three hero fixtures that DO have history stay untouched.
import { afterEach, describe, expect, test, vi } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import reactServer from '@astrojs/react/server.js';

import { product } from '@/data/product';
import Editorial from './Editorial.astro';
import Default from './Default.astro';
import Split from './Split.astro';

const render = async (Component: unknown, props: Record<string, unknown> = {}) => {
  const container = await AstroContainer.create({
    renderers: [{ name: '@astrojs/react', ssr: reactServer }] as never,
  });
  return container.renderToString(Component as never, { props });
};

const tags = (html: string) => [...html.matchAll(/<([a-zA-Z][\w-]*)\b/g)].map((m) => m[1]);
const count = (html: string, re: RegExp) => [...html.matchAll(re)].length;
const SENTINEL = '<div id="hero-end" class="h-px w-full" aria-hidden="true"></div>';

/**
 * Re-imports the REAL block against a product whose gallery has been trimmed.
 * Nothing about the component is stubbed — only its data source, exactly the
 * way the historical golden swaps in GOLDEN_DATA.
 */
async function withGallery(n: number) {
  vi.resetModules();
  vi.doMock('@/data/product', () => ({
    product: { ...product, gallery: product.gallery.slice(0, n) },
  }));
  const mod = await import('./Editorial.astro');
  return render(mod.default);
}

afterEach(() => {
  vi.doUnmock('@/data/product');
  vi.resetModules();
});

describe('editorial consumes REAL existing data, and invents nothing', () => {
  test('it renders brand, tagline, subtagline, rating, count and every badge', async () => {
    const html = await render(Editorial);
    expect(html, 'brand').toContain(product.brand);
    expect(html, 'tagline').toContain(product.tagline);
    expect(html, 'subtagline').toContain(product.subtagline);
    expect(html, 'ratingAverage').toContain(String(product.ratingAverage));
    expect(html, 'ratingCount').toContain(String(product.ratingCount));
    for (const badge of product.badges) expect(html, `badge "${badge}"`).toContain(badge);
  });

  test('it fabricates NO claim of its own', async () => {
    // The failure this guards is a hero writing marketing copy. Every visible
    // string must come from @/data/product; the Content Agent owns what is
    // said, this block owns only how it is arranged.
    const html = await render(Editorial);
    for (const invented of ['Bestseller', 'Top rated', 'Más vendido', 'Nº 1', '#1', 'Oferta']) {
      expect(html, `editorial invented "${invented}"`).not.toContain(invented);
    }
  });

  test('the rating comes from the shared Stars primitive, with its a11y intact', async () => {
    // Not a second star renderer: Stars.astro's own role/aria-label must survive.
    const html = await render(Editorial);
    expect(html).toContain(`aria-label="${product.ratingAverage} de 5 estrellas"`);
    expect(html).toMatch(/role="img"/);
    expect(count(html, /<svg\b/g), 'five stars, one svg each').toBe(5);
  });

  test('imagery comes from the shared hero accessor — no second gallery source', async () => {
    const src = readSource();
    expect(src, 'editorial resolves its own gallery').toContain("heroGallery('editorial')");
    expect(src, 'editorial reads product.gallery directly').not.toMatch(/product\.gallery/);
  });

  test('it hydrates nothing and touches no commerce', async () => {
    const html = await render(Editorial);
    expect(html, 'grew an island').not.toContain('astro-island');
    expect(html, 'grew a button').not.toMatch(/<button\b/);
    expect(html, 'grew a form').not.toMatch(/<form\b/);
    for (const forbidden of ['CartDrawer', 'add_to_cart', 'checkout', 'data-variant-id']) {
      expect(html, `referenced commerce (${forbidden})`).not.toContain(forbidden);
    }
  });
});

describe('editorial is a REAL variant, not a restyle of its siblings', () => {
  test('it shows meta that NEITHER sibling shows', async () => {
    // The sharpest statement available that `variant` earned its keep: the
    // difference is CONTENT PRESENT, not a class swap.
    //
    // Compared STRUCTURALLY, not by badge text. product.badges and
    // product.heroPills genuinely overlap in this catalogue — both contain
    // "Pila incluida" — so "no sibling renders a badge string" is false on real
    // data and an earlier version of this test failed on it, correctly. What
    // is actually exclusive to editorial is the Badge primitive and the Stars
    // a11y label; what is exclusive to its siblings is the heroPills row.
    const editorial = await render(Editorial);
    const a = await render(Default);
    const b = await render(Split, { align: 'left' });

    const BADGE_SURFACE = 'bg-graphite/5 text-graphite';
    const PILL_SURFACE = 'rounded-pill bg-white';

    for (const [name, html] of [['default', a], ['split', b]] as const) {
      expect(html, `${name} already showed the brand as an eyebrow`).not.toContain(
        `uppercase text-rust">${product.brand}`,
      );
      expect(html, `${name} already showed a rating`).not.toContain('de 5 estrellas');
      expect(html, `${name} already used the Badge primitive`).not.toContain(BADGE_SURFACE);
      expect(html, `${name} should still render heroPills`).toContain(PILL_SURFACE);
    }

    expect(editorial, 'brand eyebrow').toContain(`uppercase text-rust">${product.brand}`);
    expect(editorial, 'rating').toContain('de 5 estrellas');
    expect(editorial, 'badges').toContain(BADGE_SURFACE);
    // …and editorial does NOT repeat heroPills: badges occupy that role here.
    // Two rows of near-identical chips would be the same claim made twice.
    expect(editorial, 'editorial duplicated the heroPills row').not.toContain(PILL_SURFACE);
    expect(count(editorial, new RegExp(escapeRe(BADGE_SURFACE), 'g'))).toBe(product.badges.length);
  });

  test('the three heroes are three different documents with three different shapes', async () => {
    const e = await render(Editorial);
    const a = await render(Default);
    const b = await render(Split, { align: 'left' });

    expect(e).not.toBe(a);
    expect(e).not.toBe(b);
    expect(tags(e)).not.toEqual(tags(a));
    expect(tags(e)).not.toEqual(tags(b));
  });

  test('media is composed as an asymmetric cluster, not a collage and not one frame', async () => {
    const e = await render(Editorial);
    const a = await render(Default);
    const b = await render(Split, { align: 'left' });

    // default: rotated collage, rendered twice (one tier per breakpoint).
    expect(count(a, /-rotate-6/g)).toBe(2);
    expect(count(e, /-rotate-6/g), 'editorial grew a collage').toBe(0);

    // split: exactly one framed shot, no grid of cells.
    expect(count(b, /md:col-span-/g), 'split grew cluster cells').toBe(0);

    // editorial: a 12-column grid with cells of DIFFERENT spans — that
    // inequality is the composition. Equal cells would be `grid-cols-3`.
    expect(e).toContain('md:grid-cols-12');
    expect(e).toContain('md:col-span-8');
    expect(e).toContain('md:col-span-4');
    expect(e).toContain('md:col-span-12');
    expect(count(e, /md:col-span-/g), 'three cells, three spans').toBe(3);

    // …and the dominant is visually promoted over its secondaries.
    expect(count(e, /shadow-lift/g), 'one dominant').toBe(1);
    expect(count(e, /shadow-card/g), 'two secondaries').toBe(2);
  });

  test('editorial declares no props — the structure IS the variant', async () => {
    // A DesignSpec may pass nothing; passing nothing must be complete output.
    // (The registry-level "unknown prop is rejected" case lives in
    // admin/test/contract.design-blocks.test.ts, against the real contract.)
    const bare = await render(Editorial, {});
    expect(bare).toBe(await render(Editorial));
    expect(bare).not.toContain('undefined');
    expect(bare).not.toContain('class=""');
  });
});

describe('gallery degradation — D=1, E=2, F=3+', () => {
  const CASES = [
    ['D — one image', 1, 1],
    ['E — two images', 2, 2],
    ['F — three images', 3, 3],
    ['F — five images (capped)', 5, 3],
  ] as const;

  test.each(CASES)('%s renders %i source image(s) as %i cell(s)', async (_n, given, cells) => {
    const html = await withGallery(given);
    expect(count(html, /class="overflow-hidden rounded-card/g), 'cell count').toBe(cells);
  });

  test.each(CASES)('%s leaves no empty cell and invents no placeholder', async (_n, given) => {
    const html = await withGallery(given);
    // An empty structural cell is the exact failure mode this variant had to
    // avoid: a 12-column grid with a hole in it.
    expect(html, 'empty cell').not.toMatch(/class="[^"]*col-span[^"]*"><\/div>/);
    // Every rendered cell must carry a real image or the REAL placeholder
    // branch of Media.astro — never a slot fabricated to fill the layout.
    const cells = count(html, /class="overflow-hidden rounded-card/g);
    const media = count(html, /<img\b/g) + count(html, /data-placeholder="true"/g);
    expect(media, 'a cell without media').toBe(cells);
  });

  test.each(CASES)('%s reads nothing out of range', async (_n, given) => {
    const html = await withGallery(given);
    expect(html).not.toContain('undefined');
    expect(html).not.toContain('null');
    expect(html).not.toContain('NaN');
  });

  test('one image takes the full-width solo cell; two or more take the paired cell', async () => {
    // Degradation is a real composition change, not the same grid with fewer
    // children — that is what stops a one-image hero looking like a mistake.
    const one = await withGallery(1);
    expect(one, 'solo dominant should span the full 12').toContain('md:col-span-12 md:aspect-[16/7]');
    expect(one, 'solo dominant kept the paired span').not.toContain('md:col-span-8');

    const two = await withGallery(2);
    expect(two).toContain('md:col-span-8 md:aspect-[16/10]');
    // The secondary takes the row height rather than its own ratio, so the pair
    // ends on the same line at any gap. Measured, not assumed: without this the
    // two cells came out 509px and 497px on a 1600px viewport.
    expect(two).toContain('md:col-span-4 md:aspect-auto md:h-full');
    expect(two, 'two images grew the third band').not.toContain('md:col-span-12');

    const three = await withGallery(3);
    expect(three).toContain('md:col-span-8 md:aspect-[16/10]');
    expect(three).toContain('md:col-span-4');
    expect(three).toContain('md:col-span-12 md:aspect-[16/6]');
  });

  test('an empty gallery still renders the editorial header — it never throws', async () => {
    // heroGallery carries no fail-closed guard by design; requiresData is what
    // keeps an empty-gallery product from selecting this variant at all. If it
    // somehow renders, it must degrade, not explode.
    const html = await withGallery(0);
    expect(html).toContain(product.tagline);
    expect(count(html, /md:col-span-/g), 'a cell with no image').toBe(0);
    expect(html, 'sentinel survives an empty gallery').toContain(SENTINEL);
  });

  test.each(CASES)('%s still emits exactly one #hero-end', async (_n, given) => {
    const html = await withGallery(given);
    expect(count(html, /id="hero-end"/g)).toBe(1);
    expect(html.trimEnd().endsWith(`${SENTINEL}</section>`)).toBe(true);
  });
});

describe('editorial owes the shell the same sticky-CTA contract as its siblings', () => {
  test('it emits the sentinel once, last, byte-identical to default and split', async () => {
    const e = await render(Editorial);
    expect(count(e, /id="hero-end"/g)).toBe(1);
    expect(e.trimEnd().endsWith(`${SENTINEL}</section>`)).toBe(true);

    // Same element, not merely the same id: the shell looks up one id and the
    // three variants must agree on what it looks like.
    const grab = (html: string) => html.match(/<div id="hero-end"[^>]*><\/div>/)?.[0];
    expect(grab(e)).toBe(SENTINEL);
    expect(grab(await render(Default))).toBe(SENTINEL);
    expect(grab(await render(Split, { align: 'left' }))).toBe(SENTINEL);
  });

  test('the sentinel comes after every piece of editorial content', async () => {
    const html = await render(Editorial);
    const at = html.indexOf('id="hero-end"');
    for (const [label, value] of [
      ['brand', product.brand],
      ['tagline', product.tagline],
      ['subtagline', product.subtagline],
      ['last badge', product.badges[product.badges.length - 1]!],
    ] as const) {
      expect(at, `sentinel precedes ${label}`).toBeGreaterThan(html.indexOf(value));
    }
  });
});

function escapeRe(v: string): string {
  return v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function readSource(): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('node:fs').readFileSync(
    require('node:url').fileURLToPath(new URL('./Editorial.astro', import.meta.url)),
    'utf-8',
  );
}

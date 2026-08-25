// Structural variants — hero/Hero/{default,split}, and the A/B/C demonstration
// the hero taxonomy migration exists to make.
//
// THREE renders of the SAME product and the SAME content:
//
//   A  hero/Hero/default
//   B  hero/Hero/split   align="left"
//   C  hero/Hero/split   align="center"
//
// The claim under test is the two-axis one:
//
//   A vs B   `variant` chooses a COMPOSITION — different DOM, different media
//            count, a different number of elements.
//   B vs C   `align` is a PROP — the SAME composition with one dial turned.
//            Same tags, same element counts, same media, same CTA surface,
//            same (zero) islands. Only align-derived classes may move.
//
// If B vs C ever started differing structurally, `align` would have become a
// variant in disguise and the registry would be lying about its own axes. That
// is what the strip-the-align-classes comparison below actually measures.
//
// Byte-level preservation against the historical renders is NOT this file's
// job — test-fixtures/legacy-markup/historical-markup.golden.test.ts owns it,
// against frozen references from 4732910 (default) and 19f60d5 (split).
import { describe, expect, test } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import reactServer from '@astrojs/react/server.js';

import { product } from '@/data/product';
import Default from './Default.astro';
import Split from './Split.astro';
import { heroGallery } from './hero-gallery';

const render = async (Component: unknown, props: Record<string, unknown> = {}) => {
  const container = await AstroContainer.create({
    renderers: [{ name: '@astrojs/react', ssr: reactServer }] as never,
  });
  return container.renderToString(Component as never, { props });
};

/** Ordered list of every opening tag name, so structure is compared not prose. */
const tags = (html: string) => [...html.matchAll(/<([a-zA-Z][\w-]*)\b/g)].map((m) => m[1]);
const count = (html: string, re: RegExp) => [...html.matchAll(re)].length;

/** Classes `align` is allowed to move, per Split.astro's three lookup tables. */
const ALIGN_CLASSES = [
  'text-left', 'text-center',
  'justify-start', 'justify-center',
  'mx-auto max-w-prose', 'max-w-prose',
];

const A = () => render(Default);
const B = () => render(Split, { align: 'left' });
const C = () => render(Split, { align: 'center' });

describe('both variants consume the same hero data', () => {
  test('the shared accessor returns product.gallery verbatim for either variant', () => {
    expect(heroGallery('default')).toEqual([...product.gallery]);
    expect(heroGallery('split')).toEqual([...product.gallery]);
  });

  test('all three renders carry the same tagline, subtagline and pills', async () => {
    for (const [name, html] of [['A', await A()], ['B', await B()], ['C', await C()]] as const) {
      expect(html, `${name} lost the tagline`).toContain(product.tagline);
      expect(html, `${name} lost the subtagline`).toContain(product.subtagline);
      for (const pill of product.heroPills) {
        expect(html, `${name} dropped pill "${pill}"`).toContain(pill);
      }
    }
  });

  test('neither variant hydrates, and neither touches commerce', async () => {
    // The hero states the offer; BuyBox and the sticky bar transact it. A hero
    // that grew an island or a cart hook would have crossed a real boundary.
    for (const [name, html] of [['A', await A()], ['B', await B()], ['C', await C()]] as const) {
      expect(html, `${name} grew an island`).not.toContain('astro-island');
      expect(html, `${name} grew a button`).not.toMatch(/<button\b/);
      expect(html, `${name} grew a form`).not.toMatch(/<form\b/);
      for (const forbidden of ['CartDrawer', 'add_to_cart', 'checkout', 'data-variant-id']) {
        expect(html, `${name} referenced commerce (${forbidden})`).not.toContain(forbidden);
      }
    }
  });
});

describe('A vs B — variant is a REAL structural difference', () => {
  test('they are not the same document', async () => {
    expect(await A()).not.toBe(await B());
  });

  test('A renders the collage TWICE (one per breakpoint); B renders one framed shot', async () => {
    const a = await A();
    const b = await B();

    // GOLDEN-independent count: `<Media>` resolves to a figure/img/svg tree, so
    // count the rotation wrappers the collage is built from instead.
    expect(count(a, /-rotate-6/g), 'A lost a collage tier').toBe(2);
    expect(count(b, /-rotate-6/g), 'B grew the collage').toBe(0);

    // A shows three gallery pieces per tier, B shows exactly one image total.
    expect(count(a, /ring-4 ring-white/g), 'A collage piece count').toBe(6);
    expect(count(b, /ring-4 ring-white/g), 'B is not a single framed shot').toBe(0);
    expect(b).toContain('rounded-card shadow-lift');
  });

  test('B is materially smaller in element count — it is not A restyled', async () => {
    const a = tags(await A());
    const b = tags(await B());
    expect(a.length, 'A should compose more elements than B').toBeGreaterThan(b.length);
    // Not a marginal difference: the collage is six positioned media wrappers
    // rendered twice against one flat frame.
    expect(a.length - b.length).toBeGreaterThan(10);
  });

  test('only A emits the #hero-end sticky-CTA sentinel — PRESERVED DEFECT', async () => {
    // NOT an endorsement. 15-sticky-bar.astro passes sentinelId="hero-end" and
    // StickyAddToCart returns early when getElementById misses, so a landing
    // composed with hero/Hero/split never shows its sticky CTA at all.
    //
    // This migration preserves that behaviour ON PURPOSE, so the taxonomy
    // change is provably behaviour-preserving before anything functional moves.
    // Tracked as "Hero split Sticky CTA anchor parity"; when that lands, this
    // assertion flips and the two split goldens are regenerated by hand.
    expect(await A()).toContain('id="hero-end"');
    expect(await B()).not.toContain('hero-end');
    expect(await C()).not.toContain('hero-end');
  });
});

describe('B vs C — align is a PROP: same structure, one dial', () => {
  test('the two renders differ at all (the dial is connected)', async () => {
    expect(await B()).not.toBe(await C());
  });

  test('identical tag sequence — same tags, same order, same count', async () => {
    expect(tags(await C())).toEqual(tags(await B()));
  });

  test('identical media, identical islands, identical CTA surface', async () => {
    const b = await B();
    const c = await C();
    for (const re of [/<img\b/g, /<svg\b/g, /<figure\b/g, /<a\b/g, /<button\b/g, /astro-island/g]) {
      expect(count(c, re), `element count moved for ${re}`).toBe(count(b, re));
    }
    expect(count(c, /rounded-card shadow-lift/g)).toBe(count(b, /rounded-card shadow-lift/g));
  });

  test('every difference between B and C is an align class — nothing else moves', async () => {
    // Strip exactly the classes Split.astro's lookup tables can emit. What is
    // left must be byte-identical, which is the strongest available statement
    // that `align` did not earn its own variant.
    const strip = (html: string) =>
      ALIGN_CLASSES.reduce((acc, cls) => acc.split(cls).join(''), html).replace(/\s+/g, ' ');

    expect(strip(await C()), 'B and C differ outside the align dial').toBe(strip(await B()));
  });

  test('each value emits ONLY its own classes — no leakage', async () => {
    const b = await B();
    const c = await C();
    expect(b).toContain('text-left');
    expect(b).toContain('justify-start');
    expect(b).not.toContain('text-center');
    expect(b).not.toContain('justify-center');
    expect(c).toContain('text-center');
    expect(c).toContain('justify-center');
    expect(c).not.toContain('text-left');
    expect(c).not.toContain('justify-start');
  });

  test('the dial has exactly two settings, and the default is one of them', async () => {
    // A DesignSpec may omit props entirely; an omitted align must land on a
    // declared enum value, never `undefined`.
    const noProps = await render(Split, {});
    expect(noProps).toBe(await B());
    expect(noProps).not.toContain('undefined');
    expect(noProps).not.toContain('class=""');
  });
});

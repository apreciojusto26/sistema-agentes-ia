// HISTORICAL MARKUP GOLDEN — the invariant legacy-render.golden.test.ts does
// NOT cover.
//
// TWO DIFFERENT INVARIANTS, deliberately kept in two files:
//
//   legacy-render.golden.test.ts  the legacy import path and the registry path
//                                 resolve to the SAME composition
//   this file                     that composition is still the HISTORICAL one
//
// The first one cannot cover the second, and this was PROVEN, not assumed:
// components/sections/*.astro are now one-line shims onto the promoted blocks,
// so both sides of that comparison resolve to the same component and change
// together. Rewriting `lg:grid-cols-3` to `lg:grid-cols-2` inside
// HorizontalTimeline.astro left it green. This file is what goes red.
//
// THE REFERENCE. Each .html beside this test is the output of the ORIGINAL
// component at the commit named in its CASES row, rendered against the frozen
// GOLDEN_DATA in legacy-markup/golden-data.ts. Most are 4732910 — the last
// commit before any conversion touched those files. The two split-hero
// references are 19f60d5 instead, because that is where hero/Hero/split was
// introduced; it never existed at 4732910. Both baselines were verified
// byte-identical to the working tree before the render that produced them, so
// each fixture is the historical output and not a re-derivation of the current
// code. They were produced once, from git history, and
// reviewed. NOTHING HERE REGENERATES THEM. A test that can rewrite its own
// reference is not a golden, it is a rubber stamp: if this goes red, either the
// change was unintended and belongs reverted, or it was deliberate and the
// fixture is updated BY HAND in the same reviewed commit.
//
// The sha256 map below seals the fixtures themselves, so "fix" cannot mean
// quietly editing the expected HTML.
//
// WHY FROZEN DATA. src/data/* is real template content that changes for
// legitimate reasons — one earlier phase rewrote testimonials.ts wholesale — so
// a golden rendered against it would go red on a copy edit and prove nothing
// about markup. GOLDEN_DATA fixes the input so only STRUCTURE can move it.
//
// WHAT THIS COVERS: element nesting and ordering, tag names, every class
// string, aria/role/id attributes, item counts — the whole rendered DOM of each
// promoted section.
//
// A PRESERVED DEFECT LIVES IN HERE. HeroSplitLeft.html and HeroSplitCenter.html
// contain NO `#hero-end` sentinel, while Hero.html does. 15-sticky-bar.astro
// observes that id, so a landing composed with hero/Hero/split never shows its
// sticky CTA. That is a real bug and it is FROZEN here on purpose: the hero
// taxonomy migration had to be provably behaviour-preserving first. Fixing it
// is a separate, deliberate commit — "Hero split Sticky CTA anchor parity" —
// which will turn these two fixtures red and must update them BY HAND.
// WHAT IT DOES NOT: the resolved-image branch of Media.astro / ProductGallery.
// GOLDEN_DATA uses `asset: null` throughout so media takes the PlaceholderShot
// path, which keeps the output deterministic (no content-hashed asset URLs).
// Media.astro is shared plumbing rather than a promoted capability, and it has
// its own coverage; this file is about the sections' own composition.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test, vi } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import reactServer from '@astrojs/react/server.js';
import { GOLDEN_DATA } from './golden-data';

vi.mock('@/lib/shopify/catalog', () => ({
  getProductCommerce: async () => GOLDEN_DATA.commerce,
}));
vi.mock('@/data/product', () => ({ product: GOLDEN_DATA.product }));
vi.mock('@/data/testimonials', () => ({ testimonials: GOLDEN_DATA.testimonials }));
vi.mock('@/data/faq', () => ({ faq: GOLDEN_DATA.faq }));

// The CURRENT components, reached through the SHIMS — the same path a
// generation without --design takes.
import ReviewsReel from '@/components/sections/10-reviews-reel.astro';
import GalleryStrip from '@/components/sections/04-gallery-strip.astro';
import UgcStrip from '@/components/sections/09-ugc-strip.astro';
import Faq from '@/components/sections/08-faq.astro';
import HowItWorks from '@/components/sections/06-how-it-works.astro';
import Comparison from '@/components/sections/11-comparison.astro';
import Hero from '@/components/sections/03-hero.astro';
// hero/Hero/split has no legacy section path — it was born in the design
// system — so it is reached directly. Both align values are frozen: `align` is
// a PROP that dials one composition, and the golden has to pin both settings of
// the dial, not just its default.
import HeroSplit from '@/design-system/blocks/hero/Hero/Split.astro';

/** sha256 of each reference file, so the reference cannot be edited silently. */
const FIXTURE_SHA256: Record<string, string> = {
  ReviewsReel: '6681c699a8d88e5be7bd388363ace0a2a441fa6dd9a4fe92ea4727b3a1ffc70b',
  GalleryStrip: 'f18d975cb8ad1823cd2183c64dab53336f3c586ad92a131310f576ca35019964',
  UgcStrip: '9bb05f6abfaf8135f8062dd9dea9695e6c4f9818df08ce4a2e9a1805c5645bcf',
  Faq: '491435a05003fb23e82e9f1d848287df0a8ef6938fd02e090b899f24ac537c93',
  HowItWorks: 'aec423d4517857dd125c1c3f8735e4360d5beb9a92d00edb079aab437a6fbf2a',
  Comparison: '851eb3fc7c4a17dccff08753dac874d32685014964b5155501200d251e2e9376',
  Hero: '6c7364e836ebe4c1b81fcd77ea60e9598d6e99fa8af7ef27f99d0dbafab5835a',
  HeroSplitLeft: '67ce54deecbda15070533f2cf7c9de3b0a9669c4bf27a3547882fbf48c789c3e',
  HeroSplitCenter: 'c574bbd4b2b397c37bdd64932a6217762f585df54de4674d2bb0e0eeb5d27d38',
};

/** [fixture name, component, baseline commit, props]. */
const CASES = [
  ['ReviewsReel', ReviewsReel, '4732910', {}],
  ['GalleryStrip', GalleryStrip, '4732910', {}],
  ['UgcStrip', UgcStrip, '4732910', {}],
  ['Faq', Faq, '4732910', {}],
  ['HowItWorks', HowItWorks, '4732910', {}],
  ['Comparison', Comparison, '4732910', {}],
  ['Hero', Hero, '4732910', {}],
  ['HeroSplitLeft', HeroSplit, '19f60d5', { align: 'left' }],
  ['HeroSplitCenter', HeroSplit, '19f60d5', { align: 'center' }],
] as const;

const fixturePath = (name: string) => fileURLToPath(new URL(`./${name}.html`, import.meta.url));

const render = async (Component: unknown, props: Record<string, unknown> = {}) => {
  const container = await AstroContainer.create({
    renderers: [{ name: '@astrojs/react', ssr: reactServer }] as never,
  });
  return container.renderToString(Component as never, { props });
};

describe('historical markup golden (references: 4732910, 19f60d5)', () => {
  test.each(CASES.map(([name]) => name))(
    '%s reference file is byte-locked',
    (name) => {
      const hash = createHash('sha256').update(readFileSync(fixturePath(name))).digest('hex');
      expect(hash, `${name}.html was edited — update it only in a reviewed commit`).toBe(
        FIXTURE_SHA256[name],
      );
    },
  );

  test.each(CASES)('%s still renders its %s markup', async (name, Component, ref, props) => {
    const expected = readFileSync(fixturePath(name), 'utf-8').trimEnd();
    const actual = (await render(Component, props)).trimEnd();

    expect(
      actual,
      `${name} no longer renders the markup it had at ${ref}. If this change is ` +
        'intended, regenerate the fixture BY HAND and review the diff in the same commit.',
    ).toBe(expected);
  });

  test('the reference set covers every promoted capability', () => {
    // A capability promoted onto the variant axis without a frozen reference
    // would silently escape this golden.
    expect(Object.keys(FIXTURE_SHA256).sort()).toEqual(
      [
        'Comparison', 'Faq', 'GalleryStrip', 'HowItWorks', 'ReviewsReel', 'UgcStrip',
        'Hero', 'HeroSplitLeft', 'HeroSplitCenter',
      ].sort(),
    );
    // Every fixture is also actually RENDERED. A sha entry with no CASES row
    // would byte-lock a file nothing compares against.
    expect(CASES.map(([name]) => name).sort()).toEqual(Object.keys(FIXTURE_SHA256).sort());
  });

  test('the preserved #hero-end defect is exactly where it was, and nowhere else', () => {
    // This is a BUG PIN, not an approval. hero/Hero/default emits the sentinel
    // 15-sticky-bar.astro observes; hero/Hero/split does not, so the sticky CTA
    // never appears on a split-hero landing. Frozen deliberately so the taxonomy
    // migration could be proven behaviour-preserving. When "Hero split Sticky
    // CTA anchor parity" lands, this test is what tells the next reader that
    // flipping the two split fixtures was the WHOLE point of that commit.
    const read = (n: string) => readFileSync(fixturePath(n), 'utf-8');
    expect(read('Hero'), 'Hero/default lost #hero-end').toContain('id="hero-end"');
    expect(read('HeroSplitLeft'), 'split gained #hero-end — fix it in its own commit')
      .not.toContain('hero-end');
    expect(read('HeroSplitCenter'), 'split gained #hero-end — fix it in its own commit')
      .not.toContain('hero-end');
  });
});

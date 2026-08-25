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
// section component at commit 4732910 — the last commit before any conversion
// touched these files — rendered against the frozen GOLDEN_DATA in
// legacy-markup/golden-data.ts. They were produced once, from git history, and
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

/** sha256 of each reference file, so the reference cannot be edited silently. */
const FIXTURE_SHA256: Record<string, string> = {
  ReviewsReel: '6681c699a8d88e5be7bd388363ace0a2a441fa6dd9a4fe92ea4727b3a1ffc70b',
  GalleryStrip: 'f18d975cb8ad1823cd2183c64dab53336f3c586ad92a131310f576ca35019964',
  UgcStrip: '9bb05f6abfaf8135f8062dd9dea9695e6c4f9818df08ce4a2e9a1805c5645bcf',
  Faq: '491435a05003fb23e82e9f1d848287df0a8ef6938fd02e090b899f24ac537c93',
  HowItWorks: 'aec423d4517857dd125c1c3f8735e4360d5beb9a92d00edb079aab437a6fbf2a',
  Comparison: '851eb3fc7c4a17dccff08753dac874d32685014964b5155501200d251e2e9376'
};

const CASES = [
  ['ReviewsReel', ReviewsReel],
  ['GalleryStrip', GalleryStrip],
  ['UgcStrip', UgcStrip],
  ['Faq', Faq],
  ['HowItWorks', HowItWorks],
  ['Comparison', Comparison],
] as const;

const fixturePath = (name: string) => fileURLToPath(new URL(`./${name}.html`, import.meta.url));

const render = async (Component: unknown) => {
  const container = await AstroContainer.create({
    renderers: [{ name: '@astrojs/react', ssr: reactServer }] as never,
  });
  return container.renderToString(Component as never);
};

describe('historical markup golden (reference: 4732910)', () => {
  test.each(CASES.map(([name]) => name))(
    '%s reference file is byte-locked',
    (name) => {
      const hash = createHash('sha256').update(readFileSync(fixturePath(name))).digest('hex');
      expect(hash, `${name}.html was edited — update it only in a reviewed commit`).toBe(
        FIXTURE_SHA256[name],
      );
    },
  );

  test.each(CASES)('%s still renders its 4732910 markup', async (name, Component) => {
    const expected = readFileSync(fixturePath(name), 'utf-8').trimEnd();
    const actual = (await render(Component)).trimEnd();

    expect(
      actual,
      `${name} no longer renders the markup it had at 4732910. If this change is ` +
        'intended, regenerate the fixture BY HAND and review the diff in the same commit.',
    ).toBe(expected);
  });

  test('the reference set covers every promoted capability', () => {
    // A capability promoted onto the variant axis without a frozen reference
    // would silently escape this golden.
    expect(Object.keys(FIXTURE_SHA256).sort()).toEqual(
      ['Comparison', 'Faq', 'GalleryStrip', 'HowItWorks', 'ReviewsReel', 'UgcStrip'].sort(),
    );
  });
});

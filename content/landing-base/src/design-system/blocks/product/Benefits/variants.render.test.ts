// Structural variants — product/Benefits/{icon-grid,feature-list}.
//
// SEVENTH capability on the variant axis and the FIRST that is additive: there
// is no legacy Benefits section, so there is no historical markup to preserve
// and no shim. See the registry note. What replaces that invariant here is the
// pair of claims below.
//
//   1. Both variants say the SAME THING about the product — same benefits, same
//      titles, same texts, same glyphs — and differ only in composition.
//   2. A benefit is a CARD in one and a ROW in the other. Not the same card in
//      one column: different wrappers, different surfaces, different icon
//      placement, different separators.
//
// The glyph resolver gets its own block because it is the one piece of REAL
// shared logic here, and because it is already load-bearing on real data.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import reactServer from '@astrojs/react/server.js';

import { ICONS, STAR_PATH } from '@/lib/icons';
import { product } from '@/data/product';
import type { BenefitItem } from '@/types/content';
import IconGrid from './IconGrid.astro';
import FeatureList from './FeatureList.astro';
import {
  benefitItems,
  benefitGlyph,
  BENEFITS_EYEBROW,
  BENEFITS_HEADING,
} from './benefit-items';

const render = async (Component: unknown) => {
  const container = await AstroContainer.create({
    renderers: [{ name: '@astrojs/react', ssr: reactServer }] as never,
  });
  return container.renderToString(Component as never);
};

const tags = (html: string) => [...html.matchAll(/<([a-zA-Z][\w-]*)\b/g)].map((m) => m[1]);
const count = (html: string, re: RegExp) => [...html.matchAll(re)].length;
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const benefits: BenefitItem[] = [...product.benefits];
const BOTH = [
  ['icon-grid', IconGrid],
  ['feature-list', FeatureList],
] as const;

/** Re-imports the REAL blocks against a product carrying exactly `n` benefits. */
async function withBenefits(n: number) {
  vi.resetModules();
  vi.doMock('@/data/product', () => ({
    product: { ...product, benefits: product.benefits.slice(0, n) },
  }));
  const [grid, list] = await Promise.all([import('./IconGrid.astro'), import('./FeatureList.astro')]);
  return { grid: await render(grid.default), list: await render(list.default) };
}

afterEach(() => {
  vi.doUnmock('@/data/product');
  vi.resetModules();
});

describe('both variants consume the same authorised dataset', () => {
  test('the fixture really exercises this — several benefits, and a star icon', () => {
    // Guards everything below. The star case is not incidental: it is the one
    // `ICONS` does not contain, so a fixture without it would leave the whole
    // reason benefit-items.ts exists untested while the suite looked green.
    expect(benefits.length).toBeGreaterThan(1);
    expect(benefits.some((b) => b.icon === 'star'), 'no star icon in the fixture').toBe(true);
  });

  test('the shared accessor returns product.benefits verbatim for either variant', () => {
    expect(benefitItems('icon-grid')).toEqual(benefits);
    expect(benefitItems('feature-list')).toEqual(benefits);
  });

  test.each(BOTH)('%s renders every title and every text, verbatim', async (_n, Component) => {
    const html = await render(Component);
    for (const b of benefits) {
      expect(html, `missing title "${b.title}"`).toContain(b.title);
      expect(html, `missing text for "${b.id}"`).toContain(b.text);
    }
  });

  test.each(BOTH)('%s invents no benefit and no claim of its own', async (_n, Component) => {
    const html = await render(Component);
    // Only the two shared framing strings are template copy; everything else
    // visible must come from @/data/product.
    const text = html.replace(/<[^>]+>/g, '\n');
    const sentences = text
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s.length > 12);
    const authorised = new Set<string>([
      BENEFITS_EYEBROW,
      BENEFITS_HEADING,
      ...benefits.map((b) => b.title),
      ...benefits.map((b) => b.text),
    ]);
    for (const s of sentences) {
      expect(authorised.has(s), `unauthorised copy rendered: "${s}"`).toBe(true);
    }
  });

  test('both variants frame the section identically — they cannot drift', async () => {
    for (const [name, Component] of BOTH) {
      const html = await render(Component);
      expect(html, `${name} eyebrow`).toContain(BENEFITS_EYEBROW);
      expect(html, `${name} heading`).toContain(BENEFITS_HEADING);
    }
  });

  test.each(BOTH)('%s hydrates nothing and touches no commerce', async (_n, Component) => {
    const html = await render(Component);
    expect(html, 'grew an island').not.toContain('astro-island');
    expect(html, 'grew a button').not.toMatch(/<button\b/);
    expect(html, 'grew a form').not.toMatch(/<form\b/);
    for (const forbidden of ['CartDrawer', 'add_to_cart', 'checkout', 'data-variant-id']) {
      expect(html, `referenced commerce (${forbidden})`).not.toContain(forbidden);
    }
  });
});

describe('icon resolution is shared, and fail-closed', () => {
  test('star resolves — the case ICONS deliberately does NOT contain', () => {
    // `ICONS` is Record<Exclude<IconName,'star'>,...>; the star glyph lives as
    // STAR_PATH so ui/Stars.astro and islands/parts/Stars.tsx can share it.
    // Both real catalogues use `icon: 'star'` for a benefit, so this is the
    // difference between a drawn glyph and a blank square in production.
    expect((ICONS as Record<string, unknown>).star, 'ICONS grew a star key').toBeUndefined();
    expect(benefitGlyph('star', 'icon-grid').path).toBe(STAR_PATH);
  });

  test('every other icon resolves to its ICONS entry, unmodified', () => {
    for (const [name, def] of Object.entries(ICONS)) {
      expect(benefitGlyph(name as never, 'icon-grid'), `${name} glyph`).toEqual(def);
    }
  });

  test('an unknown icon id THROWS — it never draws a placeholder', () => {
    // No existing dynamic lookup means no existing fallback to respect, so this
    // follows the house rule (index.astro, comparison-rows) and fails closed.
    expect(() => benefitGlyph('definitely-not-an-icon' as never, 'feature-list')).toThrow(
      /is not a glyph this template can draw/,
    );
    expect(() => benefitGlyph('definitely-not-an-icon' as never, 'feature-list')).toThrow(
      /variant "feature-list"/,
    );
  });

  test('BOTH variants draw the SAME glyph for the same benefit', async () => {
    const grid = await render(IconGrid);
    const list = await render(FeatureList);
    for (const b of benefits) {
      const path = benefitGlyph(b.icon, 'icon-grid').path;
      const re = new RegExp(escapeRe(path), 'g');
      expect(count(grid, re), `icon-grid glyph for ${b.id}`).toBe(1);
      expect(count(list, re), `feature-list glyph for ${b.id}`).toBe(1);
    }
  });

  test.each(BOTH)('%s emits no empty or undefined path', async (_n, Component) => {
    const html = await render(Component);
    expect(html).not.toContain('d="undefined"');
    expect(html).not.toContain('d=""');
    expect(count(html, /<path\b/g), 'one path per benefit').toBe(benefits.length);
  });
});

describe('the shared accessor is fail-closed for BOTH variants', () => {
  async function starved() {
    vi.resetModules();
    vi.doMock('@/data/product', () => ({ product: { ...product, benefits: [] } }));
    return (await import('./benefit-items')).benefitItems;
  }

  test('throws when benefits is empty, naming the variant composed', async () => {
    const items = await starved();
    expect(() => items('icon-grid')).toThrow(/`benefits` in src\/data\/product\.ts is empty/);
    expect(() => items('icon-grid')).toThrow(/variant "icon-grid"/);
    expect(() => items('feature-list')).toThrow(/variant "feature-list"/);
  });
});

describe('the two compositions are genuinely different', () => {
  test('a benefit is a CARD in the grid and a ROW in the list', async () => {
    const grid = await render(IconGrid);
    const list = await render(FeatureList);

    // grid: one <article> surface per benefit, with shadow. list: none.
    expect(count(grid, /<article\b/g), 'one card per benefit').toBe(benefits.length);
    expect(count(list, /<article\b/g), 'the list grew cards').toBe(0);
    expect(grid).toContain('rounded-card bg-surface');
    expect(grid).toContain('shadow-card');
    expect(list, 'the list grew a card surface').not.toContain('rounded-card bg-surface');
    expect(list, 'the list grew a shadow').not.toContain('shadow-card');
  });

  test('separation is a GAP between blocks vs a RULE between rows', async () => {
    const grid = await render(IconGrid);
    const list = await render(FeatureList);

    expect(grid).toContain('grid-cols-[repeat(auto-fit,minmax(15rem,1fr))]');
    expect(grid, 'the grid grew dividers').not.toContain('divide-y');

    expect(list).toContain('divide-y divide-graphite/10');
    expect(list, 'the list kept the card track list').not.toContain('minmax(15rem,1fr)');
  });

  test('the icon sits ABOVE the title in the grid and BESIDE it in the list', async () => {
    const grid = await render(IconGrid);
    const list = await render(FeatureList);

    // grid: a column, icon then title. list: a two-column row, rail then copy.
    expect(grid).toContain('flex h-full flex-col');
    expect(list).toContain('grid-cols-[auto_1fr]');
    expect(grid, 'the grid grew a row rail').not.toContain('grid-cols-[auto_1fr]');
    expect(list, 'the list stacked its icon').not.toContain('flex h-full flex-col');

    // …and the rails are visually different objects, not one restyled.
    expect(grid).toContain('rounded-tile bg-rust-tint');
    expect(list).toContain('rounded-full bg-graphite');
  });

  test('the list gives the copy real reading width; the grid does not', async () => {
    const list = await render(FeatureList);
    const grid = await render(IconGrid);
    expect(list).toContain('max-w-prose');
    expect(grid, 'the grid grew a prose measure').not.toContain('max-w-prose');
    expect(list).toContain('max-w-3xl');
  });

  test('feature-list is NOT icon-grid at one column', async () => {
    // The whole point of the pair. Same benefits, same glyphs — and a tag
    // sequence that is not a permutation of the other.
    const grid = await render(IconGrid);
    const list = await render(FeatureList);
    expect(grid).not.toBe(list);
    expect(tags(grid)).not.toEqual(tags(list));
    expect(tags(grid).sort()).not.toEqual(tags(list).sort());
  });

  test('both still expose one list item per benefit — same data, different unit', async () => {
    for (const [name, Component] of BOTH) {
      const html = await render(Component);
      expect(count(html, /<li\b/g), `${name} item count`).toBe(benefits.length);
      expect(count(html, /<h3\b/g), `${name} heading count`).toBe(benefits.length);
    }
  });
});

describe('item-count behaviour — 1, 2, 3, 4+', () => {
  const COUNTS = [1, 2, 3, 4, 6] as const;

  test.each(COUNTS)('%i benefit(s): both variants render exactly that many', async (n) => {
    const { grid, list } = await withBenefits(Math.min(n, benefits.length));
    const expected = Math.min(n, benefits.length);
    expect(count(grid, /<li\b/g), 'icon-grid').toBe(expected);
    expect(count(list, /<li\b/g), 'feature-list').toBe(expected);
  });

  test.each(COUNTS)('%i benefit(s): no empty item, no invented placeholder', async (n) => {
    const { grid, list } = await withBenefits(Math.min(n, benefits.length));
    const expected = Math.min(n, benefits.length);
    for (const [name, html] of [['icon-grid', grid], ['feature-list', list]] as const) {
      expect(html, `${name} empty <li>`).not.toMatch(/<li[^>]*><\/li>/);
      expect(html, `${name} undefined`).not.toContain('undefined');
      expect(html, `${name} NaN`).not.toContain('NaN');
      // Exactly one glyph and one heading per item — never a filler slot.
      expect(count(html, /<path\b/g), `${name} glyph count`).toBe(expected);
      expect(count(html, /<h3\b/g), `${name} heading count`).toBe(expected);
    }
  });

  test('NEITHER variant hardcodes the four the template happens to ship', async () => {
    // The trap this whole block exists for: a layout tuned to `lg:grid-cols-4`
    // looks perfect on the fixture and absurd on a product with one benefit.
    const one = await withBenefits(1);
    for (const [name, html] of [['icon-grid', one.grid], ['feature-list', one.list]] as const) {
      expect(html, `${name} kept a fixed 4-track grid`).not.toMatch(/grid-cols-4/);
      expect(html, `${name} kept a fixed 3-track grid`).not.toMatch(/grid-cols-3/);
      expect(html, `${name} kept a fixed 2-track grid`).not.toMatch(/grid-cols-2/);
    }
    // auto-fit is what lets ONE card occupy the full row instead of a quarter
    // of it beside three empty tracks.
    expect(one.grid).toContain('auto-fit');
  });

  test('no class in either source is keyed to an item count', async () => {
    const src = (n: string) =>
      readFileSync(fileURLToPath(new URL(`./${n}`, import.meta.url)), 'utf-8');
    for (const file of ['IconGrid.astro', 'FeatureList.astro']) {
      // `.length`-driven class selection is exactly how a variant starts
      // depending on "always exactly 3".
      expect(src(file), `${file} branches on item count`).not.toMatch(
        /(items|benefits)\.length\s*[=><!]/,
      );
    }
  });
});

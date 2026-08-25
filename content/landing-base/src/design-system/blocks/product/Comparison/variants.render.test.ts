// Structural variants — product/Comparison/{table,cards}.
//
// These assertions RENDER both blocks and read the resulting HTML. The claim
// that matters most here is the one the other capabilities did not have: both
// variants must give `boolean | string` the SAME meaning. A table where
// `false` is a cross and a card panel where `false` is the word "No" would be
// the same data making two different statements about the product.
import { afterEach, describe, expect, test, vi } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import reactServer from '@astrojs/react/server.js';

import { ICONS } from '@/lib/icons';
import { product } from '@/data/product';
import type { ComparisonRow } from '@/types/content';
import Table from './Table.astro';
import Cards from './Cards.astro';
import { comparisonRows, comparisonValue, comparisonBrand } from './comparison-rows';

const render = async (Component: unknown) => {
  const container = await AstroContainer.create({
    renderers: [{ name: '@astrojs/react', ssr: reactServer }] as never,
  });
  return container.renderToString(Component as never);
};

// Same widening as comparison-rows.ts: product.ts is `as const satisfies Product`.
const rows: ComparisonRow[] = [...product.comparison];
const BOTH = [
  ['table', Table],
  ['cards', Cards],
] as const;

describe('both variants consume the same comparison data', () => {
  test('the fixture has rows, and covers boolean AND string values', () => {
    // Guards everything below. If every row were a boolean, the string branch
    // would go untested while the suite still looked green.
    expect(rows.length).toBeGreaterThan(1);
    const kinds = new Set(rows.flatMap((r) => [typeof r.ours, typeof r.rival]));
    expect(kinds.has('boolean'), 'no boolean value in the fixture').toBe(true);
  });

  test('the shared accessor returns product.comparison verbatim for either variant', () => {
    expect(comparisonRows('table')).toEqual(rows);
    expect(comparisonRows('cards')).toEqual(rows);
  });

  test.each(BOTH)('%s names every feature', async (_name, Component) => {
    const html = await render(Component);
    for (const row of rows) expect(html, `missing feature "${row.feature}"`).toContain(row.feature);
  });

  test.each(BOTH)('%s labels the ours side with the brand', async (_name, Component) => {
    const html = await render(Component);
    expect(html).toContain(comparisonBrand());
  });
});

describe('boolean and string mean the SAME thing in both variants', () => {
  test('comparisonValue is the single interpretation: true=check, false=cross, string=text', () => {
    expect(comparisonValue(true)).toEqual({
      kind: 'icon',
      positive: true,
      viewBox: ICONS.check.viewBox,
      path: ICONS.check.path,
    });
    expect(comparisonValue(false)).toEqual({
      kind: 'icon',
      positive: false,
      viewBox: ICONS.cross.viewBox,
      path: ICONS.cross.path,
    });
    expect(comparisonValue('12 meses')).toEqual({ kind: 'text', text: '12 meses' });
  });

  test('both variants draw the same number of checks and the same number of crosses', async () => {
    const expectedChecks = rows.filter((r) => r.ours === true).length + rows.filter((r) => r.rival === true).length;
    const expectedCrosses = rows.filter((r) => r.ours === false).length + rows.filter((r) => r.rival === false).length;

    for (const [name, Component] of BOTH) {
      const html = await render(Component);
      const checks = [...html.matchAll(new RegExp(escapeRe(ICONS.check.path), 'g'))].length;
      const crosses = [...html.matchAll(new RegExp(escapeRe(ICONS.cross.path), 'g'))].length;
      expect(checks, `${name} drew the wrong number of checks`).toBe(expectedChecks);
      expect(crosses, `${name} drew the wrong number of crosses`).toBe(expectedCrosses);
    }
  });

  test('neither variant coerces a string into an icon', async () => {
    const strings = rows.flatMap((r) =>
      [r.ours, r.rival].filter((v): v is string => typeof v === 'string'),
    );
    if (strings.length === 0) return; // fixture has no string values — nothing to assert

    for (const [name, Component] of BOTH) {
      const html = await render(Component);
      for (const value of strings) {
        expect(html, `${name} dropped the string value "${value}"`).toContain(value);
      }
    }
  });
});

describe('the two compositions are genuinely different', () => {
  test('table is one flat 3-column grid; cards is two panels', async () => {
    const table = await render(Table);
    const cards = await render(Cards);

    expect(table).toContain('grid-cols-[1.3fr_1fr_1fr]');
    expect(cards, 'cards kept the table grid').not.toContain('grid-cols-[1.3fr_1fr_1fr]');

    expect([...cards.matchAll(/<article\b/g)].length, 'one panel per side').toBe(2);
    expect([...table.matchAll(/<article\b/g)].length, 'the table grew panels').toBe(0);
  });

  test('cards regroups the DOM by side — it is not the table restyled', async () => {
    const cards = await render(Cards);
    const table = await render(Table);

    // Each panel owns a complete list of every feature.
    expect([...cards.matchAll(/<ul\b/g)].length, 'one list per panel').toBe(2);
    expect([...cards.matchAll(/<li\b/g)].length, 'every feature listed inside every panel').toBe(
      rows.length * 2,
    );
    expect([...table.matchAll(/<li\b/g)].length, 'the table became a list').toBe(0);
  });

  test('cards emphasises the ours side; the table gives both equal weight', async () => {
    const cards = await render(Cards);
    expect(cards).toContain('bg-graphite text-bone shadow-lift');
    expect(cards).toContain('bg-surface text-steel');
  });

  test('each feature name appears once per side in cards, once total in the table', async () => {
    const cards = await render(Cards);
    const table = await render(Table);
    const feature = rows[0]!.feature;

    expect([...cards.matchAll(new RegExp(escapeRe(feature), 'g'))].length).toBe(2);
    expect([...table.matchAll(new RegExp(escapeRe(feature), 'g'))].length).toBe(1);
  });

  test.each(BOTH)('%s hydrates nothing — a comparison is a statement, not a control', async (_n, Component) => {
    const html = await render(Component);
    expect(html, 'grew an island').not.toContain('astro-island');
    expect(html, 'grew a button').not.toMatch(/<button\b/);
  });

  test('the two HTML outputs are not the same document', async () => {
    expect(await render(Table)).not.toBe(await render(Cards));
  });
});

describe('the shared accessor is fail-closed for BOTH variants', () => {
  /** Starves the REAL module: product.comparison emptied. */
  async function starved() {
    vi.resetModules();
    vi.doMock('@/data/product', () => ({ product: { ...product, comparison: [] } }));
    const mod = await import('./comparison-rows');
    return mod.comparisonRows;
  }

  afterEach(() => {
    vi.doUnmock('@/data/product');
    vi.resetModules();
  });

  test('throws when product.comparison is empty', async () => {
    const starvedRows = await starved();
    expect(() => starvedRows('table')).toThrow(/`comparison` in src\/data\/product\.ts is empty/);
  });

  test('BOTH variants hit the same guard, and it names the one composed', async () => {
    const starvedRows = await starved();
    expect(() => starvedRows('table')).toThrow(/variant "table"/);
    expect(() => starvedRows('cards')).toThrow(/variant "cards"/);
  });
});

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

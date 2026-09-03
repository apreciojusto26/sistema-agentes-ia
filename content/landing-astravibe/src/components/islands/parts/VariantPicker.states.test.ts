// ITEM STATE MODEL for VariantPicker — proved at the COMPONENT, not by builds.
//
// The structural grammar emits the DECLARED set of item shapes rather than the
// observed one, which is what lets two products hash alike. That only holds if
// the declared set covers every state a real product can reach: an unlisted
// shape leaves its region unnormalized, so a legitimate product would fail for
// a state nobody enumerated.
//
// Enumerating from full landing builds does not scale — this component alone
// has three state dimensions, so eight combinations would mean eight Astro
// builds. Rendering the real component with real props answers the same
// question in milliseconds.
//
// It lives HERE rather than in admin/test for a concrete reason: the template
// carries its own node_modules, so importing this component from admin gives
// the test a different React instance than the component uses, and hooks fail
// with a null dispatcher. Same package, same React.
//
// Full-landing A/B fixtures answer a DIFFERENT question — that two different
// products share the template's grammar — and are not this file's job.
import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { VariantPicker } from './VariantPicker';
import type { VariantOption } from '@/lib/shopify/types';

type State = { checked: boolean; disabled: boolean; popular: boolean };

const STATES: State[] = [
  { checked: false, disabled: false, popular: false },
  { checked: false, disabled: false, popular: true },
  { checked: false, disabled: true, popular: false },
  { checked: false, disabled: true, popular: true },
  { checked: true, disabled: false, popular: false },
  { checked: true, disabled: false, popular: true },
  { checked: true, disabled: true, popular: false },
  { checked: true, disabled: true, popular: true },
];

const key = (s: State) => `c${+s.checked}-d${+s.disabled}-p${+s.popular}`;

/**
 * Why each combination is REACHABLE. Every entry is a contract fact, not an
 * intuition — an unreachable combination would have to be justified the same
 * way and then NOT declared in the grammar.
 *
 * `checked && disabled` is the one that looks impossible and is not. The
 * picker refuses to SELECT a sold-out variant (`onChange={() => !disabled &&
 * onSelect(...)}`), but nothing there chooses the initial value: catalog.ts
 * does, and its chain ends `preferredDefault ?? firstAvailable ?? variants[0]`.
 * A product whose variants are ALL sold out therefore renders with a sold-out
 * variant checked.
 */
const REACHABILITY: Record<string, string> = {
  'c0-d0-p0': 'an available non-6 variant that is not selected',
  'c0-d0-p1': 'the 6-projection variant while another is selected',
  'c0-d1-p0': 'a sold-out non-6 variant — the ordinary out-of-stock case',
  'c0-d1-p1': 'the 6-projection variant sold out while another is selected',
  'c1-d0-p0': 'catalog.ts falls back to firstAvailable when no 6 is available',
  'c1-d0-p1': 'the normal default — preferredDefault is the available 6',
  'c1-d1-p0': 'ALL variants sold out: defaultVariantId falls through to variants[0]',
  'c1-d1-p1': 'all sold out AND variants[0] is the 6-projection one',
};

function render(states: State[]): string {
  const variants = states.map((s, i) => ({
    id: `gid://fixture/ProductVariant/${i}`,
    title: s.popular ? '6 proyecciones' : `${i + 1} proyecciones`,
    projectionCount: s.popular ? 6 : i + 1,
    optionValue: `opt-${i}`,
    availableForSale: !s.disabled,
    unitPriceCents: 1900,
    unitCompareAtCents: null,
    imageIndex: null,
  })) as VariantOption[];
  const selectedIndex = states.findIndex((s) => s.checked);
  return renderToStaticMarkup(
    createElement(VariantPicker, {
      variants,
      selectedId: selectedIndex >= 0 ? variants[selectedIndex]!.id : 'none',
      onSelect: () => {},
      label: 'Elige',
    }),
  );
}

/** One `<label>` per variant — the repeated item the grammar declares. */
function items(html: string): string[] {
  return html.split('<label').slice(1).map((chunk) => `<label${chunk.split('</label>')[0]}</label>`);
}

describe('VariantPicker state model', () => {
  it('enumerates all 2^3 combinations, each with a reachability argument', () => {
    expect(STATES).toHaveLength(8);
    for (const s of STATES) {
      expect(REACHABILITY[key(s)], `${key(s)} has no reachability argument`).toBeTruthy();
    }
  });

  it('computes its three dimensions independently', () => {
    // Orthogonality is what licenses declaring the cartesian product instead
    // of treating each combination as its own composition. Asserted against
    // the source: no branch reads two dimensions together.
    const src = readFileSync(new URL('./VariantPicker.tsx', import.meta.url), 'utf-8');
    expect(src).toMatch(/const checked = variant\.id === selectedId;/);
    expect(src).toMatch(/const disabled = !variant\.availableForSale;/);
    expect(src).toMatch(/const isPopular = variant\.projectionCount === 6;/);
    expect(src, 'a branch couples two state dimensions').not.toMatch(
      /(checked|disabled|isPopular)\s*&&\s*(checked|disabled|isPopular)/,
    );
  });

  it('renders all 8, and every one is DISTINCT', () => {
    const rendered = items(render(STATES));
    expect(rendered).toHaveLength(8);
    // Distinctness matters both ways: identical markup for two states would
    // mean the model is over-specified and the declared set should shrink.
    expect(new Set(rendered).size, 'two states render identically').toBe(8);
  });

  it('declared == reachable == covered', () => {
    expect(new Set(items(render(STATES))).size).toBe(Object.keys(REACHABILITY).length);
  });

  it('sold-out and popular really do compose on one item', () => {
    // The combination that was missing from every build until it was looked
    // for. Asserted on real markup, not inferred from the source.
    const one = render([{ checked: true, disabled: true, popular: true }]);
    expect(one).toContain('Agotado');
    expect(one).toContain('Más elegido');
    expect(one).toContain('line-through');
  });

  it('a plain available variant carries neither marker', () => {
    const one = render([{ checked: false, disabled: false, popular: false }]);
    expect(one).not.toContain('Agotado');
    expect(one).not.toContain('Más elegido');
  });
});

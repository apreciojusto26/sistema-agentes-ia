// REAL render coverage for the three Design System Fase 2 building blocks
// (architectural review blocker B1).
//
// These render the actual .astro components through Astro's own container API
// — no mock of the renderer, no stubbed component. That matters: the whole
// point of the Fase 2 vertical slice is to prove that a design prop reaches a
// component and changes what it emits. A test that mocked the renderer would
// delete exactly the thing under test.
//
// The blocks import no commerce module (verified: only @/components/ui/*,
// @/lib/icons and @/data/*), so unlike index.astro they render here without
// PUBLIC_SHOPIFY_* being configured.
import { describe, test, expect } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';

import ProductHeroSplit from './hero/ProductHero/Split.astro';
import FeaturedQuoteDefault from './social-proof/FeaturedQuote/Default.astro';
import ProductGuaranteeDefault from './conversion/ProductGuarantee/Default.astro';

const container = await AstroContainer.create();

const render = (Component: any, props: Record<string, unknown>) =>
  container.renderToString(Component, { props });

describe('ProductHero/split — align is a REAL rendering difference', () => {
  test('align="left" and align="center" emit different markup', async () => {
    const left = await render(ProductHeroSplit, { align: 'left' });
    const center = await render(ProductHeroSplit, { align: 'center' });

    expect(left).not.toBe(center);
    expect(left).toContain('text-left');
    expect(left).toContain('justify-start');
    expect(center).toContain('text-center');
    expect(center).toContain('justify-center');

    // Each variant emits ONLY its own classes — no leakage between values.
    expect(left).not.toContain('text-center');
    expect(center).not.toContain('text-left');
  });

  test('no interpolated class survives into the output', async () => {
    const out = await render(ProductHeroSplit, { align: 'center' });
    // A built class name would appear literally as `text-undefined` or leave
    // an empty class — both are the silent-fallback mode B2 guards against.
    expect(out).not.toContain('undefined');
    expect(out).not.toContain('class=""');
  });

  test('renders the shared shell primitives, not a commerce or shell element', async () => {
    const out = await render(ProductHeroSplit, { align: 'left' });
    expect(out).toContain('<section');
    for (const forbidden of ['CartDrawer', 'site-header', 'site-footer', 'sticky-bar']) {
      expect(out).not.toContain(forbidden);
    }
  });
});

describe('FeaturedQuote/default — tone is a REAL rendering difference', () => {
  test('tone="light" and tone="muted" emit different markup', async () => {
    const light = await render(FeaturedQuoteDefault, { tone: 'light' });
    const muted = await render(FeaturedQuoteDefault, { tone: 'muted' });

    expect(light).not.toBe(muted);
    expect(light).toContain('bg-surface');
    expect(muted).toContain('bg-bone-dim');
    expect(light).not.toContain('bg-bone-dim');
    expect(muted).not.toContain('bg-surface');
  });

  test('emits no undefined class for either tone', async () => {
    for (const tone of ['light', 'muted']) {
      const out = await render(FeaturedQuoteDefault, { tone });
      expect(out, `tone=${tone}`).not.toContain('undefined');
    }
  });
});

describe('ProductGuarantee/default — tone is a REAL rendering difference', () => {
  test('tone="gold" and tone="plain" emit different markup', async () => {
    const gold = await render(ProductGuaranteeDefault, { tone: 'gold' });
    const plain = await render(ProductGuaranteeDefault, { tone: 'plain' });

    expect(gold).not.toBe(plain);
    expect(gold).toContain('bg-gold-tint');
    expect(gold).toContain('text-gold');
    expect(plain).toContain('bg-bone');
    expect(plain).toContain('text-steel');
    expect(gold).not.toContain('bg-bone ');
  });

  test('does NOT replace the legacy guarantee — it renders its own markup', async () => {
    const out = await render(ProductGuaranteeDefault, { tone: 'gold' });
    // Shares the guarantee data, but is a distinct component: a generation
    // without --design still renders 12-guarantee.astro, never this one.
    expect(out).toContain('<section');
    expect(out).not.toContain('undefined');
  });
});

describe('every block defaults to a valid variant when no prop is supplied', () => {
  // The DesignSpec contract makes props optional, so a spec may omit them.
  // A missing prop must fall back to a declared enum value, never undefined.
  test.each([
    ['ProductHero/split', ProductHeroSplit],
    ['FeaturedQuote/default', FeaturedQuoteDefault],
    ['ProductGuarantee/default', ProductGuaranteeDefault],
  ])('%s renders with no props', async (_name, Component) => {
    const out = await render(Component, {});
    expect(out).toContain('<section');
    expect(out).not.toContain('undefined');
    expect(out).not.toContain('class=""');
  });
});

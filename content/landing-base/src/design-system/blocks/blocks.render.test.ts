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
import { describe, test, expect, vi } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';

// conversion/Guarantee reads merchant config through lib/policy.ts. A frozen
// merchant is mocked here so the tone evidence below is about PRESENTATION;
// the no-merchant case is its own test further down.
//
// vi.hoisted, not a plain const: vi.mock is hoisted above every other statement
// in the file, so a factory closing over a normal top-level binding throws
// "Cannot access before initialization".
//
// `commercialGuaranteeDays: null` on purpose — absent is the default state, and
// the optional guarantee line has its own case.
const MERCHANT = vi.hoisted(() => ({
  current: {
    legalName: 'Test Merchant',
    taxId: 'B00000000',
    address: 'Test address',
    contactEmail: 'test@merchant.invalid',
    country: 'Testland',
    returnsWindowDays: 14,
    carrierName: 'Test Carrier',
    shippingEtaLabel: 'Test eta',
    returnShippingPaidBy: 'customer' as const,
    dataControllerEmail: 'test@merchant.invalid',
    commercialGuaranteeDays: null as number | null,
  },
}));
vi.mock('@/data/merchant', () => ({ merchant: MERCHANT.current }));

import HeroSplit from './hero/Hero/Split.astro';
import HeroDefault from './hero/Hero/Default.astro';
import FeaturedTestimonialDefault from './social-proof/FeaturedTestimonial/Default.astro';
import GuaranteeDefault from './conversion/Guarantee/Default.astro';

const container = await AstroContainer.create();

const render = (Component: any, props: Record<string, unknown>) =>
  container.renderToString(Component, { props });

describe('Hero/split — align is a REAL rendering difference, NOT a variant', () => {
  // `align` deliberately did not become split-left / split-center. This block
  // is what makes that defensible: the two values must produce ONE composition
  // with a dial turned, which is a different claim from the A-vs-B structural
  // claim proven in blocks/hero/Hero/variants.render.test.ts.
  test('align="left" and align="center" emit different markup', async () => {
    const left = await render(HeroSplit, { align: 'left' });
    const center = await render(HeroSplit, { align: 'center' });

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
    const out = await render(HeroSplit, { align: 'center' });
    // A built class name would appear literally as `text-undefined` or leave
    // an empty class — both are the silent-fallback mode B2 guards against.
    expect(out).not.toContain('undefined');
    expect(out).not.toContain('class=""');
  });

  test('renders the shared shell primitives, not a commerce or shell element', async () => {
    const out = await render(HeroSplit, { align: 'left' });
    expect(out).toContain('<section');
    for (const forbidden of ['CartDrawer', 'site-header', 'site-footer', 'sticky-bar']) {
      expect(out).not.toContain(forbidden);
    }
  });
});

describe('FeaturedTestimonial/default — tone is a PROP, and this is the proof', () => {
  const TONES = ['plain', 'light', 'muted'] as const;

  // The INVERSE of the Hero evidence above. There, two prop values had to
  // produce visibly different markup to earn the `align` prop. Here the burden
  // runs the other way: `tone` earns its place as a prop only if the three
  // values are the SAME composition with a dial turned. If they were not, this
  // capability would owe the registry three variants, not one.
  //
  // socialProof/FeaturedQuote used to be that second capability. It is gone.
  const skeleton = (html: string) => (html.match(/<[a-z][a-z0-9-]*/gi) ?? []).join(' ');

  test('all three tones emit an IDENTICAL tag sequence', async () => {
    const skeletons = await Promise.all(
      TONES.map(async (tone) => skeleton(await render(FeaturedTestimonialDefault, { tone }))),
    );
    // THE EMPTY-RENDER TRAP, GUARDED FIRST. This block renders nothing at all
    // when no quote testimonial is selected — and three empty strings are also
    // "identical". Without this, a broken selector would turn the assertion
    // below into a green test that proves nothing.
    for (const s of skeletons) {
      expect(s.startsWith('<section'), `empty render: ${s}`).toBe(true);
      expect(s.split(' ').length, `suspiciously small render: ${s}`).toBeGreaterThan(4);
    }

    // Same tags, same order, same count — nesting included, because the
    // sequence of open tags encodes the tree for markup with no reordering.
    expect(new Set(skeletons).size, `tone changed the structure: ${skeletons.join(' | ')}`).toBe(1);
  });

  test('the ONLY thing tone moves is the class attribute', async () => {
    const stripped = await Promise.all(
      TONES.map(async (tone) =>
        (await render(FeaturedTestimonialDefault, { tone })).replace(/ class="[^"]*"/g, ''),
      ),
    );
    expect(new Set(stripped).size, 'tone changed something other than classes').toBe(1);
  });

  test('each tone still emits its own surface, with no leakage', async () => {
    const [plain, light, muted] = await Promise.all(
      TONES.map((tone) => render(FeaturedTestimonialDefault, { tone })),
    );

    // `plain` draws NO background. This is the whole reason it exists: the
    // legacy section had none, and neither of the other two could say so.
    expect(plain).not.toContain('bg-surface');
    expect(plain).not.toContain('bg-bone-dim');

    expect(light).toContain('bg-surface');
    expect(light).not.toContain('bg-bone-dim');
    expect(muted).toContain('bg-bone-dim');
    expect(muted).not.toContain('bg-surface');

    // …and they are genuinely three renders, not one aliased three ways.
    expect(new Set([plain, light, muted]).size).toBe(3);
  });

  test('emits no undefined class for any tone', async () => {
    for (const tone of TONES) {
      const out = await render(FeaturedTestimonialDefault, { tone });
      expect(out, `tone=${tone}`).not.toContain('undefined');
      expect(out, `tone=${tone}`).not.toContain('class=""');
    }
  });
});

describe('Guarantee/default — tone is a PROP, and this is the proof', () => {
  const TONES = ['gold', 'plain'] as const;

  // Same burden as FeaturedTestimonial above, and for the same reason: this
  // capability absorbed conversion/ProductGuarantee, so `tone` only keeps its
  // place as a prop while the two values stay ONE composition.
  const skeleton = (html: string) => (html.match(/<[a-z][a-z0-9-]*/gi) ?? []).join(' ');

  test('both tones emit an IDENTICAL tag sequence', async () => {
    const skeletons = await Promise.all(
      TONES.map(async (tone) => skeleton(await render(GuaranteeDefault, { tone }))),
    );
    // Empty-render trap first: two empty strings are also identical.
    for (const s of skeletons) {
      expect(s.startsWith('<section'), `empty render: ${s}`).toBe(true);
      expect(s.split(' ').length, `suspiciously small render: ${s}`).toBeGreaterThan(4);
    }
    expect(new Set(skeletons).size, `tone changed the structure: ${skeletons.join(' | ')}`).toBe(1);
  });

  test('the ONLY thing tone moves is the class attribute', async () => {
    const stripped = await Promise.all(
      TONES.map(async (tone) =>
        (await render(GuaranteeDefault, { tone })).replace(/ class="[^"]*"/g, ''),
      ),
    );
    expect(new Set(stripped).size, 'tone changed something other than classes').toBe(1);
  });

  test('every tone keeps the anchor, the crest and the SAME policy facts', async () => {
    // The parts that are NOT design. A tone that dropped the anchor would break
    // the footer link; one that changed a number would mean the dial had
    // reached the facts, which is the whole thing this phase separated.
    //
    // The old version of this test asserted the gold seal image. That asset is
    // deleted: public/sello-garantia.webp had "GARANTIA 30 DIAS" baked into its
    // pixels, so it contradicted any merchant whose window was not 30. The
    // crest is ICONS.shield now, labelled from the same fact as the heading.
    for (const tone of TONES) {
      const out = await render(GuaranteeDefault, { tone });
      expect(out.split('id="guarantee"').length - 1, `${tone}: anchor count`).toBe(1);
      expect(out, `${tone}: crest`).toContain('role="img"');
      expect(out, `${tone}: no baked-policy asset`).not.toContain('sello-garantia');
      expect(out, `${tone}: returns window`).toContain('Devoluciones durante 14 días');
      expect(out, `${tone}: return shipping`).toContain('corre a cargo del comprador');
      // Nothing calls the returns window a guarantee, and no unconfigured
      // guarantee appears.
      expect(out, `${tone}: invented guarantee`).not.toMatch(/Garantía de \d+ días/);
    }
  });

  test('each tone emits its own surface, with no leakage', async () => {
    // Awaited one at a time rather than destructured out of a Promise.all:
    // under noUncheckedIndexedAccess that destructure types both as possibly
    // undefined, and the `.split()` counts below are worth keeping typed.
    const gold = await render(GuaranteeDefault, { tone: 'gold' });
    const plain = await render(GuaranteeDefault, { tone: 'plain' });

    // Asserted on the COMPLETE literals the block actually emits, not on bare
    // tokens. A first pass here checked `not.toContain('text-steel')` for gold
    // and was false on real data: the body paragraph is `text-sm text-steel` in
    // BOTH tones, because it is not part of the dial at all.
    const SECTION_GOLD = '<section id="guarantee" class="bg-gold-tint py-12 md:py-16">';
    const SECTION_PLAIN = '<section id="guarantee" class="py-12 md:py-16 bg-bone">';
    const ICON_GOLD = 'class="mx-auto size-20 text-gold"';
    const ICON_PLAIN = 'class="mx-auto size-20 text-steel"';

    expect(gold).toContain(SECTION_GOLD);
    expect(gold).not.toContain(SECTION_PLAIN);
    expect(gold.split(ICON_GOLD).length - 1).toBe(1);
    expect(gold).not.toContain(ICON_PLAIN);

    expect(plain).toContain(SECTION_PLAIN);
    expect(plain).not.toContain(SECTION_GOLD);
    expect(plain.split(ICON_PLAIN).length - 1).toBe(1);
    expect(plain).not.toContain(ICON_GOLD);

    // `gold` is the LEGACY surface, so its heading carries no colour class at
    // all — global.css already applies text-graphite to body. ProductGuarantee
    // had added it; re-adding it would change the bytes of every legacy
    // generation, which is why the historical golden also pins this.
    expect(gold, 'gold heading regained a redundant colour class').toContain(
      '<h2 class="mt-4 text-display md:text-4xl">',
    );
    expect(gold).not.toContain('text-display md:text-4xl text-graphite"');

    expect(gold).not.toBe(plain);
  });

  test('emits no undefined class for either tone', async () => {
    for (const tone of TONES) {
      const out = await render(GuaranteeDefault, { tone });
      expect(out, `tone=${tone}`).not.toContain('undefined');
      expect(out, `tone=${tone}`).not.toContain('class=""');
    }
  });
});

describe('Guarantee renders policy facts, never invented ones', () => {
  test('an OPTIONAL commercial guarantee appears only when configured', async () => {
    // Absent is the default and means absent — never 30. The section says
    // nothing about a guarantee unless the merchant configured one.
    const without = await render(GuaranteeDefault, {});
    expect(without).not.toMatch(/Garantía de/);

    // vi.doMock, not a mutation of the hoisted object: the hoisted factory's
    // result is cached, so changing what it closes over does not survive a
    // resetModules. doMock re-registers the module for the next import.
    vi.resetModules();
    vi.doMock('@/data/merchant', () => ({
      merchant: { ...MERCHANT.current, commercialGuaranteeDays: 60 },
    }));
    const GuaranteeWith = (await import('./conversion/Guarantee/Default.astro')).default;
    const withGuarantee = await render(GuaranteeWith, {});
    vi.doUnmock('@/data/merchant');
    vi.resetModules();

    expect(withGuarantee).toContain('Garantía de 60 días');
    // …and it is stated ALONGSIDE the returns window, not instead of it.
    expect(withGuarantee).toContain('Devoluciones durante 14 días');
  });

  test('with NO merchant it renders NOTHING — preview never invents a policy', async () => {
    vi.resetModules();
    vi.doMock('@/data/merchant', () => ({ merchant: null }));
    const Preview = (await import('./conversion/Guarantee/Default.astro')).default;
    const out = await render(Preview, {});
    vi.doUnmock('@/data/merchant');
    vi.resetModules();

    expect(out.trim(), 'preview invented a guarantee section').toBe('');
    expect(out).not.toMatch(/\d+ días/);
  });
});

describe('every block defaults to a valid variant when no prop is supplied', () => {
  // The DesignSpec contract makes props optional, so a spec may omit them.
  // A missing prop must fall back to a declared enum value, never undefined.
  test.each([
    ['Hero/default', HeroDefault],
    ['Hero/split', HeroSplit],
    ['FeaturedTestimonial/default', FeaturedTestimonialDefault],
    ['Guarantee/default', GuaranteeDefault],
  ])('%s renders with no props', async (_name, Component) => {
    const out = await render(Component, {});
    expect(out).toContain('<section');
    expect(out).not.toContain('undefined');
    expect(out).not.toContain('class=""');
  });
});

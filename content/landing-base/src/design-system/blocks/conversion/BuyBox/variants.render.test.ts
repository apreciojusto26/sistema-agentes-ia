// Structural variants — conversion/BuyBox/{card,compact}.
//
// The riskiest conversion in this series, so it carries TWO separate proofs
// that must not be confused with each other:
//
//   1. COMPOSITION DIFFERS. Card and compact are different documents with
//      different DOM — and the difference that matters commercially is that
//      card renders product.benefits and compact does not.
//   2. THE TRANSACTION IS IDENTICAL. Both presentations reach the same
//      useBuyAction(), so the same state produces the same commercial decision
//      in both, across every state the CTA can be in.
//
// Byte-level preservation of the legacy composition is NOT this file's job —
// test-fixtures/legacy-markup/historical-markup.golden.test.ts owns it, against
// a BuyBox.html reference verified in a worktree at 4732910.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import reactServer from '@astrojs/react/server.js';

import { GOLDEN_DATA } from '@/design-system/test-fixtures/legacy-markup/golden-data';

vi.mock('@/lib/shopify/catalog', () => ({ getProductCommerce: async () => GOLDEN_DATA.commerce }));
vi.mock('@/data/product', () => ({ product: GOLDEN_DATA.product }));
vi.mock('@/stores/cart', async (orig) => {
  const actual = await orig<typeof import('@/stores/cart')>();
  return { ...actual, checkout: vi.fn(), syncCartLine: vi.fn() };
});
vi.mock('@/lib/analytics', async (orig) => {
  const actual = await orig<typeof import('@/lib/analytics')>();
  return { ...actual, trackEvent: vi.fn() };
});

import { $cart, $cartStatus } from '@/stores/cart';
import { $selectedPackId, $selectedVariantId } from '@/stores/checkout';
import Card from './Card.astro';
import Compact from './Compact.astro';
import { BundleSelector } from '@/components/islands/BundleSelector';
import { CompactBuySelector } from '@/components/islands/CompactBuySelector';

const P = GOLDEN_DATA.product;
const C = GOLDEN_DATA.commerce;
const V1 = C.variants[0]!.id;
const V2 = C.variants[1]!.id;

const renderAstro = async (Component: unknown) => {
  const container = await AstroContainer.create({
    renderers: [{ name: '@astrojs/react', ssr: reactServer }] as never,
  });
  return container.renderToString(Component as never);
};

const tags = (html: string) => [...html.matchAll(/<([a-zA-Z][\w-]*)\b/g)].map((m) => m[1]);
const count = (html: string, re: RegExp) => [...html.matchAll(re)].length;

// --- 1. composition -------------------------------------------------------

describe('card and compact are different compositions', () => {
  test('they are not the same document, and not the same tag sequence', async () => {
    const card = await renderAstro(Card);
    const compact = await renderAstro(Compact);
    expect(card).not.toBe(compact);
    expect(tags(card)).not.toEqual(tags(compact));
  });

  test('card wears a lifted card surface; compact wears rules and none', async () => {
    const card = await renderAstro(Card);
    const compact = await renderAstro(Compact);
    expect(card).toContain('rounded-card bg-surface p-5 shadow-lift');
    expect(compact, 'compact grew the card surface').not.toContain('rounded-card bg-surface p-5');
    expect(compact, 'compact grew a lift shadow on its container').toContain('border-y border-graphite/10');
  });

  test('THE POINT: card renders the benefit tiles, compact renders none', async () => {
    const card = await renderAstro(Card);
    const compact = await renderAstro(Compact);

    for (const b of P.benefits) {
      expect(card, `card lost benefit "${b.title}"`).toContain(b.title);
      expect(card, `card lost benefit text for ${b.id}`).toContain(b.text);
      expect(compact, `compact duplicated benefit "${b.title}"`).not.toContain(b.title);
      expect(compact, `compact duplicated benefit text for ${b.id}`).not.toContain(b.text);
    }
    expect(count(card, /rounded-tile bg-bone p-3/g), 'one tile per benefit').toBe(P.benefits.length);
    expect(count(compact, /rounded-tile bg-bone p-3/g)).toBe(0);
  });

  test('card carries the payment-logo block; compact condenses trust to one line', async () => {
    const card = await renderAstro(Card);
    const compact = await renderAstro(Compact);
    for (const logo of ['Visa', 'Mastercard', 'PayPal']) {
      expect(card).toContain(logo);
      expect(compact, `compact kept the ${logo} logo`).not.toContain(logo);
    }
    // Both still state shipping and guarantee — condensing is not dropping.
    for (const html of [card, compact]) {
      expect(html).toContain(P.shipping.etaLabel);
      expect(html).toContain(P.guarantee.title);
    }
  });

  test('the pack control is a stack of tiles vs a segmented row of pills', async () => {
    const card = await renderAstro(Card);
    const compact = await renderAstro(Compact);

    // card: bordered tiles in a column, each with a radio dot and a ribbon slot.
    expect(card).toContain('rounded-tile border-2 border-graphite/10');
    expect(count(card, /peer-checked:border-\[6px\]/g), 'one radio dot per pack').toBe(P.packs.length);

    // compact: pills in a wrapping row, no dot at all.
    expect(compact).toContain('rounded-pill border border-graphite/15');
    expect(count(compact, /peer-checked:border-\[6px\]/g), 'compact grew radio dots').toBe(0);
    expect(compact, 'compact kept the tile borders').not.toContain('rounded-tile border-2');

    // …but BOTH keep the same real controls — accessibility is not what varies.
    // Two radiogroups each (variants and packs), and one native radio per
    // option in both. Counting every radio in the document, not just the pack
    // ones: an earlier version of this expected P.packs.length and failed at 4,
    // because VariantPicker's pills are radios too. That was the assertion
    // being wrong, not the markup.
    for (const [name, html] of [['card', card], ['compact', compact]] as const) {
      expect(count(html, /role="radiogroup"/g), `${name} radiogroups`).toBe(2);
      expect(count(html, /type="radio"/g), `${name} radio inputs`).toBe(
        P.packs.length + C.variants.length,
      );
    }
  });

  test('both reuse the SAME shared primitives — neither restyles a copy', async () => {
    const card = await renderAstro(Card);
    const compact = await renderAstro(Compact);
    for (const [name, html] of [['card', card], ['compact', compact]] as const) {
      // PriceRow's price element.
      expect(html, `${name} lost PriceRow`).toContain('font-display text-3xl font-black tabular-nums');
      // VariantPicker's group, labelled from the same data.
      expect(html, `${name} lost VariantPicker`).toContain(`aria-label="${P.variantGroupLabel}"`);
      // Stars, with its own a11y intact.
      expect(html, `${name} lost the rating`).toContain(`${P.ratingAverage} de 5 estrellas`);
      // Exactly one island each.
      expect(count(html, /<astro-island/g), `${name} island count`).toBe(1);
    }
  });

  test('each variant mounts its OWN island — compact is not BundleSelector with a prop', async () => {
    // The taxonomy claim. A `presentation="compact"` prop branching the whole
    // DOM inside one island would be a variant wearing a prop's clothes.
    const card = await renderAstro(Card);
    const compact = await renderAstro(Compact);
    expect(card).toContain('BundleSelector');
    expect(card, 'card mounted the compact island').not.toContain('CompactBuySelector');
    expect(compact).toContain('CompactBuySelector');
    expect(compact, 'compact reused BundleSelector with a prop').not.toMatch(
      /component-export="BundleSelector"/,
    );
  });
});

// --- 2. commercial equality ------------------------------------------------

const CTA_COPY = { primary: P.cta.primary, checkout: P.cta.checkout, pending: P.cta.pending, soldOut: P.cta.soldOut };

const islandProps = (available: boolean) => ({
  commerce: available ? C : { ...C, variants: C.variants.map((v) => ({ ...v, availableForSale: false })), anyAvailable: false },
  packs: [...P.packs],
  bundleOfferActive: P.commerce.bundleOfferActive,
  variantGroupLabel: P.variantGroupLabel,
  cta: CTA_COPY,
  errors: P.errors,
  giftThresholdUnits: 2,
  giftLabel: 'Golden gift label',
});

/** The CTA as the buyer meets it: label, whether it is disabled, aria-busy. */
function ctaState(html: string) {
  const btn = [...html.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/g)].at(-1);
  if (!btn) throw new Error('no CTA rendered');
  const [tag, label] = [btn[0], btn[1]!.replace(/<[^>]+>/g, '').trim()];
  return {
    label,
    disabled: /(^|\s)disabled(=|\s|>)/.test(tag.split('>')[0]!),
    ariaBusy: /aria-busy="true"/.test(tag),
  };
}

const renderIsland = (Component: unknown, available = true) =>
  renderToStaticMarkup(createElement(Component as never, islandProps(available) as never));

function cartLine(variantId: string, quantity: number) {
  $cart.set({
    id: 'gid://shopify/Cart/golden',
    checkoutUrl: 'https://shop.example/checkout/golden',
    totalCents: 3980,
    discountCents: 0,
    line: { id: 'gid://shopify/CartLine/golden', variantId, quantity },
  } as never);
}

beforeEach(() => {
  $cart.set(null);
  $cartStatus.set('idle');
  $selectedVariantId.set(null);
  $selectedPackId.set(null);
});

afterEach(() => {
  vi.unstubAllEnvs();
  $cart.set(null);
  $cartStatus.set('idle');
  $selectedVariantId.set(null);
  $selectedPackId.set(null);
});

describe('the SAME state produces the SAME commercial decision in both', () => {
  const STATES: Array<[string, () => void]> = [
    ['available + unsynced', () => {}],
    ['available + synced', () => cartLine(V1, P.packs[0]!.units)],
    ['synced to another variant', () => cartLine(V2, P.packs[0]!.units)],
    ['synced at the wrong quantity', () => cartLine(V1, 99)],
    ['pending (creating)', () => $cartStatus.set('creating')],
    ['pending (updating)', () => $cartStatus.set('updating')],
    ['pending (restoring)', () => $cartStatus.set('restoring')],
    ['variant changed', () => $selectedVariantId.set(V2)],
    ['pack changed', () => $selectedPackId.set(P.packs[1]!.id)],
    ['cart error', () => { $cart.set(null); $cartStatus.set('idle'); }],
  ];

  test.each(STATES)('%s: identical CTA label, disabled and aria-busy', (_name, arrange) => {
    arrange();
    expect(ctaState(renderIsland(CompactBuySelector))).toEqual(ctaState(renderIsland(BundleSelector)));
  });

  test('sold out: identical in both, and disabled in both', () => {
    const card = ctaState(renderIsland(BundleSelector, false));
    const compact = ctaState(renderIsland(CompactBuySelector, false));
    expect(compact).toEqual(card);
    expect(card.label).toBe(P.cta.soldOut);
    expect(card.disabled).toBe(true);
  });

  test('both price the SAME pack at the SAME number', () => {
    // Not "both show a price" — the same price. A presentation that projected
    // its own pack pricing would diverge here on the first bundle.
    const price = (html: string) =>
      html.match(/font-display text-3xl font-black tabular-nums[^>]*>([^<]+)</)?.[1];
    expect(price(renderIsland(CompactBuySelector))).toBe(price(renderIsland(BundleSelector)));
  });

  test('a pack change moves BOTH to the same new price', () => {
    const price = (html: string) =>
      html.match(/font-display text-3xl font-black tabular-nums[^>]*>([^<]+)</)?.[1];
    const before = price(renderIsland(BundleSelector));
    $selectedPackId.set(P.packs[1]!.id);
    const afterCard = price(renderIsland(BundleSelector));
    const afterCompact = price(renderIsland(CompactBuySelector));
    expect(afterCard, 'the pack change did not move the price').not.toBe(before);
    expect(afterCompact).toBe(afterCard);
  });

  test('both select the SAME variant id, and follow a change together', () => {
    const selected = (html: string) => html.match(/aria-checked="true"[^>]*data-variant="([^"]*)"/)?.[1];
    // VariantPicker marks the checked pill; compare the whole picker block.
    const picker = (html: string) => html.match(/<div role="radiogroup" aria-label="[^"]*"[\s\S]*?<\/div>\s*<\/div>/)?.[0];
    expect(picker(renderIsland(CompactBuySelector))).toBe(picker(renderIsland(BundleSelector)));
    $selectedVariantId.set(V2);
    expect(picker(renderIsland(CompactBuySelector))).toBe(picker(renderIsland(BundleSelector)));
    void selected;
  });
});

describe('preview mode works in BOTH, with no fabricated commerce', () => {
  beforeEach(() => vi.stubEnv('PUBLIC_COMMERCE_MODE', 'preview'));

  const previewProps = { ...islandProps(true), commerce: { ...C, variants: [], defaultVariantId: '', anyAvailable: false } };
  const renderPreview = (Component: unknown) =>
    renderToStaticMarkup(createElement(Component as never, previewProps as never));

  test.each([['BundleSelector', BundleSelector], ['CompactBuySelector', CompactBuySelector]] as const)(
    '%s renders a disabled preview CTA and NO price',
    (_name, Component) => {
      const html = renderPreview(Component);
      expect(html).toContain('data-preview-cta="true"');
      expect(html).toMatch(/aria-disabled="true"/);
      // No monetary value at all — not 0, not a struck-out compare-at.
      expect(html).not.toMatch(/\d[.,]\d{2}\s*€|€\s*\d/);
      expect(html).not.toContain(V1);
    },
  );

  test('the two preview branches differ in markup but share the signal', () => {
    // Each presentation writes its own unavailable copy; neither invents a
    // selection, and both got there through the same `selection === null`.
    const a = renderPreview(BundleSelector);
    const b = renderPreview(CompactBuySelector);
    expect(a).not.toBe(b);
    for (const html of [a, b]) expect(html).toContain('Vista previa');
  });
});

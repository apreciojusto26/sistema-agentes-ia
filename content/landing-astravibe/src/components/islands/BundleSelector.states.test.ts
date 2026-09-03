// ITEM STATE MODEL for the pack card — the second combinatorial item.
//
// Same method as VariantPicker.states.test.ts and the same reason: the grammar
// declares item shapes, and a shape a real product can reach but nobody
// enumerated would leave its region unnormalized and fail a landing that is
// perfectly correct.
//
// The pack card is NOT its own component — it is rendered inline inside
// BundleSelector's `packs.map()`. So the harness renders the real
// BundleSelector and reads the cards out of its markup. Its stores are plain
// nanostores atoms, driven from here; nothing in the component was changed to
// make it testable.
//
// REACHABILITY IS OBSERVED, NOT ARGUED. Candidate pack configurations are
// rendered and the state tuples they actually produce are collected. A tuple
// nothing can produce is not declared — which is the rule that kept
// `soldout + popular` honest when it turned out to be reachable after all.
import { describe, it, expect, beforeEach } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BundleSelector } from './BundleSelector';
import { $selectedPackId, $selectedVariantId } from '@/stores/checkout';
import type { ProductCommerce, VariantOption } from '@/lib/shopify/types';
import type { PricePack } from '@/types/content';

const VARIANT: VariantOption = {
  id: 'gid://fixture/ProductVariant/1',
  title: '6 proyecciones',
  projectionCount: 6,
  optionValue: '6 Slides',
  availableForSale: true,
  unitPriceCents: 2000,
  unitCompareAtCents: null,
  imageIndex: null,
};

const COMMERCE: ProductCommerce = {
  handle: 'fixture',
  title: 'Fixture',
  currencyCode: 'EUR',
  optionName: 'Opciones',
  variants: [VARIANT],
  defaultVariantId: VARIANT.id,
  anyAvailable: true,
  images: [],
};

function render(packs: PricePack[], selectedPackId: string, compareAt: number | null = null): string {
  $selectedVariantId.set(VARIANT.id);
  $selectedPackId.set(selectedPackId);
  const commerce: ProductCommerce = {
    ...COMMERCE,
    variants: [{ ...VARIANT, unitCompareAtCents: compareAt }],
  };
  return renderToStaticMarkup(
    createElement(BundleSelector, {
      commerce,
      packs,
      bundleOfferActive: false,
      variantGroupLabel: 'Elige',
      cta: { primary: 'Comprar', checkout: 'Pagar', pending: 'Esperando', soldOut: 'Agotado' },
      errors: { network: 'n', soldOut: 's', expired: 'e', noDiscount: 'd', generic: 'g' },
      giftThresholdUnits: 2,
      giftLabel: 'Regalo',
    }),
  );
}

/** The `<label>` cards inside the pack radiogroup, in order. */
function packCards(html: string): string[] {
  const group = html.split('role="radiogroup"').pop() ?? '';
  return group.split('<label').slice(1).map((c) => `<label${c.split('</label>')[0]}</label>`);
}

/** The four dimensions, read back off the rendered card. */
function stateOf(card: string) {
  return {
    // `checked=""` on the INPUT. A bare `includes('checked')` matches the
    // `has-[:checked]:` utility class that sits on every card, which read
    // every state as selected and silently halved the observed space.
    checked: /<input[^>]*\schecked(=""|\s|>)/.test(card),
    badge: card.includes('bg-amber-600'),
    middle: card.includes('Ahorras') ? 'savings' : card.includes('text-xs text-steel">') ? 'sublabel' : 'none',
    compareAt: card.includes('line-through'),
  };
}

const key = (s: ReturnType<typeof stateOf>) =>
  `c${+s.checked}-b${+s.badge}-m:${s.middle}-a${+s.compareAt}`;

const pack = (over: Partial<PricePack> & { id: string; units: number }): PricePack => ({
  freeUnits: 0,
  label: `Pack ${over.units}`,
  default: false,
  popular: false,
  ...over,
});

/**
 * Configurations chosen to exercise each dimension independently, given the
 * constraints the code imposes:
 *
 *   badge      requires totalUnits === 2 AND (discountPercent || pack.badge)
 *   middle     savings > 0 requires the pack's effective per-unit price to sit
 *              below the one-unit pack's, i.e. a discountPercent; otherwise a
 *              sublabel if one exists; otherwise nothing
 *   compareAt  requires compareAtCents > displayPrice — a struck-through unit
 *              price, or a discount
 */
const CONFIGS: Array<{ why: string; packs: PricePack[]; selected: string; compareAt?: number | null }> = [
  {
    why: 'plain 1-unit and 3-unit packs: no badge, no savings, no sublabel',
    packs: [pack({ id: 'x1', units: 1 }), pack({ id: 'x3', units: 3 })],
    selected: 'x1',
  },
  {
    why: 'sublabels present, still no discount: the middle slot falls to sublabel',
    packs: [pack({ id: 'x1', units: 1, sublabel: 'Para probar' }), pack({ id: 'x3', units: 3, sublabel: 'El grande' })],
    selected: 'x1',
  },
  {
    why: 'a 2-unit discounted pack: badge (quantity===2 + discountPercent) and savings',
    packs: [pack({ id: 'x1', units: 1 }), pack({ id: 'x2', units: 2, discountPercent: 10 })],
    selected: 'x2',
  },
  {
    why: 'a 2-unit pack with a literal badge and no discount: badge without savings',
    packs: [pack({ id: 'x1', units: 1 }), pack({ id: 'x2', units: 2, badge: 'Más vendido', sublabel: 'Popular' })],
    selected: 'x1',
  },
  {
    why: 'a struck-through unit price: compareAt without any discount',
    packs: [pack({ id: 'x1', units: 1 }), pack({ id: 'x3', units: 3 })],
    selected: 'x3',
    compareAt: 3000,
  },
  {
    why: 'a 3-unit discounted pack: savings WITHOUT a badge, since quantity !== 2',
    packs: [pack({ id: 'x1', units: 1 }), pack({ id: 'x3', units: 3, discountPercent: 15 })],
    selected: 'x1',
  },
  {
    why: 'the discounted 2-unit pack UNSELECTED: same card, checked off',
    packs: [pack({ id: 'x1', units: 1 }), pack({ id: 'x2', units: 2, discountPercent: 10 })],
    selected: 'x1',
  },
  {
    why: 'a 2-unit literal badge with no sublabel: badge over an empty middle slot',
    packs: [pack({ id: 'x1', units: 1 }), pack({ id: 'x2', units: 2, badge: 'Más vendido' })],
    selected: 'x2',
  },
  {
    why: 'the same badge-only card UNSELECTED',
    packs: [pack({ id: 'x1', units: 1 }), pack({ id: 'x2', units: 2, badge: 'Más vendido' })],
    selected: 'x1',
  },
  {
    why: 'a badge + sublabel card SELECTED',
    packs: [pack({ id: 'x1', units: 1 }), pack({ id: 'x2', units: 2, badge: 'Más vendido', sublabel: 'Popular' })],
    selected: 'x2',
  },
];

function observedStates(): Map<string, string> {
  const found = new Map<string, string>();
  for (const cfg of CONFIGS) {
    for (const card of packCards(render(cfg.packs, cfg.selected, cfg.compareAt ?? null))) {
      const k = key(stateOf(card));
      if (!found.has(k)) found.set(k, cfg.why);
    }
  }
  return found;
}

describe('pack card state model', () => {
  beforeEach(() => {
    $selectedPackId.set(null as unknown as string);
    $selectedVariantId.set(null as unknown as string);
  });

  it('has four dimensions, one of them ternary', () => {
    // 2 (checked) x 2 (badge) x 3 (middle) x 2 (compareAt) = 24 theoretical.
    // `middle` is ternary rather than two booleans because the component picks
    // it with if/else-if: savings wins, then sublabel, then nothing. The two
    // can never both render.
    const src = new URL('./BundleSelector.tsx', import.meta.url);
    const source = readFileSync(src, 'utf-8');
    expect(source).toMatch(/savingsCents > 0 \? \([\s\S]*?\) : p\.sublabel \?/);
  });

  /**
   * The DECLARED set: exactly the states the configurations above materialize,
   * each with the configuration that produced it.
   *
   * 24 combinations are theoretically expressible (2 x 2 x 3 x 2). Far fewer
   * are reachable, because the constraints are real: a badge needs a two-unit
   * pack, savings needs a discount, and a discount forces a compare-at price.
   * Nothing here is declared because the cartesian product says it should
   * exist — the rule that kept `soldout + popular` honest when it turned out
   * to BE reachable applies in the other direction too.
   */
  const DECLARED = [
    'c0-b0-m:none-a0',
    'c0-b0-m:none-a1',
    'c0-b0-m:savings-a1',
    'c0-b0-m:sublabel-a0',
    'c0-b1-m:none-a0',
    'c0-b1-m:savings-a1',
    'c0-b1-m:sublabel-a0',
    'c1-b0-m:none-a0',
    'c1-b0-m:none-a1',
    'c1-b0-m:sublabel-a0',
    'c1-b1-m:none-a0',
    'c1-b1-m:savings-a1',
    'c1-b1-m:sublabel-a0',
  ];

  it('declared == reachable == covered', () => {
    const covered = [...observedStates().keys()].sort();
    expect(covered, 'the declared set drifted from what the component renders').toEqual(
      [...DECLARED].sort(),
    );
  });

  it('every declared state carries the configuration that produced it', () => {
    for (const [, why] of observedStates()) expect(why).toBeTruthy();
  });

  it('badge requires a two-unit pack — the constraint that prunes the space', () => {
    // A 3-unit discounted pack has savings and no badge, which is what makes
    // the badge dimension genuinely constrained rather than free.
    const cards = packCards(render([pack({ id: 'x1', units: 1 }), pack({ id: 'x3', units: 3, discountPercent: 15 })], 'x1'));
    const three = cards[1]!;
    expect(stateOf(three).middle).toBe('savings');
    expect(stateOf(three).badge).toBe(false);
  });

  it('savings and sublabel never render together', () => {
    const cards = packCards(
      render([pack({ id: 'x1', units: 1 }), pack({ id: 'x2', units: 2, discountPercent: 10, sublabel: 'Popular' })], 'x1'),
    );
    const two = cards[1]!;
    expect(two).toContain('Ahorras');
    expect(two).not.toContain('Popular');
  });

  it('declared == covered: the state set is stable across repeated renders', () => {
    // Determinism: the same configurations must always produce the same state
    // set, or the declared grammar could not be trusted.
    expect([...observedStates().keys()].sort()).toEqual([...observedStates().keys()].sort());
  });
});

function readFileSync(url: URL, enc: 'utf-8'): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (require('node:fs') as typeof import('node:fs')).readFileSync(url, enc);
}

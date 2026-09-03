// SHAPE EMITTER — tooling, not an assertion.
//
// The declarative grammar needs every REACHABLE item shape, and builds only
// materialize the states a given product happens to be in: the commerce
// fixture shows five of VariantPicker's eight. The component state models
// prove all eight are reachable, so the shapes for the other three have to
// come from the same place the proof does — the component itself.
//
// Runs only under EMIT_SHAPES=1 so it never costs anything in a normal run.
import { describe, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { writeFileSync } from 'node:fs';
import { VariantPicker } from './parts/VariantPicker';
import { BundleSelector } from './BundleSelector';
import { $selectedPackId, $selectedVariantId } from '@/stores/checkout';
import type { ProductCommerce, VariantOption } from '@/lib/shopify/types';
import type { PricePack } from '@/types/content';

const OUT = process.env.EMIT_SHAPES_OUT ?? '/tmp/fixed-shapes.json';

function variantMarkup(): string {
  const states = [0, 1, 2, 3, 4, 5, 6, 7].map((n) => ({
    checked: !!(n & 4),
    disabled: !!(n & 2),
    popular: !!(n & 1),
  }));
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
  const selected = states.findIndex((s) => s.checked);
  return renderToStaticMarkup(
    createElement(VariantPicker, {
      variants,
      selectedId: selected >= 0 ? variants[selected]!.id : 'none',
      onSelect: () => {},
      label: 'Elige',
    }),
  );
}

// The pack configurations are the same ones BundleSelector.states.test.ts
// proves reachable. They are repeated here rather than shared through a module
// because a shared file under src/ would ship into every generated landing —
// `.test.ts` is excluded from the template copy, a plain helper is not.
const PACK_VARIANT: VariantOption = {
  id: 'gid://fixture/ProductVariant/1',
  title: '6 proyecciones',
  projectionCount: 6,
  optionValue: '6 Slides',
  availableForSale: true,
  unitPriceCents: 2000,
  unitCompareAtCents: null,
  imageIndex: null,
};

const pk = (o: Partial<PricePack> & { id: string; units: number }): PricePack => ({
  freeUnits: 0, label: `Pack ${o.units}`, default: false, popular: false, ...o,
});

const PACK_CONFIGS: Array<{ packs: PricePack[]; selected: string; compareAt?: number }> = [
  { packs: [pk({ id: 'x1', units: 1 }), pk({ id: 'x3', units: 3 })], selected: 'x1' },
  { packs: [pk({ id: 'x1', units: 1, sublabel: 'Para probar' }), pk({ id: 'x3', units: 3, sublabel: 'El grande' })], selected: 'x1' },
  { packs: [pk({ id: 'x1', units: 1 }), pk({ id: 'x2', units: 2, discountPercent: 10 })], selected: 'x2' },
  { packs: [pk({ id: 'x1', units: 1 }), pk({ id: 'x2', units: 2, badge: 'Más vendido', sublabel: 'Popular' })], selected: 'x1' },
  { packs: [pk({ id: 'x1', units: 1 }), pk({ id: 'x3', units: 3 })], selected: 'x3', compareAt: 3000 },
  { packs: [pk({ id: 'x1', units: 1 }), pk({ id: 'x3', units: 3, discountPercent: 15 })], selected: 'x1' },
  { packs: [pk({ id: 'x1', units: 1 }), pk({ id: 'x2', units: 2, discountPercent: 10 })], selected: 'x1' },
  { packs: [pk({ id: 'x1', units: 1 }), pk({ id: 'x2', units: 2, badge: 'Más vendido' })], selected: 'x2' },
  { packs: [pk({ id: 'x1', units: 1 }), pk({ id: 'x2', units: 2, badge: 'Más vendido' })], selected: 'x1' },
  { packs: [pk({ id: 'x1', units: 1 }), pk({ id: 'x2', units: 2, badge: 'Más vendido', sublabel: 'Popular' })], selected: 'x2' },
];

function packMarkup(): string[] {
  return PACK_CONFIGS.map((cfg) => {
    $selectedVariantId.set(PACK_VARIANT.id);
    $selectedPackId.set(cfg.selected);
    const commerce: ProductCommerce = {
      handle: 'fixture', title: 'Fixture', currencyCode: 'EUR', optionName: 'Opciones',
      variants: [{ ...PACK_VARIANT, unitCompareAtCents: cfg.compareAt ?? null }],
      defaultVariantId: PACK_VARIANT.id, anyAvailable: true, images: [],
    };
    return renderToStaticMarkup(
      createElement(BundleSelector, {
        commerce, packs: cfg.packs, bundleOfferActive: false, variantGroupLabel: 'Elige',
        cta: { primary: 'Comprar', checkout: 'Pagar', pending: 'Esperando', soldOut: 'Agotado' },
        errors: { network: 'n', soldOut: 's', expired: 'e', noDiscount: 'd', generic: 'g' },
        giftThresholdUnits: 2, giftLabel: 'Regalo',
      }),
    );
  });
}

describe.runIf(process.env.EMIT_SHAPES === '1')('shape emitter', () => {
  it('writes the component-derived markup the grammar generator consumes', () => {
    writeFileSync(OUT, JSON.stringify({ variantPicker: variantMarkup(), bundleSelector: packMarkup() }, null, 2));
  });
});

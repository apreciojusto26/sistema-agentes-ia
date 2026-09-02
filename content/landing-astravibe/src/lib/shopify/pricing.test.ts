import { describe, expect, it } from 'vitest';
import { packDiscountBadge, projectPack } from '@/lib/shopify/pricing';
import { product } from '@/data/product';
import type { VariantOption } from '@/lib/shopify/types';
import type { PricePack } from '@/types/content';

const variant: VariantOption = {
  id: 'gid://shopify/ProductVariant/1',
  title: '24 proyecciones',
  projectionCount: 24,
  optionValue: '24 Slides',
  availableForSale: true,
  unitPriceCents: 999,
  unitCompareAtCents: null,
  imageIndex: null,
};

function pack(overrides: Partial<PricePack> = {}): PricePack {
  return {
    id: 'x2',
    units: 2,
    freeUnits: 0,
    label: 'Pack 2 unidades',
    ...overrides,
  };
}

describe('projectPack percentage discounts', () => {
  it('applies the configured percentage to the Shopify unit price and rounds the final total to cents', () => {
    const projection = projectPack({ ...variant, unitPriceCents: 995 }, pack({ discountPercent: 5 }), false);

    expect(projection.priceCents).toBe(1_891); // Math.round(995 * 2 * 0.95) = Math.round(1890.5)
    expect(projection.compareAtCents).toBe(1_990);
    expect(projection.savingsCents).toBe(99);
  });

  it('does not alter packs without a percentage discount', () => {
    expect(projectPack(variant, pack(), false).priceCents).toBe(1_998);
  });

  it('gives an active BXGY offer precedence to avoid stacking both discounts', () => {
    const bxgyPack = pack({ units: 2, freeUnits: 1, discountPercent: 5 });

    const active = projectPack(variant, bxgyPack, true);
    expect(active.priceCents).toBe(1_998);
    expect(active.paidUnits).toBe(2);
    expect(active.claimsFreeUnits).toBe(true);

    const inactive = projectPack(variant, bxgyPack, false);
    expect(inactive.priceCents).toBe(2_847); // Math.round(999 * 3 * 0.95)
    expect(inactive.paidUnits).toBe(3);
  });

  it('generates the exact badge copy from pack configuration', () => {
    const discountedPack = pack({ discountPercent: 5 });
    const projection = projectPack(variant, discountedPack, false);

    expect(packDiscountBadge(discountedPack, projection, null)).toBe('5% de descuento');
    expect(packDiscountBadge(discountedPack, projection, projection.priceCents)).toBe('5% de descuento');
    expect(packDiscountBadge(discountedPack, projection, projection.priceCents + 1)).toBeNull();
    expect(packDiscountBadge(pack(), projection, null)).toBeNull();
  });

  it('configures the real two-unit pack as the only 5% discounted pack', () => {
    const discountedPacks = product.packs.filter((item) => 'discountPercent' in item);

    expect(discountedPacks).toHaveLength(1);
    expect(discountedPacks[0]).toMatchObject({ units: 2, freeUnits: 0, discountPercent: 5 });
  });
});

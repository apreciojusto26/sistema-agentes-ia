// The policy layer is where facts become sentences, so this is where the
// sentence rules are pinned. Everything below is a pure function of merchant
// config — no rendering, no DOM.
import { describe, test, expect, vi } from 'vitest';

const BASE = {
  legalName: 'M',
  taxId: 'B0',
  address: 'A',
  contactEmail: 'm@test.invalid',
  country: 'C',
  returnsWindowDays: 14,
  carrierName: 'Carrier',
  shippingEtaLabel: 'Entrega en 3-5 días',
  returnShippingPaidBy: 'customer' as 'customer' | 'merchant',
  dataControllerEmail: 'm@test.invalid',
  commercialGuaranteeDays: null as number | null,
};

async function load(overrides: Partial<typeof BASE> | null) {
  vi.resetModules();
  vi.doMock('@/data/merchant', () => ({
    merchant: overrides === null ? null : { ...BASE, ...overrides },
  }));
  const mod = await import('./policy');
  vi.doUnmock('@/data/merchant');
  return mod;
}

describe('the returns window is NOT a guarantee', () => {
  // The distinction this whole phase exists to hold. One is how long you have
  // to send it back; the other is an additional promise the merchant may never
  // have made. The landing used to call the first one the second.
  test('the headline says "Devoluciones", never "Garantía"', async () => {
    const { policy, returnsHeadline } = await load({});
    const headline = returnsHeadline(policy!);
    expect(headline).toBe('Devoluciones durante 14 días');
    expect(headline).not.toMatch(/[Gg]arantía/);
  });

  test('an absent commercial guarantee yields NO line — absent is not 30', async () => {
    const { policy, commercialGuaranteeHeadline } = await load({ commercialGuaranteeDays: null });
    expect(policy!.commercialGuarantee).toBeNull();
    expect(commercialGuaranteeHeadline(policy!)).toBeNull();
  });

  test('a configured commercial guarantee is stated as its own promise', async () => {
    const { policy, commercialGuaranteeHeadline, returnsHeadline } = await load({
      commercialGuaranteeDays: 60,
    });
    expect(commercialGuaranteeHeadline(policy!)).toBe('Garantía de 60 días');
    // …and it does not overwrite the window. 60 and 14 coexist.
    expect(returnsHeadline(policy!)).toBe('Devoluciones durante 14 días');
  });
});

describe('who pays the return leg is stated, never implied', () => {
  // The page used to say nothing here, which reads as "free". It is a claim.
  test.each([
    ['customer', 'a cargo del comprador'],
    ['merchant', 'lo asumimos nosotros'],
  ] as const)('%s', async (payer, expected) => {
    const { policy, returnShippingLine } = await load({ returnShippingPaidBy: payer });
    expect(returnShippingLine(policy!)).toContain(expected);
  });
});

describe('no derived sentence invents a condition', () => {
  test('nothing claims free returns, full refunds or no questions asked', async () => {
    const { policy, returnsHeadline, returnShippingLine, policyFaq, policyTickerItems } =
      await load({ commercialGuaranteeDays: 60 });
    const all = [
      returnsHeadline(policy!),
      returnShippingLine(policy!),
      ...policyTickerItems(policy!),
      ...policyFaq(policy!).flatMap((f) => [f.question, f.answer]),
    ].join(' ');

    // Every one of these shipped in the generated copy this layer replaced,
    // and not one of them is backed by a field in merchant config.
    for (const claim of [
      /sin preguntas/i,
      /reembolso completo/i,
      /devoluci[óo]n gratuita/i,
      /env[íi]o gratis/i,
      /sin coste/i,
      /sin riesgo/i,
      /te devolvemos el dinero/i,
      /mismo medio de pago/i,
    ]) {
      expect(all, `derived copy asserts ${claim}`).not.toMatch(claim);
    }
  });
});

describe('preview has no policy at all', () => {
  test('no merchant means policy is null, not a default', async () => {
    const { policy } = await load(null);
    expect(policy).toBeNull();
  });
});

describe('the policy FAQ answers only what is configured', () => {
  test('returns and shipping always; guarantee only when configured', async () => {
    const { policy: withoutG, policyFaq } = await load({ commercialGuaranteeDays: null });
    expect(policyFaq(withoutG!).map((f) => f.id)).toEqual(['policy-returns', 'policy-shipping']);

    const { policy: withG, policyFaq: faqWith } = await load({ commercialGuaranteeDays: 60 });
    expect(faqWith(withG!).map((f) => f.id)).toEqual([
      'policy-returns',
      'policy-shipping',
      'policy-guarantee',
    ]);
  });

  test('every number in an answer comes from a field', async () => {
    const { policy, policyFaq } = await load({ returnsWindowDays: 21 });
    const answers = policyFaq(policy!).map((f) => f.answer).join(' ');
    expect(answers).toContain('21 días');
    // The old generated answer said "30 días" whatever the config said.
    expect(answers).not.toMatch(/\b30 días\b/);
  });
});

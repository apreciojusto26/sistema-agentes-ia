import { describe, expect, it, vi } from 'vitest';
import { buildOrderInput, settleCheckout, type SettlePorts } from '@/lib/sumup/settle';
import type { CartSnapshot } from '@/lib/shopify/types';
import type { CheckoutSession, SumUpCheckout } from '@/lib/sumup/types';

function session(overrides: Partial<CheckoutSession> = {}): CheckoutSession {
  return {
    cartId: 'gid://shopify/Cart/1',
    email: 'buyer@example.com',
    phone: '+34600123456',
    address: {
      firstName: 'Ana',
      lastName: 'García',
      address1: 'Calle Mayor 1',
      address2: '',
      city: 'Madrid',
      provinceCode: 'M',
      countryCode: 'ES',
      zip: '28001',
    },
    amountCents: 2000,
    ...overrides,
  };
}

function cart(overrides: Partial<CartSnapshot> = {}): CartSnapshot {
  return {
    id: 'gid://shopify/Cart/1',
    checkoutUrl: 'https://example.myshopify.com/cart/c/1',
    totalQuantity: 24,
    subtotalCents: 2000,
    totalCents: 2000,
    discountCents: 0,
    line: { id: 'gid://shopify/CartLine/1', variantId: 'gid://shopify/ProductVariant/1', quantity: 24 },
    ...overrides,
  };
}

function paidCheckout(overrides: Partial<SumUpCheckout> = {}): SumUpCheckout {
  return {
    id: 'sumup-checkout-id',
    checkout_reference: 'REF123',
    amount: 20,
    currency: 'EUR',
    merchant_code: 'MC1',
    status: 'PAID',
    date: '2026-08-03T00:00:00Z',
    transactions: [],
    ...overrides,
  };
}

describe('buildOrderInput — optional phone', () => {
  it('omits phone entirely when the buyer left it blank', () => {
    const input = buildOrderInput(session({ phone: '' }), cart(), 'REF123');
    const shippingAddress = input.shippingAddress as { phone?: string };

    // Shopify rejects '' where it accepts an omitted field — sending the
    // empty string fails orderCreate for every buyer who skips the field.
    expect(input.phone).toBeUndefined();
    expect(shippingAddress.phone).toBeUndefined();
  });

  it('keeps the phone on both order and shippingAddress when supplied', () => {
    const input = buildOrderInput(session({ phone: '+34600123456' }), cart(), 'REF123');
    const shippingAddress = input.shippingAddress as { phone?: string };

    expect(input.phone).toBe('+34600123456');
    expect(shippingAddress.phone).toBe('+34600123456');
  });
});

describe('buildOrderInput — task 7.3', () => {
  it('includes a fixed 21% VAT tax line extracted from the tax-inclusive total', () => {
    const input = buildOrderInput(session(), cart({ totalCents: 2000 }), 'REF123');
    const taxLines = input.taxLines as { title: string; rate: number; priceSet: { shopMoney: { amount: number } } }[];

    expect(taxLines).toHaveLength(1);
    expect(taxLines[0]!.rate).toBe(0.21);
    // 2000 cents gross, tax-inclusive 21% -> 2000*0.21/1.21 = 347.1... -> rounds to 347 cents -> 3.47
    expect(taxLines[0]!.priceSet.shopMoney.amount).toBeCloseTo(3.47, 2);
  });

  it('maps the BXGY cart discount to discountCode.itemFixedDiscountCode.amountSet', () => {
    const input = buildOrderInput(session(), cart({ totalCents: 1800, discountCents: 200 }), 'REF123');

    expect(input.discountCode).toEqual({
      itemFixedDiscountCode: {
        code: 'BUNDLE',
        amountSet: { shopMoney: { amount: 2, currencyCode: 'EUR' } },
      },
    });
  });

  it('omits discountCode entirely when the BXGY offer did not fire (discountCents === 0)', () => {
    const input = buildOrderInput(session(), cart({ discountCents: 0 }), 'REF123');
    expect(input.discountCode).toBeUndefined();
  });

  it('tags the order sumup-ref-{ref} and sets financialStatus PAID', () => {
    const input = buildOrderInput(session(), cart(), 'REF123');
    expect(input.tags).toEqual(['sumup-ref-REF123']);
    expect(input.financialStatus).toBe('PAID');
  });

  it('throws if the cart has no line — caller (settleCheckout) must guard first', () => {
    expect(() => buildOrderInput(session(), cart({ line: null }), 'REF123')).toThrow();
  });
});

describe('settleCheckout — total-equality guard (task 7.4)', () => {
  it('aborts and dead-letters on a mismatch — no order is written', async () => {
    const createOrder = vi.fn();
    const recordFailure = vi.fn().mockResolvedValue({ attempt: 1 });
    const alertOps = vi.fn().mockResolvedValue(undefined);

    const ports: SettlePorts = {
      acquireLock: async () => true,
      releaseLock: async () => {},
      getSession: async () => session({ amountCents: 2000 }),
      recordFailure,
      getCheckoutByRef: async () => paidCheckout({ amount: 21 }), // 2100 cents
      cartGet: async () => cart({ totalCents: 1900 }), // disagrees with both session (2000) and sumup (2100)
      findOrderByRef: async () => null,
      createOrder,
      alertOps,
      getOrderRecord: async () => null,
      putOrderRecord: vi.fn(),
    };

    const result = await settleCheckout('REF123', ports);

    expect(createOrder).not.toHaveBeenCalled();
    expect(ports.putOrderRecord).not.toHaveBeenCalled();
    expect(recordFailure).toHaveBeenCalledOnce();
    expect(alertOps).toHaveBeenCalledOnce();
    expect(result).toEqual({ status: 'retrying', attempt: 1 });
  });

  it('proceeds to createOrder when all three totals agree, and records the dedupe marker', async () => {
    const createOrder = vi.fn().mockResolvedValue({ id: 'gid://shopify/Order/1', name: '#1001' });
    const putOrderRecord = vi.fn().mockResolvedValue(undefined);

    const ports: SettlePorts = {
      acquireLock: async () => true,
      releaseLock: async () => {},
      getSession: async () => session({ amountCents: 2000 }),
      recordFailure: vi.fn(),
      getCheckoutByRef: async () => paidCheckout({ amount: 20 }),
      cartGet: async () => cart({ totalCents: 2000 }),
      findOrderByRef: async () => null,
      createOrder,
      alertOps: vi.fn(),
      getOrderRecord: async () => null,
      putOrderRecord,
    };

    const result = await settleCheckout('REF123', ports);

    expect(createOrder).toHaveBeenCalledOnce();
    expect(putOrderRecord).toHaveBeenCalledWith('REF123', { id: 'gid://shopify/Order/1', name: '#1001' });
    expect(result).toEqual({ status: 'paid', orderName: '#1001' });
  });
});

describe('settleCheckout — idempotency (task 7.5)', () => {
  it('two settle calls for the same paid checkout create exactly one order, even with a stale (lagging) tag-search index', async () => {
    let createdOrder: { id: string; name: string } | null = null;
    const createOrder = vi.fn(async () => {
      createdOrder = { id: 'gid://shopify/Order/1', name: '#1001' };
      return createdOrder;
    });

    const ports: SettlePorts = {
      acquireLock: async () => true,
      releaseLock: async () => {},
      getSession: async () => session(),
      recordFailure: vi.fn(),
      getCheckoutByRef: async () => paidCheckout(),
      cartGet: async () => cart(),
      // Simulates Shopify's eventually-consistent tag search NEVER catching
      // up within this test — if dedupe relied on this alone, the second
      // call would create a duplicate order. The KV order-record (below)
      // is what actually prevents it.
      findOrderByRef: async () => null,
      createOrder,
      alertOps: vi.fn(),
      getOrderRecord: async () => createdOrder, // strongly-consistent: sees what the first call just wrote
      putOrderRecord: vi.fn(),
    };

    const first = await settleCheckout('REF123', ports);
    const second = await settleCheckout('REF123', ports);

    expect(createOrder).toHaveBeenCalledOnce();
    expect(first).toEqual({ status: 'paid', orderName: '#1001' });
    expect(second).toEqual({ status: 'paid', orderName: '#1001' });
  });

  it('a held lock (concurrent in-flight settle) returns pending without touching any port', async () => {
    const createOrder = vi.fn();
    const ports: SettlePorts = {
      acquireLock: async () => false, // another call already holds it
      releaseLock: vi.fn(),
      getSession: vi.fn(),
      recordFailure: vi.fn(),
      getCheckoutByRef: vi.fn(),
      cartGet: vi.fn(),
      findOrderByRef: vi.fn(),
      createOrder,
      alertOps: vi.fn(),
      getOrderRecord: vi.fn(),
      putOrderRecord: vi.fn(),
    };

    const result = await settleCheckout('REF123', ports);

    expect(result).toEqual({ status: 'pending' });
    expect(createOrder).not.toHaveBeenCalled();
    expect(ports.getOrderRecord).not.toHaveBeenCalled();
  });
});

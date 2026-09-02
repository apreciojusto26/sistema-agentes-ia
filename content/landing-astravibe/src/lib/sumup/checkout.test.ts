import { beforeEach, describe, expect, it, vi } from 'vitest';

const { sumupMock } = vi.hoisted(() => ({ sumupMock: vi.fn() }));

vi.mock('@/lib/sumup/client', () => ({
  assertEnv: () => ({ apiKey: 'test-key', merchantCode: 'merchant-code' }),
  sumup: sumupMock,
}));

import {
  buildCheckoutRedirectUrl,
  centsToMajorAmount,
  createCheckout,
  majorAmountToCents,
  newRef,
} from '@/lib/sumup/checkout';

beforeEach(() => {
  sumupMock.mockReset();
});

describe('newRef', () => {
  it('produces a 22-char base64url string (16 random bytes, no padding)', () => {
    const ref = newRef();
    expect(ref).toHaveLength(22);
    expect(ref).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });

  it('produces distinct refs across calls', () => {
    const refs = new Set(Array.from({ length: 20 }, () => newRef()));
    expect(refs.size).toBe(20);
  });
});

describe('cents <-> major amount conversion', () => {
  it('round-trips integer cents', () => {
    expect(centsToMajorAmount(1990)).toBe(19.9);
    expect(majorAmountToCents(19.9)).toBe(1990);
  });

  it('avoids float drift on the inverse conversion', () => {
    // 19.9 * 100 is 1990.0000000000002 in raw JS float math — majorAmountToCents must round.
    expect(majorAmountToCents(centsToMajorAmount(1990))).toBe(1990);
  });
});

describe('SumUp checkout URLs', () => {
  it('builds an absolute confirmation URL that keeps the checkout ref', () => {
    expect(buildCheckoutRedirectUrl('https://shop.example', 'REF123')).toBe(
      'https://shop.example/checkout/gracias?ref=REF123',
    );
  });

  it('encodes the ref instead of allowing it to alter the redirect destination', () => {
    const redirectUrl = buildCheckoutRedirectUrl('https://shop.example', 'REF&next=https://evil.example');

    expect(redirectUrl).toBe(
      'https://shop.example/checkout/gracias?ref=REF%26next%3Dhttps%3A%2F%2Fevil.example',
    );
    expect(new URL(redirectUrl).origin).toBe('https://shop.example');
  });
});

describe('createCheckout', () => {
  it('sends both the webhook return_url and the browser redirect_url', async () => {
    sumupMock.mockResolvedValue({ id: 'sumup-checkout-id' });

    await createCheckout({
      ref: 'REF123',
      amountCents: 1990,
      webhookUrl: 'https://shop.example/api/sumup/webhook',
      redirectUrl: 'https://shop.example/checkout/gracias?ref=REF123',
    });

    expect(sumupMock).toHaveBeenCalledWith('/v0.1/checkouts', {
      method: 'POST',
      body: JSON.stringify({
        checkout_reference: 'REF123',
        amount: 19.9,
        currency: 'EUR',
        merchant_code: 'merchant-code',
        return_url: 'https://shop.example/api/sumup/webhook',
        redirect_url: 'https://shop.example/checkout/gracias?ref=REF123',
      }),
    });
  });
});

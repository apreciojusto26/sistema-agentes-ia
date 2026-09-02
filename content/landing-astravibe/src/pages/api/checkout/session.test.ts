import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  env: {} as Record<string, string | undefined>,
  createCheckout: vi.fn(),
  putSession: vi.fn(),
  cartGet: vi.fn(),
  cookieSet: vi.fn(),
}));

vi.mock('astro:env/server', () => ({
  getSecret: (key: string) => mocks.env[key],
}));

vi.mock('@/lib/kv', () => ({ putSession: mocks.putSession }));
vi.mock('@/lib/shopify/cart', () => ({ cartGet: mocks.cartGet }));
vi.mock('@/lib/sumup/checkout', () => ({
  buildCheckoutRedirectUrl: (origin: string, ref: string) => {
    const url = new URL('/checkout/gracias', origin);
    url.searchParams.set('ref', ref);
    return url.toString();
  },
  createCheckout: mocks.createCheckout,
  newRef: () => 'REF123',
}));

import { POST } from '@/pages/api/checkout/session';

const validBody = {
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
};

function callSession(requestUrl = 'https://attacker.example/api/checkout/session') {
  return POST({
    request: new Request(requestUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validBody),
    }),
    url: new URL(requestUrl),
    cookies: { set: mocks.cookieSet },
  } as never);
}

beforeEach(() => {
  mocks.env = {};
  mocks.createCheckout.mockReset().mockResolvedValue({ id: 'sumup-checkout-id' });
  mocks.putSession.mockReset().mockResolvedValue(undefined);
  mocks.cartGet.mockReset().mockResolvedValue({
    id: 'gid://shopify/Cart/1',
    line: { id: 'gid://shopify/CartLine/1' },
    totalCents: 1990,
  });
  mocks.cookieSet.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('POST /api/checkout/session canonical payment URLs', () => {
  it('ignores a malicious request host and wires both SumUp URLs to SITE_URL', async () => {
    mocks.env.SITE_URL = 'https://shop.example';

    const response = await callSession();

    expect(response.status).toBe(200);
    expect(mocks.createCheckout).toHaveBeenCalledWith({
      ref: 'REF123',
      amountCents: 1990,
      webhookUrl: 'https://shop.example/api/sumup/webhook',
      redirectUrl: 'https://shop.example/checkout/gracias?ref=REF123',
    });
  });

  it.each([
    'https://shop.example/checkout?next=https://evil.example',
    'https://127.0.0.2',
    'https://[::ffff:127.0.0.1]',
    'https://localhost.',
  ])('rejects unsafe production SITE_URL %s before any checkout side effect', async (siteUrl) => {
    mocks.env.SITE_URL = siteUrl;
    vi.stubEnv('DEV', false);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await callSession();

    expect(response.status).toBe(500);
    expect(mocks.cartGet).not.toHaveBeenCalled();
    expect(mocks.putSession).not.toHaveBeenCalled();
    expect(mocks.createCheckout).not.toHaveBeenCalled();
    expect(mocks.cookieSet).not.toHaveBeenCalled();
  });
});

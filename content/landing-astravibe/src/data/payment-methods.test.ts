import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PAYMENT_METHOD_SLUGS } from '@/data/payment-methods';

describe('payment methods shown in the buy box', () => {
  it('shows only the methods approved for the storefront', () => {
    expect(PAYMENT_METHOD_SLUGS).toEqual(['visa', 'mastercard', 'applepay', 'googlepay']);
  });

  it('does not advertise PayPal or Shop Pay', () => {
    expect(PAYMENT_METHOD_SLUGS).not.toContain('paypal');
    expect(PAYMENT_METHOD_SLUGS).not.toContain('shoppay');
  });

  it('does not ship unused PayPal or Shop Pay logo assets', () => {
    expect(existsSync(resolve(process.cwd(), 'public/img/payment/paypal.svg'))).toBe(false);
    expect(existsSync(resolve(process.cwd(), 'public/img/payment/shoppay.svg'))).toBe(false);
  });
});

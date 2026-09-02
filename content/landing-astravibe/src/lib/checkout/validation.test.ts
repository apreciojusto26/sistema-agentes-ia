import { describe, expect, it } from 'vitest';
import { isValidEmail, isValidPhone, validateCheckoutForm, type CheckoutFormData } from '@/lib/checkout/validation';

function completeForm(): CheckoutFormData {
  return {
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
}

describe('isValidEmail', () => {
  it('accepts a well-formed email', () => {
    expect(isValidEmail('buyer@example.com')).toBe(true);
  });

  it('rejects missing @ or domain', () => {
    expect(isValidEmail('not-an-email')).toBe(false);
    expect(isValidEmail('buyer@')).toBe(false);
  });
});

describe('isValidPhone', () => {
  it('accepts E.164-ish numbers with or without a leading +', () => {
    expect(isValidPhone('+34600123456')).toBe(true);
    expect(isValidPhone('600123456')).toBe(true);
  });

  it('rejects too-short or non-numeric input', () => {
    expect(isValidPhone('123')).toBe(false);
    expect(isValidPhone('not-a-phone')).toBe(false);
  });
});

describe('validateCheckoutForm — spec scenario: complete form enables payment', () => {
  it('passes with a fully valid form', () => {
    const result = validateCheckoutForm(completeForm());
    expect(result.valid).toBe(true);
  });
});

describe('validateCheckoutForm — phone is optional', () => {
  it('passes when phone is blank', () => {
    const form = completeForm();
    form.phone = '';

    expect(validateCheckoutForm(form).valid).toBe(true);
  });

  it('still rejects a malformed phone when one is supplied', () => {
    const form = completeForm();
    form.phone = 'not-a-phone';

    const result = validateCheckoutForm(form);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.phone).toBeDefined();
    }
  });
});

describe('validateCheckoutForm — spec scenario: missing required field blocks payment', () => {
  it('fails when city is empty', () => {
    const form = completeForm();
    form.address.city = '';

    const result = validateCheckoutForm(form);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors['address.city']).toBeDefined();
    }
  });

  it('fails when email is missing/invalid', () => {
    const form = completeForm();
    form.email = '';

    const result = validateCheckoutForm(form);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.email).toBeDefined();
    }
  });

  it('does not require address2 or provinceCode (optional fields)', () => {
    const form = completeForm();
    form.address.address2 = '';
    form.address.provinceCode = '';

    const result = validateCheckoutForm(form);

    expect(result.valid).toBe(true);
  });
});

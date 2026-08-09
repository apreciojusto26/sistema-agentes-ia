import { describe, expect, it } from 'vitest';
import { centsToMajorAmount, majorAmountToCents, newRef } from '@/lib/sumup/checkout';

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

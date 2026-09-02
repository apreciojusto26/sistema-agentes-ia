import { describe, expect, it } from 'vitest';
import { parseProjectionCount, toCustomerTitle } from '@/lib/shopify/catalog';

describe('parseProjectionCount', () => {
  it('reads the count from the supplier titles this product actually ships', () => {
    expect(parseProjectionCount('1 Random Slides')).toBe(1);
    expect(parseProjectionCount('6 Slides')).toBe(6);
    expect(parseProjectionCount('24 Slides')).toBe(24);
  });

  it('tolerates padding and casing', () => {
    expect(parseProjectionCount('  24 slides  ')).toBe(24);
  });

  it('returns null for a variant that is not a projection count', () => {
    expect(parseProjectionCount('Nightlight')).toBeNull();
    expect(parseProjectionCount('')).toBeNull();
  });
});

describe('toCustomerTitle', () => {
  it('renders customer language instead of supplier language', () => {
    expect(toCustomerTitle('6 Slides', 6)).toBe('6 proyecciones');
    expect(toCustomerTitle('24 Slides', 24)).toBe('24 proyecciones');
  });

  it('keeps the singular for the one-film variant', () => {
    expect(toCustomerTitle('1 Random Slides', 1)).toBe('1 proyección');
  });

  it('falls back to the original title when there is no count to speak of', () => {
    expect(toCustomerTitle('Nightlight', null)).toBe('Nightlight');
  });
});

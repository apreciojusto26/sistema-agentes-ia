import { describe, expect, test } from 'vitest';
import { ANONYMOUS_REVIEWER, isMaskedReviewer, reviewerDisplayName } from './reviewer-identity';

describe('readable authors are preserved verbatim', () => {
  test.each([
    'María García',
    'Juan',
    'J. Ruiz',
    'Ana-Sofía',
    "O'Brien",
    'Jean-Luc Picard',
    '李明',
    'Ünal Öztürk',
  ])('%s survives untouched', (name) => {
    expect(reviewerDisplayName(name)).toBe(name);
    expect(isMaskedReviewer(name)).toBe(false);
  });

  test('surrounding whitespace is trimmed but the name is not otherwise altered', () => {
    expect(reviewerDisplayName('  María García  ')).toBe('María García');
  });
});

describe('masked or absent authors become Cliente', () => {
  test.each([
    ['Y***t', 'the real shape seen in a generated landing'],
    ['A***n', 'same shape, different letters'],
    ['****', 'fully masked'],
    ['***', 'fully masked, odd length'],
    ['', 'empty'],
    ['   ', 'whitespace only'],
    ['M***', 'leading initial only'],
    ['***z', 'trailing initial only'],
    ['1234', 'digits, no letters'],
    ['--', 'punctuation leftovers'],
  ])('%s -> Cliente (%s)', (raw) => {
    expect(reviewerDisplayName(raw)).toBe(ANONYMOUS_REVIEWER);
    expect(isMaskedReviewer(raw)).toBe(true);
  });

  test.each([null, undefined])('%s -> Cliente', (raw) => {
    expect(reviewerDisplayName(raw as never)).toBe(ANONYMOUS_REVIEWER);
  });
});

describe('it does NOT over-anonymise', () => {
  test('a name is never replaced just for having punctuation or accents', () => {
    // The failure mode on the other side: a rule tuned to catch `Y***t` that
    // also eats "J. Ruiz" would erase real people to hide a formatting bug.
    for (const name of ['J. Ruiz', 'Ana-Sofía', "O'Brien", 'Mª Carmen']) {
      expect(reviewerDisplayName(name), `${name} was anonymised`).toBe(name);
    }
  });

  test('the fallback makes NO verification claim', () => {
    // "Cliente verificado" would be the same fabricated trust badge this phase
    // removed, reintroduced through the back door.
    expect(ANONYMOUS_REVIEWER).toBe('Cliente');
    expect(ANONYMOUS_REVIEWER.toLowerCase()).not.toContain('verific');
  });
});

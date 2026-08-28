import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  CONSENT_STORAGE_KEY, readConsent, writeConsent, consentState, analyticsAllowed,
} from './consent';

/** Minimal localStorage stand-in — the node env has none. */
function installStorage(initial: Record<string, string> = {}, throwing = false) {
  const map = new Map(Object.entries(initial));
  const store = {
    getItem: (k: string) => { if (throwing) throw new Error('denied'); return map.get(k) ?? null; },
    setItem: (k: string, v: string) => { if (throwing) throw new Error('denied'); map.set(k, v); },
    removeItem: (k: string) => map.delete(k),
  };
  vi.stubGlobal('window', { localStorage: store });
  return map;
}

afterEach(() => vi.unstubAllGlobals());

describe('three states, not two', () => {
  test('nothing stored -> unknown', () => {
    installStorage();
    expect(readConsent()).toBe('unknown');
    expect(analyticsAllowed()).toBe(false);
  });

  test('rejected is DISTINCT from unknown', () => {
    // Collapsing them would re-prompt someone who already said no.
    installStorage();
    writeConsent('rejected');
    expect(readConsent()).toBe('rejected');
    expect(analyticsAllowed()).toBe(false);
  });

  test('accepted', () => {
    installStorage();
    writeConsent('accepted');
    expect(readConsent()).toBe('accepted');
    expect(analyticsAllowed()).toBe(true);
  });

  test('necessary is always true and analytics tracks the decision', () => {
    expect(consentState('accepted')).toEqual({ necessary: true, analytics: true });
    expect(consentState('rejected')).toEqual({ necessary: true, analytics: false });
    expect(consentState('unknown')).toEqual({ necessary: true, analytics: false });
  });
});

describe('persistence', () => {
  test('the key is neutral — not the product brand, not the generator', () => {
    // astravibe:cartId and astravibe:offerEndsAt hardcode the star projector's
    // brand into every landing this system generates. This one does not
    // inherit that, and does not leak the generator's name either.
    expect(CONSENT_STORAGE_KEY).toBe('consent:v1');
    expect(CONSENT_STORAGE_KEY).not.toMatch(/astravibe|bamzuk|cortto/i);
  });

  test('what is written is what is read back', () => {
    const map = installStorage();
    writeConsent('accepted');
    expect(JSON.parse(map.get(CONSENT_STORAGE_KEY)!)).toEqual({ necessary: true, analytics: true });
  });

  test('storage that throws is treated as unknown — never as consent', () => {
    installStorage({}, true);
    expect(readConsent()).toBe('unknown');
    expect(analyticsAllowed()).toBe(false);
    expect(writeConsent('accepted')).toBe(false);
  });

  test('a corrupted value is unknown, not accepted', () => {
    installStorage({ [CONSENT_STORAGE_KEY]: 'not json' });
    expect(readConsent()).toBe('unknown');
  });

  test('server-side rendering never claims consent', () => {
    vi.stubGlobal('window', undefined);
    expect(readConsent()).toBe('unknown');
    expect(analyticsAllowed()).toBe(false);
  });
});

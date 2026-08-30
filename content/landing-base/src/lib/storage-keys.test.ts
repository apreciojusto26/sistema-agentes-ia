import { describe, expect, test } from 'vitest';
import {
  STORAGE_KEYS, LEGACY_STORAGE_KEYS, readMigrating, writeMigrating, clearMigrating,
} from './storage-keys';

function storage(initial: Record<string, string> = {}, throwing = false) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (k: string) => { if (throwing) throw new Error('denied'); return map.get(k) ?? null; },
    setItem: (k: string, v: string) => { if (throwing) throw new Error('denied'); map.set(k, v); },
    removeItem: (k: string) => { if (throwing) throw new Error('denied'); map.delete(k); },
  };
}

describe('the keys carry PURPOSE, not identity', () => {
  test('no product, brand, generator or merchant name', () => {
    for (const key of Object.values(STORAGE_KEYS)) {
      expect(key, `${key} leaks an identity`).not.toMatch(/astravibe|nubecalma|bamzuk|cortto|ilepo/i);
    }
    expect(STORAGE_KEYS.cartId).toBe('commerce:cartId');
    expect(STORAGE_KEYS.offerEndsAt).toBe('offer:endsAt');
  });

  test('the legacy names are recorded exactly, for migration only', () => {
    expect(LEGACY_STORAGE_KEYS.cartId).toBe('astravibe:cartId');
    expect(LEGACY_STORAGE_KEYS.offerEndsAt).toBe('astravibe:offerEndsAt');
  });
});

describe('a clean install uses only the new keys', () => {
  test('write touches the new key and nothing else', () => {
    const s = storage();
    writeMigrating(s, STORAGE_KEYS.cartId, LEGACY_STORAGE_KEYS.cartId, 'gid://cart/1');
    expect([...s.map.keys()]).toEqual([STORAGE_KEYS.cartId]);
  });

  test('read of an empty store is null, not a legacy probe artefact', () => {
    const s = storage();
    expect(readMigrating(s, STORAGE_KEYS.cartId, LEGACY_STORAGE_KEYS.cartId)).toBeNull();
    expect([...s.map.keys()]).toEqual([]);
  });
});

describe('a returning visitor is migrated, once', () => {
  test('legacy cart id is read, moved to the new key, and the old one deleted', () => {
    const s = storage({ [LEGACY_STORAGE_KEYS.cartId]: 'gid://cart/legacy' });
    const value = readMigrating(s, STORAGE_KEYS.cartId, LEGACY_STORAGE_KEYS.cartId);
    expect(value, 'the cart was silently lost').toBe('gid://cart/legacy');
    expect(s.map.get(STORAGE_KEYS.cartId)).toBe('gid://cart/legacy');
    expect(s.map.has(LEGACY_STORAGE_KEYS.cartId), 'legacy key survived').toBe(false);
  });

  test('legacy offer deadline migrates the same way', () => {
    const s = storage({ [LEGACY_STORAGE_KEYS.offerEndsAt]: '1790000000000' });
    expect(readMigrating(s, STORAGE_KEYS.offerEndsAt, LEGACY_STORAGE_KEYS.offerEndsAt)).toBe('1790000000000');
    expect(s.map.has(LEGACY_STORAGE_KEYS.offerEndsAt)).toBe(false);
  });

  test('the new key WINS when both exist — no resurrection of stale state', () => {
    const s = storage({
      [STORAGE_KEYS.cartId]: 'gid://cart/new',
      [LEGACY_STORAGE_KEYS.cartId]: 'gid://cart/old',
    });
    expect(readMigrating(s, STORAGE_KEYS.cartId, LEGACY_STORAGE_KEYS.cartId)).toBe('gid://cart/new');
  });

  test('migration is ONE-SHOT — the second read no longer touches legacy', () => {
    const s = storage({ [LEGACY_STORAGE_KEYS.cartId]: 'gid://cart/legacy' });
    readMigrating(s, STORAGE_KEYS.cartId, LEGACY_STORAGE_KEYS.cartId);
    s.map.set(LEGACY_STORAGE_KEYS.cartId, 'gid://cart/resurrected');
    // The new key exists now, so legacy is never consulted again.
    expect(readMigrating(s, STORAGE_KEYS.cartId, LEGACY_STORAGE_KEYS.cartId)).toBe('gid://cart/legacy');
  });

  test('there is no dual-write left behind', () => {
    const s = storage({ [LEGACY_STORAGE_KEYS.cartId]: 'old' });
    writeMigrating(s, STORAGE_KEYS.cartId, LEGACY_STORAGE_KEYS.cartId, 'fresh');
    expect([...s.map.keys()]).toEqual([STORAGE_KEYS.cartId]);
  });

  test('clearing removes both, so a reset does not leave a ghost to migrate', () => {
    const s = storage({ [STORAGE_KEYS.cartId]: 'a', [LEGACY_STORAGE_KEYS.cartId]: 'b' });
    clearMigrating(s, STORAGE_KEYS.cartId, LEGACY_STORAGE_KEYS.cartId);
    expect([...s.map.keys()]).toEqual([]);
  });
});

describe('storage that refuses never breaks the page', () => {
  test.each([
    ['read', () => readMigrating(storage({}, true), STORAGE_KEYS.cartId, LEGACY_STORAGE_KEYS.cartId)],
    ['write', () => writeMigrating(storage({}, true), STORAGE_KEYS.cartId, LEGACY_STORAGE_KEYS.cartId, 'x')],
    ['clear', () => clearMigrating(storage({}, true), STORAGE_KEYS.cartId, LEGACY_STORAGE_KEYS.cartId)],
  ])('%s does not throw in private mode', (_n, fn) => {
    expect(fn).not.toThrow();
  });

  test('an absent storage object is handled, not assumed', () => {
    expect(readMigrating(undefined, STORAGE_KEYS.cartId, LEGACY_STORAGE_KEYS.cartId)).toBeNull();
    expect(() => writeMigrating(undefined, STORAGE_KEYS.cartId, LEGACY_STORAGE_KEYS.cartId, 'x')).not.toThrow();
  });
});

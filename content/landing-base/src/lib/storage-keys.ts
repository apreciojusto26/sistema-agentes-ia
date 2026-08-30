// THE storage keys this landing writes, declared once and neutrally.
//
// WHY THEY MOVED. The previous keys were `astravibe:cartId` and
// `astravibe:offerEndsAt` — the star projector's brand, hardcoded in the
// template, so EVERY landing this system generates wrote `astravibe:`
// whatever it actually sold. Same class of defect as the comparison heading
// that claimed every product competed with a decorative lamp; invisible only
// because storage keys are never rendered.
//
// NAMING. Keys of PURPOSE, not of identity: `commerce:cartId`,
// `offer:endsAt`, `consent:v1`. No product name, no brand, no merchant
// domain, and not the generator's name either — a shopper's browser has no
// business learning what built the page. Namespacing by owner would only be
// justified if several unrelated apps shared an origin, and none do: each
// landing is its own deployment.
export const STORAGE_KEYS = {
  /** Shopify cart id — the one piece of state a returning buyer needs. */
  cartId: 'commerce:cartId',
  /** Countdown deadline, so the offer timer does not restart on navigation. */
  offerEndsAt: 'offer:endsAt',
} as const;

/**
 * The keys we used to write. READ-ONLY: they exist so a visitor mid-purchase
 * does not silently lose their cart on the deploy that renames the key.
 *
 * Migration is one-shot — read legacy, write new, delete legacy — so there is
 * no dual-write to forget to remove later. Once a visitor has been through it
 * once, these are gone from their browser.
 */
export const LEGACY_STORAGE_KEYS = {
  cartId: 'astravibe:cartId',
  offerEndsAt: 'astravibe:offerEndsAt',
} as const;

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/**
 * Reads `key`, falling back to `legacyKey` once and migrating it across.
 *
 * Never throws: private mode and disabled storage return null, exactly as a
 * missing value would, because a landing that cannot remember a cart is a
 * degraded experience and not an error.
 */
export function readMigrating(storage: StorageLike | undefined, key: string, legacyKey: string): string | null {
  if (!storage) return null;
  try {
    const current = storage.getItem(key);
    if (current !== null) return current;

    const legacy = storage.getItem(legacyKey);
    if (legacy === null) return null;

    // One-shot migration. The delete is deliberate: leaving the old key would
    // make this fallback permanent and the rename cosmetic.
    storage.setItem(key, legacy);
    storage.removeItem(legacyKey);
    return legacy;
  } catch {
    return null;
  }
}

/** Writes to the new key only, and clears any legacy leftover. */
export function writeMigrating(storage: StorageLike | undefined, key: string, legacyKey: string, value: string): void {
  if (!storage) return;
  try {
    storage.setItem(key, value);
    storage.removeItem(legacyKey);
  } catch {
    // Ignore: same reasoning as above.
  }
}

/** Clears both, for the paths that reset state (checkout complete, stale line). */
export function clearMigrating(storage: StorageLike | undefined, key: string, legacyKey: string): void {
  if (!storage) return;
  try {
    storage.removeItem(key);
    storage.removeItem(legacyKey);
  } catch {
    // Ignore.
  }
}

// THE storage keys this landing writes, declared once and neutrally.
//
// WHY THEY MOVED. Every key in this template was namespaced `astravibe:` —
// the star projector's brand, hardcoded in the canonical source that every
// generated landing is copied from. So a coffee grinder's shop wrote
// `astravibe:cartId` into its buyers' browsers, and a lamp's shop wrote
// `astravibe:dsid`. Same class of defect as the hardcoded "Astra Vibe"
// heading, and it survived longer for one reason: storage keys are never
// rendered, so no review ever saw them.
//
// NAMING. Keys of PURPOSE, not of identity: `commerce:cartId`,
// `attribution:source`, `telemetry:dsid`. No product name, no brand, no
// merchant domain — and not the generator's name either, because a shopper's
// browser has no business learning what built the page. Namespacing by owner
// would only be justified if several unrelated apps shared an origin, and none
// do: each landing is its own deployment.
//
// CONSENT IS NOT HERE, deliberately. `consent:v1` lives in lib/consent.ts and
// keeps its own read-only fallback, because it is a record of a legal decision
// with a versioned schema rather than a piece of UI state. Its migration also
// must NOT be one-shot — see below.
export const STORAGE_KEYS = {
  /** Shopify cart id — the one piece of state a returning buyer needs. */
  cartId: 'commerce:cartId',
  /** Latched `?source=tiktokbio` marker; survives navigation within the session. */
  source: 'attribution:source',
  /** One-time dismissal of the in-app-browser entry notice. */
  entryNoticeDismissed: 'attribution:entryNoticeDismissed',
  /** Anonymous diagnostics session id. */
  dsid: 'telemetry:dsid',
  /** Local diagnostics toggle. Developer state, never shipped on. */
  diagMode: 'diag:mode',
} as const;

/**
 * The keys we used to write. READ-ONLY, and they exist for one reason: a
 * visitor mid-purchase must not silently lose their cart on the deploy that
 * renames the key.
 *
 * Migration is ONE-SHOT — read legacy, write new, delete legacy — so there is
 * no dual-write to forget to remove later. Once a visitor has been through it
 * once, these are gone from their browser.
 */
export const LEGACY_STORAGE_KEYS = {
  cartId: 'astravibe:cartId',
  source: 'astravibe:source',
  entryNoticeDismissed: 'astravibe:tiktokbio-entry-dismissed',
  dsid: 'astravibe:dsid',
  diagMode: 'astravibe:diag',
} as const;

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/**
 * Reads `key`, falling back to `legacyKey` once and migrating it across.
 *
 * Never throws: private mode and disabled storage return null, exactly as a
 * missing value would, because a landing that cannot remember a cart is a
 * degraded experience and not an error.
 */
export function readMigrating(
  storage: StorageLike | undefined,
  key: string,
  legacyKey: string,
): string | null {
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
export function writeMigrating(
  storage: StorageLike | undefined,
  key: string,
  legacyKey: string,
  value: string,
): void {
  if (!storage) return;
  try {
    storage.setItem(key, value);
    storage.removeItem(legacyKey);
  } catch {
    // Ignore: same reasoning as above.
  }
}

/** Clears both, for the paths that reset state (checkout complete, stale line). */
export function clearMigrating(
  storage: StorageLike | undefined,
  key: string,
  legacyKey: string,
): void {
  if (!storage) return;
  try {
    storage.removeItem(key);
    storage.removeItem(legacyKey);
  } catch {
    // Ignore.
  }
}

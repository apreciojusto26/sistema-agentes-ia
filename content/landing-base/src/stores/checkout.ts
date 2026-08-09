import { atom } from 'nanostores';

/**
 * Pure SELECTION state — nothing here is derived. Both dimensions of the
 * (variant × pack) configurator. `null` means "use the default" (resolved by
 * use-selection.ts against the commerce props each island receives).
 */
export const $selectedVariantId = atom<string | null>(null);
export const $selectedPackId = atom<string | null>(null);

import { atom, computed } from 'nanostores';

export const $lightboxIndex = atom<number | null>(null);
export const $isLightboxOpen = computed($lightboxIndex, (i) => i !== null);

export const $stickyVisible = atom<boolean>(false);

export const $openFaqId = atom<string | null>(null);

export const $isCartOpen = atom<boolean>(false);

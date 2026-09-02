import { atom } from 'nanostores';
import { isInAppWebView } from '@/lib/telemetry/webview';

/**
 * UX layer for traffic arriving from the TikTok profile/bio link.
 *
 * Confirmed by real testing (2026-08-26): links opened from a TikTok DM run
 * in a WebView where the whole checkout works end to end, while the same site
 * opened from the profile "Website" link runs in a more restricted WebView
 * that interrupts the hop to /checkout.
 *
 * Because the two cases share a User-Agent, the source CANNOT be inferred
 * from it — this is driven purely by the explicit `?source=tiktokbio` marker
 * on the bio link, latched into sessionStorage so it survives navigation.
 *
 * Nothing here touches payments. It gates ONE navigation and shows a notice.
 */

const SOURCE_KEY = 'astravibe:source';
const ENTRY_DISMISSED_KEY = 'astravibe:tiktokbio-entry-dismissed';
const TIKTOK_BIO = 'tiktokbio';

/** null = nothing to show. 'entry' = dismissible. 'checkout' = blocking. */
export type BioNoticeMode = 'entry' | 'checkout' | null;

export const $bioNotice = atom<BioNoticeMode>(null);

function readStorage(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // Storage blocked. The notice then re-shows on each page, which is the
    // safe direction to fail for a warning of this kind.
  }
}

/**
 * Latches `?source=tiktokbio` for the rest of the session. Called once on
 * mount; reading the URL every time would lose the marker as soon as the
 * buyer navigates.
 */
export function captureSource(): void {
  if (typeof window === 'undefined') return;
  try {
    const source = new URLSearchParams(window.location.search).get('source');
    if (source === TIKTOK_BIO) writeStorage(SOURCE_KEY, TIKTOK_BIO);
  } catch {
    // Malformed query string — nothing to latch.
  }
}

export function isTikTokBioSource(): boolean {
  if (typeof window === 'undefined') return false;
  return readStorage(SOURCE_KEY) === TIKTOK_BIO;
}

/**
 * The whole decision, in one place.
 *
 * `source` alone is NOT enough. When the buyer follows our own instruction —
 * ⋯ → "Abrir en navegador" — Safari reopens the SAME url, marker included. If
 * the notice keyed off the marker alone it would fire again and block the
 * checkout in Safari, trapping the buyer in a loop created by our own advice.
 *
 * So the marker supplies the CONTEXT (this visitor came from the bio link)
 * and the WebView check supplies the CONDITION (we are still inside an
 * embedded browser). Both must hold.
 */
export function shouldWarn(userAgent?: string | null): boolean {
  if (typeof window === 'undefined') return false;
  if (!isTikTokBioSource()) return false;
  return isInAppWebView(userAgent ?? window.navigator?.userAgent ?? null);
}

/** The entry notice is a one-time nudge; the checkout gate is not. */
export function hasDismissedEntryNotice(): boolean {
  return readStorage(ENTRY_DISMISSED_KEY) === '1';
}

export function dismissEntryNotice(): void {
  writeStorage(ENTRY_DISMISSED_KEY, '1');
  $bioNotice.set(null);
}

export function closeNotice(): void {
  $bioNotice.set(null);
}

/**
 * Called by cart.ts checkout() BEFORE it navigates. Returning true means the
 * caller must stop: the buyer is on the bio link and has to be told, every
 * time, because continuing here is what breaks.
 */
export function shouldBlockCheckout(userAgent?: string | null): boolean {
  if (!shouldWarn(userAgent)) return false;
  $bioNotice.set('checkout');
  return true;
}

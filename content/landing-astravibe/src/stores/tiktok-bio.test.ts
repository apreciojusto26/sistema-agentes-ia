import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  $bioNotice,
  captureSource,
  closeNotice,
  dismissEntryNotice,
  hasDismissedEntryNotice,
  isTikTokBioSource,
  shouldBlockCheckout,
  shouldWarn,
} from '@/stores/tiktok-bio';

/**
 * REAL string captured from TikTok's in-app browser on iPhone (iOS 18.7,
 * 2026-08-27). Note what it lacks: no Version/, no Safari/, and nothing
 * naming TikTok — which is why marker-only detection reported it as
 * `unknown`. Pinning the real string means a regression here fails loudly.
 */
const UA_TIKTOK_IOS =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';

const UA_SAFARI_IOS =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.7 Mobile/15E148 Safari/604.1';
const UA_CHROME_IOS =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.153 Mobile/15E148 Safari/604.1';
const UA_FIREFOX_IOS =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/127.0 Mobile/15E148 Safari/605.1.15';

let store: Storage;

function setEnvironment(search: string, userAgent: string): void {
  vi.stubGlobal('window', {
    location: { search },
    sessionStorage: store,
    navigator: { userAgent },
  });
}

beforeEach(() => {
  const map = new Map<string, string>();
  store = {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
    clear: () => map.clear(),
    key: () => null,
    length: 0,
  } as unknown as Storage;
  setEnvironment('', UA_SAFARI_IOS);
  $bioNotice.set(null);
});

describe('captureSource', () => {
  it('latches the bio marker so it survives navigation away from the landing', () => {
    setEnvironment('?source=tiktokbio', UA_TIKTOK_IOS);
    captureSource();

    setEnvironment('', UA_TIKTOK_IOS);
    expect(isTikTokBioSource()).toBe(true);
  });

  it('ignores any other source', () => {
    setEnvironment('?source=instagram', UA_TIKTOK_IOS);
    captureSource();
    expect(isTikTokBioSource()).toBe(false);
  });
});

describe('shouldWarn — the marker is context, the WebView is the condition', () => {
  it('warns inside the real TikTok iOS WebView arriving from the bio link', () => {
    setEnvironment('?source=tiktokbio', UA_TIKTOK_IOS);
    captureSource();
    expect(shouldWarn()).toBe(true);
  });

  it('does NOT warn once the same URL is reopened in Safari', () => {
    // This is the loop the previous implementation created: the buyer follows
    // "⋯ → Abrir en navegador", Safari reopens the URL WITH the marker, and a
    // marker-only check would warn again in the very browser we asked for.
    setEnvironment('?source=tiktokbio', UA_TIKTOK_IOS);
    captureSource();
    setEnvironment('?source=tiktokbio', UA_SAFARI_IOS);
    expect(shouldWarn()).toBe(false);
  });

  it('does NOT warn in Chrome iOS', () => {
    setEnvironment('?source=tiktokbio', UA_CHROME_IOS);
    captureSource();
    expect(shouldWarn()).toBe(false);
  });

  it('does NOT warn in Firefox iOS', () => {
    setEnvironment('?source=tiktokbio', UA_FIREFOX_IOS);
    captureSource();
    expect(shouldWarn()).toBe(false);
  });

  it('does NOT warn inside a WebView without the bio marker', () => {
    // DM traffic: the full checkout works there, so it must not be warned.
    setEnvironment('', UA_TIKTOK_IOS);
    captureSource();
    expect(shouldWarn()).toBe(false);
  });
});

describe('shouldBlockCheckout', () => {
  it('blocks in the real TikTok WebView and raises the checkout notice', () => {
    setEnvironment('?source=tiktokbio', UA_TIKTOK_IOS);
    captureSource();

    expect(shouldBlockCheckout()).toBe(true);
    expect($bioNotice.get()).toBe('checkout');
  });

  it('lets checkout() run normally in Safari with the marker still on the URL', () => {
    setEnvironment('?source=tiktokbio', UA_TIKTOK_IOS);
    captureSource();
    setEnvironment('?source=tiktokbio', UA_SAFARI_IOS);

    expect(shouldBlockCheckout()).toBe(false);
    expect($bioNotice.get()).toBeNull();
  });

  it('lets Chrome iOS through', () => {
    setEnvironment('?source=tiktokbio', UA_CHROME_IOS);
    captureSource();
    expect(shouldBlockCheckout()).toBe(false);
  });

  it('lets Firefox iOS through', () => {
    setEnvironment('?source=tiktokbio', UA_FIREFOX_IOS);
    captureSource();
    expect(shouldBlockCheckout()).toBe(false);
  });

  it('lets normal traffic through untouched', () => {
    expect(shouldBlockCheckout()).toBe(false);
    expect($bioNotice.get()).toBeNull();
  });

  it('keeps blocking after the entry notice was dismissed', () => {
    setEnvironment('?source=tiktokbio', UA_TIKTOK_IOS);
    captureSource();
    dismissEntryNotice();

    // Dismissing the one-time nudge must NOT buy a pass through the gate.
    expect(shouldBlockCheckout()).toBe(true);
  });

  it('keeps blocking on a second attempt after closing the gate', () => {
    setEnvironment('?source=tiktokbio', UA_TIKTOK_IOS);
    captureSource();

    expect(shouldBlockCheckout()).toBe(true);
    closeNotice();
    expect(shouldBlockCheckout()).toBe(true);
  });
});

describe('entry notice', () => {
  it('is remembered for the session once dismissed', () => {
    setEnvironment('?source=tiktokbio', UA_TIKTOK_IOS);
    captureSource();

    expect(hasDismissedEntryNotice()).toBe(false);
    dismissEntryNotice();
    expect(hasDismissedEntryNotice()).toBe(true);
    expect($bioNotice.get()).toBeNull();
  });
});

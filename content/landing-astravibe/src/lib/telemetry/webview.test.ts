import { describe, expect, it } from 'vitest';
import {
  detectBrowser,
  isAndroidWebView,
  isInAppWebView,
  isIOSWebView,
  isTikTokWebView,
  summarizeUserAgent,
} from '@/lib/telemetry/webview';

/**
 * Real-shaped strings. The point of these tests is not that the regexes work
 * but that in-app browsers are not misread as the engine they embed: every
 * iOS WebView says "Safari", and Android in-app browsers say "Chrome".
 */
const UA = {
  tiktokIOS:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 musical_ly_34.5.0 JsSdk/2.0 NetType/WIFI Channel/App Store ByteLocale/es Region/ES',
  tiktokAndroid:
    'Mozilla/5.0 (Linux; Android 13; SM-A536B Build/TP1A.220624.014; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.0.0 Mobile Safari/537.36 BytedanceWebview/d8a21c6 trill_340502',
  instagram:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Instagram 320.0.0.0.0',
  facebook: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 [FBAN/FBIOS;FBAV/450.0]',
  safariIOS:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  chromeDesktop:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  androidWebview:
    'Mozilla/5.0 (Linux; Android 13; Pixel 7 Build/TQ3A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.0.0 Mobile Safari/537.36',
  /**
   * REAL string captured from TikTok's in-app browser on iPhone (iOS 18.7,
   * 2026-08-27). No Version/, no Safari/, and nothing naming TikTok — the
   * exact case marker-only detection got wrong.
   */
  tiktokIOSReal:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
  chromeIOS:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.153 Mobile/15E148 Safari/604.1',
  firefoxIOS:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/127.0 Mobile/15E148 Safari/605.1.15',
} as const;

describe('isIOSWebView — detected by the ABSENCE of Safari/', () => {
  it('recognises the real TikTok iPhone string that carries no markers', () => {
    expect(isIOSWebView(UA.tiktokIOSReal)).toBe(true);
  });

  it('does not fire for the real iOS browsers', () => {
    expect(isIOSWebView(UA.safariIOS)).toBe(false);
    expect(isIOSWebView(UA.chromeIOS)).toBe(false);
    expect(isIOSWebView(UA.firefoxIOS)).toBe(false);
  });

  it('does not fire off iOS', () => {
    expect(isIOSWebView(UA.chromeDesktop)).toBe(false);
    expect(isIOSWebView(UA.androidWebview)).toBe(false);
  });
});

describe('isInAppWebView — the question the UX layer actually asks', () => {
  it('is true for every embedded browser, named or not', () => {
    expect(isInAppWebView(UA.tiktokIOSReal)).toBe(true);
    expect(isInAppWebView(UA.tiktokIOS)).toBe(true);
    expect(isInAppWebView(UA.tiktokAndroid)).toBe(true);
    expect(isInAppWebView(UA.instagram)).toBe(true);
    expect(isInAppWebView(UA.facebook)).toBe(true);
    expect(isInAppWebView(UA.androidWebview)).toBe(true);
  });

  it('is false for real browsers, which is what keeps buyers unblocked', () => {
    expect(isInAppWebView(UA.safariIOS)).toBe(false);
    expect(isInAppWebView(UA.chromeIOS)).toBe(false);
    expect(isInAppWebView(UA.firefoxIOS)).toBe(false);
    expect(isInAppWebView(UA.chromeDesktop)).toBe(false);
  });
});

describe('isAndroidWebView', () => {
  it('recognises the Chromium wv marker', () => {
    expect(isAndroidWebView(UA.androidWebview)).toBe(true);
    expect(isAndroidWebView(UA.chromeDesktop)).toBe(false);
  });
});

describe('isTikTokWebView', () => {
  it('recognises the iOS and Android TikTok shells', () => {
    expect(isTikTokWebView(UA.tiktokIOS)).toBe(true);
    expect(isTikTokWebView(UA.tiktokAndroid)).toBe(true);
  });

  it('does not fire for other browsers', () => {
    expect(isTikTokWebView(UA.safariIOS)).toBe(false);
    expect(isTikTokWebView(UA.chromeDesktop)).toBe(false);
    expect(isTikTokWebView(UA.instagram)).toBe(false);
  });

  it('treats a missing user agent as not-TikTok rather than throwing', () => {
    expect(isTikTokWebView(null)).toBe(false);
    expect(isTikTokWebView(undefined)).toBe(false);
    expect(isTikTokWebView('')).toBe(false);
  });
});

describe('detectBrowser', () => {
  it('puts in-app browsers ahead of the engine they embed', () => {
    // Both of these also contain Safari/Chrome markers — order matters.
    expect(detectBrowser(UA.tiktokIOS)).toBe('tiktok');
    expect(detectBrowser(UA.tiktokAndroid)).toBe('tiktok');
    expect(detectBrowser(UA.instagram)).toBe('instagram');
    expect(detectBrowser(UA.facebook)).toBe('facebook');
  });

  it('classifies real browsers', () => {
    expect(detectBrowser(UA.safariIOS)).toBe('safari');
    expect(detectBrowser(UA.chromeDesktop)).toBe('chrome');
  });

  it('flags a generic Android WebView', () => {
    expect(detectBrowser(UA.androidWebview)).toBe('other-webview');
  });

  it('classifies the real TikTok iPhone string as a WebView, not unknown', () => {
    expect(detectBrowser(UA.tiktokIOSReal)).toBe('other-webview');
  });

  it('keeps the iOS browsers apart from the WebView fallback', () => {
    expect(detectBrowser(UA.chromeIOS)).toBe('chrome');
    expect(detectBrowser(UA.firefoxIOS)).toBe('firefox');
    expect(detectBrowser(UA.safariIOS)).toBe('safari');
  });

  it('falls back to unknown', () => {
    expect(detectBrowser(null)).toBe('unknown');
    expect(detectBrowser('curl/8.4.0')).toBe('unknown');
  });
});

describe('summarizeUserAgent', () => {
  it('bounds the stored string so the full UA never becomes a fingerprint', () => {
    expect(summarizeUserAgent('x'.repeat(500))).toHaveLength(180);
  });

  it('returns an empty string when there is no user agent', () => {
    expect(summarizeUserAgent(null)).toBe('');
  });
});

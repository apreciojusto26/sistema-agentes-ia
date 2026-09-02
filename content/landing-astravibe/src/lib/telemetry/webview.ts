/**
 * In-app browser detection from the User-Agent. Runs on BOTH sides: the
 * client tags its own events, and the server re-derives the same answer from
 * the request header so a tampered client payload cannot rewrite history.
 *
 * TELEMETRY ONLY for now — nothing in the checkout branches on this. Keep it
 * that way until a real TikTok run says which phase actually breaks.
 *
 * User-Agent strings are advisory: they are client-controlled and vendors
 * change them without notice. Treat a positive as a hint, never as proof.
 */

export type DetectedBrowser =
  | 'tiktok'
  | 'instagram'
  | 'facebook'
  | 'safari'
  | 'chrome'
  | 'firefox'
  | 'edge'
  | 'other-webview'
  | 'unknown';

/** Markers TikTok/ByteDance ship in their in-app WebView UA. */
const TIKTOK_MARKERS = ['tiktok', 'musical_ly', 'bytedancewebview', 'bytedance', 'trill'];

/**
 * Named TikTok. Android's TikTok shell says so outright; iOS often does NOT —
 * see isIOSWebView for the case this misses on purpose.
 */
export function isTikTokWebView(userAgent: string | null | undefined): boolean {
  if (!userAgent) return false;
  const ua = userAgent.toLowerCase();
  return TIKTOK_MARKERS.some((marker) => ua.includes(marker));
}

/**
 * An iOS WKWebView, whoever embeds it.
 *
 * Detected by ABSENCE: real iOS browsers always append `Safari/`, and Safari
 * itself also carries `Version/`. An embedded WKWebView carries neither. The
 * real string captured from TikTok on iPhone 18.7 is exactly that —
 *
 *   Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X)
 *   AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148
 *
 * — no Version/, no Safari/, and nothing naming TikTok, which is why a
 * marker-based check alone reported `unknown` for it.
 */
export function isIOSWebView(userAgent: string | null | undefined): boolean {
  if (!userAgent) return false;
  const ua = userAgent.toLowerCase();
  const isIOS = ua.includes('iphone') || ua.includes('ipad') || ua.includes('ipod');
  return isIOS && !ua.includes('safari/');
}

/** An Android WebView container (`; wv)` is Chromium's own marker). */
export function isAndroidWebView(userAgent: string | null | undefined): boolean {
  if (!userAgent) return false;
  const ua = userAgent.toLowerCase();
  return ua.includes('; wv)') || ua.includes('webview');
}

/**
 * Any embedded browser. This — not the TikTok markers — is what the UX layer
 * should ask, because the question that matters is "are we still inside an
 * in-app browser?", not "which app embedded us?".
 *
 * Deliberately broad: a false positive shows a dismissible notice, while a
 * false negative leaves a buyer facing a checkout that cannot complete.
 */
export function isInAppWebView(userAgent: string | null | undefined): boolean {
  if (!userAgent) return false;
  const ua = userAgent.toLowerCase();
  if (isTikTokWebView(ua) || isIOSWebView(ua) || isAndroidWebView(ua)) return true;
  return ua.includes('instagram') || ua.includes('fban') || ua.includes('fbav') || ua.includes('fb_iab');
}

/**
 * Coarse classification, ordered so in-app browsers win over the engine they
 * embed — every iOS WebView reports Safari, and Instagram/Facebook report
 * Chrome on Android, so checking the engines first would hide them.
 */
export function detectBrowser(userAgent: string | null | undefined): DetectedBrowser {
  if (!userAgent) return 'unknown';
  const ua = userAgent.toLowerCase();

  if (isTikTokWebView(ua)) return 'tiktok';
  if (ua.includes('instagram')) return 'instagram';
  if (ua.includes('fban') || ua.includes('fbav') || ua.includes('fb_iab')) return 'facebook';
  if (isAndroidWebView(ua)) return 'other-webview';

  // Real iOS browsers are checked BEFORE the iOS-WebView fallback, since all
  // of them are WebKit and only the `Safari/` suffix separates them.
  if (ua.includes('crios')) return 'chrome';
  if (ua.includes('fxios')) return 'firefox';
  if (ua.includes('edgios')) return 'edge';

  // Anything left on iOS with no `Safari/` is an embedded WKWebView — the
  // real TikTok iPhone string lands here rather than in 'unknown'.
  if (isIOSWebView(ua)) return 'other-webview';

  if (ua.includes('edg/')) return 'edge';
  if (ua.includes('firefox/')) return 'firefox';
  if (ua.includes('chrome/')) return 'chrome';
  if (ua.includes('safari/')) return 'safari';

  return 'unknown';
}

/**
 * Bounded, non-identifying UA summary. The full string is a fingerprinting
 * vector and is never stored; this keeps just enough to tell platforms apart
 * when the classification above says 'unknown'.
 */
export function summarizeUserAgent(userAgent: string | null | undefined): string {
  if (!userAgent) return '';
  return userAgent.slice(0, 180);
}

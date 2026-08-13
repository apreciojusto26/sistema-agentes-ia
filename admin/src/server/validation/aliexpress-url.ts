// Pure URL preflight validation (spec R12 "URL Preflight Validation"; design
// §7 "AliExpress URL preflight"). Rejects empty/malformed URLs BEFORE a
// scrape job is ever spawned, because scrape.js L494 silently falls back to
// a hardcoded default product when given an empty argv[2]
// ('https://es.aliexpress.com/item/1005007502111078.html') — an unvalidated
// empty URL would otherwise scrape the wrong product with no error at all.
//
// isProductImage (scrape.js L48) allows `aliexpress-media.com|alicdn.com` —
// those are CDN hosts for IMAGES, not page hosts, and must never leak into
// HOST_RE below.

export type UrlCheckCode =
  | 'empty'
  | 'not-a-url'
  | 'not-https'
  | 'short-link'
  | 'not-aliexpress'
  | 'not-an-item-url';

export type UrlCheck =
  | { ok: true; url: string; itemId: string; host: string; normalized: string }
  | { ok: false; code: UrlCheckCode; message: string };

const SHORT_HOST_RE = /^a\.aliexpress\.com$/i;
const HOST_RE = /(^|\.)aliexpress\.(com|us|ru)$/i;
const ITEM_PATH_RE = /^\/(?:item|i)\/(\d{6,})\.html$/;

/**
 * Order (load-bearing, see design §7): trim -> empty -> `new URL()` try ->
 * protocol check -> short-link (checked BEFORE the host test so it gets its
 * own actionable message) -> HOST_RE -> ITEM_PATH_RE -> capture itemId.
 */
export function validateAliExpressUrl(input: string): UrlCheck {
  const trimmed = input.trim();

  if (!trimmed) {
    return { ok: false, code: 'empty', message: 'URL is required.' };
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, code: 'not-a-url', message: `"${trimmed}" is not a valid URL.` };
  }

  if (url.protocol !== 'https:') {
    return { ok: false, code: 'not-https', message: 'URL must use https://.' };
  }

  if (SHORT_HOST_RE.test(url.hostname)) {
    return {
      ok: false,
      code: 'short-link',
      message:
        'Short links (a.aliexpress.com) are not supported — open it in a browser and paste the full /item/{id}.html URL.',
    };
  }

  if (!HOST_RE.test(url.hostname)) {
    return { ok: false, code: 'not-aliexpress', message: `"${url.hostname}" is not an AliExpress domain.` };
  }

  const match = ITEM_PATH_RE.exec(url.pathname);
  if (!match) {
    return {
      ok: false,
      code: 'not-an-item-url',
      message: `"${url.pathname}" does not look like a product item URL (expected /item/{id}.html).`,
    };
  }

  const itemId = match[1];

  // Spawn with the trimmed ORIGINAL url, query string intact (design §7) —
  // never second-guess what the site needs from `?spm=...`. `normalized` is
  // for display/history/dedupe only.
  return {
    ok: true,
    url: trimmed,
    itemId,
    host: url.hostname,
    normalized: `https://${url.hostname}/item/${itemId}.html`,
  };
}

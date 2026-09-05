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

import { PROVIDERS, resolveSourceIdentity } from '../../../../scripts/lib/source-identity.mjs';
import type { SourceProductIdentity } from '../../../../scripts/lib/source-identity.mjs';

export type UrlCheckCode =
  | 'empty'
  | 'not-a-url'
  | 'not-https'
  | 'short-link'
  | 'not-aliexpress'
  | 'not-an-item-url';

export type UrlCheck =
  | {
      ok: true;
      url: string;
      itemId: string;
      host: string;
      normalized: string;
      /**
       * WHICH PRODUCT THIS IS, resolved before a scrape is ever spawned.
       *
       * The pipeline used to call `createScrapeJob({ itemId: '', normalizedUrl:
       * input.url })` — throwing away the identity this function had already
       * computed — so nothing downstream could tell a re-run of one product
       * from an attempt on a different one.
       */
      identity: SourceProductIdentity;
    }
  | { ok: false; code: UrlCheckCode; message: string };

// THE SHAPES COME FROM THE PROVIDER, NOT FROM A SECOND COPY OF THEM.
//
// These three patterns used to be declared here AND, in effect, again wherever
// else the system needed to know what an AliExpress product link is. One
// definition that drifts is how "the same product" and "a valid URL" end up
// disagreeing — so scripts/lib/source-identity.mjs owns them and this boundary
// borrows them. What stays here is the HTTP-facing part: the ordered,
// actionable error messages an operator reads.
const { hostPattern: HOST_RE, shortHostPattern: SHORT_HOST_RE, itemPathPattern: ITEM_PATH_RE } =
  PROVIDERS.find((p) => p.id === 'aliexpress')!;

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
  const identity = resolveSourceIdentity(trimmed);
  if (!identity) {
    // Unreachable given the tests above, and asserted rather than assumed: the
    // two must agree about what a product link is, because one of them decides
    // whether a scrape runs and the other decides whose output directory it is.
    return {
      ok: false,
      code: 'not-an-item-url',
      message: `"${trimmed}" passed the URL checks but no provider could identify a product in it.`,
    };
  }

  // Spawn with the trimmed ORIGINAL url, query string intact (design §7) —
  // never second-guess what the site needs from `?spm=...`. `normalized` is
  // for display/history/dedupe only; `identity` is what decides lineage.
  return {
    ok: true,
    url: trimmed,
    itemId,
    host: url.hostname,
    normalized: identity.canonicalUrl,
    identity,
  };
}

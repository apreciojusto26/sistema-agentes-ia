// RED-before-GREEN for validateAliExpressUrl (spec R12 "URL Preflight
// Validation"; design §7 "AliExpress URL preflight"). Written before
// aliexpress-url.ts exists.
//
// Grounding: scrape.js L494's real hardcoded fallback is
// 'https://es.aliexpress.com/item/1005007502111078.html' — that is exactly
// the shape a valid URL here must match, and exactly what an empty/malformed
// input must be rejected BEFORE spawning, so the script never silently
// scrapes that default product instead of what the user asked for.
import { describe, test, expect } from 'vitest';
import { validateAliExpressUrl } from './aliexpress-url';

describe('validateAliExpressUrl', () => {
  test('rejects an empty string', () => {
    const r = validateAliExpressUrl('');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('empty');
  });

  test('rejects a whitespace-only string as empty', () => {
    const r = validateAliExpressUrl('   ');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('empty');
  });

  test('rejects a string that is not a URL at all', () => {
    const r = validateAliExpressUrl('not a url');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('not-a-url');
  });

  test('rejects an http:// (non-https) URL', () => {
    const r = validateAliExpressUrl('http://es.aliexpress.com/item/1005007502111078.html');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('not-https');
  });

  test('rejects a short link (a.aliexpress.com) with its own actionable message', () => {
    const r = validateAliExpressUrl('https://a.aliexpress.com/_mNqE3f2');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe('short-link');
      expect(r.message.toLowerCase()).toContain('short link');
    }
  });

  test('rejects a non-AliExpress host', () => {
    const r = validateAliExpressUrl('https://www.amazon.com/item/1005007502111078.html');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('not-aliexpress');
  });

  test('rejects an AliExpress URL that is not an item page', () => {
    const r = validateAliExpressUrl('https://es.aliexpress.com/wholesale?catId=100');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('not-an-item-url');
  });

  test('rejects an item path with too short a numeric id', () => {
    const r = validateAliExpressUrl('https://es.aliexpress.com/item/123.html');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('not-an-item-url');
  });

  test('accepts a valid es.aliexpress.com item URL and extracts itemId', () => {
    const r = validateAliExpressUrl('https://es.aliexpress.com/item/1005007502111078.html');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.itemId).toBe('1005007502111078');
      expect(r.host).toBe('es.aliexpress.com');
      expect(r.normalized).toBe('https://es.aliexpress.com/item/1005007502111078.html');
    }
  });

  test('accepts a valid www.aliexpress.com item URL', () => {
    const r = validateAliExpressUrl('https://www.aliexpress.com/item/1005007502111078.html');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.itemId).toBe('1005007502111078');
  });

  test('accepts a bare aliexpress.com item URL', () => {
    const r = validateAliExpressUrl('https://aliexpress.com/item/1005007502111078.html');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.itemId).toBe('1005007502111078');
  });

  test('accepts the /i/ short item path variant', () => {
    const r = validateAliExpressUrl('https://es.aliexpress.com/i/1005007502111078.html');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.itemId).toBe('1005007502111078');
  });

  test('preserves the trimmed original URL including its query string, unmodified', () => {
    const withQuery = '  https://es.aliexpress.com/item/1005007502111078.html?spm=a2g0o.home.1000023.1 ';
    const r = validateAliExpressUrl(withQuery);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.url).toBe(withQuery.trim());
      // normalized strips tracking params, but the spawn-worthy `url` field must not
      expect(r.normalized).toBe('https://es.aliexpress.com/item/1005007502111078.html');
    }
  });

  test('does not treat a CDN image host as a valid page host', () => {
    const r = validateAliExpressUrl('https://ae01.alicdn.com/kf/some-image.jpg');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('not-aliexpress');
  });
});

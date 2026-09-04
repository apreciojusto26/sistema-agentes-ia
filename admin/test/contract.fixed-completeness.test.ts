// EVERY LINK THE FIXED PAGE OFFERS MUST GO SOMEWHERE.
//
// contract.landing-completeness.test.ts enforces this for Version A, and it
// does it through `content/landing-base/src/lib/navigation.ts` — a declared
// slug list it can read and cross-check against src/pages/legal/.
//
// AstraVibe has no such file. Its footer and utility bar write their hrefs
// inline, so the Version A test has nothing to bind to and, after the F3B
// template switch, the Fixed pipeline inherited NO dead-link guard at all.
// Nothing was broken by that — all ten internal hrefs resolve today — but
// nothing was watching either, and a footer link is exactly the kind of thing
// that survives a copy-paste into a page nobody created.
//
// So this asserts the same rule against the shape AstraVibe actually has:
// hrefs are read out of the RENDERED HTML, not out of a declaration, and each
// one has to resolve to a real page.
import { describe, test, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const T = path.join(REPO_ROOT, 'content/landing-astravibe');
const PAGES = path.join(T, 'src/pages');

const build = (who: 'a' | 'b', mode: 'preview' | 'commerce') =>
  path.join(T, `dist-ab-${who}-${mode}/client/index.html`);
const BUILT = (['a', 'b'] as const).flatMap((w) =>
  (['preview', 'commerce'] as const).map((m) => [w, m] as const),
).filter(([w, m]) => existsSync(build(w, m)));

/** `/legal/envios` -> src/pages/legal/envios.astro, `/` -> src/pages/index.astro */
const resolvesToPage = (href: string) => {
  const clean = href.replace(/\/$/, '') || '/index';
  const rel = clean === '/index' ? 'index' : clean.slice(1);
  return existsSync(path.join(PAGES, `${rel}.astro`)) || existsSync(path.join(PAGES, rel, 'index.astro'));
};

/** Anything served from the build output rather than authored as a route. */
const isAsset = (href: string) => /\.[a-z0-9]{2,5}$/i.test(href);

describe.runIf(BUILT.length > 0)('no rendered link is dead', () => {
  test.each(BUILT)('%s %s — every internal href resolves', (who, mode) => {
    const html = readFileSync(build(who, mode), 'utf-8');
    // Site-internal only: `#anchors`, `mailto:`, `tel:` and absolute URLs are
    // other systems' problems.
    const hrefs = [...new Set([...html.matchAll(/href="(\/[^"#]*)"/g)].map((m) => m[1]!))];
    expect(hrefs.length, 'no internal hrefs found — the extraction is broken, not the page').toBeGreaterThan(5);

    const dead = hrefs.filter((h) => !isAsset(h) && !resolvesToPage(h));
    expect(dead, `hrefs pointing at pages that do not exist: ${dead.join(', ')}`).toEqual([]);
  });

  test.each(BUILT)('%s %s — assets referenced by href exist in the build', (who, mode) => {
    const dir = path.dirname(build(who, mode));
    const html = readFileSync(build(who, mode), 'utf-8');
    const assets = [...new Set([...html.matchAll(/href="(\/[^"#]*)"/g)].map((m) => m[1]!))].filter(isAsset);
    const missing = assets.filter((a) => !existsSync(path.join(dir, a.slice(1))));
    expect(missing, `href assets missing from the build: ${missing.join(', ')}`).toEqual([]);
  });
});

describe('the legal surface is complete', () => {
  // Six pages, because Spanish e-commerce needs all six and a footer that
  // links five of them plus a 404 is worse than one that links none.
  const REQUIRED = ['aviso-legal', 'cookies', 'devoluciones', 'envios', 'privacidad', 'terminos'];

  test.each(REQUIRED)('legal/%s exists', (slug) => {
    expect(existsSync(path.join(PAGES, 'legal', `${slug}.astro`))).toBe(true);
  });

  test('and there are no others — an unlinked legal page is a page nobody maintains', () => {
    const found = readdirSync(path.join(PAGES, 'legal'))
      .filter((f) => f.endsWith('.astro'))
      .map((f) => f.replace(/\.astro$/, ''))
      .sort();
    expect(found).toEqual([...REQUIRED].sort());
  });

  test.runIf(BUILT.length > 0)('every legal page is actually linked from the landing', () => {
    const html = readFileSync(build(...BUILT[0]!), 'utf-8');
    for (const slug of REQUIRED) {
      expect(html, `legal/${slug} exists but nothing links to it`).toContain(`href="/legal/${slug}"`);
    }
  });
});

describe('the template ships no invented merchant', () => {
  test('merchant is null, not a plausible-looking fixture', () => {
    // The Version A rule is "merchant.ts must not contain FIXTURE". The Fixed
    // rule is stricter and simpler: the TEMPLATE declares none at all. A
    // template carrying a legal name, a VAT number or an address is one bad
    // generation away from publishing a real-looking company that does not
    // exist — and `null` makes every policy surface state nothing instead.
    const merchant = readFileSync(path.join(T, 'src/data/merchant.ts'), 'utf-8');
    expect(merchant).toMatch(/export const merchant:\s*Merchant\s*\|\s*null\s*=\s*null;/);
  });
});

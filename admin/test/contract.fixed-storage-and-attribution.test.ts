// NO BRAND IN A BUYER'S BROWSER — and the WebView fix survives the port.
//
// ─── STORAGE KEYS ─────────────────────────────────────────────────────────
//
// Every key this template wrote was namespaced `astravibe:`. It is the
// canonical source every generated landing is copied from, so a coffee
// grinder's shop wrote `astravibe:cartId` into its buyers' browsers and a
// lamp's shop wrote `astravibe:dsid`. The same defect class as the hardcoded
// heading, and it outlived that one for a simple reason: storage keys are
// never rendered, so no review ever saw them.
//
// THE GUARD HAS TO BE PRECISE. A blanket "no `astravibe:` anywhere" scan would
// forbid the migration module from naming the keys it exists to migrate FROM.
// So the legacy names are allowed in exactly the files that declare them, and
// nowhere else.
//
// ─── ATTRIBUTION ──────────────────────────────────────────────────────────
//
// The TikTok in-app-browser fix is this template's own, and landing-base has
// no equivalent — there was nothing to port and nothing that could replace it.
// It is pinned here anyway, because "port the modern implementation" is
// exactly the instruction under which a working fix gets replaced by other
// code that looks more current.
import { describe, test, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SRC = path.join(REPO_ROOT, 'content/landing-astravibe/src');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|astro)$/.test(full)) out.push(full);
  }
  return out;
}

/** Comments stripped — the migration is documented in prose all over these files. */
const code = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*)/.test(l))
    .join('\n');

const read = (rel: string) => code(readFileSync(path.join(SRC, rel), 'utf-8'));

/** The only files allowed to name a legacy key — they declare the migration. */
const MAY_NAME_LEGACY_KEYS = ['lib/storage-keys.ts', 'lib/consent.ts'];

describe('the template brand reaches no storage key', () => {
  test('only the migration declarations name a legacy key', () => {
    const offenders = walk(SRC)
      .filter((f) => /['"`]astravibe:/.test(code(readFileSync(f, 'utf-8'))))
      .map((f) => path.relative(SRC, f))
      .filter((rel) => !MAY_NAME_LEGACY_KEYS.includes(rel) && !rel.endsWith('.test.ts'));

    expect(offenders, 'a brand-namespaced key survived the migration').toEqual([]);
  });

  test('every current key names a purpose, not a product', () => {
    const keys = read('lib/storage-keys.ts');
    const block = /STORAGE_KEYS = \{([\s\S]*?)\} as const;/.exec(keys)?.[1] ?? '';
    expect(block.length, 'STORAGE_KEYS not found').toBeGreaterThan(0);

    const values = [...block.matchAll(/'([^']+)'/g)].map((m) => m[1]!);
    expect(values.length).toBeGreaterThan(0);
    for (const value of values) {
      expect(value, `${value} names a product or brand`).not.toMatch(
        /astravibe|bamzuk|proyector|projector/i,
      );
      // …and not the generator's name either. A shopper's browser has no
      // business learning what built the page.
      expect(value, `${value} leaks the generator`).not.toMatch(/landing-?generator|admin/i);
      expect(value, `${value} is not namespaced by purpose`).toMatch(/^[a-z]+:[A-Za-z]/);
    }
  });

  test('the consent key is neutral too, and is declared outside this module', () => {
    // Deliberately separate: it records a legal decision with a versioned
    // schema, not a piece of UI state.
    expect(read('lib/consent.ts')).toMatch(/CONSENT_KEY = 'consent:v1'/);
  });
});

describe('the cart survives the rename; session state does not need to', () => {
  test('the cart id migrates, because localStorage outlives the deploy', () => {
    const cart = read('stores/cart.ts');
    expect(cart).toMatch(/readMigrating\(/);
    expect(cart).toMatch(/writeMigrating\(/);
    expect(cart).toMatch(/clearMigrating\(/);
    expect(cart, 'the cart store still touches localStorage directly').not.toMatch(
      /localStorage\.(get|set|remove)Item/,
    );
  });

  test('the migration is one-shot, never a permanent dual read', () => {
    // Leaving the old key behind would make the fallback permanent and the
    // rename cosmetic.
    const keys = read('lib/storage-keys.ts');
    expect(keys).toMatch(/storage\.setItem\(key, legacy\)/);
    expect(keys).toMatch(/storage\.removeItem\(legacyKey\)/);
  });

  test('storage failures degrade instead of throwing', () => {
    // A landing that cannot remember a cart is degraded, not broken. Private
    // mode must not crash the page.
    const keys = read('lib/storage-keys.ts');
    expect([...keys.matchAll(/catch\s*\{/g)].length).toBeGreaterThanOrEqual(3);
  });
});

describe('the TikTok in-app-browser fix is intact', () => {
  test('the warning requires BOTH the marker and the WebView', () => {
    // The marker alone is not enough. When a buyer follows our own advice —
    // "Abrir en navegador" — Safari reopens the SAME url, marker included. A
    // check keyed off the marker alone fires again there and blocks checkout,
    // trapping the buyer in a loop our own instruction created.
    const store = read('stores/tiktok-bio.ts');
    const fn = /export function shouldWarn\([\s\S]*?\n\}/.exec(store)?.[0] ?? '';
    expect(fn.length, 'shouldWarn not found — has it been replaced?').toBeGreaterThan(0);
    expect(fn).toMatch(/isTikTokBioSource\(\)/);
    expect(fn).toMatch(/isInAppWebView\(/);
  });

  test('the WebView detector still exists and is this template’s own', () => {
    const detector = read('lib/telemetry/webview.ts');
    expect(detector).toMatch(/export function isInAppWebView\(/);
  });

  test('the marker is latched, not re-read from the URL on every check', () => {
    // Reading the query string each time loses the marker as soon as the buyer
    // navigates away from the landing page.
    const store = read('stores/tiktok-bio.ts');
    expect(store).toMatch(/export function captureSource\(/);
    const isSource = /export function isTikTokBioSource\([\s\S]*?\n\}/.exec(store)?.[0] ?? '';
    expect(isSource, 'the source check reads the URL directly').not.toMatch(/location\.search/);
  });
});

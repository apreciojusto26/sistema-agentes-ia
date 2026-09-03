// TWO COMMERCE POSTURES, AND THE FORBIDDEN PATH BETWEEN THEM.
//
// The Fixed template could not build without Shopify credentials at all. Its
// catalog called assertEnv() unconditionally, so any generation that was not
// linked to a live product died at prerender with "Missing PUBLIC_SHOPIFY_*".
// A preview landing — the normal output of a run with no --shopify-handle —
// was therefore impossible to build.
//
// It also HARDCODED the star projector's handle inside fetchProductCommerce().
// This template is the canonical source every Fixed landing is copied from, so
// that single literal meant every generated landing, whatever it advertised,
// fetched the projector's price, variants and images. A coffee grinder's page
// would have sold a galaxy projector.
//
// ─── THE DISTINCTION THAT MUST NEVER COLLAPSE ─────────────────────────────
//
//   preview + 0 variants  ->  a valid, non-purchasable page
//   shopify + 0 variants  ->  an ERROR, and it stays one
//
// The mode is read from an explicit PUBLIC_COMMERCE_MODE, never inferred from
// a missing token or an empty variant list. Inference makes "the credentials
// are broken" and "this landing was never meant to sell" indistinguishable,
// and turns a real Shopify failure into a page that silently looks fine. That
// is the one path this system forbids: commerce requested -> Shopify fails ->
// show preview.
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const T = 'content/landing-astravibe/src';

const readRaw = (rel: string) => readFileSync(path.join(REPO_ROOT, rel), 'utf-8');
const read = (rel: string) =>
  readRaw(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*)/.test(l))
    .join('\n');

const CATALOG = `${T}/lib/shopify/catalog.ts`;
const SELECTION = `${T}/components/islands/parts/use-selection.ts`;

describe('the product handle is per-landing, never the template’s', () => {
  test('the handle is resolved from the environment, not written in the fetch', () => {
    const src = read(CATALOG);
    expect(src).toMatch(/resolveProductHandle\(/);
    expect(src).toMatch(/PUBLIC_SHOPIFY_PRODUCT_HANDLE/);
  });

  test('a missing handle throws instead of falling back', () => {
    // A silent fallback is what reintroduces the contamination: a landing for
    // product B quietly selling product A.
    const src = read(CATALOG);
    expect(src).toMatch(/throw new ShopifyError\(\s*\n?\s*'Missing PUBLIC_SHOPIFY_PRODUCT_HANDLE/);
  });

  test('the template’s own handle is reachable ONLY behind an explicit opt-in', () => {
    const src = read(CATALOG);
    // It exists exactly once, as a named constant, guarded by a flag no
    // generated output ever sets.
    expect(src).toMatch(/TEMPLATE_COMPAT_HANDLE/);
    expect(src).toMatch(/PUBLIC_SHOPIFY_TEMPLATE_COMPAT === '1'/);
    const literals = [...src.matchAll(/usb-mini-galaxy-star-projector/g)];
    expect(literals.length, 'the projector handle appears more than once').toBe(1);
  });

  test('the fetch no longer carries a handle of its own', () => {
    const src = read(CATALOG);
    expect(src).not.toMatch(/const handle\s*=\s*\n?\s*'usb-mini-galaxy/);
  });
});

describe('preview is explicit, and never inferred', () => {
  test('the mode comes from PUBLIC_COMMERCE_MODE', () => {
    expect(read(CATALOG)).toMatch(/PUBLIC_COMMERCE_MODE\?\.trim\(\) === 'preview'/);
  });

  test('the default is shopify, so nothing becomes a preview by omission', () => {
    // `? 'preview' : 'shopify'` — anything that is not the explicit opt-in
    // keeps the fail-closed posture.
    expect(read(CATALOG)).toMatch(/=== 'preview' \? 'preview' : 'shopify'/);
  });

  test('preview short-circuits BEFORE any network call', () => {
    const src = read(CATALOG);
    const preview = src.indexOf("resolveCommerceMode() === 'preview'");
    const fetchCall = src.indexOf('await storefront<');
    expect(preview, 'the preview check is missing').toBeGreaterThan(-1);
    expect(preview, 'the preview check runs after the Shopify call').toBeLessThan(fetchCall);
  });

  test('preview emits no price at all, rather than a zero', () => {
    // An empty variant list makes every purchase control resolve to its
    // unavailable state. A synthetic variant or a 0 would render "0,00 €" —
    // a fabricated price, which is worse than an absent one.
    const src = read(CATALOG);
    const fn = /function previewCommerce\(\)[\s\S]*?\n\}/.exec(src)?.[0] ?? '';
    expect(fn.length, 'previewCommerce not found').toBeGreaterThan(0);
    expect(fn).toMatch(/variants:\s*\[\]/);
    expect(fn).toMatch(/anyAvailable:\s*false/);
    expect(fn, 'preview invents a price').not.toMatch(/PriceCents:\s*\d/);
  });
});

describe('an empty variant list means different things in the two modes', () => {
  test('the client reads the SAME explicit flag, not the empty list', () => {
    const src = read(SELECTION);
    expect(src).toMatch(/PUBLIC_COMMERCE_MODE/);
    expect(src).toMatch(/isPreviewMode\(\)/);
  });

  test('shopify with zero variants still throws', () => {
    const src = read(SELECTION);
    expect(src).toMatch(/commerce\.variants is empty/);
    // …and the preview escape is checked FIRST, so the throw is unreachable
    // only in the one case where zero variants is correct.
    const previewReturn = src.indexOf('if (isPreviewMode()) return null');
    const thrown = src.indexOf("throw new Error('commerce.variants is empty");
    expect(previewReturn).toBeGreaterThan(-1);
    expect(previewReturn).toBeLessThan(thrown);
  });

  test('preview returns null rather than a placeholder selection', () => {
    expect(read(SELECTION)).toMatch(/Selection \| null/);
  });
});

describe('the purchase controls degrade honestly', () => {
  test('the buy box says it cannot sell instead of showing a disabled price', () => {
    const src = read(`${T}/components/islands/BundleSelector.tsx`);
    expect(src).toMatch(/if \(!selection\)/);
    expect(src).toMatch(/data-preview-cta="true"/);
    expect(src).toMatch(/compra no disponible/);
  });

  test('the sticky add-to-cart bar is omitted, not rendered disabled', () => {
    // A sticky bar whose one job is impossible should not follow the visitor
    // down the page advertising it.
    const src = read(`${T}/components/islands/StickyAddToCart.tsx`);
    expect(src).toMatch(/if \(!selection\) return null;/);
  });

  test('the sticky bar’s early return sits AFTER its hooks', () => {
    // Returning before the hooks would change hook order between a preview
    // build and a commerce build — a real React violation, and one that would
    // only show up in whichever mode was built second.
    const src = read(`${T}/components/islands/StickyAddToCart.tsx`);
    const lastHook = Math.max(src.lastIndexOf('useEffect('), src.lastIndexOf('useStore('));
    expect(src.indexOf('if (!selection) return null;')).toBeGreaterThan(lastHook);
  });
});

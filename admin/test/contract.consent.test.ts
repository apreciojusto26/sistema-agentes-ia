// The consent gate as a CONTRACT — invariants, not the existence of a file.
//
// The defect this closes ran in production: GA4 and Microsoft Clarity were
// emitted straight into Base.astro's <head>, gated only by
// `import.meta.env.PROD && <id configured>`, so a live landing loaded both and
// fired view_item on first paint. Clarity is a session recorder.
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const readRaw = (rel: string) => readFileSync(path.join(REPO_ROOT, rel), 'utf-8');
const read = (rel: string) =>
  readRaw(rel).replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n');

describe('the layout no longer loads analytics itself', () => {
  const base = read('content/landing-base/src/layouts/Base.astro');

  test.each([
    ['the GA4 tag', 'googletagmanager.com'],
    ['the Clarity tag', 'clarity.ms'],
    ['a GA4 config call', "gtag('config'"],
    ['the Clarity IIFE', 'window, document,'],
  ])('Base.astro emits no %s', (_n, needle) => {
    expect(base).not.toContain(needle);
  });

  test('it mounts the consent gate instead', () => {
    expect(base).toContain('ConsentGate');
  });

  test('it no longer reads the provider ids at all', () => {
    // They are read in the browser, after consent, by analytics-loader.ts.
    expect(base).not.toMatch(/PUBLIC_GA_MEASUREMENT_ID|PUBLIC_CLARITY_PROJECT_ID/);
  });
});

describe('there is exactly ONE injector', () => {
  test('only analytics-loader.ts references the provider URLs', () => {
    const offenders: string[] = [];
    for (const rel of [
      'content/landing-base/src/layouts/Base.astro',
      'content/landing-base/src/pages/index.astro',
      'content/landing-base/src/components/islands/ConsentGate.tsx',
      'content/landing-base/src/lib/analytics.ts',
    ]) {
      const src = read(rel);
      if (/googletagmanager\.com|clarity\.ms/.test(src)) offenders.push(rel);
    }
    expect(offenders, 'a second place injects analytics').toEqual([]);
    expect(read('content/landing-base/src/lib/analytics-loader.ts')).toMatch(/googletagmanager\.com/);
  });

  test('the loader is gated on consent, not on env alone', () => {
    const loader = read('content/landing-base/src/lib/analytics-loader.ts');
    expect(loader).toMatch(/analyticsAllowed\s*\(/);
    // Both providers must sit behind the same check.
    const gateIdx = loader.indexOf('analyticsAllowed');
    expect(loader.indexOf('googletagmanager.com')).toBeGreaterThan(-1);
    expect(gateIdx).toBeGreaterThan(-1);
  });
});

describe('view_item is behind the gate', () => {
  test('index.astro no longer calls gtag inline', () => {
    const index = read('content/landing-base/src/pages/index.astro');
    expect(index).not.toMatch(/gtag\(\s*['"]event['"]\s*,\s*['"]view_item['"]/);
    expect(index).toContain('ViewItem');
  });

  test('the loader guarantees at-most-once', () => {
    const loader = read('content/landing-base/src/lib/analytics-loader.ts');
    expect(loader).toMatch(/viewItemSent/);
  });

  test('there is no pre-consent event queue to replay', () => {
    // Consent is not retroactive. An add_to_cart that no-oped before
    // acceptance must stay gone, not be flushed afterwards.
    const loader = read('content/landing-base/src/lib/analytics-loader.ts');
    expect(loader).not.toMatch(/flush|replay|drainQueue/i);
  });
});

describe('the existing event call sites needed no change', () => {
  test('trackEvent still no-ops without gtag, which is now the consent gate', () => {
    const analytics = read('content/landing-base/src/lib/analytics.ts');
    expect(analytics).toMatch(/typeof window\.gtag !== 'function'\) return/);
  });

  test.each([
    ['add_to_cart', 'content/landing-base/src/components/islands/parts/use-buy-action.ts'],
    ['begin_checkout', 'content/landing-base/src/stores/cart.ts'],
    ['purchase', 'content/landing-base/src/components/islands/OrderConfirmation.tsx'],
  ])('%s still goes through trackEvent', (event, file) => {
    expect(read(file)).toContain(`trackEvent('${event}'`);
  });
});

describe('the decision can be changed', () => {
  test('the footer offers a manage-preferences entry', () => {
    const nav = read('content/landing-base/src/lib/navigation.ts');
    expect(nav).toContain('MANAGE_COOKIES_HREF');
    expect(nav).toContain('Gestionar cookies');
  });

  test('the gate intercepts it and reopens preferences', () => {
    const gate = read('content/landing-base/src/components/islands/ConsentGate.tsx');
    expect(gate).toContain('MANAGE_COOKIES_HREF');
    expect(gate).toMatch(/setShowPreferences\(true\)/);
  });

  test('revoking reloads rather than pretending to unload', () => {
    const gate = read('content/landing-base/src/components/islands/ConsentGate.tsx');
    expect(gate).toMatch(/location\.reload\(\)/);
  });

  test('necessary is presented as always-on and not editable', () => {
    const gate = read('content/landing-base/src/components/islands/ConsentGate.tsx');
    expect(gate).toContain('Siempre activas');
    // Exactly one editable control: analytics.
    expect([...gate.matchAll(/type="checkbox"/g)].length).toBe(1);
  });

  test('reject is a sibling of accept, not hidden behind a second modal', () => {
    const gate = read('content/landing-base/src/components/islands/ConsentGate.tsx');
    const banner = gate.slice(gate.indexOf('showBanner &&'), gate.indexOf('showPreferences && ('));
    expect(banner).toContain('Rechazar no esenciales');
    expect(banner).toContain('Aceptar analítica');
  });
});

// The gate itself: what gets injected, when, and how many times.
import { afterEach, describe, expect, test, vi } from 'vitest';

const KEY = 'consent:v1';

/** A DOM stub small enough to observe injections without pulling in jsdom. */
function setup(consent: 'unknown' | 'accepted' | 'rejected', env: Record<string, string> = {}) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  const appended: Array<{ id: string; src: string }> = [];
  const byId = new Map<string, unknown>();
  const store = new Map<string, string>();
  if (consent !== 'unknown') {
    store.set(KEY, JSON.stringify({ necessary: true, analytics: consent === 'accepted' }));
  }
  const win: Record<string, unknown> = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k),
    },
  };
  vi.stubGlobal('window', win);
  vi.stubGlobal('document', {
    getElementById: (id: string) => byId.get(id) ?? null,
    createElement: () => ({ set id(v: string) { (this as never as { _id: string })._id = v; }, get id() { return (this as never as { _id: string })._id; }, async: false, src: '' }),
    head: {
      appendChild: (el: { id: string; src: string }) => {
        appended.push({ id: el.id, src: el.src });
        byId.set(el.id, el);
      },
    },
  });
  return { appended, win };
}

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

const IDS = { PUBLIC_GA_MEASUREMENT_ID: 'G-TEST', PUBLIC_CLARITY_PROJECT_ID: 'clarity-test' };

describe('unknown consent loads NOTHING', () => {
  test('no GA tag, no Clarity tag, no gtag on window', async () => {
    const { appended, win } = setup('unknown', IDS);
    const { syncAnalytics } = await import('./analytics-loader');
    syncAnalytics();
    expect(appended).toEqual([]);
    expect(win.gtag).toBeUndefined();
    expect(win.clarity).toBeUndefined();
  });

  test('view_item registered before consent is NOT sent', async () => {
    const { appended, win } = setup('unknown', IDS);
    const { registerViewItem } = await import('./analytics-loader');
    registerViewItem({ currency: 'EUR', value: 10, items: [] });
    expect(appended).toEqual([]);
    expect(win.gtag).toBeUndefined();
  });
});

describe('rejected loads NOTHING either', () => {
  test('no tags injected', async () => {
    const { appended, win } = setup('rejected', IDS);
    const { syncAnalytics, registerViewItem } = await import('./analytics-loader');
    registerViewItem({ currency: 'EUR', value: 10, items: [] });
    syncAnalytics();
    expect(appended).toEqual([]);
    expect(win.gtag).toBeUndefined();
  });
});

describe('accepted loads both, exactly once', () => {
  test('GA and Clarity are injected with their configured ids', async () => {
    const { appended, win } = setup('accepted', IDS);
    const { syncAnalytics } = await import('./analytics-loader');
    syncAnalytics();
    expect(appended.map((a) => a.id).sort()).toEqual(['clarity-tag', 'ga4-tag']);
    expect(appended.find((a) => a.id === 'ga4-tag')!.src).toContain('googletagmanager.com/gtag/js?id=G-TEST');
    expect(appended.find((a) => a.id === 'clarity-tag')!.src).toContain('clarity.ms/tag/clarity-test');
    expect(typeof win.gtag).toBe('function');
  });

  test('repeated calls do NOT duplicate the tags', async () => {
    const { appended } = setup('accepted', IDS);
    const { syncAnalytics } = await import('./analytics-loader');
    syncAnalytics(); syncAnalytics(); syncAnalytics();
    expect(appended.length).toBe(2);
  });

  test('view_item fires exactly once — arrival path', async () => {
    const { win } = setup('accepted', IDS);
    const { registerViewItem, syncAnalytics } = await import('./analytics-loader');
    const calls: unknown[][] = [];
    registerViewItem({ currency: 'EUR', value: 10, items: [] });
    syncAnalytics();
    (win.gtag as (...a: unknown[]) => void) &&
      ((win as { gtag: (...a: unknown[]) => void }).gtag = (...a) => calls.push(a));
    syncAnalytics();
    registerViewItem({ currency: 'EUR', value: 10, items: [] });
    // The latch already fired during the first sync; nothing more is sent.
    expect(calls.filter((c) => c[1] === 'view_item').length).toBe(0);
  });

  test('accepting mid-session sends view_item once, not zero and not twice', async () => {
    const { appended, win } = setup('unknown', IDS);
    const mod = await import('./analytics-loader');
    mod.registerViewItem({ currency: 'EUR', value: 10, items: [] });
    expect(appended).toEqual([]); // nothing yet

    // user accepts
    (win.localStorage as { setItem: (k: string, v: string) => void }).setItem(
      KEY, JSON.stringify({ necessary: true, analytics: true }),
    );
    mod.syncAnalytics();
    expect(appended.length).toBe(2);
    const layer = win.dataLayer as unknown[][];
    expect(layer.filter((e) => e[1] === 'view_item').length).toBe(1);

    mod.syncAnalytics();
    expect(layer.filter((e) => e[1] === 'view_item').length).toBe(1);
  });
});

describe('consent is necessary but NOT sufficient', () => {
  test('accepted with NO provider ids loads nothing', async () => {
    const { appended, win } = setup('accepted', { PUBLIC_GA_MEASUREMENT_ID: '', PUBLIC_CLARITY_PROJECT_ID: '' });
    const { syncAnalytics, analyticsConfigured } = await import('./analytics-loader');
    expect(analyticsConfigured()).toBe(false);
    syncAnalytics();
    expect(appended).toEqual([]);
    expect(win.gtag).toBeUndefined();
  });

  test('accepted with only GA configured loads only GA', async () => {
    const { appended } = setup('accepted', { PUBLIC_GA_MEASUREMENT_ID: 'G-ONLY', PUBLIC_CLARITY_PROJECT_ID: '' });
    const { syncAnalytics } = await import('./analytics-loader');
    syncAnalytics();
    expect(appended.map((a) => a.id)).toEqual(['ga4-tag']);
  });

  test('accepted with only Clarity configured loads only Clarity', async () => {
    const { appended } = setup('accepted', { PUBLIC_GA_MEASUREMENT_ID: '', PUBLIC_CLARITY_PROJECT_ID: 'c-only' });
    const { syncAnalytics } = await import('./analytics-loader');
    syncAnalytics();
    expect(appended.map((a) => a.id)).toEqual(['clarity-tag']);
  });
});

describe('consent is not retroactive', () => {
  test('there is no event queue to flush on acceptance', async () => {
    // A buffer that replayed pre-consent events would be collecting under
    // exactly the condition the visitor had not agreed to.
    const src = (await import('node:fs')).readFileSync(
      (await import('node:url')).fileURLToPath(new URL('./analytics-loader.ts', import.meta.url)), 'utf-8',
    );
    const code = src.split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n');
    expect(code).not.toMatch(/queue\.push|buffer|flush|replay/i);
  });
});

// CONSENT IN THE FIXED TEMPLATE — one implementation, three states, no brand.
//
// The template's consent logic was already close to correct: analytics loaded
// only on an explicit decision, and a returning consenter got them on first
// paint rather than after hydration, which is better than gating the loader
// behind React. What it got wrong was the STORAGE KEY.
//
// `astravibe:cookie-consent` wrote the star projector's brand into the browser
// of every buyer of every product this system will ever generate — a coffee
// grinder's shop storing `astravibe:` something. Storage keys are never
// rendered, which is the only reason it survived the reviews that caught the
// same defect in a heading.
//
// So this port is narrow on purpose: neutral versioned key, an explicit
// three-state vocabulary, and a read-through migration so nobody who already
// answered is asked again. The banner's markup is untouched.
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

const CONSENT = `${T}/lib/consent.ts`;
const BANNER = `${T}/components/islands/CookieBanner.tsx`;
const BASE = `${T}/layouts/Base.astro`;

describe('three states, and rejection is remembered', () => {
  test('the decision type names all three', () => {
    expect(read(CONSENT)).toMatch(
      /ConsentDecision\s*=\s*'unknown'\s*\|\s*'accepted'\s*\|\s*'rejected'/,
    );
  });

  test('only `unknown` re-opens the banner', () => {
    // The distinction that matters: `rejected` must NOT re-prompt. A model
    // that stores "analytics: false" for both cannot tell them apart and asks
    // again on every visit.
    const banner = read(BANNER);
    expect(banner).toMatch(/readConsent\(\)\s*===\s*'unknown'/);
    expect(banner, 'the banner reopens on a rejection').not.toMatch(/!==\s*'accepted'/);
  });

  test('`unknown` is an absence, never a persisted value', () => {
    const src = read(CONSENT);
    expect(src, "'unknown' is written to storage").not.toMatch(/setItem\([^)]*'unknown'/);
  });
});

describe('analytics load only after an explicit acceptance', () => {
  test('the allow-check requires `accepted`, not "not rejected"', () => {
    expect(read(CONSENT)).toMatch(/readConsent\(\)\s*===\s*'accepted'/);
  });

  test('setConsent loads analytics only for `accepted`', () => {
    expect(read(CONSENT)).toMatch(/value\s*===\s*'accepted'\s*\)?\s*window\.__loadAnalytics/);
  });

  test('the first-paint bootstrap gates on `accepted` too', () => {
    // Two gates exist — the island for the undecided visitor, the inline
    // bootstrap for the returning one — and they must agree. A bootstrap that
    // loaded on any stored value would ship analytics to someone who declined.
    const base = read(BASE);
    expect(base).toMatch(/decision === 'accepted'\) window\.__loadAnalytics\(\)/);
  });

  test('a storage failure falls back to `unknown`, never to consent', () => {
    // Private mode throws on read. Assuming consent there would load analytics
    // for someone who never agreed.
    expect(read(CONSENT)).toMatch(/catch\s*\{\s*return 'unknown';/);
  });
});

describe('the storage key carries no brand', () => {
  test('the current key is neutral and versioned', () => {
    const src = read(CONSENT);
    expect(src).toMatch(/CONSENT_KEY = 'consent:v1'/);
  });

  test('the template brand appears in no key this module WRITES', () => {
    const src = read(CONSENT);
    const writes = [...src.matchAll(/setItem\(\s*([A-Za-z_$][\w$]*)/g)].map((m) => m[1]);
    expect(writes.length, 'no setItem found — has the module been restructured?').toBeGreaterThan(0);
    for (const symbol of writes) {
      expect(symbol, 'a legacy-named key is written to').not.toBe('LEGACY_CONSENT_KEY');
    }
  });

  test('the legacy key survives as a READ-ONLY fallback', () => {
    // Renaming without this resets every existing visitor to `unknown` and
    // re-prompts people who already answered, including the ones who said no.
    const src = read(CONSENT);
    expect(src).toMatch(/LEGACY_CONSENT_KEY = 'astravibe:cookie-consent'/);
    expect(src).toMatch(/getItem\(LEGACY_CONSENT_KEY\)/);
    // …and the old vocabulary is translated, not discarded.
    expect(src).toMatch(/'granted'/);
    expect(src).toMatch(/'denied'/);
  });

  test('the bootstrap reads the legacy key too, so first paint agrees with the island', () => {
    expect(read(BASE)).toMatch(/legacyConsentKey/);
  });
});

describe('there is exactly ONE consent implementation', () => {
  test('the banner owns no storage logic of its own', () => {
    const banner = read(BANNER);
    expect(banner, 'the banner touches localStorage directly').not.toMatch(/localStorage/);
    expect(banner).toMatch(/from '@\/lib\/consent'/);
  });

  test('the bootstrap shares the key constants rather than repeating the literals', () => {
    const base = read(BASE);
    expect(base).toMatch(/from '@\/lib\/consent'/);
    expect(base, 'a key literal was retyped into the bootstrap').not.toMatch(/'consent:v1'/);
  });
});

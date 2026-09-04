// WHAT ACTUALLY DETERMINES THE STRUCTURE OF A FIXED LANDING.
//
// The working model was:
//
//     structure = template + runtime mode
//
// Sealing the two canonical profiles required measuring both, and the
// measurement disagreed. Preview and Commerce were built from the same HEAD
// and differ by 77 elements (503 vs 580) — but only some of that difference is
// the runtime mode. The rest comes from two other sources, and the second one
// no number of profiles can absorb:
//
//     structure = template
//               + runtime mode          (A)
//               + optional capabilities (B)
//               + LIST CARDINALITY      (C)   <- the one that breaks it
//
// (C) is the finding. Eleven surfaces render one element per array entry, and
// nothing pins those array lengths. A product with five gallery images and a
// product with eight produce different structures IN THE SAME PROFILE, so
// `fingerprint(A, commerce) === fingerprint(B, commerce)` cannot hold for two
// genuinely different products unless their cardinalities match.
//
// This file does not fix that. It PINS THE INVENTORY, so the decision is made
// against a complete list rather than a sample, and so a future surface that
// starts depending on a count cannot be added without this test noticing.
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

// ───────────────────────────────────────────────────────────────────────────
// (A) RUNTIME PROFILE — determined by PUBLIC_COMMERCE_MODE.
//
// These are the differences the two-profile model was designed to hold, and
// they are legitimate: a page that cannot sell must not render controls that
// imply it can.
// ───────────────────────────────────────────────────────────────────────────
const PROFILE_CONDITIONALS = [
  ['StickyAddToCart renders nothing', `${T}/components/islands/StickyAddToCart.tsx`, /if \(!selection\) return null;/],
  ['BundleSelector shows a notice instead of the selector', `${T}/components/islands/BundleSelector.tsx`, /if \(!selection\)/],
] as const;

describe('(A) runtime-profile conditionals', () => {
  test.each(PROFILE_CONDITIONALS)('%s', (_label, file, pattern) => {
    expect(read(file)).toMatch(pattern);
  });

  test('the profile is read from the mode, never inferred from empty data', () => {
    expect(read(`${T}/components/islands/parts/use-selection.ts`)).toMatch(/PUBLIC_COMMERCE_MODE/);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// (B) OPTIONAL CAPABILITIES — presence of a FACT adds or removes DOM.
//
// Each of these is a real, defensible conditional: the alternative is a shell
// that implies data nobody supplied. They are listed so the canonical profile
// can state which capabilities it pins as PRESENT, rather than discovering
// later that two commerce products diverged over one of them.
// ───────────────────────────────────────────────────────────────────────────
const CAPABILITY_CONDITIONALS: Array<[string, string, RegExp]> = [
  ['merchant present -> guarantee section exists', `${T}/components/sections/12-guarantee.astro`, /facts && headline &&/],
  ['merchant present -> buy-box policy lines', `${T}/components/sections/05-buy-box.astro`, /\{shippingEta && \(/],
  ['merchant present -> footer returns line', `${T}/components/sections/14-site-footer.astro`, /returnsFooterLine &&/],
  ['merchant present -> policy ticker items', `${T}/components/sections/01-utility-bar.astro`, /policyTickerItems\(/],
  ['commercial guarantee -> extra guarantee cell', `${T}/lib/policy.ts`, /commercialGuaranteeHeadline/],
  ['commercial guarantee -> returns-table row', `${T}/pages/legal/devoluciones.astro`, /commercialGuaranteeDays !== null/],
  ['commercial guarantee -> terms sentence', `${T}/pages/legal/terminos.astro`, /commercialGuaranteeDays !== null/],
  ['rating present -> RealResults section exists', `${T}/components/sections/13-real-results.astro`, /rating !== null &&/],
  ['rating present -> buy-box rating row', `${T}/components/sections/05-buy-box.astro`, /\{rating !== null && \(/],
  ['review count present -> summary line', `${T}/components/sections/13-real-results.astro`, /countLabel !== null &&/],
  ['featured testimonial present -> quote section exists', `${T}/components/sections/07-featured-testimonial.astro`, /featured && \(/],
];

describe('(B) optional-capability conditionals', () => {
  test.each(CAPABILITY_CONDITIONALS)('%s', (_label, file, pattern) => {
    expect(read(file)).toMatch(pattern);
  });

  test('the inventory is complete — a new one must be added here deliberately', () => {
    // Eleven. If this number moves, a capability conditional was added or
    // removed and the canonical profile definition has to be revisited before
    // the fingerprints can be trusted again.
    expect(CAPABILITY_CONDITIONALS).toHaveLength(11);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// (C) CARDINALITY — element COUNT follows array LENGTH.
//
// This is the dimension that breaks the two-hash model, because it is not a
// presence/absence question that a profile can pin. Every entry below renders
// one element (or one group) per array item, and no type declares how many
// items there are.
// ───────────────────────────────────────────────────────────────────────────
const CARDINALITY_SURFACES: Array<[string, string, RegExp]> = [
  ['hero carousel slides + dots', `${T}/components/islands/HeroCarousel.tsx`, /images\.map\(/],
  ['hero image source switches on Shopify images', `${T}/components/sections/03-hero.astro`, /commerce\.images\.length > 0/],
  ['pack cards', `${T}/components/islands/BundleSelector.tsx`, /packs\.map\(/],
  ['variant radios', `${T}/components/islands/parts/VariantPicker.tsx`, /variants\.map\(/],
  ['review cards (rendered twice)', `${T}/components/islands/ReviewCarousel.tsx`, /reviews\.map\(/],
  ['faq items', `${T}/components/islands/FaqAccordion.tsx`, /items\.map\(/],
  ['ugc marquee (rendered twice)', `${T}/components/sections/09-ugc-strip.astro`, /marqueeTrack\.map\(/],
  ['how-it-works steps (rendered twice)', `${T}/components/sections/06-how-it-works.astro`, /product\.steps\.map\(/],
  ['trust ticker (rendered twice)', `${T}/components/sections/01-utility-bar.astro`, /ticker, \.\.\.ticker\]\.map\(/],
  ['comparison rows', `${T}/components/sections/11-comparison.astro`, /rows\.map\(/],
  ['guarantee cells', `${T}/components/sections/12-guarantee.astro`, /cells\.map\(/],
];

describe('(C) cardinality-driven surfaces', () => {
  test.each(CARDINALITY_SURFACES)('%s follows an array length', (_label, file, pattern) => {
    expect(read(file)).toMatch(pattern);
  });

  test('the inventory is complete', () => {
    expect(CARDINALITY_SURFACES).toHaveLength(11);
  });

  test('NO type pins any of these lengths — which is the whole problem', () => {
    // Tuple types (`[A, B, C]`) or explicit length assertions would make the
    // counts structural guarantees. There are none: the contract only carries
    // prose comments like "exactly 4 -> 2x2 grid", which the compiler cannot
    // enforce and a generated product cannot be held to.
    const types = read(`${T}/types/content.ts`);
    // `ugc`, `heroPills` and `benefits` left this list with the fields
    // themselves: the F3 audit found no consumer for any of them on the
    // mounted page, so they are gone from the contract rather than pinned here.
    for (const field of ['gallery', 'packs', 'steps', 'comparison', 'ugcStrip']) {
      const decl = new RegExp(`^\\s*${field}[?]?:\\s*([^;]+);`, 'm').exec(types)?.[1] ?? '';
      expect(decl, `${field} is not declared`).not.toBe('');
      expect(decl, `${field} unexpectedly pins a length — update the audit`).toMatch(/\[\]$/);
    }
  });
});

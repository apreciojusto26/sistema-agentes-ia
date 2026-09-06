// ASTRAVIBE_FIXED_STRUCTURAL_GRAMMAR_V4 — <head> becomes representable.
//
// V1/V2/V3 never modelled <head> at all: it passed through as fixed,
// unclaimed lines. Base.astro renders `og:image` only when SITE_URL AND a
// factual product photograph both exist, so a Preview build and a Commerce
// build of the SAME product hashed differently under V3 for a reason that
// has nothing to do with body structure. V4 closes exactly that gap with one
// new optional slot — see fixed-grammar-v4.mjs's own header for the full
// argument and why it needs no change to fingerprint.mjs's shared code.
//
// This file proves five things: the artifact is sealed, the artifact is
// exactly what the declarations say (not hand-edited), V4 changes nothing
// about body/layout, the two real cases now hash alike under V4, and V3
// — deliberately never touched — still does not. That last test is the
// historical record of why V4 exists, not a regression to fix.
import { describe, test, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  structuralFingerprint,
  collectUncollapsedRegions,
  CONTEXTUAL_VALUE_RULES,
  FULLY_DROPPED_ATTRS,
  VALUE_DROPPED_ATTRS,
} from '../../scripts/lib/fingerprint.mjs';
import { FIXED_GRAMMAR_V3, FIXED_OPTIONAL_SLOTS_V3 } from '../../scripts/lib/fixed-grammar-v3.mjs';
import { FIXED_GRAMMAR_V4, FIXED_OPTIONAL_SLOTS_V4, OG_IMAGE_META_SLOT } from '../../scripts/lib/fixed-grammar-v4.mjs';
import { renderGrammar, grammarHash } from '../../scripts/lib/grammar-artifact.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

/**
 * THE SEAL. Do NOT regenerate this because a test went red — see
 * contract.fixed-grammar-seal.test.ts's identical warning for V1.
 */
const V4 = 'ef688830cb98d8e1cebe782db85c1f0ce89a30725d49d559b18a1dda2a90bd5c';
const ARTIFACT = path.join(REPO_ROOT, 'scripts/lib/ASTRAVIBE_FIXED_STRUCTURAL_GRAMMAR_V4.txt');

/**
 * CASE B, REAL: outputs/1005007345199501 is a genuine build already carrying
 * SITE_URL + a real product photograph — verified directly against its own
 * .env, not assumed. CASE A is derived from it by removing exactly the one
 * line Base.astro's own source shows is the ONLY thing SITE_URL changes on
 * this page (confirmed by grepping the whole template for `Astro.site`:
 * Base.astro's og:image and three /legal/ routes, none of which are
 * index.astro) — never a fabricated page.
 */
const REAL_HTML = path.join(REPO_ROOT, 'outputs/1005007345199501/dist/client/index.html');
const OG_LINE = '<meta property="og:image" content="https://tubo-rgb.bamzuk.com/og-cover.webp">';
const REAL_BUILD_PRESENT = existsSync(REAL_HTML) && readFileSync(REAL_HTML, 'utf-8').includes(OG_LINE);

const caseB = () => readFileSync(REAL_HTML, 'utf-8');
const caseA = () => {
  const html = caseB();
  if (!html.includes(OG_LINE)) throw new Error('fixture drifted — og:image line not found verbatim');
  return html.replace(OG_LINE, '');
};

describe('the sealed grammar — V4', () => {
  test('the artifact on disk still hashes to V4', () => {
    expect(existsSync(ARTIFACT), 'the readable artifact is missing').toBe(true);
    expect(grammarHash(readFileSync(ARTIFACT, 'utf-8'))).toBe(V4);
  });

  test('the artifact matches what the declarations actually say', () => {
    // The file cannot drift from the code it documents: it is re-rendered
    // here, by the SAME renderGrammar() V1's own seal test uses, and compared.
    const rendered = renderGrammar({
      grammar: FIXED_GRAMMAR_V4,
      slots: FIXED_OPTIONAL_SLOTS_V4,
      contextualRules: CONTEXTUAL_VALUE_RULES,
      buildIdentityAttrs: FULLY_DROPPED_ATTRS,
      valueDroppedAttrs: VALUE_DROPPED_ATTRS,
    });
    expect(rendered).toBe(readFileSync(ARTIFACT, 'utf-8'));
  });

  test('readable diff over V3: ONE new optional slot, body/layout byte-identical', () => {
    // Same reference, not merely equal content — proves V4 re-exports V3's
    // regions rather than re-declaring them, so they cannot drift apart.
    expect(FIXED_GRAMMAR_V4).toBe(FIXED_GRAMMAR_V3);
    expect(FIXED_OPTIONAL_SLOTS_V4).toHaveLength(FIXED_OPTIONAL_SLOTS_V3.length + 1);
    expect(FIXED_OPTIONAL_SLOTS_V4.slice(0, -1)).toEqual(FIXED_OPTIONAL_SLOTS_V3);
    expect(FIXED_OPTIONAL_SLOTS_V4.at(-1)).toBe(OG_IMAGE_META_SLOT);
    expect(OG_IMAGE_META_SLOT.id).toBe('OgImageMeta');
  });
});

describe.runIf(REAL_BUILD_PRESENT)('Case A / Case B — the exact gap V4 closes', () => {
  test('CASE A: og:image absent (no SITE_URL) — Grammar V4 PASS', () => {
    expect(collectUncollapsedRegions(caseA(), FIXED_GRAMMAR_V4)).toEqual([]);
    expect(caseA()).not.toContain('og:image');
  });

  test('CASE B: og:image present (SITE_URL + factual OG) — Grammar V4 PASS', () => {
    expect(collectUncollapsedRegions(caseB(), FIXED_GRAMMAR_V4)).toEqual([]);
    expect(caseB()).toMatch(/<meta property="og:image" content="https:\/\/[^"]+">/);
  });

  test('BOTH cases produce the SAME canonical Grammar V4 hash', () => {
    const a = structuralFingerprint(caseA(), FIXED_GRAMMAR_V4, FIXED_OPTIONAL_SLOTS_V4);
    const b = structuralFingerprint(caseB(), FIXED_GRAMMAR_V4, FIXED_OPTIONAL_SLOTS_V4);
    expect(a.hash).toBe(b.hash);
  });

  test('V3 HISTORICAL — the SAME two cases hash DIFFERENTLY under V3, unchanged and undisturbed', () => {
    // This is the measurement that motivated V4, kept alive as a permanent
    // record rather than edited away once V4 existed. V3's own seal and
    // regions are not touched by this test in any way.
    const a = structuralFingerprint(caseA(), FIXED_GRAMMAR_V3, FIXED_OPTIONAL_SLOTS_V3);
    const b = structuralFingerprint(caseB(), FIXED_GRAMMAR_V3, FIXED_OPTIONAL_SLOTS_V3);
    expect(a.hash).not.toBe(b.hash);
    expect(a.elements).not.toBe(b.elements);
  });
});

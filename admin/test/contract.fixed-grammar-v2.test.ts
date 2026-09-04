// STRUCTURAL GRAMMAR V2 — the same AstraVibe, with social proof honestly optional.
//
// V1 IS NOT TOUCHED. It remains the sealed record of the structure as it stood
// when reviews were still written by a language model, and its own suite still
// pins it. A contract edited in place to match whatever the code now produces
// is a comment.
//
// V2 exists because F7 made CanonicalProduct.socialProof.reviews the only
// authority for reviews. A product whose provider published nothing usable
// therefore has none — and under V1 that page still rendered the reels wrapper
// around an empty carousel and empty dots, because the section always mounted.
// V1 cannot represent the honest page, so V2 declares one thing more:
//
//     OPTIONAL<ReviewsSection>
import { describe, test, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { structuralFingerprint, CONTEXTUAL_VALUE_RULES, FULLY_DROPPED_ATTRS, VALUE_DROPPED_ATTRS } from '../../scripts/lib/fingerprint.mjs';
import { renderGrammar, grammarHash } from '../../scripts/lib/grammar-artifact.mjs';
import { FIXED_GRAMMAR, FIXED_OPTIONAL_SLOTS } from '../../scripts/lib/fixed-grammar.mjs';
import {
  FIXED_GRAMMAR_V2,
  FIXED_OPTIONAL_SLOTS_V2,
  REVIEWS_SECTION_SLOT,
} from '../../scripts/lib/fixed-grammar-v2.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const V1_HASH = 'a2fc51ddf61b7dfa6a145eee7e25497a12e10669a7dfd714f07600aa586d77cd';
const V2_HASH = '82e3913a2cb7268da0b9f75f72f058fb3e248ba20aee8cf120866d0de80c9f24';
const artifact = (v: 'V1' | 'V2') =>
  readFileSync(path.join(REPO_ROOT, `scripts/lib/ASTRAVIBE_FIXED_STRUCTURAL_GRAMMAR_${v}.txt`), 'utf-8');

const WITH = path.join(REPO_ROOT, 'outputs/zz-fixed-preview/dist/client/index.html');
const WITHOUT = path.join(REPO_ROOT, 'outputs/zz-noreviews/dist/client/index.html');
const BUILT = existsSync(WITH) && existsSync(WITHOUT);

const v2 = (html: string) => structuralFingerprint(html, FIXED_GRAMMAR_V2, FIXED_OPTIONAL_SLOTS_V2);
const html = (p: string) => readFileSync(p, 'utf-8');

// ───────────────────────────────────────────────────────────────────────────
// BOTH SEALS
// ───────────────────────────────────────────────────────────────────────────

describe('V1 is history and V2 is the current profile', () => {
  test('V1 still hashes to its seal, untouched', () => {
    expect(grammarHash(artifact('V1'))).toBe(V1_HASH);
  });

  test('V2 hashes to its own seal', () => {
    expect(grammarHash(artifact('V2'))).toBe(V2_HASH);
  });

  test('neither artifact can drift from the declarations it documents', () => {
    const opts = {
      contextualRules: CONTEXTUAL_VALUE_RULES,
      buildIdentityAttrs: FULLY_DROPPED_ATTRS,
      valueDroppedAttrs: VALUE_DROPPED_ATTRS,
    };
    expect(renderGrammar({ grammar: FIXED_GRAMMAR, slots: FIXED_OPTIONAL_SLOTS, ...opts })).toBe(artifact('V1'));
    expect(renderGrammar({ grammar: FIXED_GRAMMAR_V2, slots: FIXED_OPTIONAL_SLOTS_V2, ...opts })).toBe(artifact('V2'));
  });

  test('the readable diff is ONE declaration — nothing was loosened', () => {
    const a = artifact('V1').split('\n');
    const b = artifact('V2').split('\n');
    const added = b.filter((l) => !a.includes(l));
    const removed = a.filter((l) => !b.includes(l));
    expect(removed, 'V2 dropped something V1 declared').toEqual([]);
    expect(added.some((l) => l.includes('OPTIONAL<ReviewsSection>'))).toBe(true);
    // Regions, shapes and value rules are V1's, re-exported rather than
    // re-declared, so the two cannot drift apart.
    expect(FIXED_GRAMMAR_V2).toBe(FIXED_GRAMMAR);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// POSITION AND CAPABILITY
// ───────────────────────────────────────────────────────────────────────────

describe('optional does not mean anywhere', () => {
  test('the slot is bracketed by its canonical anchors', () => {
    expect(REVIEWS_SECTION_SLOT.after).toEqual({ tag: 'section', attrs: { id: 'como-funciona' } });
    expect(REVIEWS_SECTION_SLOT.before).toEqual({ tag: 'section', attrs: { id: 'garantia' } });
  });

  test('its capability names the data that decides it', () => {
    // Not a stored boolean that could contradict the list: the projection in
    // fixed-social-proof.mjs derives presence FROM the factual reviews, so
    // "capability true, list empty" is unrepresentable upstream.
    expect(REVIEWS_SECTION_SLOT.capability).toBe('factualReviews');
  });

  test('the wrapper is matched EXACTLY, because the class is not unique', () => {
    // `bg-grape-tint` also sits on a comparison-table header cell. A slot that
    // matched two elements would be left alone as a misplacement.
    expect(REVIEWS_SECTION_SLOT.wrapper).toEqual({ tag: 'div', exactClasses: ['bg-grape-tint'] });
  });
});

// ───────────────────────────────────────────────────────────────────────────
// THE TWO PRODUCTS
// ───────────────────────────────────────────────────────────────────────────

describe.runIf(BUILT)('a product with reviews and one without are the same page', () => {
  test('with reviews: the section is present and carries real cards', () => {
    const page = html(WITH);
    expect(page).toContain('Opiniones');
    expect(page).toContain('Lo que dicen quienes ya lo tienen');
    expect(v2(page).skeleton).toContain('OPTIONAL<ReviewsSection>');
  });

  test('without reviews: the section is absent, with no empty wrapper left behind', () => {
    const page = html(WITHOUT);
    expect(page, 'the heading survived an absent section').not.toContain('Lo que dicen quienes ya lo tienen');
    expect(page, 'an empty carousel shipped').not.toContain('bg-grape-tint py-10');
    const fp = v2(page);
    expect(fp.skeleton).toContain('OPTIONAL<ReviewsSection>');
    // The V1 failure this replaces: min-1 regions rendered with nothing in them.
    expect(fp.skeleton).not.toMatch(/UNDERFILLED reviews/);
  });

  test('and both fingerprint identically under V2', () => {
    expect(v2(html(WITHOUT)).hash).toBe(v2(html(WITH)).hash);
    expect(v2(html(WITHOUT)).elements).toBe(v2(html(WITH)).elements);
  });

  test('while V1 still tells them apart — which is why V2 exists', () => {
    const v1 = (p: string) => structuralFingerprint(html(p), FIXED_GRAMMAR, FIXED_OPTIONAL_SLOTS);
    expect(v1(WITHOUT).hash).not.toBe(v1(WITH).hash);
  });

  test('the featured testimonial follows its own capability, from the same facts', () => {
    // It has always been optional, and its source is now CanonicalReview too.
    expect(html(WITHOUT)).not.toContain('bg-grape-tint md:py-16');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// THE INSIDE IS STILL PROTECTED
// ───────────────────────────────────────────────────────────────────────────

describe.runIf(BUILT)('when the section IS present, its shape is exact', () => {
  const base = () => v2(html(WITH)).hash;

  /** A mutation that changed nothing proves nothing — catch that first. */
  const mutate = (label: string, fn: (h: string) => string) => {
    const out = fn(html(WITH));
    expect(out, `the "${label}" mutation is a no-op — the probe is wrong`).not.toBe(html(WITH));
    return v2(out).hash;
  };

  test('an altered wrapper class moves the hash', () => {
    expect(mutate('wrapper class', (h) => h.replace('<div class="bg-grape-tint">', '<div class="bg-bone">'))).not.toBe(
      base(),
    );
  });

  test('an altered section class moves the hash', () => {
    expect(
      mutate('section class', (h) => h.replace('rounded-card bg-grape-tint py-10', 'rounded-tile bg-grape-tint py-10')),
    ).not.toBe(base());
  });

  test('removing the carousel moves the hash', () => {
    expect(mutate('carousel', (h) => h.replace(/<astro-island[\s\S]*?<\/astro-island>/, ''))).not.toBe(base());
  });

  test('an added element inside the section moves the hash', () => {
    expect(
      mutate('added element', (h) =>
        h.replace('<div class="bg-grape-tint">', '<div class="bg-grape-tint"><span></span>'),
      ),
    ).not.toBe(base());
  });

  test('duplicating the section moves the hash — twice is a misplacement', () => {
    // applyOptionalSlots refuses to collapse a slot it finds more than once:
    // position is structure, and "optional" never meant "any number of times".
    const page = html(WITH);
    const start = page.indexOf('<div class="bg-grape-tint">');
    const block = page.slice(start, start + 400);
    expect(v2(page.slice(0, start) + block + page.slice(start)).hash).not.toBe(base());
  });

  test('but changing the review TEXT does not — that is data', () => {
    expect(
      mutate('review text', (h) => h.replace('Lo que dicen quienes ya lo tienen', 'Opiniones reales')),
    ).toBe(base());
  });
});

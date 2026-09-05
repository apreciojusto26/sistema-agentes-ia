// STRUCTURAL GRAMMAR V3 — the comparison table, fully stated.
//
// V1 AND V2 ARE NOT TOUCHED. Both still hash to their own seals and both are
// still asserted below. A contract edited in place to match whatever the code
// now produces is a comment.
//
// V3 exists because the first real landing failed its structural gate on a
// table that was correct by every rule the system states. The model wrote
// `{ ours: true, rival: "A pilas o con enchufe" }` as its last row — a boolean
// and a string, exactly what the content contract permits and exactly what
// 11-comparison.astro renders. V2 had never seen that combination CLOSING a
// table, so the region did not collapse and the page carried eighteen extra
// elements.
//
// The gap was in the grammar, and this suite is the proof: it derives the
// state space from the component's own branches, measures which members V2
// declared, and materializes every one of them in a real build.
import { describe, test, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  structuralFingerprint,
  CONTEXTUAL_VALUE_RULES,
  FULLY_DROPPED_ATTRS,
  VALUE_DROPPED_ATTRS,
} from '../../scripts/lib/fingerprint.mjs';
import { renderGrammar, grammarHash } from '../../scripts/lib/grammar-artifact.mjs';
import { FIXED_GRAMMAR, FIXED_OPTIONAL_SLOTS } from '../../scripts/lib/fixed-grammar.mjs';
import { FIXED_GRAMMAR_V2, FIXED_OPTIONAL_SLOTS_V2 } from '../../scripts/lib/fixed-grammar-v2.mjs';
import {
  FIXED_GRAMMAR_V3,
  FIXED_OPTIONAL_SLOTS_V3,
  COMPARISON_REGION_V3,
  COMPARISON_BODY_SHAPES,
  COMPARISON_LAST_SHAPES,
} from '../../scripts/lib/fixed-grammar-v3.mjs';
import { CELL_STATES, ROW_STATES } from '../../scripts/lib/comparison-states.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

const V1_HASH = 'a2fc51ddf61b7dfa6a145eee7e25497a12e10669a7dfd714f07600aa586d77cd';
const V2_HASH = '82e3913a2cb7268da0b9f75f72f058fb3e248ba20aee8cf120866d0de80c9f24';

/**
 * THE SEAL.
 *
 * Do NOT regenerate this because a test went red. A legitimate structural
 * change is a new VERSION with its own reviewed artifact; updating this line
 * to match whatever the code now produces is how a contract becomes a comment.
 */
const V3_HASH = 'af765fce5c7d66630f660b64fba1eeab6901a0c0f8342c8c0e2d24083e46acff';

const artifact = (v: 'V1' | 'V2' | 'V3') =>
  readFileSync(path.join(REPO_ROOT, `scripts/lib/ASTRAVIBE_FIXED_STRUCTURAL_GRAMMAR_${v}.txt`), 'utf-8');

type Shape = { name: string; skeleton: string };
const v2Comparison = FIXED_GRAMMAR_V2.find((r: { id: string }) => r.id === 'comparison/rows') as {
  tuple: { prefix: number; size: number; shapes: Shape[]; lastShapes: Shape[] };
};

// ───────────────────────────────────────────────────────────────────────────
// THE THREE SEALS
// ───────────────────────────────────────────────────────────────────────────

describe('V1 and V2 are history, V3 is the current profile', () => {
  test('V1 still hashes to its seal, untouched', () => {
    expect(grammarHash(artifact('V1'))).toBe(V1_HASH);
  });

  test('V2 still hashes to its seal, untouched', () => {
    expect(grammarHash(artifact('V2'))).toBe(V2_HASH);
  });

  test('V3 hashes to its own seal', () => {
    expect(grammarHash(artifact('V3'))).toBe(V3_HASH);
  });

  test('and all three are distinct — a new version that hashes like the old one is not one', () => {
    expect(new Set([V1_HASH, V2_HASH, V3_HASH]).size).toBe(3);
  });

  test('no artifact can drift from the declarations it documents', () => {
    const opts = {
      contextualRules: CONTEXTUAL_VALUE_RULES,
      buildIdentityAttrs: FULLY_DROPPED_ATTRS,
      valueDroppedAttrs: VALUE_DROPPED_ATTRS,
    };
    expect(renderGrammar({ grammar: FIXED_GRAMMAR, slots: FIXED_OPTIONAL_SLOTS, ...opts })).toBe(artifact('V1'));
    expect(renderGrammar({ grammar: FIXED_GRAMMAR_V2, slots: FIXED_OPTIONAL_SLOTS_V2, ...opts })).toBe(artifact('V2'));
    expect(renderGrammar({ grammar: FIXED_GRAMMAR_V3, slots: FIXED_OPTIONAL_SLOTS_V3, ...opts })).toBe(artifact('V3'));
  });
});

// ───────────────────────────────────────────────────────────────────────────
// THE READABLE DIFF
// ───────────────────────────────────────────────────────────────────────────

describe('V3 widens one region and loosens nothing', () => {
  test('the diff against V2 is PURELY ADDITIVE', () => {
    const a = artifact('V2').split('\n');
    const b = artifact('V3').split('\n');
    expect(a.filter((l) => !b.includes(l)), 'V3 dropped something V2 declared').toEqual([]);
  });

  test('and every added line is a comparison shape', () => {
    const a = artifact('V2').split('\n');
    const added = artifact('V3').split('\n').filter((l) => !a.includes(l));
    // Twelve: five body states and seven closing states V2 never declared.
    expect(added).toHaveLength(12);
    for (const line of added) {
      expect(line.trim(), `${line.trim()} is not a comparison shape`).toMatch(/^TUPLE_(REPEAT|LAST)<[RL]\d\d>\s+[0-9a-f]{12}$/);
    }
    expect(added.filter((l) => l.includes('TUPLE_REPEAT'))).toHaveLength(5);
    expect(added.filter((l) => l.includes('TUPLE_LAST'))).toHaveLength(7);
  });

  test('every OTHER region is V1\'s own object, not a copy that could drift', () => {
    for (const region of FIXED_GRAMMAR_V3 as Array<{ id: string }>) {
      if (region.id === 'comparison/rows') continue;
      expect(FIXED_GRAMMAR, `${region.id} was re-declared instead of re-exported`).toContain(region);
    }
    // And the reviews section stays optional exactly as V2 made it.
    expect(FIXED_OPTIONAL_SLOTS_V3).toBe(FIXED_OPTIONAL_SLOTS_V2);
  });

  test('the comparison region itself is V1\'s, with only its shape sets grown', () => {
    const v1 = FIXED_GRAMMAR.find((r: { id: string }) => r.id === 'comparison/rows') as {
      wrapper: unknown; kind: string; min: number; zero: string; tuple: { prefix: number; size: number };
    };
    expect(COMPARISON_REGION_V3.wrapper).toBe(v1.wrapper);
    expect(COMPARISON_REGION_V3.kind).toBe(v1.kind);
    expect(COMPARISON_REGION_V3.min).toBe(v1.min);
    expect(COMPARISON_REGION_V3.zero).toBe(v1.zero);
    // The three header cells are still compared verbatim, and a row is still
    // three cells. Nothing about arity was relaxed.
    expect(COMPARISON_REGION_V3.tuple.prefix).toBe(v1.tuple.prefix);
    expect(COMPARISON_REGION_V3.tuple.size).toBe(v1.tuple.size);
  });

  test('V2\'s own shapes survive BYTE FOR BYTE under their original names', () => {
    // This is what makes the diff additive rather than a rewrite that happens
    // to have the same line count.
    for (const [declared, v2Shapes] of [
      [COMPARISON_BODY_SHAPES, v2Comparison.tuple.shapes],
      [COMPARISON_LAST_SHAPES, v2Comparison.tuple.lastShapes],
    ] as const) {
      for (const old of v2Shapes) {
        const now = (declared as Shape[]).find((s) => s.name === old.name);
        expect(now, `${old.name} disappeared in V3`).toBeTruthy();
        expect(now!.skeleton, `${old.name} was rewritten rather than kept`).toBe(old.skeleton);
      }
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// THEORETICAL · REACHABLE · COVERED
// ───────────────────────────────────────────────────────────────────────────

describe('the comparison row state space', () => {
  test('THEORETICAL: three cell states, two cells, nine rows', () => {
    // Derived from the component's branches, not from a fixture:
    //   typeof cell === 'boolean' ? (cell ? tick : cross) : <span>text</span>
    const component = readFileSync(
      path.join(REPO_ROOT, 'content/landing-astravibe/src/components/sections/11-comparison.astro'),
      'utf-8',
    );
    expect(component).toContain("typeof row.ours === 'boolean'");
    expect(component).toContain("typeof row.rival === 'boolean'");
    expect(component).toMatch(/row\.ours \? check\.path : cross\.path/);
    expect(component).toMatch(/row\.rival \? check\.path : cross\.path/);
    expect(CELL_STATES).toEqual(['check', 'cross', 'text']);
    expect(CELL_STATES.length ** 2).toBe(9);
  });

  test('REACHABLE: all nine, because the contract permits every cell value', () => {
    // `boolean | non-empty string` per cell, with no rule about position or
    // about the other cell. Nothing narrows the product of the two.
    const contract = readFileSync(path.join(REPO_ROOT, 'scripts/lib/fixed-content-output.mjs'), 'utf-8');
    expect(contract).toContain(
      "const isComparisonCell = (v) => typeof v === 'boolean' || isFilledString(v);",
    );
    expect(ROW_STATES).toHaveLength(9);
    expect(new Set(ROW_STATES.map((s) => s.id)).size).toBe(9);
  });

  test('and position multiplies rather than interacts — only the closed corner differs', () => {
    const component = readFileSync(
      path.join(REPO_ROOT, 'content/landing-astravibe/src/components/sections/11-comparison.astro'),
      'utf-8',
    );
    // The ONLY thing `isLast` decides. If it ever decided more, the closing
    // shapes would stop being the body shapes plus one class.
    expect(component).toMatch(/const isLast = i === rowCount - 1;/);
    expect([...component.matchAll(/isLast/g)]).toHaveLength(2);
    expect(component).toMatch(/isLast && 'rounded-b-card'/);
  });

  test('DECLARED: V3 covers all nine in the body and all nine closing', () => {
    expect(COMPARISON_BODY_SHAPES.map((s) => s.state).sort()).toEqual(ROW_STATES.map((s) => s.id).sort());
    expect(COMPARISON_LAST_SHAPES.map((s) => s.state).sort()).toEqual(ROW_STATES.map((s) => s.id).sort());
    // Eighteen distinct skeletons — a duplicate would mean two states render
    // identically, which would make one of them undetectable.
    const all = [...COMPARISON_BODY_SHAPES, ...COMPARISON_LAST_SHAPES];
    expect(new Set(all.map((s) => s.skeleton)).size).toBe(18);
    expect(new Set(all.map((s) => s.name)).size).toBe(18);
  });

  test('THE V2 GAP, stated exactly — this is what the first real landing hit', () => {
    const declared = (shapes: Shape[], all: Array<{ name: string; state: string }>) =>
      new Set(shapes.map((s) => all.find((a) => a.name === s.name)?.state));

    const bodyGap = ROW_STATES.map((s) => s.id).filter(
      (id) => !declared(v2Comparison.tuple.shapes, COMPARISON_BODY_SHAPES).has(id),
    );
    const lastGap = ROW_STATES.map((s) => s.id).filter(
      (id) => !declared(v2Comparison.tuple.lastShapes, COMPARISON_LAST_SHAPES).has(id),
    );

    expect(bodyGap.sort()).toEqual(['cross-check', 'cross-cross', 'cross-text', 'text-check', 'text-cross']);
    expect(lastGap.sort()).toEqual([
      'check-check', 'check-cross', 'check-text',
      'cross-check', 'cross-text', 'text-check', 'text-cross',
    ]);
    // The reported failure by name. Gemini's closing row was a tick beside a
    // value, and V2 had no shape for it.
    expect(lastGap).toContain('check-text');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// COVERED — every declared shape materialized by a real build
// ───────────────────────────────────────────────────────────────────────────
//
// "A shape nobody can produce must not sit in the grammar unexercised" is the
// rule fingerprint.mjs states about its own emission, and this is where it is
// paid for. scripts/e2e/comparison-states.mjs builds nine landings, one per
// closing state, each with all nine states in its body. Nine real `astro
// build`s — not one build and eight string compositions, which would be a test
// of this file's glue rather than of Astro's output.

const STATES_DIR = path.join(REPO_ROOT, 'outputs/zz-cmp/states');
const statePage = (id: string) => path.join(STATES_DIR, `${id}.html`);
const STATES_BUILT =
  ROW_STATES.every((s) => existsSync(statePage(s.id))) &&
  existsSync(path.join(STATES_DIR, 'reported-failure.html'));

const v3 = (html: string) => structuralFingerprint(html, FIXED_GRAMMAR_V3, FIXED_OPTIONAL_SLOTS_V3);
const v2 = (html: string) => structuralFingerprint(html, FIXED_GRAMMAR_V2, FIXED_OPTIONAL_SLOTS_V2);

describe.runIf(STATES_BUILT)('every reachable state, built for real', () => {
  test.each(ROW_STATES)('$id closes a table that V3 collapses', ({ id }) => {
    const fp = v3(readFileSync(statePage(id), 'utf-8'));
    // Collapsed means the engine RECOGNISED every group. An unknown shape
    // leaves the region verbatim, with no marker at all.
    expect(fp.skeleton, `V3 left the comparison region verbatim for a ${id} closing row`).toContain(
      'TUPLE_REPEAT<comparison/rows:',
    );
    expect(fp.skeleton).toContain('TUPLE_LAST<comparison/rows:');
  });

  test('THE V3 GATE: nine different closing states, ONE grammar', () => {
    // The whole point. Two documents whose last row differs legitimately are
    // the same page, and V3 says so.
    const hashes = ROW_STATES.map((s) => v3(readFileSync(statePage(s.id), 'utf-8')).hash);
    expect(new Set(hashes).size, `states disagree: ${JSON.stringify(hashes)}`).toBe(1);
    // And the element count, which is what actually drifted on the real run.
    const elements = ROW_STATES.map((s) => v3(readFileSync(statePage(s.id), 'utf-8')).elements);
    expect(new Set(elements).size).toBe(1);
  });

  test('while V2 tells all nine apart — which is why V3 exists', () => {
    // Under V2 not one of these pages collapses: each carries the full state
    // space in its BODY, and five of those states V2 never declared either. So
    // the region is emitted verbatim in every page, and nine pages that are the
    // same design produce nine different hashes.
    const hashes = ROW_STATES.map((s) => v2(readFileSync(statePage(s.id), 'utf-8')).hash);
    expect(new Set(hashes).size).toBe(9);
    for (const s of ROW_STATES) {
      expect(
        v2(readFileSync(statePage(s.id), 'utf-8')).skeleton,
        `V2 unexpectedly collapsed the ${s.id} page`,
      ).not.toContain('TUPLE_REPEAT<comparison/rows:');
    }
  });

  // ─── THE REPORTED FAILURE, ISOLATED ──────────────────────────────────────
  //
  // The pages above prove the whole state space, but each one exercises the
  // body gap and the closing gap at once. This is the table the first real
  // landing actually produced — four rows, every one a tick beside a value —
  // where the three body rows were ALREADY legal under V2 and only the closing
  // row was not. It is the narrowest possible statement of the bug.
  test('the exact table the first real landing produced', () => {
    const page = readFileSync(path.join(STATES_DIR, 'reported-failure.html'), 'utf-8');

    const underV2 = v2(page);
    expect(
      underV2.skeleton,
      'V2 collapsed the reported failure — the regression fixture no longer reproduces it',
    ).not.toContain('TUPLE_REPEAT<comparison/rows:');
    // The rows sit VERBATIM in the skeleton — a feature cell's own element,
    // which a collapsed region replaces with a TUPLE marker. That is where the
    // extra elements came from: the profile did not match because the page
    // grew. (Text is not in a skeleton at all; only elements are.)
    expect(underV2.skeleton).toContain('<div class="bg-surface border-graphite/10 border-t p-3 text-graphite">');
    expect(v3(page).skeleton).not.toContain(
      '<div class="bg-surface border-graphite/10 border-t p-3 text-graphite">',
    );

    const underV3 = v3(page);
    expect(underV3.skeleton).toContain('TUPLE_REPEAT<comparison/rows:');
    expect(underV3.skeleton).toContain('TUPLE_LAST<comparison/rows:L05>');
    expect(underV3.elements).toBeLessThan(underV2.elements);
  });

  test('and it now hashes exactly like every other legitimate table', () => {
    // The claim that actually matters to a generated landing: a real product's
    // comparison is the same page as the fixtures', whatever its cells say.
    const reported = v3(readFileSync(path.join(STATES_DIR, 'reported-failure.html'), 'utf-8'));
    const canonical = v3(readFileSync(statePage('check-text'), 'utf-8'));
    expect(reported.hash).toBe(canonical.hash);
  });

  test('and the body states are covered by the same builds', () => {
    // Each page carries all nine states BEFORE its closing row, so a single
    // page proves every non-final shape materializes.
    const fp = v3(readFileSync(statePage('text-text'), 'utf-8'));
    for (const shape of COMPARISON_BODY_SHAPES) {
      expect(fp.skeleton, `${shape.name} (${shape.state}) is not emitted`).toContain(
        `TUPLE_REPEAT<comparison/rows:${shape.name}>`,
      );
    }
    for (const shape of COMPARISON_LAST_SHAPES) {
      expect(fp.skeleton).toContain(`TUPLE_LAST<comparison/rows:${shape.name}>`);
    }
  });

  test('a shape that is NOT reachable still fails — V3 did not open the region', () => {
    // The calibration. A table whose row carries a fourth cell, or whose
    // closing row lost its closed corner, must not be absorbed.
    const page = readFileSync(statePage('check-text'), 'utf-8');
    const base = v3(page).hash;

    const mutate = (label: string, fn: (h: string) => string) => {
      const out = fn(page);
      expect(out, `the "${label}" mutation is a no-op — the probe is wrong`).not.toBe(page);
      return v3(out).hash;
    };

    // A closing corner in the wrong place: the table now ends without one.
    expect(mutate('lost closed corner', (h) => h.replace(/ rounded-b-card/, ''))).not.toBe(base);
    // A changed cell class is a design change, not a data change.
    expect(
      mutate('cell class', (h) => h.replace('bg-grape-tint p-3 text-center', 'bg-bone p-3 text-center')),
    ).not.toBe(base);
  });

  test('but the row TEXT does not move the hash — that is data', () => {
    const page = readFileSync(statePage('check-text'), 'utf-8');
    const renamed = page.replace(/Característica 1/g, 'Otra cosa');
    expect(renamed).not.toBe(page);
    expect(v3(renamed).hash).toBe(v3(page).hash);
  });
});

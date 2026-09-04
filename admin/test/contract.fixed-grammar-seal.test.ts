// ASTRAVIBE_FIXED_STRUCTURAL_GRAMMAR_V1 — the seal, and everything it rests on.
//
// The claim: two unrelated products, built through this template, produce the
// SAME structural grammar. Not similar — identical. Everything that differs
// between them is data, and lives in metadata that is deliberately not part of
// the hash.
//
// The fixtures are a ceramic aroma diffuser and a solid-oak cutting board.
// They differ in brand, copy, price, rating, media files, media dimensions and
// the cardinality of every collection, and B carries a sold-out variant and no
// commercial guarantee. If the grammar still matches, the template is doing
// its one job.
//
// THE HASH IS OF THE GRAMMAR, NOT OF A PAGE. A digest of rendered HTML is a
// digest of one product. V1 seals the declared artifact — regions, shapes,
// optional slots and value rules — so it answers "what does this template
// permit", which is the question Fixed actually asks.
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
import { FIXED_GRAMMAR, FIXED_OPTIONAL_SLOTS } from '../../scripts/lib/fixed-grammar.mjs';
import { renderGrammar, grammarHash } from '../../scripts/lib/grammar-artifact.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const T = path.join(REPO_ROOT, 'content/landing-astravibe');

/**
 * THE SEAL.
 *
 * Do NOT regenerate this because a test went red. A legitimate structural
 * change is a new VERSION with its own reviewed artifact; updating this line
 * to match whatever the code now produces is how a contract becomes a
 * comment. The readable artifact next to it exists so a proposed V2 can be
 * diffed and argued about rather than merely noticed.
 */
const V1 = 'a2fc51ddf61b7dfa6a145eee7e25497a12e10669a7dfd714f07600aa586d77cd';

const ARTIFACT = path.join(REPO_ROOT, 'scripts/lib/ASTRAVIBE_FIXED_STRUCTURAL_GRAMMAR_V1.txt');

/** The four A/B builds. Absent unless they have been generated — see below. */
const build = (who: 'a' | 'b', mode: 'preview' | 'commerce') =>
  path.join(T, `dist-ab-${who}-${mode}/client/index.html`);

const BUILDS_PRESENT = (['a', 'b'] as const).every((w) =>
  (['preview', 'commerce'] as const).every((m) => existsSync(build(w, m))),
);

const grammarOf = (who: 'a' | 'b', mode: 'preview' | 'commerce') =>
  structuralFingerprint(readFileSync(build(who, mode), 'utf-8'), FIXED_GRAMMAR, FIXED_OPTIONAL_SLOTS);

const html = (who: 'a' | 'b', mode: 'preview' | 'commerce') => readFileSync(build(who, mode), 'utf-8');

describe('the sealed grammar', () => {
  test('the artifact on disk still hashes to V1', () => {
    expect(existsSync(ARTIFACT), 'the readable artifact is missing').toBe(true);
    expect(grammarHash(readFileSync(ARTIFACT, 'utf-8'))).toBe(V1);
  });

  test('the artifact matches what the declarations actually say', () => {
    // The file cannot drift from the code it documents: it is re-rendered here
    // and compared. A change to a region, a shape, a slot or a value rule
    // moves this and forces a deliberate re-seal.
    const rendered = renderGrammar({
      grammar: FIXED_GRAMMAR,
      slots: FIXED_OPTIONAL_SLOTS,
      contextualRules: CONTEXTUAL_VALUE_RULES,
      buildIdentityAttrs: FULLY_DROPPED_ATTRS,
      valueDroppedAttrs: VALUE_DROPPED_ATTRS,
    });
    expect(rendered).toBe(readFileSync(ARTIFACT, 'utf-8'));
  });

  test('it declares twelve regions and one optional slot', () => {
    expect(FIXED_GRAMMAR).toHaveLength(12);
    expect(FIXED_GRAMMAR.filter((r: { tuple?: unknown }) => r.tuple)).toHaveLength(1);
    expect(FIXED_OPTIONAL_SLOTS).toHaveLength(1);
  });
});

describe.runIf(BUILDS_PRESENT)('two unrelated products, one grammar', () => {
  test('A and B agree in PREVIEW', () => {
    expect(grammarOf('a', 'preview').hash).toBe(grammarOf('b', 'preview').hash);
  });

  test('A and B agree in COMMERCE', () => {
    expect(grammarOf('a', 'commerce').hash).toBe(grammarOf('b', 'commerce').hash);
  });

  test('preview and commerce do NOT agree, and are not forced to', () => {
    // A real runtime difference: preview renders a notice where commerce
    // renders a selector, and has no sticky purchase bar. Collapsing them
    // would mean rendering controls a preview cannot honour.
    expect(grammarOf('a', 'preview').hash).not.toBe(grammarOf('a', 'commerce').hash);
  });

  test('every declared region normalized — none was left verbatim', () => {
    // A region left verbatim is the engine reporting an undeclared shape. In
    // commerce every region is materialized, so all twelve must collapse.
    const sk = grammarOf('a', 'commerce').skeleton;
    const missing = FIXED_GRAMMAR.filter(
      (r: { id: string }) => !sk.includes(`REPEAT<${r.id}:`) && !sk.includes(`TUPLE_REPEAT<${r.id}:`),
    ).map((r: { id: string }) => r.id);
    expect(missing).toEqual([]);
  });

  test('the optional slot is represented in BOTH products', () => {
    // A fills it, B does not — and both carry the marker, at the same place.
    for (const who of ['a', 'b'] as const) {
      expect(grammarOf(who, 'commerce').skeleton).toContain('OPTIONAL<FeaturedTestimonial>');
    }
  });

  test('capability binding: the slot is filled in A and empty in B', () => {
    // The grammar says the slot MAY be filled; this says whether it WAS. The
    // two claims are deliberately separate, and this is the one about data.
    // Matched on the SECTION element, not on a class substring: `bg-grape-tint`
    // and `text-center` also occur together on every variant pill, so a loose
    // pattern reports the slot as filled in both products.
    const SECTION = /<section class="relative overflow-hidden bg-grape-tint[^"]*text-center/;
    expect(html('a', 'commerce'), 'A should render the featured testimonial').toMatch(SECTION);
    expect(html('b', 'commerce'), 'B has no quote testimonial, so the slot is empty').not.toMatch(SECTION);
  });
});

describe.runIf(BUILDS_PRESENT)('accessibility relationships survive canonicalization', () => {
  // The fingerprint abstracts the ORDINALS inside a repeated item. These
  // assertions run on the real HTML, where the ordinals are still there, so
  // the wiring is proved rather than assumed.
  const ids = (h: string) => [...h.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]!);

  test.each([
    ['a', 'preview'], ['a', 'commerce'], ['b', 'preview'], ['b', 'commerce'],
  ] as const)('%s %s — every DOM id is unique', (who, mode) => {
    const all = ids(html(who, mode));
    expect(all.length - new Set(all).size, `duplicate ids: ${all.filter((x, i) => all.indexOf(x) !== i)}`).toBe(0);
  });

  test.each([
    ['a', 'preview'], ['a', 'commerce'], ['b', 'preview'], ['b', 'commerce'],
  ] as const)('%s %s — aria-controls and aria-labelledby resolve', (who, mode) => {
    const h = html(who, mode);
    const present = new Set(ids(h));
    for (const attr of ['aria-controls', 'aria-labelledby']) {
      for (const m of h.matchAll(new RegExp(`\\s${attr}="([^"]+)"`, 'g'))) {
        expect(present.has(m[1]!), `${attr}="${m[1]}" points at nothing`).toBe(true);
      }
    }
  });

  test('no FAQ trigger points at another item\'s panel', () => {
    const h = html('a', 'commerce');
    for (const m of h.matchAll(/id="faq-trigger-(\d+)"[^>]*aria-controls="faq-panel-(\d+)"/g)) {
      expect(m[2], 'a trigger is cross-linked to another panel').toBe(m[1]);
    }
  });
});

// FAMILY SETS THE DIRECTION, THE DESIGNSPEC OVERRIDES WITHIN IT.
//
// This was believed rather than known. A first reading of the CSS concluded
// from selector specificity that `body[data-design-family=...]` (0,1,1) must
// beat the `@theme` block Tailwind compiles to `:root` (0,1,0) — so the family
// would win. Measured with computed styles on a real build, the DesignSpec's
// value won instead, and toggling the family attribute changed nothing.
//
// The reason is a third rule the generator emits, which the deduction had not
// accounted for:
//
//   :root, :host                              (0,1,0)  @theme, patched
//   body[data-design-family="luxury"]         (0,1,1)  family preset
//   body[data-design-family][data-density]    (0,2,1)  DesignSpec overrides
//
// TWO attributes on purpose. A token the product explicitly chose is never
// overwritten by its family; a token it did not choose still comes from the
// family. That is exactly the intended architecture — but nothing asserted it,
// which is why an hour went into re-deriving it from a bundle.
//
// Asserted GENERICALLY: no family name is hardcoded, so the invariant survives
// a family being added, renamed or retuned.
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel: string) => readFileSync(path.join(REPO_ROOT, rel), 'utf-8');

/** Crude but sufficient: (id, class/attr/pseudo-class, element) counts. */
function specificity(selector: string): [number, number, number] {
  const s = selector.trim();
  const ids = (s.match(/#[\w-]+/g) ?? []).length;
  const attrs = (s.match(/\[[^\]]+\]/g) ?? []).length + (s.match(/\.[\w-]+/g) ?? []).length;
  const pseudoClasses = (s.match(/:(?!:)[\w-]+/g) ?? []).length;
  const elements = (s.match(/(^|[\s>+~,])[a-z][\w-]*/gi) ?? []).length;
  return [ids, attrs + pseudoClasses, elements];
}

const gt = (a: [number, number, number], b: [number, number, number]) =>
  a[0] !== b[0] ? a[0] > b[0] : a[1] !== b[1] ? a[1] > b[1] : a[2] > b[2];

describe('theme overrides beat family presets, by construction', () => {
  const GENERATOR = read('scripts/generate-landing.mjs');
  const DESIGN_SYSTEM_CSS = read('content/landing-base/src/styles/design-system.css');
  // TWO TESTS WERE REMOVED HERE, and the capability with them.
  //
  // They read scripts/generate-landing.mjs for the DesignSpec override block —
  // its two-attribute selector and the comment explaining its specificity.
  // The Fixed generator no longer emits either: it consumes no spec, because
  // the structure is sealed and there is nothing for one to decide.
  //
  // The three assertions that remain inspect content/landing-base's own
  // stylesheet, which still exists and is still Version A tooling. They are
  // untouched.

  test('that selector outranks EVERY family preset in the stylesheet', () => {
    const familySelectors = [
      ...DESIGN_SYSTEM_CSS.matchAll(/^(body\[data-design-family=[^\]]+\])\s*\{/gm),
    ].map((m) => m[1]);

    expect(familySelectors.length, 'no family presets found — the scanner is looking at the wrong shape')
      .toBeGreaterThan(0);

    const override = specificity('body[data-design-family][data-density]');
    for (const sel of familySelectors) {
      expect(gt(override, specificity(sel)), `${sel} ties or beats the DesignSpec override`).toBe(true);
    }
  });

  test('and it outranks the @theme block, which Tailwind compiles to :root', () => {
    expect(gt(specificity('body[data-design-family][data-density]'), specificity(':root'))).toBe(true);
  });

  test('the family presets are still ABOVE the baseline — family is a real default', () => {
    // The other half of the contract: a token the DesignSpec does NOT set must
    // still come from the family, not from the untouched template value.
    const familySelectors = [
      ...DESIGN_SYSTEM_CSS.matchAll(/^(body\[data-design-family=[^\]]+\])\s*\{/gm),
    ].map((m) => m[1]);
    for (const sel of familySelectors) {
      expect(gt(specificity(sel), specificity(':root')), `${sel} does not beat :root`).toBe(true);
    }
  });

});

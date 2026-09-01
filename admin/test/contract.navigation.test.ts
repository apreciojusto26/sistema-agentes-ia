// Section anchors as a CONTRACT.
//
// The footer used to build its links from a local array of labels and render
// every one of them as `<a href="#">` — a single href in the whole file. Fixing
// that needed ids that did not exist: only `id="buy"` was present anywhere.
//
// So the ids live in lib/navigation.ts, the sections import them, the footer
// imports them, and this file makes the pairing mechanical instead of hopeful.
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const readRaw = (rel: string) => readFileSync(path.join(REPO_ROOT, rel), 'utf-8');
/** Source scans strip comments — the standing convention in this repo. */
const read = (rel: string) =>
  readRaw(rel).replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n');

const B = 'content/landing-base/src';
const nav = read(`${B}/lib/navigation.ts`);

describe('the ids are declared once', () => {
  test.each([['BuyBox', 'buy'], ['HowItWorks', 'how-it-works'], ['Faq', 'faq'], ['Guarantee', 'guarantee']])(
    '%s -> %s',
    (key, id) => expect(nav).toContain(`${key}: '${id}'`),
  );

  test('they are English kebab, not the visible Spanish copy', () => {
    // An id is a stable contract; "Cómo funciona" is editorial text a Content
    // Agent may reword. The convention follows the pre-existing id="buy".
    for (const bad of ['como-funciona', 'preguntas-frecuentes', 'garantia']) {
      expect(nav, `${bad} is derived from copy`).not.toContain(bad);
    }
  });
});

describe('EVERY variant of an anchored capability emits its id', () => {
  // The trap: anchoring only the variant the default spec happens to use, so
  // the footer silently breaks for any landing that picks the sibling.
  test.each([
    ['Faq/Accordion', `${B}/design-system/blocks/conversion/Faq/Accordion.astro`, 'Faq'],
    ['Faq/OpenList', `${B}/design-system/blocks/conversion/Faq/OpenList.astro`, 'Faq'],
    ['HowItWorks/VerticalSteps', `${B}/design-system/blocks/product/HowItWorks/VerticalSteps.astro`, 'HowItWorks'],
    ['HowItWorks/HorizontalTimeline', `${B}/design-system/blocks/product/HowItWorks/HorizontalTimeline.astro`, 'HowItWorks'],
    // ONE row now, not two. conversion/Guarantee absorbed
    // conversion/ProductGuarantee, and 12-guarantee.astro is a one-line shim —
    // pointing a MUST-CONTAIN assertion at it would be green-but-empty, so the
    // shim gets the opposite guard in the test right below instead.
    ['Guarantee', `${B}/design-system/blocks/conversion/Guarantee/Default.astro`, 'Guarantee'],
  ])('%s', (_n, file, key) => {
    const src = read(file);
    expect(src).toContain(`id={SECTION_ANCHORS.${key}}`);
    expect(src, 'anchor hardcoded instead of imported').not.toMatch(/id="(how-it-works|faq|guarantee)"/);
  });

  test('the Guarantee shim emits no anchor of its own', () => {
    // The inverse guard. If markup ever came back to the shim it could grow a
    // second id="guarantee", which is exactly the collision that merging the
    // two capabilities removed.
    const shim = read(`${B}/components/sections/12-guarantee.astro`);
    expect(shim, 'the shim emits an anchor again').not.toMatch(/id=/);
    expect(shim, 'the shim no longer delegates to the block').toContain(
      'blocks/conversion/Guarantee/Default.astro',
    );
  });

  test('a capability contributes exactly ONE target to a landing', () => {
    // Both variants carry the id, but `section-duplicate-type` already stops a
    // spec composing two of the same capability — so a valid landing has one.
    const contract = read('scripts/lib/design-contract.mjs');
    expect(contract).toContain('section-duplicate-type');
  });
});

describe('the footer builds from that same source', () => {
  const footer = read(`${B}/components/sections/14-site-footer.astro`);

  test('no second array of labels lives in the component', () => {
    expect(footer).toContain("from '@/lib/navigation'");
    expect(footer).toContain('FOOTER_COLUMNS.map');
    expect(footer).toContain('href={link.href}');
    expect(footer, 'the footer hardcodes an href again').not.toMatch(/href="[^{]/);
  });

  test('every INTERNAL anchor points at an id some section really emits', () => {
    const anchors = [...nav.matchAll(/href: `#\$\{SECTION_ANCHORS\.(\w+)\}`/g)].map((m) => m[1]);
    expect(anchors.length).toBeGreaterThan(0);
    for (const key of anchors) {
      expect(nav, `${key} is not a declared anchor`).toMatch(new RegExp(`${key}: '`));
    }
    expect(anchors.sort()).toEqual(['Faq', 'Guarantee', 'HowItWorks']);
  });
});

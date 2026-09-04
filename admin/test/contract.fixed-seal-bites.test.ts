// THE TWO GUARDS THAT PROVE THE SEALS ARE LOAD-BEARING.
//
// Every other contract test asserts that something IS a certain way. These two
// assert that it CANNOT QUIETLY STOP BEING that way, which is a different and
// much easier thing to get wrong:
//
//   1. A grammar permissive enough to absorb any change is not a contract.
//      Structural Grammar V1 deliberately normalizes cardinality, ordinals and
//      a handful of scoped attribute values. If that normalization went one
//      step too far, every hash comparison in the suite would pass forever
//      while the template drifted underneath. So: mutate real built HTML and
//      require the hash to MOVE.
//
//   2. The Fixed pipeline is supposed to have left content/landing-base
//      behind. Source assertions prove no file NAMES it; they cannot prove no
//      file READS it. So: actually corrupt landing-base, actually run the
//      generator, and require the output to be unchanged.
import { describe, test, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync, writeFileSync, rmSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { structuralFingerprint } from '../../scripts/lib/fingerprint.mjs';
import { FIXED_GRAMMAR, FIXED_OPTIONAL_SLOTS } from '../../scripts/lib/fixed-grammar.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const REFERENCE = path.join(
  REPO_ROOT,
  'content/landing-astravibe/dist-ab-a-commerce/client/index.html',
);

// ───────────────────────────────────────────────────────────────────────────
// GUARD 1 — the grammar is calibrated, not merely permissive
// ───────────────────────────────────────────────────────────────────────────

describe.runIf(existsSync(REFERENCE))('Structural Grammar V1 bites', () => {
  const HTML = existsSync(REFERENCE) ? readFileSync(REFERENCE, 'utf-8') : '';
  const hash = (h: string) => structuralFingerprint(h, FIXED_GRAMMAR, FIXED_OPTIONAL_SLOTS).hash;
  const BASE = existsSync(REFERENCE) ? hash(HTML) : '';

  /** A mutation that did not change the string proves nothing — catch that first. */
  const mutate = (label: string, fn: (h: string) => string) => {
    const out = fn(HTML);
    expect(out, `the "${label}" mutation is a no-op — the probe is wrong, not the grammar`).not.toBe(
      HTML,
    );
    return out;
  };

  describe('structural change MOVES the hash', () => {
    test('an added element', () => {
      expect(hash(mutate('added element', (h) => h.replace('<footer', '<div></div><footer')))).not.toBe(BASE);
    });

    test('a removed element', () => {
      expect(hash(mutate('removed element', (h) => h.replace(/<footer[\s\S]*?<\/footer>/, '')))).not.toBe(BASE);
    });

    test('a changed heading level', () => {
      // h3 -> h4 keeps every element, every class and every byte of text. Only
      // the document outline changes, and the outline is structure.
      expect(
        hash(mutate('heading level', (h) => h.replace(/<h3 /g, '<h4 ').replace(/<\/h3>/g, '</h4>'))),
      ).not.toBe(BASE);
    });

    test('a changed class', () => {
      // Classes are deliberately NOT normalized: in a Tailwind template the
      // class list IS the layout, so `bg-grape-tint` -> `bg-blue-500` is a
      // design change even though the DOM tree is identical.
      expect(
        hash(
          mutate('class', (h) =>
            h.replace('class="relative overflow-hidden bg-grape-tint', 'class="relative overflow-hidden bg-blue-500'),
          ),
        ),
      ).not.toBe(BASE);
    });

    test('two sections swapped, with the byte count unchanged', () => {
      // The interesting case: same elements, same classes, same total length —
      // only the ORDER differs. A grammar that hashed a multiset of shapes
      // would report this as identical, and section order is exactly what the
      // removed Design Agent used to decide.
      const span = (id: string): [number, number] => {
        const start = HTML.indexOf(`<section id="${id}"`);
        expect(start, `section#${id} is missing from the reference build`).toBeGreaterThan(-1);
        const re = /<(\/?)section\b/g;
        re.lastIndex = start;
        let depth = 0;
        for (let m = re.exec(HTML); m; m = re.exec(HTML)) {
          depth += m[1] ? -1 : 1;
          if (depth === 0) return [start, re.lastIndex + HTML.slice(re.lastIndex).indexOf('>') + 1];
        }
        throw new Error(`unbalanced section#${id}`);
      };
      const [aStart, aEnd] = span('garantia');
      const [bStart, bEnd] = span('faq');
      const swapped =
        HTML.slice(0, aStart) +
        HTML.slice(bStart, bEnd) +
        HTML.slice(aEnd, bStart) +
        HTML.slice(aStart, aEnd) +
        HTML.slice(bEnd);
      expect(swapped).not.toBe(HTML);
      expect(swapped.length, 'the swap changed the length — not the clean test intended').toBe(HTML.length);
      expect(hash(swapped)).not.toBe(BASE);
    });
  });

  describe('data change does NOT move the hash', () => {
    // The other half of the calibration. Without these, "the hash moves" would
    // be satisfied by hashing the raw file, which would make the grammar
    // useless for its actual purpose: comparing two different products.
    test('changed text', () => {
      expect(hash(mutate('text', (h) => h.replace(/Preguntas frecuentes/g, 'Dudas habituales')))).toBe(BASE);
    });

    test('a different image file', () => {
      expect(hash(mutate('image src', (h) => h.replace(/src="\/_astro\/[^"]+"/, 'src="/_astro/other.webp"')))).toBe(
        BASE,
      );
    });
  });
});

// ───────────────────────────────────────────────────────────────────────────
// GUARD 2 — the Fixed pipeline does not read landing-base
// ───────────────────────────────────────────────────────────────────────────

const MARKER = 'MARKER_LANDING_BASE_CONTAMINATION';
const BASE_TEMPLATE = path.join(REPO_ROOT, 'content/landing-base');
const MARKER_FILE = path.join(BASE_TEMPLATE, 'GUARD_MARKER.txt');
const TOUCHED = path.join(BASE_TEMPLATE, 'src/types/content.ts');
const FIXTURE = path.join(REPO_ROOT, 'admin/test/fixtures/minimal-content.json');

const git = (...args: string[]) => execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf-8' });

/**
 * Refuses to run against a dirty landing-base.
 *
 * The test corrupts a tracked file on purpose and restores it with `git
 * checkout --`. If someone has uncommitted work there, that restore would
 * destroy it, so the test skips instead. A guard that can eat your changes is
 * worse than no guard.
 */
const BASE_CLEAN = existsSync(BASE_TEMPLATE) && git('status', '--porcelain', 'content/landing-base').trim() === '';

describe.runIf(BASE_CLEAN && existsSync(FIXTURE))('corrupting landing-base changes nothing', () => {
  /** Content hash of the whole tree, minus the two fields that are per-run by design. */
  const treeHash = (root: string) => {
    const h = createHash('sha256');
    const walk = (dir: string, rel = '') => {
      for (const entry of readdirSync(dir).sort()) {
        if (entry === '.git') continue;
        const full = path.join(dir, entry);
        const key = rel ? `${rel}/${entry}` : entry;
        if (statSync(full).isDirectory()) {
          walk(full, key);
          continue;
        }
        h.update(key);
        // .generation.json legitimately records the slug and a timestamp.
        h.update(
          key === '.generation.json'
            ? readFileSync(full, 'utf-8').replace(/"(slug|generatedAt)":\s*"[^"]*"/g, '"$1":"<per-run>"')
            : readFileSync(full),
        );
      }
    };
    walk(root);
    return h.digest('hex');
  };

  const generate = (slug: string) => {
    execFileSync('node', ['scripts/generate-landing.mjs', '--slug', slug, '--content', FIXTURE, '--force'], {
      cwd: REPO_ROOT,
      encoding: 'utf-8',
    });
    return path.join(REPO_ROOT, 'outputs', slug);
  };

  let clean = '';
  let contaminated = '';
  let contaminatedDir = '';

  beforeAll(() => {
    const cleanDir = generate('guard-base-clean');
    clean = treeHash(cleanDir);
    rmSync(cleanDir, { recursive: true, force: true });

    try {
      writeFileSync(MARKER_FILE, `${MARKER}\n`);
      writeFileSync(TOUCHED, `// ${MARKER}\n${readFileSync(TOUCHED, 'utf-8')}`);
      contaminatedDir = generate('guard-base-dirty');
      contaminated = treeHash(contaminatedDir);
    } finally {
      rmSync(MARKER_FILE, { force: true });
      git('checkout', '--', 'content/landing-base');
    }
  }, 120_000);

  test('the generated tree is byte-identical', () => {
    // Not "no marker found" — IDENTICAL. A read of landing-base that happened
    // to miss the two corrupted files would still be a read.
    expect(contaminated).toBe(clean);
  });

  test('the marker reached nothing', () => {
    const found: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        if (entry === '.git') continue;
        const full = path.join(dir, entry);
        if (statSync(full).isDirectory()) walk(full);
        else if (readFileSync(full, 'utf-8').includes(MARKER)) found.push(full);
      }
    };
    walk(contaminatedDir);
    expect(found).toEqual([]);
    rmSync(contaminatedDir, { recursive: true, force: true });
  });

  test('and landing-base was restored', () => {
    // The test corrupted tracked source. If this fails, the working tree is
    // dirty and that matters more than the assertion above it.
    expect(git('status', '--porcelain', 'content/landing-base').trim()).toBe('');
  });
});

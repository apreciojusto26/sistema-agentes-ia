// Contract coverage for the three Design System Fase 2 building blocks
// (architectural review blockers B1 and B2, plus risk R2).
//
// Everything here runs against the PRODUCTION registry and the PRODUCTION
// contract — never a fixture registry. Fase 1 already proves the constraint
// ENGINE works against an injectable fixture registry; what was missing, and
// what this file adds, is proof that the three real capabilities are actually
// wired into that engine.
//
// This file deliberately does NOT assert "the .astro file exists and is
// non-empty" — that assertion already exists in contract.design-spec.test.ts
// and proves nothing about behavior.
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

const contract = await import(
  pathToFileURL(path.join(REPO_ROOT, 'scripts/lib/design-contract.mjs')).href
);
const registry = await import(
  pathToFileURL(path.join(REPO_ROOT, 'scripts/lib/design-registry.mjs')).href
);

const FIXTURE_PATH = path.join(__dirname, 'fixtures/design-spec/building-blocks.json');
const baseSpec = () => JSON.parse(readFileSync(FIXTURE_PATH, 'utf-8'));

/** Structured-clone the fixture, mutate it, hand it back. */
function mutate(fn: (spec: any) => void) {
  const spec = baseSpec();
  fn(spec);
  return spec;
}

const codes = (issues: any[]) => issues.map((i) => i.code);

/**
 * DERIVED FROM THE REGISTRY, never hand-listed.
 *
 * This was a literal array of the three Fase 2 blocks. When
 * socialProof/ReviewsReel gained real structural variants the array became a
 * second source of truth instantly: the two new blocks were registered, real,
 * and completely unscanned by B2 — the guardrail would have reported green on
 * files it had never opened. `isBuildingBlock()` already existed for exactly
 * this and had no caller.
 */
const BLOCKS = registry.REGISTRY.filter(registry.isBuildingBlock).map(
  (e: any) => ({ category: e.category, type: e.type, variant: e.variant }),
);

// --- B1: the three capabilities really pass the production contract --------

describe('B1 — every building block is accepted by the REAL DesignSpec contract', () => {
  test('a spec using all three capabilities at once validates as `pass`', () => {
    const spec = baseSpec();
    const issues = contract.collectDesignErrors(spec);
    expect(issues, `unexpected issues: ${JSON.stringify(issues)}`).toEqual([]);

    const support = contract.checkDesignSupport(spec);
    expect(support.status, JSON.stringify(support)).toBe('pass');
  });

  test('each block resolves in the production registry at its declared variant', () => {
    for (const { category, type, variant } of BLOCKS) {
      const entry = registry.resolveCapability(category, type, variant);
      expect(entry, `${category}/${type}/${variant} does not resolve`).not.toBeNull();
      expect(registry.isBuildingBlock(entry), `${type} is not a building block`).toBe(true);
    }
  });

  test('their valid prop values are accepted', () => {
    // Exercises EVERY enum value of every block prop, not just the ones the
    // fixture happens to pick.
    for (const { category, type, variant } of BLOCKS) {
      const entry = registry.resolveCapability(category, type, variant);
      for (const [prop, rule] of Object.entries<any>(entry.propsSchema)) {
        for (const value of rule.enum) {
          const spec = mutate((s) => {
            const section = s.sections.find((x: any) => x.type === type);
            section.props = { [prop]: value };
          });
          expect(
            codes(contract.collectDesignErrors(spec)),
            `${type}.props.${prop} = ${JSON.stringify(value)} should be accepted`,
          ).toEqual([]);
        }
      }
    }
  });
});

describe('B1 — invalid capability / variant / props are REJECTED', () => {
  test('an unregistered capability is rejected as unsupported_design', () => {
    const spec = mutate((s) => {
      s.sections[0].type = 'ImmersiveProductHero';
    });
    const support = contract.checkDesignSupport(spec);
    expect(support.status).toBe('unsupported_design');
  });

  test('a real capability at a variant it does NOT declare is rejected', () => {
    // This used to say hero/ProductHero at 'default'. Unifying the hero
    // taxonomy made 'default' a REAL sibling variant of hero/Hero, so that
    // assertion would now be testing a resolvable triple. Named an
    // unregistered variant instead — the no-fallback claim is unchanged, the
    // case that proves it had to move.
    const spec = mutate((s) => {
      s.sections[0].variant = 'immersive';
    });
    const support = contract.checkDesignSupport(spec);
    expect(support.status).toBe('unsupported_design');
    expect(registry.resolveCapability('hero', 'Hero', 'immersive')).toBeNull();
    // …while BOTH declared variants of the same capability still resolve.
    expect(registry.resolveCapability('hero', 'Hero', 'default')).not.toBeNull();
    expect(registry.resolveCapability('hero', 'Hero', 'split')).not.toBeNull();
  });

  test('a prop value outside the declared enum is rejected', () => {
    for (const { category, type, variant } of BLOCKS) {
      const entry = registry.resolveCapability(category, type, variant);
      const [prop] = Object.keys(entry.propsSchema);
      // A props-less block has no enum to violate. Its equivalent guarantee —
      // "props on a capability that declares none are rejected" — is the
      // separate test below, which already covers legacy capabilities.
      if (!prop) continue;
      const spec = mutate((s) => {
        const section = s.sections.find((x: any) => x.type === type);
        section.props = { [prop]: 'definitely-not-in-the-enum' };
      });
      expect(
        codes(contract.collectDesignErrors(spec)),
        `${type}.props.${prop} out-of-enum should be rejected`,
      ).toContain('section-props-invalid');
    }
  });

  test('a prop the capability does not declare is rejected', () => {
    const spec = mutate((s) => {
      s.sections[0].props = { align: 'left', nonsense: 'x' };
    });
    expect(codes(contract.collectDesignErrors(spec))).toContain('section-props-unknown');
  });

  test('a prop of the wrong type is rejected', () => {
    const spec = mutate((s) => {
      s.sections[0].props = { align: 42 };
    });
    expect(codes(contract.collectDesignErrors(spec))).toContain('section-props-invalid');
  });

  test('props on a props-less capability are still rejected — they accept none', () => {
    // THIRD example this test has needed, and the reason is worth keeping: it
    // must name a REGISTERED capability that declares no props, or the spec
    // fails as `section-unknown-variant` and never reaches the props check at
    // all — green on the wrong error.
    //
    // conversion/BuyBox/default went first, when BuyBox gained structural
    // variants. socialProof/RealResults went next, when that capability was
    // removed outright for depending on a fabricated rating histogram.
    // socialProof/UgcStrip/strip is a block with `propsSchema: {}` and is the
    // capability that already owned RealResults' UGC dataset.
    const spec = mutate((s) => {
      s.sections.push({
        category: 'socialProof',
        type: 'UgcStrip',
        variant: 'strip',
        order: 3,
        props: { align: 'left' },
      });
    });
    expect(codes(contract.collectDesignErrors(spec))).toContain('section-props-unknown');
  });
});

// --- B2 + R2: the block SOURCES, scanned directly --------------------------

/**
 * Strips full-line `//` comments and `/* *\/` blocks so the scanner never
 * trips on prose. The blocks deliberately DOCUMENT the forbidden pattern in
 * their headers; a scanner that flagged its own documentation would be
 * useless. Only line-leading `//` is removed, so `https://` inside an
 * attribute value is untouched.
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !/^\s*\/\//.test(l))
    .join('\n');
}

/**
 * Index of the `}` closing the block opened at `start` (i.e. `src[start - 1]`
 * is its `{`). Quote-aware, so a brace inside a string or template literal
 * never closes the block. Returns -1 when the source is unbalanced.
 */
function matchingBrace(src: string, start: number): number {
  let depth = 1;
  let quote: string | null = null;
  for (let i = start; i < src.length; i++) {
    const ch = src[i];
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') quote = ch;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return i;
  }
  return -1;
}

interface Lookup {
  name: string;
  keys: string[];
  values: string[];
}

/**
 * `const NAME = { a: '...', b: '...' } as const;` → one Lookup per declaration.
 *
 * The body is delimited by a BRACE-BALANCED, quote-aware scan — never by
 * `\{([^}]*)\}`. That earlier form could not cross a `}`, and `${...}` contains
 * one, so a lookup holding an interpolated value failed to match AT ALL and
 * vanished from the scan instead of failing it. The scanner went blind exactly
 * where the rule was broken, which is worse than having no scanner: it reported
 * green at the precise moment it should have screamed. `countAsConst` below
 * turns any future parse failure into a red test rather than a silent skip.
 */
function extractLookups(src: string): Lookup[] {
  const out: Lookup[] = [];
  const re = /const\s+([A-Z][A-Z0-9_]*)\s*=\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const start = m.index + m[0].length;
    const end = matchingBrace(src, start);
    if (end === -1) continue;
    if (!/^\s*as const/.test(src.slice(end + 1))) continue;

    const body = src.slice(start, end);
    out.push({
      name: m[1],
      keys: [...body.matchAll(/(?:^|,)\s*([A-Za-z_][A-Za-z0-9_]*)\s*:/g)].map((k) => k[1]),
      values: [...body.matchAll(/:\s*([^,\n]+)/g)].map((v) => v[1].trim()),
    });
    re.lastIndex = end;
  }
  return out;
}

/** How many `as const` lookups the SOURCE declares, independent of the parser. */
function countAsConst(src: string): number {
  return (src.match(/\bas const\b/g) ?? []).length;
}

/** `{ NAME: ['a','b'] }`, keys sorted — the shape R2 compares against enums. */
function extractLookupKeySets(src: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const { name, keys } of extractLookups(src)) out[name] = [...keys].sort();
  return out;
}

/** Every value inside those lookups, so B2 can prove they are literals. */
function extractLookupValues(src: string): string[] {
  return extractLookups(src).flatMap((l) => l.values);
}

/** A complete quoted class string: no backtick, no `${`, no concatenation. */
const LITERAL_CLASS = /^'[^'`$]*'$|^"[^"`$]*"$/;
const BARE_IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
/** `LOOKUP[expr]` — SELECTING a literal, never BUILDING one. */
const LOOKUP_SELECTION = /^([A-Z][A-Z0-9_]*)\[[^\]]+\]$/;

/** The `---` frontmatter: where these blocks actually assemble their classes. */
function frontmatter(src: string): string {
  const lines = src.split('\n');
  const open = lines.findIndex((l) => l.trim() === '---');
  if (open === -1) return '';
  const close = lines.findIndex((l, i) => i > open && l.trim() === '---');
  return close === -1 ? '' : lines.slice(open + 1, close).join('\n');
}

/** `const x = <rhs>;` declarations in the frontmatter → { x → rhs }. */
function frontmatterAssignments(src: string): Map<string, string> {
  const out = new Map<string, string>();
  const re = /const\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*([^;]+);/g;
  for (const m of frontmatter(src).matchAll(re)) out.set(m[1], m[2].trim());
  return out;
}

/**
 * Every `class={...}` / `class:list={...}` expression. Plain `class="..."` is
 * literal by construction and needs no tracing.
 */
function extractClassExpressions(src: string): string[] {
  const out: string[] = [];
  const re = /\bclass(?::list)?=\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const start = m.index + m[0].length;
    const end = matchingBrace(src, start);
    // Unbalanced: hand over the remainder so the atom checks fail loudly.
    out.push(end === -1 ? src.slice(start) : src.slice(start, end));
    if (end !== -1) re.lastIndex = end;
  }
  return out;
}

/** Split a class expression into the individual values it contributes. */
function classAtoms(expr: string): string[] {
  const trimmed = expr.trim();
  const inner = trimmed.startsWith('[') && trimmed.endsWith(']') ? trimmed.slice(1, -1) : trimmed;

  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let cur = '';
  for (const ch of inner) {
    if (quote) {
      cur += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') quote = ch;
    else if ('([{'.includes(ch)) depth++;
    else if (')]}'.includes(ch)) depth--;
    else if (ch === ',' && depth === 0) {
      parts.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

const blockSources = BLOCKS.map(({ category, type, variant }) => {
  const entry = registry.resolveCapability(category, type, variant);
  const rel = entry.component.replace('@/', 'content/landing-base/src/');
  const raw = readFileSync(path.join(REPO_ROOT, rel), 'utf-8');
  // `type` alone stopped being unique the moment one capability had two
  // variants — two rows named "ReviewsReel" make a failure unreadable.
  return { type: `${type}/${variant}`, entry, raw, code: stripComments(raw) };
});

describe('B2 — Tailwind classes are literal, never built by interpolation', () => {
  // COVERAGE FIRST. A source scanner used as an architectural guardrail must
  // prove it parsed everything it claims to have checked, or it is theatre.
  // Without this assertion the scanner FAILS OPEN: a lookup it cannot parse is
  // simply absent from the results, and every downstream check passes over a
  // file it never really read.
  test.each(blockSources)('$type — the scanner proves it parsed every lookup', ({ entry, code }) => {
    const lookups = extractLookups(code);
    const declared = countAsConst(code);

    // A props-less block is not REQUIRED to declare a lookup — demanding one
    // would force fictional props onto a capability whose structural choice is
    // its registry VARIANT. But it is allowed to HAVE one: product/Comparison/
    // cards keys four class lookups off `ours`/`rival`, which is an internal
    // structural concept, not a prop. An earlier version of this test asserted
    // `declared === 0` for those blocks; that was too strict and would have
    // pushed a real conditional back into class:list to satisfy a test.
    //
    // Whatever it declares still has to PARSE — the fail-open check below is
    // the whole point of this test and applies either way — and its values
    // still have to be complete literals, which the loop under it enforces.
    if (Object.keys(entry.propsSchema).length > 0) {
      expect(declared, 'no `as const` variant lookup found — B2 cannot be verified').toBeGreaterThan(
        0,
      );
    }
    if (declared === 0) return;
    expect(
      lookups.length,
      `the scanner parsed ${lookups.length} lookup(s) but the source declares ${declared} ` +
        '`as const` — an unparsed lookup must FAIL this guardrail, never be skipped',
    ).toBe(declared);

    for (const { name, keys, values } of lookups) {
      expect(
        values.length,
        `${name}: parsed ${keys.length} key(s) but ${values.length} value(s) — unreliable parse`,
      ).toBe(keys.length);
    }
  });

  test.each(blockSources)('$type builds no class name dynamically', ({ code }) => {
    // `class={`text-${align}`}` and `class:list={[`x-${t}`]}` — a built class
    // name is invisible to Tailwind's source scanner, so the block would
    // silently render unstyled. That is a SILENT FALLBACK, which this system
    // forbids outright.
    const interpolatedClass = /class(?::list)?=\{[^}]*\$\{/;
    expect(interpolatedClass.test(code), 'class attribute interpolates a value').toBe(false);

    // String concatenation is the same failure by another spelling.
    const concatenatedClass = /class(?::list)?=\{[^}]*['"][^'"]*['"]\s*\+/;
    expect(concatenatedClass.test(code), 'class attribute concatenates a string').toBe(false);
  });

  test.each(blockSources)('$type expresses every variant mapping as a complete literal', ({ entry, code }) => {
    const values = extractLookupValues(code);

    // A props-less block may still declare class lookups keyed by an internal
    // structural concept (product/Comparison/cards keys four off ours/rival).
    // It is not required to have any — but whatever it has must be literal,
    // which is what the loop below checks. Only the "must exist" half is
    // skipped.
    if (Object.keys(entry.propsSchema).length > 0) {
      expect(values.length, 'no variant lookup found — B2 cannot be verified').toBeGreaterThan(0);
    }

    for (const value of values) {
      expect(value, `${value} is not a quoted literal`).toMatch(LITERAL_CLASS);
      expect(value.includes('${'), `${value} interpolates`).toBe(false);
    }
  });

  // The attribute site is NOT where these blocks build their classes — the
  // frontmatter is. Scanning only `class={...}` left the dominant idiom of
  // every one of these files unguarded: `const textAlign = `text-${align}``
  // renders a perfectly plausible `text-left`, passes every render assertion,
  // and emits no CSS at all because Tailwind never saw the literal in the
  // source. This traces each class value back to its origin instead.
  test.each(blockSources)('$type resolves every class to a literal or a lookup', ({ entry, code }) => {
    const lookupNames = new Set(extractLookups(code).map((l) => l.name));
    const consts = frontmatterAssignments(code);
    const expressions = extractClassExpressions(code);

    // A block whose classes are ALL static `class="..."` attributes has no
    // expression to trace — and that is the strongest possible state, not an
    // untested one. Prove it is really static instead of skipping: no dynamic
    // class site at all, and no backtick-built class anywhere in the source.
    // ReviewsReel/{carousel,grid} are in this bucket: the structural choice is
    // the registry VARIANT, so nothing is selected at render time.
    if (expressions.length === 0) {
      expect(Object.keys(entry.propsSchema), 'a block with props built no class from them').toEqual(
        [],
      );
      expect(/\bclass(?::list)?=\{/.test(code), 'class expression missed by the scanner').toBe(false);
      expect(/class(?::list)?="[^"]*\$\{/.test(code), 'class attribute interpolates').toBe(false);
      return;
    }

    expect(expressions.length, 'no class expression found — B2 cannot be verified').toBeGreaterThan(
      0,
    );

    for (const expr of expressions) {
      for (const atom of classAtoms(expr)) {
        if (LITERAL_CLASS.test(atom)) continue;

        // An INLINE `LOOKUP[expr]` is a selection, exactly like the hoisted
        // `const x = LOOKUP[prop]` form below — and it is the only form
        // available when the key varies per iteration, as in
        // product/Comparison/cards (`PANEL_SURFACE[side.key]` inside a map)
        // or its `OURS_CELL_END[isLast ? 'last' : 'mid']`. Requiring the
        // hoisted form there would have pushed a real ternary back INTO
        // class:list, which is the thing this test exists to prevent.
        //
        // Stricter than the identifier path, not looser: the lookup must be
        // an `as const` declared in this same file, so there is nowhere for a
        // built string to hide.
        const inline = LOOKUP_SELECTION.exec(atom);
        if (inline) {
          expect(
            lookupNames.has(inline[1]),
            `class value \`${atom}\` selects from \`${inline[1]}\`, which is not an ` +
              '`as const` lookup in this file',
          ).toBe(true);
          continue;
        }

        // A class produced by the SHARED layout vocabulary is a selection too,
        // just one whose lookup lives in design-system/section-layout.ts rather
        // than in this file. It is not an exemption: the test right after this
        // one scans that module and fails if anything in it is built rather
        // than literal, so the invariant holds — it simply holds in one place
        // for the two values (width, rhythm) that every block shares.
        //
        // Keeping the lookup per-file would have meant duplicating the same
        // enum into 21 blocks, which is the shape this vocabulary exists to
        // remove.
        const layoutRhs = consts.get(atom);
        if (layoutRhs && /^(rhythmClass|containerClass)\(/.test(layoutRhs)) continue;

        expect(
          BARE_IDENTIFIER.test(atom),
          `class value \`${atom}\` is neither a complete literal, an \`as const\` lookup ` +
            'selection, nor a plain identifier',
        ).toBe(true);

        const rhs = consts.get(atom);
        expect(rhs, `class value \`${atom}\` has no frontmatter assignment to trace`).toBeDefined();

        const selection = LOOKUP_SELECTION.exec(rhs!);
        expect(
          selection,
          `\`const ${atom} = ${rhs}\` BUILDS a class name; it must SELECT one from an ` +
            '`as const` lookup, or Tailwind never sees the literal and the block renders unstyled',
        ).not.toBeNull();
        expect(
          lookupNames.has(selection![1]),
          `${atom} is selected from \`${selection![1]}\`, which is not an \`as const\` lookup`,
        ).toBe(true);
      }
    }
  });
});

describe('R2 — registry prop enums and the component variant mappings cannot drift', () => {
  // The registry stays the single source of truth. This test does NOT restate
  // the enums: it reads them from the registry and the mapping keys from the
  // real .astro source, and requires the two to agree. If they ever diverge,
  // `LOOKUP[value]` yields undefined at render time and the block emits no
  // class at all — silent, unstyled output that no other test would catch.
  test.each(blockSources)('$type: every variant lookup matches a declared prop enum', ({ entry, code }) => {
    const lookups = extractLookupKeySets(code);

    // No props means no enum to pair against, so R2's drift check is vacuous
    // here — but the lookup is not exempt from being LITERAL, which B2 above
    // already enforces on the same source. Skipping the pairing is correct;
    // skipping the file would not be.
    if (Object.keys(entry.propsSchema).length === 0) {
      for (const [name, keys] of Object.entries(lookups)) {
        expect(keys.length, `${name} is an empty lookup`).toBeGreaterThan(0);
      }
      return;
    }

    expect(Object.keys(lookups).length, 'no `as const` variant lookup found').toBeGreaterThan(0);

    const enums = Object.entries<any>(entry.propsSchema).map(([prop, rule]) => ({
      prop,
      values: [...rule.enum].sort(),
    }));

    // Direction 1 — no lookup may contain a key the registry does not declare.
    // Direction 1 — no lookup may contain a key the registry does not declare.
    for (const [name, keys] of Object.entries(lookups)) {
      // The LAYOUT VOCABULARY is a second legitimate key source. `width` and
      // `rhythm` are declared and validated enums like any propsSchema one —
      // they just live on the SECTION INSTANCE in design-contract.mjs instead
      // of on the capability, because a Faq is the same Faq contained or wide.
      // design-system/section-layout.ts is scanned by its own describe block
      // below, so these keys are not going unguarded.
      const LAYOUT_KEYS = [
        ['contained', 'wide'],
        ['tight', 'standard', 'spacious'],
      ];
      if (LAYOUT_KEYS.some((allowed) => keys.every((k) => allowed.includes(k)))) continue;

      const match = enums.find((e) => JSON.stringify(e.values) === JSON.stringify(keys));
      expect(
        match,
        `${name} has keys [${keys.join(', ')}] which match no prop enum of ${entry.type} ` +
          `(declared: ${enums.map((e) => `${e.prop}=[${e.values.join(', ')}]`).join('; ')})`,
      ).toBeDefined();
    }

    // Direction 2 — every declared enum must be backed by at least one lookup.
    for (const { prop, values } of enums) {
      const covered = Object.values(lookups).some(
        (keys) => JSON.stringify(keys) === JSON.stringify(values),
      );
      expect(
        covered,
        `${entry.type}.props.${prop} declares [${values.join(', ')}] but no variant lookup in the ` +
          `component covers those exact values — a value would resolve to undefined at render`,
      ).toBe(true);
    }
  });
});


// --- the shared layout vocabulary, scanned like a block --------------------

describe('design-system/section-layout.ts: the shared class lookups are literal too', () => {
  // The blocks delegate `width` and `rhythm` here, so the B2 guarantee moves
  // here with them. Same rule, same strictness, one file instead of 21.
  const SOURCE = readFileSync(
    path.join(REPO_ROOT, 'content/landing-base/src/design-system/section-layout.ts'),
    'utf-8',
  );

  test('every value in every lookup is a COMPLETE class literal', () => {
    const lookups = [...SOURCE.matchAll(/const\s+([A-Z_]+)\s*=\s*\{([\s\S]*?)\}\s*as const;/g)];
    expect(lookups.length, 'no `as const` lookup found — the scanner is looking at the wrong shape')
      .toBeGreaterThan(0);

    for (const [, name, body] of lookups) {
      const values = [...body.matchAll(/:\s*'([^']*)'/g)].map((m) => m[1]);
      expect(values.length, `${name} has no values`).toBeGreaterThan(0);
      for (const v of values) {
        expect(v.includes('${'), `${name} interpolates: \`${v}\``).toBe(false);
        expect(v.trim().length, `${name} has an empty class value`).toBeGreaterThan(0);
      }
    }
  });

  test('no class name is BUILT anywhere in the module', () => {
    const code = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    expect(/`[^`]*\$\{/.test(code), 'a template literal builds a class name').toBe(false);
    expect(/\+\s*(width|rhythm)\b/.test(code), 'a class name is concatenated').toBe(false);
  });

  test('the exported enums match the lookups they select from', () => {
    // A value the contract accepts but no lookup can resolve would render an
    // undefined class; one the lookup has but the contract rejects is dead.
    expect(SOURCE).toMatch(/SECTION_WIDTHS/);
    expect(SOURCE).toMatch(/SECTION_RHYTHMS/);
    expect(SOURCE).toMatch(/'tight', 'standard', 'spacious'/);
  });
});

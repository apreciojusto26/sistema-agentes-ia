import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
// Safe to import: type-only shape, zero runtime asset deps (unlike
// images.ts/videos.ts, which pull .jpg/.mp4 through Astro's asset pipeline
// and would break this node-environment test).
import { faq } from '@/data/faq';
import { product } from '@/data/product';
import { testimonials } from '@/data/testimonials';

// Anti-drift contract suite (reconcile-spec-reality). Parses anchored JSON
// blocks embedded in CLAUDE.md / agents.MD and asserts them against the real
// filesystem / real product data, so editing the docs without updating
// reality (or vice versa) breaks this suite. See design doc D-A/D-B.

const HERE = dirname(fileURLToPath(import.meta.url));
// .../content/landing-base/src/lib
const LANDING_BASE = resolve(HERE, '../..');
const REPO_ROOT = resolve(HERE, '../../../..');

/**
 * Case-exact existence check. Plain `existsSync` is case-INSENSITIVE on
 * APFS and would report `CLAUDE.md` present even when the real file on
 * disk is still `claude.MD` — that false positive is exactly the accident
 * this suite exists to catch, so every check here goes through this helper
 * instead of `existsSync`.
 */
function existsExact(dir: string, base: string): boolean {
  return readdirSync(dir).includes(base);
}

/**
 * Case-exact existence check for a repo-root-relative path (file OR
 * directory). Delegates to `existsExact` on the resolved parent/basename
 * pair so this inherits the same APFS case-insensitivity guard.
 */
function pathExistsExact(repoRelativePath: string): boolean {
  const full = resolve(REPO_ROOT, repoRelativePath);
  try {
    return existsExact(dirname(full), basename(full));
  } catch {
    return false;
  }
}

/**
 * Extracts the first ```json fenced block following an HTML-comment anchor
 * `<!-- spec:{name} -->`. Anchoring on the comment (never on prose) keeps
 * this parser robust to surrounding text changes while still coupling the
 * test directly to the doc's own contract block. Missing anchor is a loud,
 * explanatory failure — never a silent empty result.
 */
function extractAnchoredJson(text: string, anchorName: string): unknown {
  const anchor = `<!-- spec:${anchorName} -->`;
  const anchorIdx = text.indexOf(anchor);
  if (anchorIdx === -1) {
    throw new Error(
      `anchor "spec:${anchorName}" not found — the normative contract block was removed or renamed`,
    );
  }
  const after = text.slice(anchorIdx + anchor.length);
  const fenceMatch = after.match(/```json\s*\n([\s\S]*?)```/);
  if (!fenceMatch) {
    throw new Error(
      `anchor "spec:${anchorName}" found but no \`\`\`json fenced block follows it`,
    );
  }
  return JSON.parse(fenceMatch[1]);
}

describe('spec-contract: A0 repo layout sanity', () => {
  it('repo root contains exactly CLAUDE.md (case-exact)', () => {
    const found = existsExact(REPO_ROOT, 'CLAUDE.md');
    expect(
      found,
      `Expected repo root to contain exactly "CLAUDE.md" (case-sensitive). ` +
        `Found "claude.MD". On APFS auto-injection works by luck alone.`,
    ).toBe(true);
  });

  it('repo root contains exactly agents.MD (case-exact)', () => {
    const found = existsExact(REPO_ROOT, 'agents.MD');
    expect(
      found,
      `Expected repo root to contain exactly "agents.MD" (case-sensitive).`,
    ).toBe(true);
  });

  it('content/landing-base resolves from import.meta.url', () => {
    const found = existsExact(REPO_ROOT, 'content');
    expect(
      found,
      `Expected "content" directory at repo root, resolved from import.meta.url.`,
    ).toBe(true);
    expect(existsExact(resolve(REPO_ROOT, 'content'), 'landing-base')).toBe(
      true,
    );
    // LANDING_BASE must point at this very package (src/lib is two levels
    // under it) — sanity check the resolution math itself, not just the
    // filesystem contents.
    expect(existsExact(LANDING_BASE, 'src')).toBe(true);
  });
});

describe('spec-contract: A5 no fictional/forbidden terms in prose', () => {
  // Case-sensitive path fragments — real code never spells them any other
  // way, so this also lets the docs safely say e.g. "Tailwind JS/TS config
  // file" (capital T, no literal dot) to EXPLAIN that no such file exists,
  // without tripping the guard.
  const FORBIDDEN_PATHS = ['content.json', 'tailwind.config', 'base-template', '/public/images'];

  function scanFile(relPath: string): string[] {
    const full = resolve(REPO_ROOT, relPath);
    const lines = readFileSync(full, 'utf-8').split('\n');
    const hits: string[] = [];
    lines.forEach((line, idx) => {
      const lineNo = idx + 1;
      for (const term of FORBIDDEN_PATHS) {
        if (line.includes(term)) {
          hits.push(
            `${relPath}:${lineNo} mentions forbidden path "${term}" — does not exist in repo\n  > ${line.trim()}`,
          );
        }
      }
      if (/\bproblem\b/i.test(line)) {
        hits.push(
          `${relPath}:${lineNo} mentions forbidden section name "problem" — removed per D3, no such component exists\n  > ${line.trim()}`,
        );
      }
    });
    return hits;
  }

  it('CLAUDE.md and agents.MD contain none of the fictional paths or the removed "problem" section', () => {
    const hits = [...scanFile('CLAUDE.md'), ...scanFile('agents.MD')];
    expect(hits, `Forbidden terms found:\n${hits.join('\n')}`).toEqual([]);
  });
});

describe('spec-contract: A1 file-mapping block matches disk', () => {
  it('every {role, path} entry in CLAUDE.md spec:file-mapping resolves on disk', () => {
    const text = readFileSync(resolve(REPO_ROOT, 'CLAUDE.md'), 'utf-8');
    const mapping = extractAnchoredJson(text, 'file-mapping') as Array<{
      role: string;
      path: string;
    }>;

    expect(Array.isArray(mapping) && mapping.length > 0, 'spec:file-mapping must be a non-empty array').toBe(
      true,
    );

    const missing: string[] = [];
    for (const entry of mapping) {
      // No `mustExist:false` escape hatch by design — every entry is
      // checked, unconditionally, against the real filesystem.
      if (!pathExistsExact(entry.path)) {
        missing.push(`role "${entry.role}": path "${entry.path}" does not exist (case-exact) at repo root`);
      }
    }
    expect(missing, `Missing paths:\n${missing.join('\n')}`).toEqual([]);
  });
});

type SectionsOrderBlock = {
  sections_order: Array<{ component: string; file: string }>;
  islands: Array<{ component: string; note?: string }>;
};

function readSectionsOrderBlock(): SectionsOrderBlock {
  const text = readFileSync(resolve(REPO_ROOT, 'agents.MD'), 'utf-8');
  return extractAnchoredJson(text, 'sections-order') as SectionsOrderBlock;
}

describe('spec-contract: A2 sections_order maps to real component files', () => {
  it('every sections_order entry maps to a real src/components/sections/*.astro file, count 15, contiguous 01..15', () => {
    const block = readSectionsOrderBlock();
    const sectionsDir = resolve(REPO_ROOT, 'content/landing-base/src/components/sections');

    const missing: string[] = [];
    block.sections_order.forEach((entry, idx) => {
      if (!existsExact(sectionsDir, entry.file)) {
        missing.push(`"${entry.component}" has no component file "${entry.file}" under src/components/sections/`);
      }
      const expectedPrefix = String(idx + 1).padStart(2, '0');
      if (!entry.file.startsWith(`${expectedPrefix}-`)) {
        missing.push(
          `entry ${idx} ("${entry.component}") expected file prefix "${expectedPrefix}-" but got "${entry.file}"`,
        );
      }
    });
    expect(missing, `sections_order problems:\n${missing.join('\n')}`).toEqual([]);
    expect(block.sections_order.length, 'sections_order must have exactly 15 entries').toBe(15);

    // CartDrawer is a React island, not a static section — it MUST be listed
    // separately under `islands`, never inside `sections_order`.
    const inSections = block.sections_order.some((e) => e.component === 'CartDrawer');
    expect(inSections, 'CartDrawer must not appear in sections_order (it is an island)').toBe(false);
    const inIslands = block.islands?.some((e) => e.component === 'CartDrawer');
    expect(inIslands, 'CartDrawer must be listed under islands').toBe(true);
  });
});

describe('spec-contract: A3 sections_order matches real import order in index.astro', () => {
  it('sections_order sequence + identifiers match the parsed import order of pages/index.astro', () => {
    const block = readSectionsOrderBlock();
    const astroText = readFileSync(
      resolve(REPO_ROOT, 'content/landing-base/src/pages/index.astro'),
      'utf-8',
    );

    const importRe = /^import\s+(\w+)\s+from\s+'@\/components\/sections\/([\w-]+\.astro)';$/gm;
    const actual: Array<{ component: string; file: string }> = [];
    let match: RegExpExecArray | null;
    while ((match = importRe.exec(astroText)) !== null) {
      actual.push({ component: match[1], file: match[2] });
    }

    // A silently-empty parse (e.g. a future multi-line import format) must
    // still fail loudly rather than vacuously pass an empty-vs-empty compare.
    expect(actual.length, 'expected to parse at least one section import from index.astro').toBeGreaterThan(0);

    const expected = block.sections_order;
    expect(
      actual,
      `sections_order != index.astro import order\n expected: ${JSON.stringify(expected)}\n actual: ${JSON.stringify(actual)}`,
    ).toEqual(expected);
  });
});

type ContentFieldsBlock = {
  agentWritable: string[];
  neverGenerate: string[];
  faqFields: string[];
  testimonialFields: string[];
};

/**
 * Bidirectional set diff, reported both ways: fields the docs claim exist
 * but are missing from the real object ("documented-but-missing"), and
 * real fields the docs never mention ("real-but-undocumented"). Sound
 * because `product.ts:238` is `} as const satisfies Product` — the build
 * already proves `product ≡ Product`, so this runtime check transitively
 * proves the docs match the real TYPE, without needing a schema library.
 */
function diffFields(documented: string[], real: string[]): { missingFromReal: string[]; missingFromDocs: string[] } {
  const docSet = new Set(documented);
  const realSet = new Set(real);
  return {
    missingFromReal: documented.filter((f) => !realSet.has(f)),
    missingFromDocs: real.filter((f) => !docSet.has(f)),
  };
}

describe('spec-contract: A4 content-fields block matches real product/faq/testimonial shapes', () => {
  it('agentWritable ∪ neverGenerate equals Object.keys(product), bidirectionally', () => {
    const text = readFileSync(resolve(REPO_ROOT, 'agents.MD'), 'utf-8');
    const block = extractAnchoredJson(text, 'content-fields') as ContentFieldsBlock;

    const documented = [...block.agentWritable, ...block.neverGenerate];
    const real = Object.keys(product);
    const { missingFromReal, missingFromDocs } = diffFields(documented, real);

    expect(
      missingFromReal,
      `documented-but-missing (agents.MD lists these but product.ts does not have them): ${JSON.stringify(missingFromReal)}`,
    ).toEqual([]);
    expect(
      missingFromDocs,
      `real-but-undocumented (product.ts has these but agents.MD never mentions them): ${JSON.stringify(missingFromDocs)}`,
    ).toEqual([]);
  });

  it('faqFields matches Object.keys(faq[0])', () => {
    const text = readFileSync(resolve(REPO_ROOT, 'agents.MD'), 'utf-8');
    const block = extractAnchoredJson(text, 'content-fields') as ContentFieldsBlock;

    const real = Object.keys(faq[0]);
    const { missingFromReal, missingFromDocs } = diffFields(block.faqFields, real);
    expect(missingFromReal, `documented-but-missing: ${JSON.stringify(missingFromReal)}`).toEqual([]);
    expect(missingFromDocs, `real-but-undocumented: ${JSON.stringify(missingFromDocs)}`).toEqual([]);
  });

  it('testimonialFields matches Object.keys(testimonials[0])', () => {
    const text = readFileSync(resolve(REPO_ROOT, 'agents.MD'), 'utf-8');
    const block = extractAnchoredJson(text, 'content-fields') as ContentFieldsBlock;

    const real = Object.keys(testimonials[0]);
    const { missingFromReal, missingFromDocs } = diffFields(block.testimonialFields, real);
    expect(missingFromReal, `documented-but-missing: ${JSON.stringify(missingFromReal)}`).toEqual([]);
    expect(missingFromDocs, `real-but-undocumented: ${JSON.stringify(missingFromDocs)}`).toEqual([]);
  });
});

/**
 * Recursively walks `dir`, returning every file whose extension is in
 * `exts` (dot-prefixed, e.g. '.astro'). Test files are excluded implicitly
 * by never including '.ts' in `exts` (this suite lives in a .ts file, so
 * a '.ts' glob would match its own regex literals below).
 */
function walkFiles(dir: string, exts: string[]): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...walkFiles(full, exts));
    } else if (exts.includes(extname(entry))) {
      out.push(full);
    }
  }
  return out;
}

describe('spec-contract: A6 no hardcoded palette/hex color classes (regression guard)', () => {
  // Tailwind's default palette names. Requiring a utility prefix before the
  // palette name (or before `-[#hex]`) structurally excludes bare hex/decimal
  // strings like '#1001' (a Shopify order name in settle.test.ts) or '#337'
  // (a task-number comment in CheckoutForm.tsx) — verified false positives
  // a naive bare-hex regex would produce.
  const UTILITY_PREFIX =
    '(bg|text|border|ring|fill|stroke|from|via|to|outline|shadow|accent|caret|divide|placeholder)';
  const PALETTE =
    '(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)';

  const paletteClassRe = new RegExp(`\\b${UTILITY_PREFIX}-${PALETTE}-\\d{2,3}\\b`, 'g'); // A6a
  const arbitraryColorRe = new RegExp(`\\b${UTILITY_PREFIX}-\\[#[0-9a-fA-F]{3,8}\\]`, 'g'); // A6b
  const rawHexRe = /#[0-9a-fA-F]{3,8}\b/g; // A6c — only ever scanned in .css, post-@theme-excision

  const SRC_DIR = resolve(REPO_ROOT, 'content/landing-base/src');

  it('no .astro/.tsx file uses a hardcoded Tailwind palette class or arbitrary hex color utility', () => {
    const files = walkFiles(SRC_DIR, ['.astro', '.tsx']);
    const hits: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, 'utf-8');
      const rel = file.slice(REPO_ROOT.length + 1);
      for (const m of text.matchAll(paletteClassRe)) {
        hits.push(`${rel}: hardcoded palette class "${m[0]}"`);
      }
      for (const m of text.matchAll(arbitraryColorRe)) {
        hits.push(`${rel}: hardcoded arbitrary hex utility "${m[0]}"`);
      }
    }
    expect(hits, `Hardcoded color classes found:\n${hits.join('\n')}`).toEqual([]);
  });

  it('no .css file has raw hex color outside the @theme block', () => {
    const files = walkFiles(SRC_DIR, ['.css']);
    const hits: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, 'utf-8');
      // Excise the @theme { ... } block (its hex values are the intended,
      // documented design tokens — not the regression this guard targets).
      const withoutTheme = text.replace(/@theme\s*\{[\s\S]*?\n\}/, '');
      const rel = file.slice(REPO_ROOT.length + 1);
      for (const m of withoutTheme.matchAll(rawHexRe)) {
        hits.push(`${rel}: raw hex color "${m[0]}" outside @theme block`);
      }
    }
    expect(hits, `Raw hex colors found outside @theme:\n${hits.join('\n')}`).toEqual([]);
  });
});

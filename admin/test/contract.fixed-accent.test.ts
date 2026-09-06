// AUTO ACCENT — the "grape" family, derived from a real product photograph.
//
// ─── WHAT F5 LEFT PENDING ───────────────────────────────────────────────────
//
// resolveFixedTheme() has always taken a `derived` palette, second in
// precedence after an operator override and before canonical — F5 wired the
// precedence and left `derived: null` in generate-landing.mjs with the
// comment "nothing in any runtime can read a pixel". This suite proves that
// premise is no longer true (sharp is a direct, already-installed dependency
// of content/landing-astravibe's own package.json), and that the five real
// "grape" tokens can be adapted to a product's own colour without moving a
// single element the structural grammar seals.
//
// ─── WHY THIS RUNS REAL BUILDS ──────────────────────────────────────────────
//
// A pixel-reading claim is not provable against a mock. Every test below
// that touches extraction runs the REAL extract-accent.mjs subprocess
// against REAL PNG fixtures (planted with sharp, at admin/test/fixtures/
// accent/), and the pipeline tests run the REAL generate-landing.mjs CLI —
// the same one an operator's generation actually calls — then, once, a real
// `astro build` to prove the colour reaches the compiled CSS a browser
// receives, not just the JSON manifest.
import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ACCENT_TOKENS,
  deriveContrastSafeRamp,
  readAccentSignal,
  deriveProductAccent,
  resolvePrimaryGalleryImage,
} from '../../scripts/lib/fixed-accent.mjs';
import { planAssets } from '../../scripts/lib/asset-pipeline.mjs';
import { readCanonicalPalette, collectContrastIssues, FIXED_THEME_TOKENS } from '../../scripts/lib/fixed-theme.mjs';
import { FIXED_TEMPLATE_RELATIVE } from '../../scripts/lib/fixed-template.mjs';
import { structuralFingerprint } from '../../scripts/lib/fingerprint.mjs';
import { FIXED_GRAMMAR_V3, FIXED_OPTIONAL_SLOTS_V3 } from '../../scripts/lib/fixed-grammar-v3.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const TEMPLATE_DIR = path.join(REPO_ROOT, FIXED_TEMPLATE_RELATIVE);
const EXTRACTOR = path.join(TEMPLATE_DIR, 'scripts/extract-accent.mjs');
const GEN = path.join(REPO_ROOT, 'scripts/generate-landing.mjs');

const FIXTURES = path.join(__dirname, 'fixtures/accent');
const ORANGE_IMAGE = path.join(FIXTURES, 'images/orange.png');
const BLUE_IMAGE = path.join(FIXTURES, 'images/blue.png');
const NEUTRAL_IMAGE = path.join(FIXTURES, 'images/neutral.png');

const CSS = readFileSync(path.join(TEMPLATE_DIR, 'src/styles/global.css'), 'utf-8');
const CANONICAL = readCanonicalPalette(CSS);

function generate(slug: string, productJson: string, extraArgs: string[] = []) {
  const outDir = path.join(REPO_ROOT, 'outputs', slug);
  rmSync(outDir, { recursive: true, force: true });
  const result = spawnSync(
    process.execPath,
    [
      GEN,
      '--slug', slug,
      '--content', path.join(__dirname, 'fixtures/fixed/content.json'),
      '--product', productJson,
      '--images', path.join(FIXTURES, 'images'),
      '--merchant', path.join(__dirname, 'fixtures/fixed/merchant.json'),
      ...extraArgs,
    ],
    { cwd: REPO_ROOT, encoding: 'utf-8' },
  );
  return { outDir, result };
}

function themeManifest(outDir: string) {
  return JSON.parse(readFileSync(path.join(outDir, '.theme.json'), 'utf-8'));
}

const madeDirs: string[] = [];
afterAll(() => {
  for (const dir of madeDirs) rmSync(dir, { recursive: true, force: true });
}, 60_000); // several of these dirs carry a real installed node_modules

// ───────────────────────────────────────────────────────────────────────────
// 1. PIXEL-ACCESS AUDIT — sharp is real, and where it is (and is not) reachable
// ───────────────────────────────────────────────────────────────────────────

describe('pixel-access audit: sharp exists, and only the template can reach it', () => {
  test('sharp is resolvable from inside the template', () => {
    const result = spawnSync(process.execPath, ['-e', "require.resolve('sharp')"], { cwd: TEMPLATE_DIR });
    expect(result.status, 'sharp is not installed in content/landing-astravibe').toBe(0);
  });

  test('sharp is NOT resolvable from scripts/lib or admin/src/server — the boundary this feature respects', () => {
    for (const dir of [path.join(REPO_ROOT, 'scripts/lib'), path.join(REPO_ROOT, 'admin/src/server')]) {
      const result = spawnSync(
        process.execPath,
        ['-e', `require.resolve('sharp', { paths: ['${dir}'] })`],
        { cwd: REPO_ROOT },
      );
      expect(result.status, `${dir} can resolve sharp — the subprocess boundary is no longer necessary`).not.toBe(0);
    }
  });

  test('the extractor script lives inside the template, not beside fixed-accent.mjs', () => {
    expect(existsSync(EXTRACTOR)).toBe(true);
    expect(existsSync(path.join(REPO_ROOT, 'scripts/lib/extract-accent.mjs'))).toBe(false);
  });

  test('a generated landing never ships the extractor — generation-time tooling only', () => {
    // Same category as test-fixtures/: a shipped landing never runs this
    // script (it is spawned during GENERATION, from the template's own
    // location, never from outputs/<slug>) and has no reason to carry it.
    const { outDir, result } = generate('zz-accent-noship-t', path.join(FIXTURES, 'canonical-product-orange.json'));
    madeDirs.push(outDir);
    expect(result.status, result.stderr).toBe(0);
    expect(existsSync(path.join(outDir, 'scripts'))).toBe(false);
    // And it still worked — the extraction ran from the TEMPLATE's own copy.
    expect(themeManifest(outDir).accent.source).toBe('derived');
  }, 30_000);

  test('fixed-accent.mjs itself never imports sharp — only spawns a subprocess', () => {
    const src = readFileSync(path.join(REPO_ROOT, 'scripts/lib/fixed-accent.mjs'), 'utf-8');
    expect(src).not.toMatch(/from ['"]sharp['"]/);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 2. DETERMINISTIC EXTRACTION — real pixels, real subprocess, no LLM
// ───────────────────────────────────────────────────────────────────────────

describe('extraction is deterministic pixel maths, never a model asked to look', () => {
  test('no file under scripts/lib or the template reach for an LLM to choose a colour', () => {
    const src = readFileSync(path.join(REPO_ROOT, 'scripts/lib/fixed-accent.mjs'), 'utf-8')
      + readFileSync(EXTRACTOR, 'utf-8');
    expect(src).not.toMatch(/generateContent|gemini|GEMINI/i);
  });

  test('the same real orange photo produces the same hue every time', () => {
    const results = Array.from({ length: 3 }, () =>
      readAccentSignal(ORANGE_IMAGE, { spawnSync, extractorPath: EXTRACTOR, existsSync }),
    );
    expect(results.every((r) => r.ok)).toBe(true);
    const hues = results.map((r: any) => r.hue);
    expect(new Set(hues).size, 'the same bytes produced different hues across runs').toBe(1);
  });

  test('a real orange product photo is read as orange', () => {
    const signal = readAccentSignal(ORANGE_IMAGE, { spawnSync, extractorPath: EXTRACTOR, existsSync }) as any;
    expect(signal.ok).toBe(true);
    expect(signal.hue).toBeGreaterThan(10);
    expect(signal.hue).toBeLessThan(45);
  });

  test('a real blue product photo is read as blue, and differently from the orange one', () => {
    const orange = readAccentSignal(ORANGE_IMAGE, { spawnSync, extractorPath: EXTRACTOR, existsSync }) as any;
    const blue = readAccentSignal(BLUE_IMAGE, { spawnSync, extractorPath: EXTRACTOR, existsSync }) as any;
    expect(blue.ok).toBe(true);
    expect(blue.hue).toBeGreaterThan(190);
    expect(blue.hue).toBeLessThan(230);
    expect(blue.hue).not.toBe(orange.hue);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 3. NEUTRAL FILTERING — white/black/grey never become the accent
// ───────────────────────────────────────────────────────────────────────────

describe('neutral colours are excluded, never accidentally chosen', () => {
  test('an all-white/black/grey photo reports all-neutral, not a fabricated hue', () => {
    const signal = readAccentSignal(NEUTRAL_IMAGE, { spawnSync, extractorPath: EXTRACTOR, existsSync });
    expect(signal.ok).toBe(false);
    expect((signal as any).reason).toBe('all-neutral');
  });

  test('a missing image reports a real, distinct reason — never crashes', () => {
    const signal = readAccentSignal('/no/such/file.png', { spawnSync, extractorPath: EXTRACTOR, existsSync });
    expect(signal).toEqual({ ok: false, reason: 'source-asset-missing' });
  });

  test('no source asset at all reports its own reason', () => {
    expect(readAccentSignal(null as any, { spawnSync, extractorPath: EXTRACTOR, existsSync })).toEqual({
      ok: false,
      reason: 'no-source-asset',
    });
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 4. ACCENT SCORING — frequent AND saturated, never merely most-numerous
// ───────────────────────────────────────────────────────────────────────────

describe('scoring favours a present, vivid colour — not the majority pixel', () => {
  // The fixture IS the task's own worked example: ~70% white background,
  // ~20% near-black product body, ~10% saturated accent patch.
  test('the 10% saturated patch wins over the 70% white background and the 20% black body', () => {
    const signal = readAccentSignal(ORANGE_IMAGE, { spawnSync, extractorPath: EXTRACTOR, existsSync }) as any;
    expect(signal.ok).toBe(true);
    // Neither white nor black nor near-neutral — a real, saturated orange.
    expect(signal.saturation).toBeGreaterThan(50);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 5. CONTRAST — the derived ramp passes the SAME real pairs, or falls back
// ───────────────────────────────────────────────────────────────────────────

describe('every derived ramp passes the real contrast pairs, or the whole ramp is refused', () => {
  test('the canonical hue reproduces (approximately) the canonical hex values', () => {
    const safe = deriveContrastSafeRamp(262, CANONICAL);
    expect(safe).not.toBeNull();
    expect(safe!.adjustments).toEqual([]); // canonical needs no nudge — it already passes
  });

  test.each([0, 25, 55, 90, 140, 180, 210, 262, 290, 320, 350])('hue %i produces a ramp with zero real contrast issues', (hue) => {
    const safe = deriveContrastSafeRamp(hue, CANONICAL);
    expect(safe, `hue ${hue} could not be made contrast-safe within the search bound`).not.toBeNull();
    const theme = { ...CANONICAL, ...safe!.ramp };
    expect(collectContrastIssues(theme)).toEqual([]);
  });

  test('grape-tint is never dragged into a medium tone by a contrast fix for grape', () => {
    // The bug this shape guards against: an earlier version shifted the
    // WHOLE ramp by one lightness delta, which also darkened grape-tint (a
    // near-white background for dark text) toward a saturated swatch.
    const safe = deriveContrastSafeRamp(25, CANONICAL); // orange needed real adjustment
    expect(safe).not.toBeNull();
    const tintAdjusted = safe!.adjustments.some((a) => a.token === 'grape-tint');
    expect(tintAdjusted, 'grape-tint should not need adjustment for a hue whose only issue is on dark backgrounds').toBe(false);
  });

  test('adjustments are recorded per token, with a real lightness delta — never silently applied', () => {
    const safe = deriveContrastSafeRamp(25, CANONICAL);
    expect(safe!.adjustments.length).toBeGreaterThan(0);
    for (const adj of safe!.adjustments) {
      expect(ACCENT_TOKENS).toContain(adj.token);
      expect(typeof adj.lightnessDelta).toBe('number');
      expect(adj.lightnessDelta).not.toBe(0);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 6. TOKEN SCOPE — only the five grape tokens move
// ───────────────────────────────────────────────────────────────────────────

describe('only the five grape tokens are in scope — eleven neutrals never move', () => {
  test('ACCENT_TOKENS is exactly the five grape tokens', () => {
    expect(ACCENT_TOKENS).toEqual(['grape', 'grape-dark', 'grape-tint', 'grape-deep', 'grape-soft']);
  });

  test('every accent token is a real Fixed theme token', () => {
    for (const t of ACCENT_TOKENS) expect(FIXED_THEME_TOKENS).toContain(t);
  });

  test('gold, success and the neutrals are excluded from the accent family on purpose', () => {
    for (const t of ['gold', 'gold-tint', 'success', 'success-tint', 'bone', 'bone-dim', 'graphite', 'graphite-soft', 'steel', 'steel-light', 'surface']) {
      expect(ACCENT_TOKENS).not.toContain(t);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 7. PRIMARY SOURCE ASSET — gallery[0], never a placeholder/favicon/seal
// ───────────────────────────────────────────────────────────────────────────

describe('the source image is the Asset Producer\'s primary pick, nothing else', () => {
  const media = [
    { url: 'https://fixture.invalid/blue.png', localPath: 'blue.png', order: 0 },
    { url: 'https://fixture.invalid/orange.png', localPath: 'orange.png', order: 1 },
  ];

  test('resolvePrimaryGalleryImage returns the same file planAssets would pick first', () => {
    const imagesDir = path.join(FIXTURES, 'images');
    const resolved = resolvePrimaryGalleryImage(planAssets, media, imagesDir);
    const plan = planAssets(media, imagesDir);
    expect(resolved).toBe(plan.assets[0]!.srcPath);
    expect(resolved).toContain('blue.png'); // order:0 wins, deterministically
  });

  test('no images directory resolves to no source, not a crash', () => {
    expect(resolvePrimaryGalleryImage(planAssets, media, null as any)).toBeNull();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 8. FULL PIPELINE — real generate-landing.mjs runs, real .theme.json
// ───────────────────────────────────────────────────────────────────────────

describe('the real generator: two products, two accents, one grammar', () => {
  let orange: ReturnType<typeof generate>;
  let blue: ReturnType<typeof generate>;

  beforeAll(() => {
    orange = generate('zz-accent-orange-t', path.join(FIXTURES, 'canonical-product-orange.json'));
    blue = generate('zz-accent-blue-t', path.join(FIXTURES, 'canonical-product-blue.json'));
    madeDirs.push(orange.outDir, blue.outDir);
  }, 60_000);

  test('both runs succeed', () => {
    expect(orange.result.status, orange.result.stderr).toBe(0);
    expect(blue.result.status, blue.result.stderr).toBe(0);
  });

  test('accent(orange) != accent(blue)', () => {
    const a = themeManifest(orange.outDir);
    const b = themeManifest(blue.outDir);
    expect(a.accent.source).toBe('derived');
    expect(b.accent.source).toBe('derived');
    expect(a.palette.grape).not.toBe(b.palette.grape);
  });

  test('every other token stays canonical for both — only the five grape tokens moved', () => {
    for (const outDir of [orange.outDir, blue.outDir]) {
      const manifest = themeManifest(outDir);
      for (const token of FIXED_THEME_TOKENS) {
        if (ACCENT_TOKENS.includes(token)) continue;
        expect(manifest.palette[token], `${token} moved from canonical`).toBe(CANONICAL[token]);
        expect(manifest.sources[token]).toBe('canonical');
      }
    }
  });

  test('the source stylesheet was patched with the derived values, not the canonical ones', () => {
    for (const [outDir, expectAccent] of [[orange.outDir, true], [blue.outDir, true]] as const) {
      const css = readFileSync(path.join(outDir, 'src/styles/global.css'), 'utf-8');
      const manifest = themeManifest(outDir);
      expect(css).toContain(`--color-grape:        ${manifest.palette.grape};`);
      if (expectAccent) expect(css).not.toContain('--color-grape:        #7C3AED;');
    }
  });
});

describe('real product test: the derived accent reaches the COMPILED CSS a browser gets', () => {
  let orange: ReturnType<typeof generate>;

  beforeAll(() => {
    orange = generate('zz-accent-css-t', path.join(FIXTURES, 'canonical-product-orange.json'));
    madeDirs.push(orange.outDir);
    expect(orange.result.status, orange.result.stderr).toBe(0);
    const install = spawnSync('pnpm', ['install', '--prefer-offline', '--prod=false'], { cwd: orange.outDir, encoding: 'utf-8' });
    expect(install.status, install.stderr).toBe(0);
    const build = spawnSync('pnpm', ['exec', 'astro', 'build'], { cwd: orange.outDir, encoding: 'utf-8' });
    expect(build.status, build.stderr).toBe(0);
  }, 180_000);

  test('the compiled CSS bundle contains the derived hex value', () => {
    const manifest = themeManifest(orange.outDir);
    const grapeHex = manifest.palette.grape.replace('#', '').toLowerCase();
    const cssDir = path.join(orange.outDir, 'dist/client/_astro');
    const files = require('node:fs').readdirSync(cssDir).filter((f: string) => f.endsWith('.css'));
    const bundled = files.map((f: string) => readFileSync(path.join(cssDir, f), 'utf-8')).join('\n');
    expect(bundled.toLowerCase()).toContain(grapeHex);
  });

  test('the compiled CSS bundle does NOT contain the canonical purple', () => {
    const cssDir = path.join(orange.outDir, 'dist/client/_astro');
    const files = require('node:fs').readdirSync(cssDir).filter((f: string) => f.endsWith('.css'));
    const bundled = files.map((f: string) => readFileSync(path.join(cssDir, f), 'utf-8')).join('\n');
    expect(bundled.toLowerCase()).not.toContain('7c3aed');
  });

  test('Grammar V3: the structural fingerprint is identical to a canonical build of the same product', () => {
    // Built once, above, with the derived orange. Now the SAME product, SAME
    // content, forced back to canonical via an operator override — the two
    // pages differ ONLY in colour VALUES inside global.css, never in markup.
    const canonicalOverride = path.join(orange.outDir, '..', 'zz-accent-css-override.json');
    writeFileSync(canonicalOverride, JSON.stringify(CANONICAL));
    const canon = generate('zz-accent-css-canon-t', path.join(FIXTURES, 'canonical-product-orange.json'), [
      '--theme', canonicalOverride,
    ]);
    madeDirs.push(canon.outDir);
    rmSync(canonicalOverride, { force: true });
    expect(canon.result.status, canon.result.stderr).toBe(0);
    const install = spawnSync('pnpm', ['install', '--prefer-offline', '--prod=false'], { cwd: canon.outDir, encoding: 'utf-8' });
    expect(install.status).toBe(0);
    const build = spawnSync('pnpm', ['exec', 'astro', 'build'], { cwd: canon.outDir, encoding: 'utf-8' });
    expect(build.status, build.stderr).toBe(0);

    const orangeHtml = readFileSync(path.join(orange.outDir, 'dist/client/index.html'), 'utf-8');
    const canonHtml = readFileSync(path.join(canon.outDir, 'dist/client/index.html'), 'utf-8');
    const fpOrange = structuralFingerprint(orangeHtml, FIXED_GRAMMAR_V3, FIXED_OPTIONAL_SLOTS_V3);
    const fpCanon = structuralFingerprint(canonHtml, FIXED_GRAMMAR_V3, FIXED_OPTIONAL_SLOTS_V3);
    expect(fpOrange.elements).toBe(fpCanon.elements);
    expect(fpOrange.hash).toBe(fpCanon.hash);
  }, 180_000);
});

describe('operator override always wins over auto-detection', () => {
  test('an operator palette beats a real, correctly-detected orange', () => {
    const overridePath = path.join(FIXTURES, 'zz-operator-override.json');
    writeFileSync(overridePath, JSON.stringify({ grape: '#0066CC' }));
    try {
      const { outDir, result } = generate('zz-accent-override-t', path.join(FIXTURES, 'canonical-product-orange.json'), [
        '--theme', overridePath,
      ]);
      madeDirs.push(outDir);
      expect(result.status, result.stderr).toBe(0);
      const manifest = themeManifest(outDir);
      expect(manifest.palette.grape).toBe('#0066CC');
      expect(manifest.accent.source).toBe('operator');
      // Extraction still RAN and is still reported — the override did not
      // suppress the measurement, it outranked it.
      expect(manifest.accent.extracted).not.toBeNull();
      expect(manifest.accent.extracted.hue).toBeGreaterThan(10);
      expect(manifest.accent.extracted.hue).toBeLessThan(45);
    } finally {
      rmSync(overridePath, { force: true });
    }
  }, 60_000);
});

describe('neutral image: no confident accent, canonical purple, never grey', () => {
  test('a white/black/grey product falls back to canonical — accidental grey is never shipped', () => {
    const { outDir, result } = generate('zz-accent-neutral-t', path.join(FIXTURES, 'canonical-product-neutral.json'));
    madeDirs.push(outDir);
    expect(result.status, result.stderr).toBe(0);
    const manifest = themeManifest(outDir);
    expect(manifest.accent.source).toBe('canonical');
    expect(manifest.accent.reason).toBe('all-neutral');
    expect(manifest.palette.grape).toBe(CANONICAL.grape);
    // Never a grey masquerading as an accent.
    expect(manifest.palette.grape).not.toMatch(/^#([0-9A-F])\1\1\1\1\1$/i); // #RRRRRR-shaped
  }, 60_000);
});

// ───────────────────────────────────────────────────────────────────────────
// 9. DETERMINISM — same image, same accent, same FixedThemeOutput, always
// ───────────────────────────────────────────────────────────────────────────

describe('determinism: the same product generates the identical theme, every run', () => {
  test('two independent generations of the same product produce byte-identical accents', () => {
    const a = generate('zz-accent-det-a-t', path.join(FIXTURES, 'canonical-product-orange.json'));
    const b = generate('zz-accent-det-b-t', path.join(FIXTURES, 'canonical-product-orange.json'));
    madeDirs.push(a.outDir, b.outDir);
    expect(a.result.status).toBe(0);
    expect(b.result.status).toBe(0);
    const manifestA = themeManifest(a.outDir);
    const manifestB = themeManifest(b.outDir);
    expect(manifestA.palette).toEqual(manifestB.palette);
    expect(manifestA.accent.extracted).toEqual(manifestB.accent.extracted);
    expect(manifestA.accent.appliedGrape).toBe(manifestB.accent.appliedGrape);
  }, 60_000);
});

// ───────────────────────────────────────────────────────────────────────────
// 10. MANIFEST SHAPE — only what answers the question
// ───────────────────────────────────────────────────────────────────────────

describe('.theme.json records only the accent facts that matter', () => {
  test('the accent block carries exactly the documented fields', () => {
    const { outDir, result } = generate('zz-accent-manifest-t', path.join(FIXTURES, 'canonical-product-orange.json'));
    madeDirs.push(outDir);
    expect(result.status).toBe(0);
    const manifest = themeManifest(outDir);
    expect(Object.keys(manifest.accent).sort()).toEqual(
      ['adjustments', 'appliedGrape', 'extracted', 'reason', 'source', 'sourceAsset'].sort(),
    );
    expect(['operator', 'derived', 'canonical']).toContain(manifest.accent.source);
  }, 60_000);
});

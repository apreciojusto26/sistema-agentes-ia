// THE PALETTE IS THE ONE VISUAL DECISION A PRODUCT MAKES.
//
// AstraVibe is the mould: layout, components, variants, spacing, typography,
// breakpoints, grids and section order are frozen and sealed. What may move is
// the VALUE of a colour custom property, because that rewrites numbers inside
// the `@theme` block and never touches markup.
//
// ─── THE HOLE THIS CLOSES ─────────────────────────────────────────────────
//
// The palette used to arrive in `content.json`'s `design` key, which
// content-contract.mjs has no rule for, and the old patcher interpolated the
// value straight into the stylesheet. A value of `red; } body { display: none }
// /*` closed the block and injected a rule — authored by a language model.
// Version A's DesignSpec route was never exposed this way; design-contract.mjs
// checks token value format there. The hole was only in the content path.
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FIXED_THEME_TOKENS,
  CONTRAST_PAIRS,
  MIN_CONTRAST,
  normalizeColor,
  collectThemeIssues,
  collectContrastIssues,
  readCanonicalPalette,
  resolveFixedTheme,
  applyPalette,
  FixedThemeError,
} from '../../scripts/lib/fixed-theme.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const CSS = readFileSync(path.join(REPO_ROOT, 'content/landing-astravibe/src/styles/global.css'), 'utf-8');
const canonical = () => readCanonicalPalette(CSS);

// ───────────────────────────────────────────────────────────────────────────
// THE SURFACE IS COLOUR, AND ONLY COLOUR
// ───────────────────────────────────────────────────────────────────────────

describe('only colour tokens the template declares can move', () => {
  test('every token in the contract exists in the stylesheet', () => {
    const palette = canonical();
    for (const token of FIXED_THEME_TOKENS) {
      expect(palette[token], `--color-${token} is missing from @theme`).toMatch(/^#[0-9A-F]{6}$/);
    }
    expect(Object.keys(palette)).toHaveLength(FIXED_THEME_TOKENS.length);
  });

  test.each(['font-display', 'radius-card', 'shadow-lift', 'text-hero', 'breakpoint-xs', 'spacing'])(
    '%s is refused — it is not palette',
    (token) => {
      // The old patcher accepted colors, fonts, radius, shadow AND text. Fonts,
      // radii, shadows and type scales are typography and shape; this layer has
      // no authority over either.
      const issues = collectThemeIssues({ [token]: '#FFFFFF' });
      expect(issues.map((i) => i.code)).toContain('theme-unknown-token');
    },
  );

  test('applyPalette rewrites values and nothing else', () => {
    const out = applyPalette(CSS, { grape: '#0F766E' });
    expect(out).toContain('--color-grape:        #0F766E;');
    // Same number of declarations, same classes, same everything else.
    expect(out.split('\n')).toHaveLength(CSS.split('\n').length);
    expect(out.replace('#0F766E', '#7C3AED')).toBe(CSS);
  });

  test('a token the stylesheet does not declare is skipped, never appended', () => {
    // Adding a declaration would be inventing a token, and the template would
    // not read it anyway.
    expect(applyPalette(CSS, { 'not-a-token': '#FFFFFF' })).toBe(CSS);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// THE VALUE FORMAT IS NOT AN INJECTION VECTOR
// ───────────────────────────────────────────────────────────────────────────

describe('a colour is a colour, or it is rejected', () => {
  test('hex is accepted and canonicalised', () => {
    expect(normalizeColor('#abc')).toBe('#AABBCC');
    expect(normalizeColor('  #7c3aed ')).toBe('#7C3AED');
    expect(normalizeColor('#7C3AED')).toBe('#7C3AED');
  });

  test.each([
    ['the real injection payload', 'red; } body { display: none } /*'],
    ['a named colour', 'red'],
    ['an rgb() function', 'rgb(124, 58, 237)'],
    ['a css variable', 'var(--color-grape)'],
    ['a url', 'url(https://evil.invalid/x.png)'],
    ['a token name used as a value', 'grape'],
    ['an expression', 'color-mix(in srgb, red, blue)'],
    ['a number', 16711680],
    ['a nested object', { r: 1 }],
    ['an empty string', ''],
  ])('%s is refused', (_label, value) => {
    expect(normalizeColor(value as string)).toBeNull();
    expect(collectThemeIssues({ grape: value }).map((i) => i.code)).toContain('theme-invalid-colour');
  });

  test('and an invalid palette fails the whole resolve — never partially applied', () => {
    // Silently dropping the bad token would ship a palette the operator did not
    // configure and never told them why.
    expect(() =>
      resolveFixedTheme({ override: { grape: 'red; } body{}' }, canonical: canonical() }),
    ).toThrow(FixedThemeError);
  });

  test('the stylesheet cannot be broken even by a caller that skipped validation', () => {
    // applyPalette re-normalises at the moment of writing. Defence in depth,
    // because this is the one function whose output is a stylesheet.
    const out = applyPalette(CSS, { grape: 'red; } body { display: none } /*' });
    expect(out).toBe(CSS);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// PRECEDENCE
// ───────────────────────────────────────────────────────────────────────────

describe('operator > derived > canonical, per token', () => {
  test('with nothing configured the canonical palette wins', () => {
    const { theme, manifest } = resolveFixedTheme({ canonical: canonical() });
    expect(theme).toEqual(canonical());
    expect(new Set(Object.values(manifest.sources))).toEqual(new Set(['canonical']));
  });

  test('an operator override beats a derived palette', () => {
    // The stated rule: a person decided, and a computation did not.
    const { theme, manifest } = resolveFixedTheme({
      override: { grape: '#0F766E' },
      derived: { grape: '#B91C1C' },
      canonical: canonical(),
    });
    expect(theme.grape).toBe('#0F766E');
    expect(manifest.sources.grape).toBe('override');
  });

  test('a derived palette beats the canonical one', () => {
    const { theme, manifest } = resolveFixedTheme({ derived: { gold: '#E8A317' }, canonical: canonical() });
    expect(theme.gold).toBe('#E8A317');
    expect(manifest.sources.gold).toBe('derived');
  });

  test('precedence is PER TOKEN — one colour stated does not blank the rest', () => {
    // An operator changing an accent should not have to restate sixteen values.
    const { theme, manifest } = resolveFixedTheme({ override: { grape: '#0F766E' }, canonical: canonical() });
    expect(theme.grape).toBe('#0F766E');
    expect(theme.bone).toBe(canonical().bone);
    expect(manifest.sources.bone).toBe('canonical');
  });

  test('the same inputs give a byte-identical result', () => {
    const a = resolveFixedTheme({ override: { grape: '#0F766E' }, canonical: canonical() });
    const b = resolveFixedTheme({ override: { grape: '#0F766E' }, canonical: canonical() });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

// ───────────────────────────────────────────────────────────────────────────
// CONTRAST
// ───────────────────────────────────────────────────────────────────────────

describe('a recolour cannot undo the accessibility F2 bought', () => {
  test('the canonical palette passes every pair it renders', () => {
    expect(collectContrastIssues(canonical())).toEqual([]);
  });

  test('the tightest real pair still has the margin F2 established', () => {
    // steel on bone-dim at 4.53:1 — F2 moved --color-steel from #8A9096 to
    // #63686E to buy exactly this, and a recolour must not spend it.
    const { manifest } = resolveFixedTheme({ canonical: canonical() });
    const worst = Math.min(...manifest.contrast.map((c: { ratio: number }) => c.ratio));
    expect(worst).toBeGreaterThanOrEqual(MIN_CONTRAST);
    expect(worst).toBeCloseTo(4.53, 2);
  });

  test('an illegible palette is REJECTED, not quietly nudged into range', () => {
    // The chosen policy, stated rather than implied: adjusting a colour until
    // it passes ships something the operator did not choose, and a brand colour
    // silently darkened is worse than a build that names the failing pair.
    let error: FixedThemeError | null = null;
    try {
      resolveFixedTheme({ override: { steel: '#E8E8E8' }, canonical: canonical() });
    } catch (err) {
      error = err as FixedThemeError;
    }
    expect(error, 'an unreadable palette was accepted').not.toBeNull();
    expect(error!.issues.every((i) => i.code === 'theme-contrast-failure')).toBe(true);
    expect(error!.message).toMatch(/steel on bone.*below the 4\.5:1/);
  });

  test('the failure names the pair and the ratio it actually achieved', () => {
    const issues = collectContrastIssues({ ...canonical(), graphite: '#F5F5F5' });
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].message).toMatch(/\d\.\d\d:1/);
  });

  test('no adjustment is ever recorded, because none is ever made', () => {
    const { manifest } = resolveFixedTheme({ override: { grape: '#0F766E' }, canonical: canonical() });
    expect(manifest.adjustments).toEqual([]);
  });

  test('every pair under test is one the template really renders', () => {
    for (const [fg, bg] of CONTRAST_PAIRS) {
      expect(FIXED_THEME_TOKENS, `${fg} is not a theme token`).toContain(fg);
      expect(FIXED_THEME_TOKENS, `${bg} is not a theme token`).toContain(bg);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// THE CONTENT AGENT IS OUT OF THE LOOP
// ───────────────────────────────────────────────────────────────────────────

describe('nothing a model writes reaches the stylesheet', () => {
  const generator = readFileSync(path.join(REPO_ROOT, 'scripts/generate-landing.mjs'), 'utf-8');

  test('the generator no longer patches the theme from content.json', () => {
    expect(generator).not.toMatch(/patchThemeBlock\(css, input\.design/);
  });

  test('and the injection-capable patcher is deleted, not merely unused', () => {
    // Dead code that can write arbitrary CSS is worse than dead code.
    expect(generator).not.toMatch(/^function patchThemeBlock/m);
    expect(generator).not.toMatch(/^const CSS_VAR_MAP/m);
  });

  test('the palette comes from the operator, through its own argument', () => {
    expect(generator).toMatch(/a === '--theme'/);
    expect(generator).toMatch(/resolveFixedTheme\(/);
  });

  test('Version A keeps its own theme tooling untouched', () => {
    // design-contract.mjs still validates DesignSpec token formats for the
    // experimental flow. Fixed grew a boundary; Version A lost nothing.
    expect(existsSyncSafe(path.join(REPO_ROOT, 'scripts/lib/design-contract.mjs'))).toBe(true);
    expect(existsSyncSafe(path.join(REPO_ROOT, 'scripts/lib/design-registry.mjs'))).toBe(true);
  });
});

function existsSyncSafe(p: string) {
  try {
    readFileSync(p);
    return true;
  } catch {
    return false;
  }
}

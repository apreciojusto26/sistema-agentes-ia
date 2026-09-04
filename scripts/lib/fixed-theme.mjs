// THE FIXED PALETTE — the one visual decision a product is allowed to make.
//
// AstraVibe is the mould. Layout, components, variants, spacing, typography,
// breakpoints, grids, section order and responsive behaviour are frozen and
// sealed by ASTRAVIBE_FIXED_STRUCTURAL_GRAMMAR_V1. What a product MAY change is
// the value of a colour custom property, because recolouring rewrites values
// inside global.css's `@theme` block and never touches markup — which is why
// the structural fingerprint does not move.
//
// ─── WHY THIS FILE EXISTS AT ALL ──────────────────────────────────────────
//
// The palette reached the page through `content.json`'s `design` key, and
// NOTHING VALIDATED IT. content-contract.mjs has no rule for `design`, and
// patchThemeBlock interpolated the value straight into the stylesheet:
//
//     out.replace(re, `$1${value};`)
//
// So a value of `red; } body { display: none } /*` closed the @theme block and
// injected a rule. The author of that value is a language model. That is a CSS
// injection vector with an LLM on the writing end, and it is the reason the
// Fixed palette gets its own authority rather than a validator bolted onto the
// old path.
//
// Version A's DesignSpec route was never exposed this way — design-contract.mjs
// checks token value FORMAT there, after a real run emitted `radius.card:
// "pill"` and shipped a declaration browsers drop. The hole was only ever in
// the content-driven path.
//
// ─── COLOUR ONLY ──────────────────────────────────────────────────────────
//
// The old patcher accepted `colors`, `fonts`, `radius`, `shadow` and `text`.
// Fonts, radii, shadows and type scales are not palette: they are typography
// and shape, and this layer has no authority over either. Only the sixteen
// colour tokens below can move.
import { contrastRatio } from './impeccable-principles.mjs';

/**
 * Every colour token the template declares, each verified to have real
 * consumers in src/ — the least-used is `--color-graphite-soft` at one site,
 * and none is dead.
 */
export const FIXED_THEME_TOKENS = [
  'bone',
  'bone-dim',
  'graphite',
  'graphite-soft',
  'steel',
  'steel-light',
  'grape',
  'grape-dark',
  'grape-tint',
  'grape-deep',
  'grape-soft',
  'gold',
  'gold-tint',
  'success',
  'success-tint',
  'surface',
];

/**
 * The text/background pairs the rendered page actually puts together.
 *
 * MEASURED, NOT GUESSED: every pair below is a combination that exists in the
 * template today, and every one passes AA at the canonical palette — the
 * tightest is `steel on bone-dim` at 4.53. That is the margin a recolour has to
 * respect, and F2 bought it by moving `--color-steel` from #8A9096 to #63686E.
 */
export const CONTRAST_PAIRS = [
  // Muted body copy on each light surface — F2's original three.
  ['steel', 'bone'],
  ['steel', 'bone-dim'],
  ['steel', 'surface'],
  ['steel', 'grape-tint'],
  // Primary copy on every surface it lands on, tinted panels included.
  ['graphite', 'bone'],
  ['graphite', 'bone-dim'],
  ['graphite', 'surface'],
  ['graphite', 'grape-tint'],
  ['graphite', 'gold-tint'],
  ['graphite', 'success-tint'],
  ['graphite', 'gold'],
  // Inverted: light text on the dark ground and on the accent buttons.
  ['bone', 'graphite'],
  ['surface', 'grape'],
  ['surface', 'grape-dark'],
  ['surface', 'grape-deep'],
  ['surface', 'success'],
];

/** WCAG AA for normal-size text. */
export const MIN_CONTRAST = 4.5;

/**
 * Canonicalises a colour to `#RRGGBB`, or returns null.
 *
 * DELIBERATELY NARROW. Named colours, `rgb()`, `hsl()`, `color-mix()`,
 * `var(--x)`, `url(...)` and anything with a semicolon or brace are all
 * rejected — not because they are invalid CSS, but because the value is written
 * into a stylesheet and the set of strings that are definitely safe there is
 * the set this function returns. A theme contract must not be an injection
 * vector.
 */
export function normalizeColor(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  const short = /^#([0-9a-fA-F]{3})$/.exec(trimmed);
  if (short) {
    const [r, g, b] = short[1].split('');
    return `#${(r + r + g + g + b + b).toUpperCase()}`;
  }
  const full = /^#([0-9a-fA-F]{6})$/.exec(trimmed);
  return full ? `#${full[1].toUpperCase()}` : null;
}

/**
 * Validates a palette by shape. Returns `issues` — never throws.
 *
 * @param {unknown} palette
 * @returns {{code: string, token?: string, message: string}[]}
 */
export function collectThemeIssues(palette) {
  const issues = [];
  if (palette === null || palette === undefined) return issues;
  if (typeof palette !== 'object' || Array.isArray(palette)) {
    issues.push({ code: 'theme-not-an-object', message: 'a palette must be an object of token -> colour' });
    return issues;
  }

  for (const [token, value] of Object.entries(palette)) {
    if (!FIXED_THEME_TOKENS.includes(token)) {
      issues.push({
        code: 'theme-unknown-token',
        token,
        message:
          `"${token}" is not a Fixed theme token. The palette may only address the sixteen colour ` +
          `custom properties the template declares: ${FIXED_THEME_TOKENS.join(', ')}.`,
      });
      continue;
    }
    if (normalizeColor(value) === null) {
      issues.push({
        code: 'theme-invalid-colour',
        token,
        message:
          `${token} = ${JSON.stringify(value)} is not a hex colour. Only #RGB and #RRGGBB are accepted — ` +
          'a value written into a stylesheet has to be one that cannot carry anything else.',
      });
    }
  }
  return issues;
}

/** Every pair below MIN_CONTRAST, with the ratio it actually achieved. */
export function collectContrastIssues(theme) {
  const issues = [];
  for (const [fg, bg] of CONTRAST_PAIRS) {
    const a = theme[fg];
    const b = theme[bg];
    if (!a || !b) continue;
    const ratio = contrastRatio(a, b);
    if (ratio === null || ratio < MIN_CONTRAST) {
      issues.push({
        code: 'theme-contrast-failure',
        token: fg,
        message:
          `${fg} on ${bg} is ${ratio === null ? 'unmeasurable' : ratio.toFixed(2)}:1, below the ` +
          `${MIN_CONTRAST}:1 WCAG AA floor for normal text. ${a} on ${b}.`,
      });
    }
  }
  return issues;
}

/** Reads the canonical palette out of the template's `@theme` block. */
export function readCanonicalPalette(css) {
  const palette = {};
  for (const token of FIXED_THEME_TOKENS) {
    const match = new RegExp(`--color-${token}:\\s*(#[0-9A-Fa-f]{3,6})\\s*;`).exec(css);
    const colour = match ? normalizeColor(match[1]) : null;
    if (colour) palette[token] = colour;
  }
  return palette;
}

export class FixedThemeError extends Error {
  constructor(message, issues) {
    super(message);
    this.name = 'FixedThemeError';
    this.issues = issues;
  }
}

/**
 * Resolves the final palette from its sources, in a stated order.
 *
 *   1. the OPERATOR's explicit palette   — a person decided
 *   2. a DERIVED palette                 — computed from the product's own media
 *   3. the CANONICAL AstraVibe palette   — the template as shipped
 *
 * Per token, not per source: an operator who states one colour gets the
 * canonical value for the fifteen they did not, rather than having to restate
 * the whole theme to change an accent.
 *
 * CONTRAST FAILURE IS AN ERROR, NOT AN ADJUSTMENT. The alternative — nudging a
 * colour until it passes — silently ships something the operator did not
 * choose, and a brand colour quietly darkened is a worse outcome than a build
 * that says which pair failed and by how much. The canonical palette always
 * passes, so the fallback path can never fail this.
 *
 * @throws {FixedThemeError}
 */
export function resolveFixedTheme({ override = null, derived = null, canonical } = {}) {
  if (!canonical || Object.keys(canonical).length === 0) {
    throw new FixedThemeError('no canonical palette was supplied — the template must be readable', []);
  }

  const issues = [...collectThemeIssues(override), ...collectThemeIssues(derived)];
  if (issues.length) {
    throw new FixedThemeError(`the palette was rejected: ${issues.map((i) => i.message).join(' | ')}`, issues);
  }

  const theme = {};
  const sources = {};
  for (const token of FIXED_THEME_TOKENS) {
    const fromOverride = override ? normalizeColor(override[token]) : null;
    const fromDerived = derived ? normalizeColor(derived[token]) : null;
    if (fromOverride) {
      theme[token] = fromOverride;
      sources[token] = 'override';
    } else if (fromDerived) {
      theme[token] = fromDerived;
      sources[token] = 'derived';
    } else if (canonical[token]) {
      theme[token] = canonical[token];
      sources[token] = 'canonical';
    }
  }

  const contrast = collectContrastIssues(theme);
  if (contrast.length) {
    throw new FixedThemeError(
      `the palette fails accessibility: ${contrast.map((i) => i.message).join(' | ')}`,
      contrast,
    );
  }

  return {
    theme,
    manifest: {
      schema: 1,
      palette: theme,
      sources,
      contrast: CONTRAST_PAIRS.map(([fg, bg]) => ({
        foreground: fg,
        background: bg,
        ratio: Number(contrastRatio(theme[fg], theme[bg]).toFixed(2)),
      })),
      // No adjustment ever happens: a palette either passes as stated or is
      // refused. Recorded as a field so the artefact answers the question
      // rather than leaving a reader to infer it from silence.
      adjustments: [],
    },
  };
}

/**
 * Writes the resolved palette into the `@theme` block.
 *
 * ONLY VALUES, and only of `--color-*` properties that already exist. It never
 * adds a declaration, never touches a class, never inserts a wrapper and never
 * makes markup depend on colour — which is the whole reason a recolour leaves
 * the structural fingerprint untouched.
 *
 * Every value is re-normalised immediately before it is written, so even a
 * caller that skipped validation cannot get a non-colour into the stylesheet.
 */
export function applyPalette(css, theme) {
  let out = css;
  for (const [token, value] of Object.entries(theme)) {
    if (!FIXED_THEME_TOKENS.includes(token)) continue;
    const colour = normalizeColor(value);
    if (!colour) continue;
    const re = new RegExp(`(--color-${token}:\\s*)[^;]+;`);
    if (!re.test(out)) continue;
    out = out.replace(re, `$1${colour};`);
  }
  return out;
}

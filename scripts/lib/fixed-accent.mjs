// AUTO ACCENT — deriving the "grape" family from a real product photograph.
//
// ─── WHAT F5 LEFT PENDING, AND WHAT CHANGED ────────────────────────────────
//
// resolveFixedTheme() (fixed-theme.mjs) has always accepted a `derived`
// palette, second in precedence after an operator override and before the
// canonical AstraVibe colours — generate-landing.mjs has passed `derived:
// null` since F5, with the comment "nothing in any runtime can read a pixel".
// That is no longer true: `sharp` is a direct dependency of this template's
// own package.json (Astro's image service needs it), installed and
// resolvable today — audited in extract-accent.mjs's own header, not
// assumed. This file supplies the `derived` argument that machinery has
// always been ready to take.
//
// ─── FIVE TOKENS, NOT SIXTEEN ──────────────────────────────────────────────
//
// FIXED_THEME_TOKENS lists sixteen colours. Eleven of them are neutral
// (bone*, graphite*, steel*, surface), semantic-and-deliberately-not-brand
// (success*, "purple is the brand/action colour, so a win reads as a win and
// not as a button" — global.css's own words), or a second, INTENTIONALLY
// separate accent (gold/gold-tint: the star-rating and trust-badge colour,
// universal by convention and never meant to track the product). Only the
// five "grape" tokens are the brand/action family this feature exists to
// adapt.
import { contrastRatio } from './impeccable-principles.mjs';
import { CONTRAST_PAIRS, MIN_CONTRAST } from './fixed-theme.mjs';

export const ACCENT_TOKENS = ['grape', 'grape-dark', 'grape-tint', 'grape-deep', 'grape-soft'];

/**
 * The canonical ramp's own relative law, MEASURED off the shipped palette
 * (global.css), never re-derived by formula:
 *
 *   grape       H262 S83 L58   (the anchor)
 *   grape-dark  H263 S70 L50   ΔS -13  ΔL  -8
 *   grape-tint  H255 S91 L96   ΔS  +8  ΔL +38
 *   grape-deep  H264 S67 L35   ΔS -16  ΔL -23
 *   grape-soft  H255 S92 L76   ΔS  +9  ΔL +18
 *
 * Applying these as offsets from a new hue's OWN S/L would let a washed-out
 * extracted colour produce a washed-out ramp. Applying them as offsets from
 * the CANONICAL grape's S/L, rotated to the extracted HUE only, is the actual
 * design: the ramp is exactly as vivid and exactly as contrasted as
 * AstraVibe's own, whatever hue it is pointed at. Extraction decides ONE
 * number — the hue — and every other number in the ramp is AstraVibe's own.
 */
const CANONICAL_ANCHOR = { saturation: 83, lightness: 58 };
const RAMP_OFFSETS = {
  grape: { saturation: 0, lightness: 0 },
  'grape-dark': { saturation: -13, lightness: -8 },
  'grape-tint': { saturation: 8, lightness: 38 },
  'grape-deep': { saturation: -16, lightness: -23 },
  'grape-soft': { saturation: 9, lightness: 18 },
};

/** How far ONE token's lightness is nudged, per step, before its own search
 *  gives up. Bounded and deterministic — see deriveContrastSafeRamp. */
const MAX_RETRY_STEPS = 20;
const RETRY_STEP = 2;

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function hslToHex(h, s, l) {
  h = ((h % 360) + 360) % 360;
  s = clamp(s, 0, 100) / 100;
  l = clamp(l, 0, 100) / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let [r, g, b] = [0, 0, 0];
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const toHex = (v) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

const tokenHex = (token, hue, lightnessDelta) => {
  const offset = RAMP_OFFSETS[token];
  return hslToHex(hue, CANONICAL_ANCHOR.saturation + offset.saturation, CANONICAL_ANCHOR.lightness + offset.lightness + lightnessDelta);
};

/** Every contrast pair that has this token on either side — the only pairs
 *  whose outcome THIS token's own lightness can change. */
const pairsInvolving = (token) => CONTRAST_PAIRS.filter(([fg, bg]) => fg === token || bg === token);

/**
 * Derives a contrast-safe five-token accent ramp for a hue, or null.
 *
 * PER TOKEN, NOT ONE GLOBAL SHIFT. An earlier version of this function
 * darkened the whole ramp by the same amount on every retry — which also
 * darkened `grape-tint`, a near-white BACKGROUND for dark text, turning it
 * into a medium-saturation swatch and breaking the exact pair it was meant
 * to protect (`steel` on `grape-tint` failed at −40 where it had passed at
 * 0). Each token here is searched independently, trying both directions
 * (darker AND lighter, smallest step first) against only the pairs IT
 * actually appears in — `grape-soft`, which appears in none, is never
 * touched at all.
 *
 * DETERMINISTIC AND BOUNDED. The same hue always finds the same shift, in
 * the same number of steps, because the trial order is fixed (0, −2, +2,
 * −4, +4, … up to ±40). A token with no safe value inside that bound makes
 * the WHOLE ramp null — the caller falls back to canonical rather than
 * shipping one illegible pair inside an otherwise-derived theme.
 *
 * @param {number} hue 0-360
 * @param {Record<string,string>} neutralTheme the OTHER eleven tokens
 *   (canonical values), needed because every contrast pair has a grape
 *   token on one side and a neutral on the other.
 * @returns {{ ramp: Record<string,string>, adjustments: {token:string, lightnessDelta:number}[] } | null}
 */
export function deriveContrastSafeRamp(hue, neutralTheme) {
  const ramp = {};
  const adjustments = [];

  for (const token of ACCENT_TOKENS) {
    const relevant = pairsInvolving(token);
    if (relevant.length === 0) {
      // No pair constrains this token — grape-soft today. Still built from
      // the same rotated-hue law, just never searched.
      ramp[token] = tokenHex(token, hue, 0);
      continue;
    }

    const trials = [0];
    for (let step = 1; step <= MAX_RETRY_STEPS; step += 1) trials.push(-RETRY_STEP * step, RETRY_STEP * step);

    let solved = null;
    for (const delta of trials) {
      const candidate = tokenHex(token, hue, delta);
      const trialTheme = { ...neutralTheme, ...ramp, [token]: candidate };
      const allPass = relevant.every(([fg, bg]) => {
        const ratio = contrastRatio(trialTheme[fg], trialTheme[bg]);
        return ratio !== null && ratio >= MIN_CONTRAST;
      });
      if (allPass) {
        solved = { hex: candidate, delta };
        break;
      }
    }

    if (!solved) return null;
    ramp[token] = solved.hex;
    if (solved.delta !== 0) adjustments.push({ token, lightnessDelta: solved.delta });
  }

  return { ramp, adjustments };
}

/**
 * Runs the template's own pixel-reading subprocess against one real image
 * and returns its raw measurement, or null.
 *
 * A SUBPROCESS, DELIBERATELY. `sharp` lives in content/landing-astravibe's
 * own dependency tree — see extract-accent.mjs's header for the resolution
 * audit — so this reaches it the same way admin/src/server/pipeline.ts
 * already reaches `astro build`: spawn a script that lives where the binary
 * does, read its stdout, never import the dependency across the boundary.
 *
 * NEVER THROWS, and NEVER COLLAPSES a real reason into a generic one. A
 * missing path, an unreadable file, a crashed subprocess, a corrupt stdout
 * and "every pixel was neutral" (extract-accent.mjs's own `all-neutral`) are
 * five different facts, and the manifest states whichever one actually
 * happened — auto-accent is optional decoration, but the reason it did not
 * apply is not.
 *
 * @returns {{ ok: true, hue: number, ... } | { ok: false, reason: string }}
 */
export function readAccentSignal(imagePath, { spawnSync, extractorPath, existsSync }) {
  if (!imagePath) return { ok: false, reason: 'no-source-asset' };
  if (!existsSync(imagePath)) return { ok: false, reason: 'source-asset-missing' };
  let result;
  try {
    result = spawnSync(process.execPath, [extractorPath, imagePath], { encoding: 'utf-8' });
  } catch {
    return { ok: false, reason: 'extractor-spawn-failed' };
  }
  if (!result || result.error) return { ok: false, reason: 'extractor-spawn-failed' };
  if (result.status !== 0 || !result.stdout) return { ok: false, reason: 'extractor-exit-nonzero' };
  let parsed;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    return { ok: false, reason: 'extractor-output-unparseable' };
  }
  if (!parsed || typeof parsed !== 'object') return { ok: false, reason: 'extractor-output-unparseable' };
  // The extractor's OWN reason (all-neutral, unreadable-image, ...) —
  // passed through verbatim rather than re-guessed here.
  if (parsed.ok !== true || typeof parsed.hue !== 'number') {
    return { ok: false, reason: typeof parsed.reason === 'string' ? parsed.reason : 'extractor-reported-failure' };
  }
  return parsed;
}

/**
 * THE WHOLE FEATURE, composed: read a real pixel signal, derive a
 * contrast-safe ramp from its hue, or explain why neither happened.
 *
 * @returns {{
 *   palette: Record<string,string> | null,
 *   provenance: {
 *     source: 'derived' | 'canonical',
 *     reason: string | null,
 *     sourceAsset: string | null,
 *     extracted: { hue:number, saturation:number, lightness:number, usablePixels:number, totalPixels:number } | null,
 *     adjustments: {token:string, lightnessDelta:number}[],
 *   }
 * }}
 */
export function deriveProductAccent({
  imagePath,
  spawnSync,
  extractorPath,
  existsSync,
  neutralTheme,
}) {
  const signal = readAccentSignal(imagePath, { spawnSync, extractorPath, existsSync });
  if (!signal.ok) {
    return {
      palette: null,
      provenance: {
        source: 'canonical',
        // The extractor's OWN reason, verbatim — e.g. `all-neutral` for a
        // white/black/grey frame, never a generic "it failed".
        reason: signal.reason,
        sourceAsset: imagePath ?? null,
        extracted: null,
        adjustments: [],
      },
    };
  }

  const safe = deriveContrastSafeRamp(signal.hue, neutralTheme);
  const extracted = {
    hue: signal.hue,
    saturation: signal.saturation,
    lightness: signal.lightness,
    usablePixels: signal.usablePixels,
    totalPixels: signal.totalPixels,
  };
  if (!safe) {
    return {
      palette: null,
      provenance: { source: 'canonical', reason: 'no-contrast-safe-variant', sourceAsset: imagePath, extracted, adjustments: [] },
    };
  }

  return {
    palette: safe.ramp,
    provenance: { source: 'derived', reason: null, sourceAsset: imagePath, extracted, adjustments: safe.adjustments },
  };
}

/**
 * Resolves the real file path behind the Asset Producer's gallery[0] — the
 * one asset F4 already treats as primary. Recomputes planAssets() rather
 * than trusting a manifest that may not be in scope at this call site: it is
 * a PURE function of (media, imagesDir), so calling it again returns the
 * identical plan and the identical first pick, never a second opinion.
 *
 * Never a placeholder, the favicon, the guarantee seal or a rejected file —
 * those never enter `plan.assets` at all, by construction of planAssets().
 */
export function resolvePrimaryGalleryImage(planAssets, media, imagesDir) {
  if (!imagesDir) return null;
  const plan = planAssets(media, imagesDir);
  return plan.assets[0]?.srcPath ?? null;
}

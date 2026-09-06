#!/usr/bin/env node
// DETERMINISTIC ACCENT EXTRACTION — the one place this repo reads a pixel.
//
// ─── WHY THIS FILE LIVES HERE, AND NOT IN scripts/lib/ ────────────────────
//
// `sharp` is a dependency of THIS template's own package.json — Astro's
// default image service needs it for `astro:assets` — not of admin/ or of
// the repo-root scripts/ tree. Node's module resolution walks up from a
// file's OWN location, never sideways into a sibling project, so neither
// admin/src/server nor scripts/lib can `import 'sharp'` no matter what their
// cwd is when invoked. Audited directly, not assumed:
//
//   node -e "require.resolve('sharp', {paths:['<repo>/scripts/lib']})"
//   → Cannot find module 'sharp'
//   node -e "require.resolve('sharp', {paths:['<repo>/admin/src/server']})"
//   → Cannot find module 'sharp'
//   node -e "require.resolve('sharp')"   (run from here)
//   → resolves, from this template's own node_modules
//
// So this script is spawned as a SUBPROCESS by scripts/lib/fixed-accent.mjs,
// exactly the way admin/src/server/pipeline.ts already spawns `astro build`
// inside a landing's own node_modules — a boundary the codebase already
// trusts, not a new pattern. `sharp` never leaves the template's own
// dependency tree; the Admin only ever reads this process's JSON stdout.
//
// ─── WHAT IT DOES NOT DO ───────────────────────────────────────────────────
//
// No LLM, no "what colour is this" prompt. The same bytes in this file's
// only argument produce the same bucket, the same hue, every time — see
// contract.fixed-accent.test.ts's determinism proof. Pixel maths only.
import sharp from 'sharp';

/** Small and fixed. The same photo always resamples to the same NxNx3
 *  buffer — the down-sample IS the "reduce/resample" step, not a shortcut
 *  around it. Named explicitly (`lanczos3`) so a future libvips default
 *  change cannot silently move the result. */
const SAMPLE_SIZE = 48;
const RESIZE_KERNEL = 'lanczos3';

/** Coarse enough that "orange-ish" pixels land together; fine enough that
 *  orange and red do not. 24 buckets of 15° each. */
const HUE_BUCKETS = 24;

/** Below this saturation a pixel reads as grey regardless of its hue — a
 *  hue angle measured off near-zero chroma is noise, not colour. */
const MIN_SATURATION = 20;
/** Near-white and near-black. A white studio background or a black product
 *  silhouette must never be read as "the colour of this product". */
const MAX_LIGHTNESS = 92;
const MIN_LIGHTNESS = 10;

function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
    }
    h /= 6;
  }
  return [h * 360, s * 100, l * 100];
}

async function extract(imagePath) {
  let raw;
  let info;
  try {
    ({ data: raw, info } = await sharp(imagePath)
      .resize(SAMPLE_SIZE, SAMPLE_SIZE, { fit: 'inside', kernel: RESIZE_KERNEL })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true }));
  } catch (err) {
    return { ok: false, reason: 'unreadable-image', error: err instanceof Error ? err.message : String(err) };
  }

  const channels = info.channels;
  const buckets = Array.from({ length: HUE_BUCKETS }, () => ({ count: 0, hSum: 0, sSum: 0, lSum: 0 }));
  let totalPixels = 0;
  let usablePixels = 0;

  for (let i = 0; i + channels <= raw.length; i += channels) {
    totalPixels += 1;
    const [h, s, l] = rgbToHsl(raw[i], raw[i + 1], raw[i + 2]);
    // NEUTRAL, DISCARDED — never a candidate, whatever its hue angle says.
    if (s < MIN_SATURATION || l > MAX_LIGHTNESS || l < MIN_LIGHTNESS) continue;
    const bucket = Math.min(HUE_BUCKETS - 1, Math.floor(h / (360 / HUE_BUCKETS)));
    buckets[bucket].count += 1;
    buckets[bucket].hSum += h;
    buckets[bucket].sSum += s;
    buckets[bucket].lSum += l;
    usablePixels += 1;
  }

  if (usablePixels === 0) {
    return { ok: false, reason: 'all-neutral', totalPixels };
  }

  // SCORE = how much of the USABLE frame this hue covers, times how vivid it
  // is. Neither alone is right: the most FREQUENT hue in a mostly-white photo
  // is whatever faint tint the white itself carries, and the most SATURATED
  // single pixel is noise. A hue that is both present and vivid wins — the
  // 10% saturated orange in the brief beats the 70% white background because
  // white was excluded before scoring ever runs, not because orange scored
  // higher on frequency.
  let best = null;
  for (const bucket of buckets) {
    if (bucket.count === 0) continue;
    const avgSaturation = bucket.sSum / bucket.count;
    const frequency = bucket.count / usablePixels;
    const score = frequency * (avgSaturation / 100);
    if (!best || score > best.score) {
      best = {
        score,
        hue: bucket.hSum / bucket.count,
        saturation: avgSaturation,
        lightness: bucket.lSum / bucket.count,
        pixelCount: bucket.count,
      };
    }
  }

  return {
    ok: true,
    hue: Math.round(best.hue),
    saturation: Math.round(best.saturation),
    lightness: Math.round(best.lightness),
    usablePixels,
    totalPixels,
    imageWidth: info.width,
    imageHeight: info.height,
  };
}

const imagePath = process.argv[2];
if (!imagePath) {
  process.stdout.write(JSON.stringify({ ok: false, reason: 'no-image-path' }));
  process.exit(0);
}

extract(imagePath).then((result) => {
  process.stdout.write(JSON.stringify(result));
});

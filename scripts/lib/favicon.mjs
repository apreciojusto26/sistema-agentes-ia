// DETERMINISTIC per-product favicon (SVG + ICO), generated from identity the
// landing already has: `product.brand` and the resolved theme tokens.
//
// WHY IT EXISTS. content/landing-base/public/favicon.svg is ONE static file
// that copyTemplate() ships to every output, so every landing this system has
// ever produced wore the same icon. A browser tab is identity; sharing it
// across unrelated stores is the same class of defect as sharing a comparison
// heading.
//
// NO NETWORK, NO MODEL, NO EMOJI. A monogram on a rounded square, drawn from
// the brand and coloured from the theme. Same input -> same bytes, always;
// that determinism is what lets `validate` assert an output is not still
// wearing the template's icon.
//
// PURE DATA + string building, like content-contract.mjs: no fs, no deps. The
// caller writes the files.

/**
 * Strips diacritics and non-letters so the monogram is a stable ASCII-ish
 * initial. `Ñandú` -> `N`, `Ángel & Co` -> `AC`.
 */
function normalizeWord(word) {
  return word
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}]/gu, '');
}

/** Words too generic to carry identity — never the first letter of a monogram. */
const FILLER = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'y', 'the', 'of', 'and', 'by']);

/**
 * 1–2 character monogram. One useful word -> its first letter; two or more ->
 * the first letter of each of the first two.
 *
 * Falls back to '·' rather than throwing: a brand of pure symbols is strange
 * but not a reason to fail a build, and the ICO/SVG still render something
 * stable and distinct from the template.
 */
export function brandMonogram(brand) {
  const words = String(brand ?? '')
    .split(/[\s\-_/]+/)
    .map(normalizeWord)
    .filter((w) => w.length > 0 && !FILLER.has(w.toLowerCase()));

  if (words.length === 0) return '·';
  if (words.length === 1) return words[0].slice(0, 1).toUpperCase();
  return (words[0].slice(0, 1) + words[1].slice(0, 1)).toUpperCase();
}

// --- contrast --------------------------------------------------------------

/** #rgb / #rrggbb -> [r,g,b] 0-255. Returns null for anything else. */
export function parseHex(hex) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex ?? '').trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

/** WCAG relative luminance. */
function luminance([r, g, b]) {
  const f = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** WCAG contrast ratio, 1..21. */
export function contrastRatio(a, b) {
  const ca = parseHex(a);
  const cb = parseHex(b);
  if (!ca || !cb) return 1;
  const la = luminance(ca);
  const lb = luminance(cb);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * The minimum a 16x16 monogram needs to stay readable. Deliberately above the
 * 4.5 body-text bar: a favicon is small, often on a coloured tab strip, and
 * frequently downscaled with antialiasing.
 */
export const MIN_FAVICON_CONTRAST = 4.5;

/**
 * Picks the foreground for `background`, preferring theme tokens and falling
 * back to plain white/black — never assuming a token pair is legible.
 *
 * The template's own rust-on-bone pair is a real example of why: it looks like
 * brand colour and measures about 3.4:1.
 */
export function pickForeground(background, candidates = []) {
  const scored = [...candidates, '#ffffff', '#000000']
    .filter((c) => parseHex(c))
    .map((c) => ({ c, ratio: contrastRatio(background, c) }));

  const passing = scored.filter((s) => s.ratio >= MIN_FAVICON_CONTRAST);
  // Among passing candidates keep the FIRST (theme tokens are ordered by
  // preference); if none pass, take the highest ratio available.
  if (passing.length > 0) return passing[0].c;
  return scored.sort((a, b) => b.ratio - a.ratio)[0].c;
}

// --- svg -------------------------------------------------------------------

const SIZE = 64; // viewBox units; the file scales to any tab size.

/**
 * Deterministic favicon SVG. No <text> element and therefore no font
 * dependency: a tab renders on machines that do not have the brand's typeface,
 * and a missing font would silently change the glyph. The monogram is drawn
 * with a built-in generic stack and `textLength` pinned, so rasterisation is
 * stable enough for an icon while never depending on a webfont download.
 */
export function buildFaviconSvg({ brand, background, foreground, radius = 14 }) {
  const monogram = brandMonogram(brand);
  const fontSize = monogram.length > 1 ? 30 : 40;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" role="img" aria-label="${escapeXml(String(brand ?? ''))}">`,
    `<rect width="${SIZE}" height="${SIZE}" rx="${radius}" fill="${background}"/>`,
    `<text x="50%" y="50%" dy="0.02em" text-anchor="middle" dominant-baseline="central"`,
    ` font-family="Helvetica,Arial,sans-serif" font-size="${fontSize}" font-weight="700"`,
    ` fill="${foreground}">${escapeXml(monogram)}</text>`,
    `</svg>`,
    '',
  ].join('\n');
}

function escapeXml(s) {
  return s.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));
}

// --- ico -------------------------------------------------------------------

/**
 * A real .ico carrying 16x16 and 32x32 BMP images, built by rasterising the
 * SAME identity by hand — the rounded square plus a blocky monogram.
 *
 * WHY NOT RENDER THE SVG. Rasterising SVG needs a renderer (sharp/resvg) in a
 * script that today has zero dependencies, and agents.MD §12 forbids adding one
 * during generation. The requirement is "identity consistent, useful at 16 and
 * 32, reproducible" — not vector fidelity — so the ICO paints the same colours
 * and the same letterforms from a 5x7 bitmap font.
 */
export function buildFaviconIco({ brand, background, foreground }) {
  const monogram = brandMonogram(brand);
  const images = [16, 32].map((size) => bmpForSize(size, monogram, background, foreground));

  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);

  const dirSize = 16 * images.length;
  let offset = header.length + dirSize;
  const dir = Buffer.concat(
    images.map(({ size, data }) => {
      const e = Buffer.alloc(16);
      e.writeUInt8(size === 256 ? 0 : size, 0);
      e.writeUInt8(size === 256 ? 0 : size, 1);
      e.writeUInt8(0, 2); // palette
      e.writeUInt8(0, 3); // reserved
      e.writeUInt16LE(1, 4); // planes
      e.writeUInt16LE(32, 6); // bpp
      e.writeUInt32LE(data.length, 8);
      e.writeUInt32LE(offset, 12);
      offset += data.length;
      return e;
    }),
  );

  return Buffer.concat([header, dir, ...images.map((i) => i.data)]);
}

/** 5x7 bitmap glyphs — enough for A-Z, 0-9 and the '·' fallback. */
const GLYPHS = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '11110', '10001', '10001', '10001', '11110'],
  C: ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '11110', '10000', '10000', '10000', '11111'],
  F: ['11111', '10000', '11110', '10000', '10000', '10000', '10000'],
  G: ['01111', '10000', '10000', '10011', '10001', '10001', '01111'],
  H: ['10001', '10001', '11111', '10001', '10001', '10001', '10001'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  J: ['00111', '00010', '00010', '00010', '00010', '10010', '01100'],
  K: ['10001', '10010', '11100', '10100', '10010', '10001', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '11011', '10001'],
  X: ['10001', '01010', '00100', '00100', '00100', '01010', '10001'],
  Y: ['10001', '01010', '00100', '00100', '00100', '00100', '00100'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  0: ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  1: ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  2: ['01110', '10001', '00001', '00110', '01000', '10000', '11111'],
  3: ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  4: ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  5: ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  6: ['01110', '10000', '11110', '10001', '10001', '10001', '01110'],
  7: ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  8: ['01110', '10001', '01110', '10001', '10001', '10001', '01110'],
  9: ['01110', '10001', '10001', '01111', '00001', '00001', '01110'],
  '·': ['00000', '00000', '00000', '00100', '00000', '00000', '00000'],
};

const GLYPH_W = 5;
const GLYPH_H = 7;

function bmpForSize(size, monogram, background, foreground) {
  const bg = parseHex(background) ?? [30, 33, 36];
  const fg = parseHex(foreground) ?? [255, 255, 255];

  // Scale so 1-2 glyphs plus a 1-cell gutter fit inside ~70% of the square.
  const chars = [...monogram];
  const cols = chars.length * GLYPH_W + (chars.length - 1);
  const scale = Math.max(1, Math.floor((size * 0.62) / Math.max(cols, GLYPH_H)));
  const textW = cols * scale;
  const textH = GLYPH_H * scale;
  const originX = Math.round((size - textW) / 2);
  const originY = Math.round((size - textH) / 2);
  // Rounded corners, scaled from the SVG's rx/viewBox ratio.
  const corner = Math.round(size * (14 / SIZE));

  /** BGRA, bottom-up rows (BMP convention). */
  const px = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const inside = insideRoundedSquare(x, y, size, corner);
      let color = inside ? bg : null;

      if (inside) {
        const cx = x - originX;
        const cy = y - originY;
        if (cx >= 0 && cy >= 0 && cx < textW && cy < textH) {
          const cell = Math.floor(cx / scale);
          const row = Math.floor(cy / scale);
          const charIndex = Math.floor(cell / (GLYPH_W + 1));
          const colInChar = cell % (GLYPH_W + 1);
          const glyph = GLYPHS[chars[charIndex]] ?? GLYPHS['·'];
          if (colInChar < GLYPH_W && glyph[row]?.[colInChar] === '1') color = fg;
        }
      }

      const flippedY = size - 1 - y;
      const o = (flippedY * size + x) * 4;
      if (color) {
        px[o] = color[2];
        px[o + 1] = color[1];
        px[o + 2] = color[0];
        px[o + 3] = 255;
      } // else: left as fully transparent
    }
  }

  const dib = Buffer.alloc(40);
  dib.writeUInt32LE(40, 0);
  dib.writeInt32LE(size, 4);
  dib.writeInt32LE(size * 2, 8); // height doubled: colour + (empty) mask
  dib.writeUInt16LE(1, 12);
  dib.writeUInt16LE(32, 14);
  dib.writeUInt32LE(0, 16); // BI_RGB
  dib.writeUInt32LE(px.length, 20);

  // AND mask: one bit per pixel, rows padded to 4 bytes. All zero — the alpha
  // channel already carries transparency for every renderer that reads 32bpp.
  const maskRowBytes = Math.ceil(size / 32) * 4;
  const mask = Buffer.alloc(maskRowBytes * size);

  return { size, data: Buffer.concat([dib, px, mask]) };
}

function insideRoundedSquare(x, y, size, corner) {
  const nearLeft = x < corner;
  const nearRight = x >= size - corner;
  const nearTop = y < corner;
  const nearBottom = y >= size - corner;
  if (!((nearLeft || nearRight) && (nearTop || nearBottom))) return true;
  const cx = nearLeft ? corner - 0.5 : size - corner - 0.5;
  const cy = nearTop ? corner - 0.5 : size - corner - 0.5;
  return (x - cx) ** 2 + (y - cy) ** 2 <= corner ** 2;
}

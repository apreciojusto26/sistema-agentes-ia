// Per-landing favicon — deterministic, contrast-checked, no network, no model.
//
// The defect this closes: content/landing-base/public/favicon.svg was ONE file
// copied into every output, so every store this system ever produced wore the
// same browser-tab identity. That file is now deleted from the template
// entirely rather than kept as a fallback, so a generated landing cannot
// silently inherit it.
import { describe, test, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const fav = await import(pathToFileURL(path.join(REPO_ROOT, 'scripts/lib/favicon.mjs')).href);

const THEME = { background: '#1e2124', foreground: '#f7f3ec' };

describe('the template ships NO generic favicon to inherit', () => {
  test.each(['favicon.svg', 'favicon.ico'])('content/landing-base/public/%s does not exist', (f) => {
    expect(existsSync(path.join(REPO_ROOT, 'content/landing-base/public', f))).toBe(false);
  });

  test('Base.astro references both, and the generator writes both', () => {
    const head = readFileSync(path.join(REPO_ROOT, 'content/landing-base/src/layouts/Base.astro'), 'utf-8');
    expect(head).toMatch(/rel="icon"[^>]*type="image\/svg\+xml"[^>]*href="\/favicon\.svg"/);
    expect(head).toMatch(/href="\/favicon\.ico"/);

    const gen = readFileSync(path.join(REPO_ROOT, 'scripts/generate-landing.mjs'), 'utf-8');
    expect(gen).toContain("withStage('write-favicon'");
    expect(gen).toContain('public/favicon.svg');
    expect(gen).toContain('public/favicon.ico');
  });
});

describe('the monogram is derived, deterministic and normalised', () => {
  test.each([
    ['NubeCalma', 'N'],
    ['AstraVibe', 'A'],
    ['ILEPO', 'I'],
    ['Café de la Montaña', 'CM'],
    ['Ñandú', 'N'],
    ['X', 'X'],
    ['dos palabras', 'DP'],
    ['El Buen Café', 'BC'],
  ])('%s -> %s', (brand, expected) => {
    expect(fav.brandMonogram(brand)).toBe(expected);
  });

  test('filler words never carry the identity', () => {
    // "de la" would otherwise produce "DL" for half the Spanish brands.
    expect(fav.brandMonogram('Aceites de la Sierra')).toBe('AS');
  });

  test('a symbols-only brand degrades instead of throwing', () => {
    expect(fav.brandMonogram('***')).toBe('·');
    expect(fav.brandMonogram('')).toBe('·');
  });
});

describe('contrast is MEASURED, never assumed', () => {
  test("the template's own rust-on-bone pair does NOT pass", () => {
    // The exact reason pickForeground exists. It looks like brand colour and
    // measures under the bar, which is invisible until a 16px tab.
    const ratio = fav.contrastRatio('#c8552f', '#f7f3ec');
    expect(ratio).toBeLessThan(fav.MIN_FAVICON_CONTRAST);
  });

  test('a passing theme token is preferred over plain white/black', () => {
    expect(fav.pickForeground('#1e2124', ['#f7f3ec', '#c8552f'])).toBe('#f7f3ec');
  });

  test('a failing token is rejected in favour of something that passes', () => {
    const picked = fav.pickForeground('#f7f3ec', ['#c8552f', '#1e2124']);
    expect(picked).not.toBe('#c8552f');
    expect(fav.contrastRatio('#f7f3ec', picked)).toBeGreaterThanOrEqual(fav.MIN_FAVICON_CONTRAST);
  });

  test('every chosen pair clears the bar across a spread of backgrounds', () => {
    for (const bg of ['#1e2124', '#f7f3ec', '#c8552f', '#c9a227', '#ffffff', '#000000', '#0a3d62']) {
      const fg = fav.pickForeground(bg, ['#f7f3ec', '#1e2124']);
      expect(fav.contrastRatio(bg, fg), `${bg} -> ${fg}`).toBeGreaterThanOrEqual(fav.MIN_FAVICON_CONTRAST);
    }
  });
});

describe('SVG output', () => {
  test('is well-formed, self-contained and label-bearing', () => {
    const svg = fav.buildFaviconSvg({ brand: 'NubeCalma', ...THEME });
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg.trimEnd().endsWith('</svg>')).toBe(true);
    expect(svg).toContain('viewBox="0 0 64 64"');
    expect(svg).toContain('aria-label="NubeCalma"');
    // No network of any kind. The `xmlns` URI is excluded deliberately: it is
    // the mandatory SVG namespace IDENTIFIER, never dereferenced by a renderer,
    // and an earlier version of this assertion failed on it — which would have
    // pushed the fix toward removing a required attribute.
    const withoutNamespace = svg.replace(/xmlns="[^"]*"/g, '');
    expect(withoutNamespace).not.toMatch(/https?:|<image|xlink:href|@import|url\(/);
    // No emoji, no model output.
    expect(svg).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  test('escapes a brand that contains markup', () => {
    const svg = fav.buildFaviconSvg({ brand: 'A & <B>', ...THEME });
    expect(svg).toContain('&amp;');
    expect(svg).not.toContain('<B>');
  });
});

describe('ICO output is a real icon file', () => {
  const ico: Buffer = fav.buildFaviconIco({ brand: 'NubeCalma', ...THEME });

  test('carries a valid header with 16x16 and 32x32', () => {
    expect(ico.readUInt16LE(0)).toBe(0); // reserved
    expect(ico.readUInt16LE(2)).toBe(1); // type: icon
    expect(ico.readUInt16LE(4)).toBe(2); // two images
    expect([ico.readUInt8(6), ico.readUInt8(22)]).toEqual([16, 32]);
  });

  test('each entry points at a 32bpp DIB whose height is doubled per spec', () => {
    for (const i of [0, 1]) {
      const entry = 6 + i * 16;
      const size = ico.readUInt8(entry) || 256;
      const offset = ico.readUInt32LE(entry + 12);
      expect(ico.readUInt32LE(offset)).toBe(40); // DIB header size
      expect(ico.readInt32LE(offset + 4)).toBe(size);
      expect(ico.readInt32LE(offset + 8)).toBe(size * 2); // colour + mask
      expect(ico.readUInt16LE(offset + 14)).toBe(32); // bpp
    }
  });

  test('actually paints both colours — it is not a blank square', () => {
    // A monogram that never drew would still be a structurally valid ICO.
    const offset = ico.readUInt32LE(6 + 12) + 40;
    const px = ico.subarray(offset, offset + 16 * 16 * 4);
    const seen = new Set<string>();
    for (let i = 0; i < px.length; i += 4) seen.add(`${px[i]},${px[i + 1]},${px[i + 2]},${px[i + 3]}`);
    expect(seen.size, 'the 16x16 image is a single flat colour').toBeGreaterThan(1);
  });
});

describe('determinism and distinctness', () => {
  test('same brand + same theme -> byte-identical, both formats', () => {
    const a = { brand: 'NubeCalma', ...THEME };
    expect(fav.buildFaviconSvg(a)).toBe(fav.buildFaviconSvg(a));
    expect(fav.buildFaviconIco(a).equals(fav.buildFaviconIco(a))).toBe(true);
  });

  test('different brands -> different output, both formats', () => {
    const a = { brand: 'NubeCalma', ...THEME };
    const b = { brand: 'ILEPO', ...THEME };
    expect(fav.buildFaviconSvg(a)).not.toBe(fav.buildFaviconSvg(b));
    expect(fav.buildFaviconIco(a).equals(fav.buildFaviconIco(b))).toBe(false);
  });

  test('a different theme moves the output for the same brand', () => {
    const a = { brand: 'NubeCalma', ...THEME };
    expect(fav.buildFaviconSvg({ ...a, background: '#0a3d62' })).not.toBe(fav.buildFaviconSvg(a));
    expect(fav.buildFaviconIco({ ...a, background: '#0a3d62' }).equals(fav.buildFaviconIco(a))).toBe(false);
  });
});

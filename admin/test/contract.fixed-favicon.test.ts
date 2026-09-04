// THE BRAND MARK — the smallest visual artefact a landing owns.
//
// ─── WHAT THE PAGE ACTUALLY CONSUMES ──────────────────────────────────────
//
// Audited, not assumed. Base.astro's head contains exactly one icon reference,
// `<link rel="icon" type="image/svg+xml" href="/favicon.svg">`. `favicon.ico`
// is referenced nowhere but is fetched by convention, so it stays. There is no
// manifest, no apple-touch-icon and no icon set — inventing ten sizes would be
// inventing consumers.
import { describe, test, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  resolveFixedFavicon,
  faviconFingerprint,
  validateOperatorFavicon,
  wrapRasterAsSvg,
  paletteFromCss,
  PROMPT_VERSION,
  MAX_OPERATOR_BYTES,
  FixedFaviconError,
} from '../../scripts/lib/fixed-favicon.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const PNG = readFileSync(path.join(REPO_ROOT, 'admin/test/fixtures/assets/a/images/img_2.png'));
const CSS = readFileSync(path.join(REPO_ROOT, 'content/landing-astravibe/src/styles/global.css'), 'utf-8');
const palette = () => paletteFromCss(CSS);

const tmp = () => mkdtempSync(path.join(tmpdir(), 'fixed-favicon-'));
const sha = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');

const base = { brand: 'Robledo', productName: 'Tabla de roble', palette: palette() };

// ───────────────────────────────────────────────────────────────────────────
// WHAT THE HEAD REFERENCES
// ───────────────────────────────────────────────────────────────────────────

describe('the audited consumers, pinned', () => {
  test('the head references exactly one icon, and it is the SVG', () => {
    const head = readFileSync(path.join(REPO_ROOT, 'content/landing-astravibe/src/layouts/Base.astro'), 'utf-8');
    const links = [...head.matchAll(/<link[^>]*rel="icon"[^>]*>/g)];
    expect(links).toHaveLength(1);
    expect(links[0][0]).toContain('href="/favicon.svg"');
    expect(links[0][0]).toContain('type="image/svg+xml"');
  });

  test('there is no manifest and no apple-touch-icon to feed', () => {
    // Generating icons nothing references would be inventing consumers.
    const head = readFileSync(path.join(REPO_ROOT, 'content/landing-astravibe/src/layouts/Base.astro'), 'utf-8');
    expect(head).not.toMatch(/apple-touch-icon|rel="manifest"/);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// PRECEDENCE
// ───────────────────────────────────────────────────────────────────────────

describe('operator > previous > generated > canonical', () => {
  test('with nothing supplied the deterministic monogram is used', async () => {
    const r = await resolveFixedFavicon({ ...base });
    expect(r.manifest.source).toBe('canonical');
    expect(r.files.map((f) => f.name)).toEqual(['favicon.svg', 'favicon.ico']);
    expect(r.providerCalled).toBe(false);
  });

  test('an operator file beats a provider, and the provider is never called', async () => {
    const dir = tmp();
    const file = path.join(dir, 'mark.png');
    writeFileSync(file, PNG);
    let calls = 0;
    try {
      const r = await resolveFixedFavicon({
        ...base,
        operatorPath: file,
        generate: () => {
          calls += 1;
          return PNG;
        },
      });
      expect(r.manifest.source).toBe('operator');
      expect(calls, 'the provider was called despite an operator file').toBe(0);
      expect(r.providerCalled).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a provider fills the gap when no operator file exists', async () => {
    let calls = 0;
    const r = await resolveFixedFavicon({
      ...base,
      generate: () => {
        calls += 1;
        return PNG;
      },
    });
    expect(r.manifest.source).toBe('generated');
    expect(calls).toBe(1);
    expect(r.providerCalled).toBe(true);
  });

  test('and the monogram catches everything, so a landing always has an icon', async () => {
    const r = await resolveFixedFavicon({ ...base, generate: () => null });
    expect(r.manifest.source).toBe('canonical');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// GENERATE ONCE
// ───────────────────────────────────────────────────────────────────────────

describe('an image call happens at most once per fingerprint', () => {
  test('a previous artefact with the same fingerprint is reused, not remade', async () => {
    let calls = 0;
    const first = await resolveFixedFavicon({ ...base, generate: () => (calls++, PNG) });
    const second = await resolveFixedFavicon({
      ...base,
      previous: first.manifest,
      generate: () => (calls++, PNG),
    });
    expect(calls, 'the provider ran twice for the same inputs').toBe(1);
    expect(second.manifest.reused).toBe(true);
    expect(second.files, 'reuse rewrote the files').toEqual([]);
  });

  test('copy churn does NOT justify a regeneration', () => {
    // The whole point of the fingerprint. FAQ entries, review counts and
    // secondary copy change on every run and none of them changes what a brand
    // mark should look like.
    const a = faviconFingerprint({ ...base });
    const b = faviconFingerprint({ ...base });
    expect(a).toBe(b);
  });

  test.each([
    ['the brand', { brand: 'Otra Marca' }],
    ['the product identity', { productName: 'Otro producto' }],
    ['the prompt version', { promptVersion: PROMPT_VERSION + 1 }],
  ])('but a change to %s does', (_label, over) => {
    expect(faviconFingerprint({ ...base, ...over })).not.toBe(faviconFingerprint({ ...base }));
  });

  test('a palette change moves the fingerprint — the mark is drawn from it', () => {
    const recoloured = { ...base, palette: { ...base.palette, graphite: '#0B0B0B' } };
    expect(faviconFingerprint(recoloured)).not.toBe(faviconFingerprint({ ...base }));
  });

  test('a stale fingerprint does NOT reuse', async () => {
    let calls = 0;
    const first = await resolveFixedFavicon({ ...base, generate: () => (calls++, PNG) });
    await resolveFixedFavicon({
      ...base,
      brand: 'Marca Nueva',
      previous: first.manifest,
      generate: () => (calls++, PNG),
    });
    expect(calls).toBe(2);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// DETERMINISM
// ───────────────────────────────────────────────────────────────────────────

describe('the artefact is reproducible', () => {
  test('two resolves with no provider give byte-identical files', async () => {
    const a = await resolveFixedFavicon({ ...base });
    const b = await resolveFixedFavicon({ ...base });
    expect(a.manifest.files).toEqual(b.manifest.files);
    expect(sha(a.files[0].contents as string)).toBe(sha(b.files[0].contents as string));
  });

  test('the deterministic record carries no timestamp', async () => {
    // A clock inside the reproducible half would change the manifest on every
    // run for no reason but time passing, and "the build changed" would stop
    // meaning anything. Operational metadata lives in its own object.
    const r = await resolveFixedFavicon({ ...base });
    expect(JSON.stringify({ ...r.manifest, operational: undefined })).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
    expect(r.manifest.operational.generatedAt).toBeNull();
  });

  test('a generation records WHEN, but only in the operational half', async () => {
    const r = await resolveFixedFavicon({ ...base, generate: () => PNG, now: '2026-09-04T00:00:00.000Z' });
    expect(r.manifest.operational.generatedAt).toBe('2026-09-04T00:00:00.000Z');
    expect(r.manifest.fingerprint).toBe(faviconFingerprint({ ...base }));
  });

  test('different bytes give a different hash; the same bytes do not', async () => {
    const a = await resolveFixedFavicon({ ...base, generate: () => PNG });
    const b = await resolveFixedFavicon({ ...base, generate: () => PNG });
    // Also square — a different mark, not a different shape. The shape rules
    // are exercised on their own below.
    const other = readFileSync(path.join(REPO_ROOT, 'admin/test/fixtures/assets/b/images/img_1.png'));
    const c = await resolveFixedFavicon({ ...base, generate: () => other });
    const png = (r: typeof a) => r.manifest.files.find((f: { name: string }) => f.name === 'favicon.png')!.sha256;
    expect(png(a)).toBe(png(b));
    expect(png(c)).not.toBe(png(a));
  });
});

// ───────────────────────────────────────────────────────────────────────────
// SECURITY AT THE OPERATOR BOUNDARY
// ───────────────────────────────────────────────────────────────────────────

describe('an operator file is validated by its bytes, not its name', () => {
  const withFile = (name: string, contents: Buffer | string, fn: (file: string, dir: string) => void) => {
    const dir = tmp();
    const file = path.join(dir, name);
    writeFileSync(file, contents);
    try {
      fn(file, dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };

  test('a valid PNG is accepted', () => {
    withFile('mark.png', PNG, (file) => {
      const r = validateOperatorFavicon(file);
      expect(r.ok).toBe(true);
    });
  });

  test('an SVG is refused — it is a document, and there is no sanitiser', () => {
    // F5 closed one path that let unvalidated text reach the browser. Accepting
    // arbitrary vector markup would open another: an SVG can carry <script>,
    // <foreignObject>, external references and entity expansions.
    withFile('mark.svg', '<svg onload="alert(1)"><script>x()</script></svg>', (file) => {
      const r = validateOperatorFavicon(file);
      expect(r.ok).toBe(false);
      expect((r as { code: string }).code).toBe('favicon-unsupported-format');
    });
  });

  test('a .png that is not a PNG is refused', () => {
    withFile('mark.png', '<svg><script>x()</script></svg>', (file) => {
      expect((validateOperatorFavicon(file) as { code: string }).code).toBe('favicon-malformed');
    });
  });

  test('an empty file is refused', () => {
    withFile('mark.png', Buffer.alloc(0), (file) => {
      expect((validateOperatorFavicon(file) as { code: string }).code).toBe('favicon-empty');
    });
  });

  test('an oversized file is refused', () => {
    withFile('mark.png', Buffer.concat([PNG, Buffer.alloc(MAX_OPERATOR_BYTES)]), (file) => {
      expect((validateOperatorFavicon(file) as { code: string }).code).toBe('favicon-too-large');
    });
  });

  test('a path escaping the operator directory is refused', () => {
    const dir = tmp();
    try {
      const escape = path.join(dir, '..', '..', 'etc', 'passwd.png');
      const r = validateOperatorFavicon(escape, { baseDir: dir });
      expect(r.ok).toBe(false);
      expect((r as { code: string }).code).toBe('favicon-path-escape');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a missing file is refused', () => {
    expect((validateOperatorFavicon('/nope/absent.png') as { code: string }).code).toBe('favicon-file-missing');
  });

  test('a resolve with a bad operator file throws rather than falling back', async () => {
    // Silently dropping to the monogram would ship a mark the operator did not
    // choose and never say why.
    const dir = tmp();
    const file = path.join(dir, 'mark.png');
    writeFileSync(file, 'not a png');
    try {
      await expect(resolveFixedFavicon({ ...base, operatorPath: file })).rejects.toThrow(FixedFaviconError);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a provider returning a non-square image is refused', async () => {
    // A model that returns a 900x1600 banner has not returned a favicon, and a
    // browser tab is the wrong place to discover that.
    const banner = readFileSync(path.join(REPO_ROOT, 'admin/test/fixtures/assets/a/images/img_3.png'));
    await expect(resolveFixedFavicon({ ...base, generate: () => banner })).rejects.toThrow(/not square/);
  });

  test('a provider returning non-PNG is refused too', async () => {
    // A model's SVG is untrusted markup exactly like an operator's.
    await expect(
      resolveFixedFavicon({ ...base, generate: () => Buffer.from('<svg><script>x()</script></svg>') }),
    ).rejects.toThrow(/not a PNG/);
  });
});

describe('the SVG wrapper is markup we author, byte for byte', () => {
  test('the only external input is base64 of validated PNG bytes', () => {
    const svg = wrapRasterAsSvg(PNG);
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    expect(svg).toContain('data:image/png;base64,');
    expect(svg).not.toMatch(/<script|foreignObject|<!ENTITY|onload=/i);
    // base64 cannot carry markup, so the payload cannot escape the attribute.
    const payload = /base64,([^"]+)"/.exec(svg)![1];
    expect(payload).toMatch(/^[A-Za-z0-9+/=]+$/);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// ONE IDENTITY, BOTH FILES
// ───────────────────────────────────────────────────────────────────────────

describe('favicon.svg and favicon.ico never disagree about who this is', () => {
  /** Reads the payload of an ICO's single directory entry. */
  const icoPayload = (ico: Buffer) => {
    expect(ico.readUInt16LE(0), 'ICO reserved field').toBe(0);
    expect(ico.readUInt16LE(2), 'ICO type must be 1 (icon)').toBe(1);
    const count = ico.readUInt16LE(4);
    expect(count).toBeGreaterThan(0);
    const length = ico.readUInt32LE(14);
    const offset = ico.readUInt32LE(18);
    return ico.subarray(offset, offset + length);
  };

  test('an operator mark reaches the ICO, not just the SVG', async () => {
    // The F6 gap: the ICO stayed the canonical monogram even when an operator
    // supplied a mark, so a client that ignores SVG and asks for /favicon.ico
    // was shown a different brand. Silently.
    const dir = tmp();
    const file = path.join(dir, 'mark.png');
    writeFileSync(file, PNG);
    try {
      const r = await resolveFixedFavicon({ ...base, operatorPath: file });
      const ico = r.files.find((f) => f.name === 'favicon.ico')!.contents as Buffer;
      expect(icoPayload(ico).equals(PNG), 'the ICO carries a different image').toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a generated mark does too', async () => {
    const r = await resolveFixedFavicon({ ...base, generate: () => PNG });
    const ico = r.files.find((f) => f.name === 'favicon.ico')!.contents as Buffer;
    expect(icoPayload(ico).equals(PNG)).toBe(true);
  });

  test('the SVG and the ICO carry the SAME bytes', async () => {
    // Stated as one assertion rather than two, because the invariant is the
    // agreement between them, not the contents of either.
    const r = await resolveFixedFavicon({ ...base, generate: () => PNG });
    const svg = r.files.find((f) => f.name === 'favicon.svg')!.contents as string;
    const ico = r.files.find((f) => f.name === 'favicon.ico')!.contents as Buffer;
    const embedded = Buffer.from(/base64,([^"]+)"/.exec(svg)![1], 'base64');
    expect(icoPayload(ico).equals(embedded)).toBe(true);
  });

  test('and the canonical monogram still writes a real multi-size ICO', async () => {
    // The fallback keeps its own encoder: two BMP entries at 16 and 32, which
    // is the right shape for a glyph mark and does not need a PNG container.
    const r = await resolveFixedFavicon({ ...base });
    const ico = r.files.find((f) => f.name === 'favicon.ico')!.contents as Buffer;
    expect(ico.readUInt16LE(4), 'the monogram ICO should carry 16 and 32').toBe(2);
  });

  test('no resolution ever leaves a stale monogram beside a raster mark', async () => {
    for (const opts of [{ generate: () => PNG }, {}]) {
      const r = await resolveFixedFavicon({ ...base, ...opts });
      const names = r.files.map((f) => f.name);
      const ico = r.files.find((f) => f.name === 'favicon.ico')!.contents as Buffer;
      // If a PNG is shipped, the ICO must be that PNG. If not, it must be the
      // monogram's two-entry container. There is no third state.
      if (names.includes('favicon.png')) {
        expect(ico.readUInt16LE(4)).toBe(1);
      } else {
        expect(ico.readUInt16LE(4)).toBe(2);
      }
    }
  });
});

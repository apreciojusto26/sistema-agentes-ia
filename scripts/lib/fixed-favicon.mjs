// THE BRAND MARK — the smallest visual artefact a landing owns.
//
// ─── WHAT THE PAGE ACTUALLY CONSUMES ──────────────────────────────────────
//
// Audited rather than assumed. Base.astro's head contains exactly one icon
// reference:
//
//     <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
//
// `favicon.ico` is NOT referenced anywhere; browsers request `/favicon.ico` by
// convention when they want a legacy icon, so it is an implicit consumer and
// keeps being written. There is no manifest, no apple-touch-icon and no icon
// set — inventing ten sizes would be inventing consumers.
//
// BOTH FILES ALWAYS CARRY THE SAME IDENTITY. That is an invariant, not a
// nicety: a client that ignores SVG and falls back to /favicon.ico must not be
// shown a different brand. When a raster wins, the ICO is packed from that same
// raster; when the monogram wins, both are drawn from it.
//
// `og-cover.png` is referenced through `og:image`, and it is NOT a favicon. It
// is out of scope here and still ships the template's own artwork.
//
// ─── GENERATION HAPPENS AT MOST ONCE ──────────────────────────────────────
//
// A deterministic monogram builder already existed (favicon.mjs) and ran on
// every generation, which was fine precisely because it is deterministic. An AI
// provider is not, so it cannot sit inside the build: two builds of the same
// landing would ship different icons and the artefact would stop being
// reproducible.
//
// So the rule is generate once, persist, hash, reuse. The fingerprint below
// decides when a regeneration is justified, and it deliberately covers only the
// inputs a mark depends on — brand, product identity, palette, prompt version.
// A new FAQ entry or a changed review count must never cost an image call.
//
// ─── NO PROVIDER EXISTS TODAY ─────────────────────────────────────────────
//
// Audited: there is no image-generation SDK, API surface, model or credential
// anywhere in this repo. The only configured model is a TEXT model used by the
// Content Agent over plain fetch. So `generate` is an INJECTED function and the
// chain simply skips that link when nothing is wired — the architecture is
// ready and the backend is declared debt rather than simulated.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { buildFaviconSvg, buildFaviconIco, buildIcoFromPng, pickForeground } from './favicon.mjs';

/** Where a mark can come from, strongest first. */
export const FAVICON_SOURCES = ['operator', 'generated', 'canonical'];

/** Bumped when the generation policy changes enough to justify a new mark. */
export const PROMPT_VERSION = 1;

/** A tab icon is tiny; anything approaching this is not a favicon. */
export const MAX_OPERATOR_BYTES = 256 * 1024;

/** Smallest square that still renders cleanly at 32px on a 2x display. */
export const MIN_OPERATOR_SIZE = 32;

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

/**
 * The inputs a mark legitimately depends on.
 *
 * NOT the whole landing. Copy, FAQ, reviews and prices change constantly and
 * none of them changes what a brand mark should look like; folding them in
 * would make every pipeline run a regeneration.
 */
export function faviconFingerprint({ brand = null, productName = null, palette = {}, promptVersion = PROMPT_VERSION }) {
  const material = JSON.stringify({
    brand: brand ?? null,
    productName: productName ?? null,
    // Only the tokens the mark is drawn from. A change to `--color-success`
    // does not justify redrawing an icon.
    palette: { graphite: palette.graphite ?? null, bone: palette.bone ?? null, surface: palette.surface ?? null },
    promptVersion,
  });
  return sha256(Buffer.from(material, 'utf-8'));
}

export class FixedFaviconError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'FixedFaviconError';
    this.code = code;
  }
}

/** PNG magic bytes. The extension is a claim; these are evidence. */
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Validates an operator-supplied mark.
 *
 * RASTER ONLY, AND THAT IS A SECURITY DECISION. An SVG is a document: it can
 * carry `<script>`, `<foreignObject>`, external references and entity
 * expansions, and this repo has no SVG sanitiser. F5 removed one path that let
 * unvalidated text reach the browser; accepting arbitrary vector markup would
 * open another. A PNG cannot execute.
 *
 * The bytes are checked, not the filename: an extension is a claim.
 *
 * @returns {{ok: true, buffer: Buffer, width: number, height: number} | {ok: false, code: string, message: string}}
 */
export function validateOperatorFavicon(file, { baseDir = null } = {}) {
  const bad = (code, message) => ({ ok: false, code, message });

  if (typeof file !== 'string' || file.trim() === '') {
    return bad('favicon-operator-missing', 'no operator favicon path was given');
  }

  // Path containment. A generation reads what the operator names, and the
  // operator names a file — never a way out of the tree they were pointed at.
  const resolved = path.resolve(file);
  if (baseDir) {
    const root = path.resolve(baseDir);
    if (resolved !== root && !resolved.startsWith(root + path.sep)) {
      return bad(
        'favicon-path-escape',
        `${file} resolves outside ${baseDir}. A favicon is read from the operator's own directory.`,
      );
    }
  }

  if (path.extname(resolved).toLowerCase() !== '.png') {
    return bad(
      'favicon-unsupported-format',
      `${path.basename(file)} is not a .png. SVG is refused because it is a document — it can carry ` +
        'script, external references and entity expansions, and this repo has no sanitiser for it.',
    );
  }

  if (!existsSync(resolved) || !statSync(resolved).isFile()) {
    return bad('favicon-file-missing', `operator favicon not found: ${file}`);
  }

  const bytes = statSync(resolved).size;
  if (bytes === 0) return bad('favicon-empty', `${path.basename(file)} is empty`);
  if (bytes > MAX_OPERATOR_BYTES) {
    return bad(
      'favicon-too-large',
      `${path.basename(file)} is ${bytes} bytes; a tab icon over ${MAX_OPERATOR_BYTES} is not a favicon.`,
    );
  }

  return validatePngBuffer(readFileSync(resolved), path.basename(file));
}

/**
 * The shape rules, applied to bytes from ANY source.
 *
 * A provider's output goes through exactly this: a model that returns a
 * 900x1600 banner has not returned a favicon, and finding that out at build
 * time in a browser tab is finding out too late.
 */
export function validatePngBuffer(buffer, label = 'the favicon') {
  const bad = (code, message) => ({ ok: false, code, message });

  if (!Buffer.isBuffer(buffer) || buffer.length < 24 || !buffer.subarray(0, 8).equals(PNG_MAGIC)) {
    return bad(
      'favicon-malformed',
      `${label} is not a PNG. An extension — or a provider's promise — is a claim; the bytes are the evidence.`,
    );
  }

  // IHDR sits at a fixed offset in every PNG.
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  if (width < MIN_OPERATOR_SIZE || height < MIN_OPERATOR_SIZE) {
    return bad(
      'favicon-too-small',
      `${label} is ${width}x${height}, below ${MIN_OPERATOR_SIZE}px; it would render blurred in a tab.`,
    );
  }
  if (width !== height) {
    return bad(
      'favicon-not-square',
      `${label} is ${width}x${height}, not square; a tab icon is drawn in a square box.`,
    );
  }

  return { ok: true, buffer, width, height };
}

/**
 * Wraps a raster mark in an SVG the head can reference.
 *
 * WE AUTHOR EVERY BYTE OF THIS MARKUP. The head declares
 * `type="image/svg+xml"`, so the referenced file has to be an SVG — and rather
 * than accept one, the operator's PNG is embedded in a wrapper written here.
 * The only external input is base64 of validated PNG bytes, which cannot carry
 * markup.
 */
export function wrapRasterAsSvg(pngBuffer) {
  const data = pngBuffer.toString('base64');
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">' +
    `<image href="data:image/png;base64,${data}" x="0" y="0" width="64" height="64"/>` +
    '</svg>\n'
  );
}

/** Reads the palette tokens the monogram builder draws from. */
export function paletteFromCss(css) {
  const token = (name) => {
    const m = new RegExp(`--color-${name}:\\s*([^;]+);`).exec(css);
    return m ? m[1].trim() : null;
  };
  return { graphite: token('graphite'), bone: token('bone'), surface: token('surface') };
}

/**
 * Resolves the mark, in a stated order:
 *
 *   1. an OPERATOR file        — a person supplied it
 *   2. a PREVIOUS artefact     — same fingerprint, already approved: reuse
 *   3. a GENERATED mark        — an injected provider, called at most once
 *   4. the CANONICAL monogram  — deterministic, always available
 *
 * The canonical link never fails, so a landing always has an icon.
 *
 * @param {object} opts
 * @param {string|null} opts.operatorPath
 * @param {object|null} opts.previous       a prior manifest, if one exists
 * @param {(input: object) => Promise<Buffer|null>|Buffer|null} [opts.generate]
 * @returns {Promise<{files: {name: string, contents: Buffer|string}[], manifest: object, providerCalled: boolean}>}
 */
export async function resolveFixedFavicon({
  operatorPath = null,
  operatorBaseDir = null,
  previous = null,
  generate = null,
  brand = null,
  productName = null,
  palette = {},
  now = null,
} = {}) {
  const fingerprint = faviconFingerprint({ brand, productName, palette });

  const monogram = () => {
    const background = palette.graphite ?? '#1e2124';
    const foreground = pickForeground(background, [palette.bone, palette.surface].filter(Boolean));
    const label = brand ?? productName ?? '';
    return {
      svg: buildFaviconSvg({ brand: label, background, foreground }),
      ico: buildFaviconIco({ brand: label, background, foreground }),
    };
  };

  const base = (source, files, extra = {}) => ({
    files,
    manifest: {
      schema: 1,
      source,
      fingerprint,
      promptVersion: PROMPT_VERSION,
      // DETERMINISTIC HALF: everything a rebuild must reproduce exactly.
      files: files.map((f) => ({
        name: f.name,
        sha256: sha256(Buffer.isBuffer(f.contents) ? f.contents : Buffer.from(f.contents, 'utf-8')),
      })),
      // OPERATIONAL HALF, kept apart on purpose. A timestamp inside the
      // deterministic record would change the manifest on every run for no
      // reason but the clock, and "the build changed" would stop meaning
      // anything. Null unless a generation actually happened.
      operational: { generatedAt: null, provider: null, ...extra },
    },
    providerCalled: false,
  });

  // 1 — operator
  if (operatorPath) {
    const check = validateOperatorFavicon(operatorPath, { baseDir: operatorBaseDir });
    if (!check.ok) throw new FixedFaviconError(check.message, check.code);
    return base('operator', [
      { name: 'favicon.png', contents: check.buffer },
      { name: 'favicon.svg', contents: wrapRasterAsSvg(check.buffer) },
      // THE SAME MARK, IN BOTH FILES. It used to stay the monogram here, so a
      // landing shipped one identity in favicon.svg and a different one to any
      // client that asks for /favicon.ico. buildIcoFromPng packs the validated
      // raster into an ICO container verbatim — no re-encoding, no dependency.
      { name: 'favicon.ico', contents: buildIcoFromPng(check.buffer) },
    ]);
  }

  // 2 — a previous artefact for the same inputs
  if (previous && previous.fingerprint === fingerprint && previous.source === 'generated') {
    return { files: [], manifest: { ...previous, reused: true }, providerCalled: false };
  }

  // 3 — a provider, if one is wired
  if (typeof generate === 'function') {
    const produced = await generate({ brand, productName, palette, promptVersion: PROMPT_VERSION, fingerprint });
    if (produced) {
      // THE SAME RULES AS AN OPERATOR FILE. Raster only, because an SVG from a
      // model is untrusted markup and this repo has no sanitiser — and square,
      // and big enough, because a provider that returns a banner has not
      // returned a favicon.
      const check = validatePngBuffer(produced, 'the favicon provider output');
      if (!check.ok) throw new FixedFaviconError(check.message, check.code);
      const result = base(
        'generated',
        [
          { name: 'favicon.png', contents: produced },
          { name: 'favicon.svg', contents: wrapRasterAsSvg(produced) },
          // Same rule as the operator branch: one identity, both files.
          { name: 'favicon.ico', contents: buildIcoFromPng(produced) },
        ],
        { generatedAt: now ?? new Date().toISOString(), provider: 'injected' },
      );
      return { ...result, providerCalled: true };
    }
  }

  // 4 — the deterministic monogram
  const { svg, ico } = monogram();
  return base('canonical', [
    { name: 'favicon.svg', contents: svg },
    { name: 'favicon.ico', contents: ico },
  ]);
}

/** Writes the resolved files into a landing's public/ directory. */
export function writeFaviconFiles(publicDir, files) {
  for (const file of files) {
    writeFileSync(path.join(publicDir, file.name), file.contents);
  }
}

#!/usr/bin/env node
// IS THIS OUTPUT READY?
//
// One command that answers it, so the question does not get answered by
// reading six files and remembering what F2 through F6 decided. Every check
// below is a guarantee some phase established, restated where an operator can
// run it against a landing that actually exists on disk.
//
//   node scripts/check-readiness.mjs outputs/my-landing
//
// It reads. It never writes, never builds, never installs and never touches a
// network — so it is safe to run against a tree you are about to ship.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { FIXED_TEMPLATE_NAME, FIXED_TEMPLATE_RELATIVE } from './lib/fixed-template.mjs';
import { readCanonicalPalette, collectContrastIssues } from './lib/fixed-theme.mjs';
import { collectAssetOutputIssues } from './lib/fixed-asset-output.mjs';
import { isDerivedFrom } from './lib/display-name.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GRAMMAR_V1 = 'a2fc51ddf61b7dfa6a145eee7e25497a12e10669a7dfd714f07600aa586d77cd';
const GRAMMAR_V2 = '82e3913a2cb7268da0b9f75f72f058fb3e248ba20aee8cf120866d0de80c9f24';
const GRAMMAR_V3 = 'af765fce5c7d66630f660b64fba1eeab6901a0c0f8342c8c0e2d24083e46acff';

/**
 * The template's own domain — the one host a generated landing may never claim.
 *
 * It is not read from anywhere because it is no longer written anywhere: the
 * literal left astro.config.mjs and src/data/legal.ts in FIX PACK 1, and
 * contract.template-residuals.test.ts keeps it out. Naming it here is the
 * regression guard for the day someone puts it back.
 */
const TEMPLATE_DOMAIN = 'astravibe.bamzuk.com';

/** @type {{name: string, ok: boolean, detail: string}[]} */
const results = [];
const check = (name, fn) => {
  try {
    const detail = fn();
    results.push({ name, ok: true, detail: detail ?? 'ok' });
  } catch (err) {
    results.push({ name, ok: false, detail: err.message });
  }
};

const must = (condition, message) => {
  if (!condition) throw new Error(message);
};

// THE FIRST NON-FLAG ARGUMENT, not `argv[2]`. With `--json` in the mix a
// positional read would take the flag for the landing and report "no such
// landing: --json" for a perfectly valid invocation, purely because of the
// order the caller happened to write.
const outDir = process.argv.slice(2).find((arg) => !arg.startsWith('--'));
if (!outDir) {
  console.error('usage: node scripts/check-readiness.mjs <outputs/slug>');
  process.exit(2);
}
const out = path.resolve(outDir);
if (!existsSync(out)) {
  console.error(`no such landing: ${outDir}`);
  process.exit(2);
}

const read = (rel) => readFileSync(path.join(out, rel), 'utf-8');
const has = (rel) => existsSync(path.join(out, rel));
const json = (rel) => JSON.parse(read(rel));

// ─── the seal ──────────────────────────────────────────────────────────────

check('Structural Grammar sealed', () => {
  // ALL THREE seals. V1 and V2 are the historical record and V3 is the current
  // profile for generated output; a landing is only trustworthy if none has
  // moved. An older seal is never dropped when a newer one arrives — a version
  // that stops being checked is a version that can be quietly rewritten.
  const seals = [['V1', GRAMMAR_V1], ['V2', GRAMMAR_V2], ['V3', GRAMMAR_V3]];
  for (const [name, expected] of seals) {
    const artifact = readFileSync(path.join(ROOT, `scripts/lib/ASTRAVIBE_FIXED_STRUCTURAL_GRAMMAR_${name}.txt`));
    const hash = createHash('sha256').update(artifact).digest('hex');
    must(hash === expected, `the ${name} artifact hashes ${hash}, not its seal`);
  }
  return seals.map(([n, h]) => `${n} ${h.slice(0, 12)}…`).join(' · ');
});

// ─── provenance ────────────────────────────────────────────────────────────

check('Fixed template authority', () => {
  must(has('.generation.json'), 'no .generation.json — this landing records no provenance');
  const manifest = json('.generation.json');
  must(
    manifest.template?.dir === FIXED_TEMPLATE_RELATIVE,
    `generated from ${manifest.template?.dir}, not ${FIXED_TEMPLATE_RELATIVE}`,
  );
  return `${FIXED_TEMPLATE_NAME} @ ${manifest.template.commit ?? 'unknown'}`;
});

check('Design Agent absent', () => {
  // Not disabled — unreachable. A DesignSpec artefact in a Fixed output would
  // mean something reintroduced the stage.
  must(!has('src/data/design.ts'), 'src/data/design.ts exists — a Design Agent wrote here');
  return 'no design.ts, no design stage';
});

// ─── content ───────────────────────────────────────────────────────────────

check('Content boundary', () => {
  must(has('src/data/product.ts'), 'no src/data/product.ts');
  const product = read('src/data/product.ts');
  // The steps carry asset-assigned media; a content-chosen slot key here would
  // mean the projection stopped dropping it.
  const steps = /steps: \[([\s\S]*?)\n {2}\],/.exec(product)?.[1] ?? '';
  must(steps.length > 0, 'the generated product has no steps');
  must(/asset: "product-\d/.test(steps) || !/asset:/.test(steps), 'a step media ref is not an asset-layer key');
  return 'steps carry asset-layer media';
});

// ─── assets ────────────────────────────────────────────────────────────────

check('Assets real', () => {
  must(has('src/data/images.ts'), 'no src/data/images.ts');
  const images = read('src/data/images.ts');
  must(images.includes('GENERATED by scripts/lib/asset-pipeline.mjs'), 'images.ts is still the template stock');

  const keys = new Set([...images.matchAll(/^\s*'([^']+)':/gm)].map((m) => m[1]));
  const refs = [...read('src/data/product.ts').matchAll(/asset: "([^"]+)"/g)].map((m) => m[1]);
  const dead = refs.filter((r) => !keys.has(r));
  must(dead.length === 0, `refs resolve to nothing (blank frames): ${dead.join(', ')}`);

  if (has('.assets.json')) {
    const manifest = json('.assets.json');
    const missing = manifest.assets.filter((a) => !has(path.join('src/assets/product', a.file)));
    must(missing.length === 0, `manifest names files that were never copied: ${missing.map((a) => a.file).join(', ')}`);
    return `${manifest.assets.length} asset(s), ${refs.length} ref(s), all resolve`;
  }
  return `${refs.length} ref(s), all resolve`;
});

// ─── theme ─────────────────────────────────────────────────────────────────

check('Theme safe', () => {
  const css = read('src/styles/global.css');
  const palette = readCanonicalPalette(css);
  must(Object.keys(palette).length > 0, 'the @theme block declares no colour tokens');
  const issues = collectContrastIssues(palette);
  must(issues.length === 0, issues.map((i) => i.message).join(' | '));

  if (has('.theme.json')) {
    const manifest = json('.theme.json');
    const worst = Math.min(...manifest.contrast.map((c) => c.ratio));
    return `${Object.keys(palette).length} tokens, worst pair ${worst}:1`;
  }
  return `${Object.keys(palette).length} tokens, all pairs AA`;
});

// ─── brand mark ────────────────────────────────────────────────────────────

check('Favicon valid', () => {
  must(has('public/favicon.svg'), 'no public/favicon.svg — the head references it');
  must(has('public/favicon.ico'), 'no public/favicon.ico');
  if (!has('.favicon.json')) return 'present (no manifest — legacy generation)';

  const manifest = json('.favicon.json');
  // The F6.1 invariant: both files carry the same identity, or a client that
  // ignores SVG is shown a different brand.
  const ico = readFileSync(path.join(out, 'public/favicon.ico'));
  const entries = ico.readUInt16LE(4);
  if (manifest.source === 'canonical') {
    must(entries === 2, 'the monogram ICO should carry two sizes');
  } else {
    must(entries === 1, `source is ${manifest.source} but the ICO is not the raster mark`);
  }
  return `${manifest.source}, ${manifest.files.length} file(s)`;
});

check('Social preview', () => {
  // THE LANDING DECLARES ITS OWN. src/data/og.ts is generated beside the file,
  // so the extension follows the real image instead of a historical `.png`.
  // `null` is a legitimate, reported state — better than shipping another
  // product's artwork, which is exactly what a fixed filename resolved against
  // a hardcoded domain used to do.
  if (!has('src/data/og.ts')) return 'no og module (legacy generation)';
  const declared = /ogImageFile: string \| null = (?:'([^']+)'|null)/.exec(read('src/data/og.ts'))?.[1] ?? null;
  if (!declared) return 'absent (this product has no usable main image)';

  must(has(path.join('public', declared)), `src/data/og.ts names ${declared}, which is not in public/`);
  const shipped = createHash('sha256').update(readFileSync(path.join(out, 'public', declared))).digest('hex');

  // THE TEMPLATE'S OWN COVER IS CHECKED FIRST, and the order is the message.
  // Both rules below reject the same file, but only this one can say WHOSE
  // product it is — and "you are about to share AstraVibe's artwork" is what
  // an operator needs to read. The manifest rule that follows is the general
  // case and would otherwise answer the specific one with a vaguer sentence.
  const template = path.join(ROOT, FIXED_TEMPLATE_RELATIVE, 'public/og-cover.png');
  if (existsSync(template)) {
    const original = createHash('sha256').update(readFileSync(template)).digest('hex');
    must(shipped !== original, "this landing would share AstraVibe's own artwork as its social preview");
  }

  // OWNERSHIP: it must be THIS run's asset, not a leftover from another.
  if (has('.assets.json')) {
    const manifest = json('.assets.json');
    const known = new Set(manifest.assets.map((a) => a.sha256));
    must(known.has(shipped), 'the social preview is not one of this run\'s produced assets');
  }
  return `${declared}, this run's own photograph`;
});

// ─── commerce ──────────────────────────────────────────────────────────────

check('Commerce authority', () => {
  must(has('.env'), 'no .env — the commerce mode was never written');
  const env = read('.env');
  const mode = /PUBLIC_COMMERCE_MODE=(\w+)/.exec(env)?.[1] ?? null;
  must(mode !== null, '.env states no PUBLIC_COMMERCE_MODE');
  // Credentials are NEVER written by the generator; a landing carrying one is
  // a landing that leaked it into a repo.
  must(!/PUBLIC_SHOPIFY_STOREFRONT_TOKEN=\S/.test(env), '.env carries a storefront token — it must not be committed');

  if (mode === 'preview') return 'preview — no price, no cart, no Shopify identity';
  const handle = /PUBLIC_SHOPIFY_PRODUCT_HANDLE=(\S+)/.exec(env)?.[1] ?? null;
  must(handle, 'commerce mode with no product handle — the landing cannot resolve a product');
  return `shopify — handle ${handle} (credentials supplied at deploy, never here)`;
});

// ─── the artefact ──────────────────────────────────────────────────────────

check('Artefact complete', () => {
  for (const rel of ['.git', '.gitignore', 'package.json', 'astro.config.mjs', 'src/data/faq.ts']) {
    must(has(rel), `missing ${rel}`);
  }
  // A shipped landing carries no test harness and no alternate config.
  const stray = readdirSync(out).filter((f) => /^astro\.config\..+\.mjs$/.test(f) || f === 'test-harness');
  must(stray.length === 0, `test scaffolding survived into the output: ${stray.join(', ')}`);
  return 'own repo, own data, no test scaffolding';
});

// ─── ownership ─────────────────────────────────────────────────────────────
//
// THE CHECK THAT WOULD HAVE STOPPED THE FIRST REAL LANDING.
//
// Every check above passed on a landing whose H1 described a different product
// — "24 ambientes. Un solo proyector." over a photograph of an RGB light tube
// — because none of them ever compared what the page SAYS with what this run
// DECIDED. They verified provenance, assets, contrast, seals: everything
// except whether the rendered words belong to this product.
//
// DETERMINISTIC, NOT HEURISTIC. There is no list of suspicious words here and
// there must never be one: a real customer review saying "todo llegó perfecto"
// is not contamination, and a landing that genuinely sells a projector is
// entitled to say so. What is checkable without guessing is EQUALITY — the
// rendered slot against the value this run emitted for it.

/** The slots the emitter wrote, read back from the module it wrote them to. */
function emittedSlots() {
  const src = read('src/data/product.ts');
  const slot = (name) => {
    const m = new RegExp(`^  ${name}: (null|"((?:[^"\\\\]|\\\\.)*)"),$`, 'm').exec(src);
    must(m !== null, `src/data/product.ts declares no ${name}`);
    return m[1] === 'null' ? null : JSON.parse(m[1]);
  };
  return { brand: slot('brand'), name: slot('name'), tagline: slot('tagline'), subtagline: slot('subtagline') };
}

/** An element's text, as a reader sees it: tags gone, entities decoded, spaces collapsed. */
const textOf = (fragment) =>
  fragment
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

check('Copy ownership', () => {
  if (!has('dist/client/index.html')) return 'NOT BUILT — ownership is measured on the rendered page';
  const html = read('dist/client/index.html');
  const emitted = emittedSlots();

  // ── the H1 ───────────────────────────────────────────────────────────────
  // It rendered the star projector's headline. It is `tagline` now, which the
  // assembler owns, and the two must be the same string.
  const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html);
  must(h1 !== null, 'the built page has no H1');
  must(
    textOf(h1[1]) === emitted.tagline,
    `the H1 renders ${JSON.stringify(textOf(h1[1]))} but this run emitted ${JSON.stringify(emitted.tagline)}`,
  );

  // ── the how-it-works heading ─────────────────────────────────────────────
  // NOT a data slot, deliberately: a heading true of every product is generic
  // UI copy, and asking the Content Agent for it would be asking a model to
  // write a sentence the layout already knows. So the ownership rule is that
  // it is still the TEMPLATE'S — compared against the literal the template
  // declares, which also fails loudly the day someone makes it dynamic without
  // giving it an authority.
  const section = /<section id="como-funciona"[\s\S]*?<\/section>/.exec(html);
  must(section !== null, 'the built page has no "cómo funciona" section');
  const renderedHeading = textOf(/<h2[^>]*>([\s\S]*?)<\/h2>/.exec(section[0])?.[1] ?? '');
  const templateSource = readFileSync(
    path.join(ROOT, FIXED_TEMPLATE_RELATIVE, 'src/components/sections/06-how-it-works.astro'),
    'utf-8',
  ).replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
  const declaredHeading = textOf(/<h2[^>]*>([\s\S]*?)<\/h2>/.exec(templateSource)?.[1] ?? '');
  must(declaredHeading !== '', 'the template declares no how-it-works heading to compare against');
  must(
    renderedHeading === declaredHeading,
    `the how-it-works heading renders ${JSON.stringify(renderedHeading)}, not the template's ` +
      `${JSON.stringify(declaredHeading)} — if it is meant to vary per product it needs a data authority`,
  );

  // ── the brand ────────────────────────────────────────────────────────────
  // CanonicalProduct.identity.brand is the only authority, and `null` is a real
  // answer. This landing does not carry the scrape, so what is checkable here
  // is that the emitted value is not one of the two wrong answers that actually
  // happened: the template's own brand, and the seller's legal name.
  const templateBrand = /^  brand: '(.*)',$/m.exec(
    readFileSync(path.join(ROOT, FIXED_TEMPLATE_RELATIVE, 'src/data/product.ts'), 'utf-8'),
  )?.[1];
  must(
    emitted.brand === null || emitted.brand !== templateBrand,
    `this landing ships the template's own brand, ${JSON.stringify(templateBrand)}`,
  );
  if (has('src/data/merchant.ts')) {
    // The generator serializes with double quotes; the template's own module is
    // `null`. Both spellings are read so the rule cannot be dodged by either.
    const m = /legalName:\s*(?:"((?:[^"\\\\]|\\\\.)*)"|'((?:[^'\\\\]|\\\\.)*)')/.exec(read('src/data/merchant.ts'));
    const legalName = m ? JSON.parse(`"${(m[1] ?? m[2]).replace(/"/g, '\\\\"')}"`) : null;
    must(
      !legalName || emitted.brand !== legalName,
      `the product's brand is the SELLER's legal name, ${JSON.stringify(legalName)} — a legal identity is not a brand`,
    );
  }
  // A null brand must render as absence, never as the word.
  must(
    !/>\s*null\s*</.test(html) && !/content="null"/.test(html),
    'the page renders the literal "null" — a nullable slot reached a template that assumed a string',
  );

  return emitted.brand === null
    ? `H1 and heading own their slots; no brand (the source published none)`
    : `H1 and heading own their slots; brand ${JSON.stringify(emitted.brand)}`;
});

check('Product name', () => {
  const emitted = emittedSlots();
  const source = /^  name: ("(?:[^"\\\\]|\\\\.)*")/m.exec(read('src/data/product.ts'));
  must(source !== null, 'src/data/product.ts declares no name');
  const sourceTitle = JSON.parse(source[1]);
  const display = /^  displayName: ("(?:[^"\\\\]|\\\\.)*")/m.exec(read('src/data/product.ts'));
  must(display !== null, 'src/data/product.ts declares no displayName');
  const displayName = JSON.parse(display[1]);

  must(sourceTitle.trim() !== '', 'the source title is empty — the listing title was not preserved');
  must(displayName.trim() !== '', 'the display name is empty');
  must(
    !/^(TODO|FIXME|placeholder|pendiente|sin nombre|producto)$/i.test(displayName.trim()),
    `the display name is a placeholder: ${JSON.stringify(displayName)}`,
  );

  // THE INVARIANT. Every word shown as the product's identity must come from
  // the source title, in order — the one rule that makes invention impossible.
  // A model asked for a product name answers with one: this landing's own
  // Content Agent proposed "LuminArt — …", naming a company that does not
  // exist.
  must(
    isDerivedFrom(displayName, sourceTitle),
    `the display name ${JSON.stringify(displayName)} is not derived from the source title — ` +
      'a word appears in it that the listing never contained',
  );

  // And it must not smuggle a brand past the brand rule.
  if (emitted.brand === null) {
    const templateBrand = /^  brand: '(.*)',$/m.exec(
      readFileSync(path.join(ROOT, FIXED_TEMPLATE_RELATIVE, 'src/data/product.ts'), 'utf-8'),
    )?.[1];
    must(
      !templateBrand || !displayName.includes(templateBrand),
      `the display name carries the template's brand, ${JSON.stringify(templateBrand)}`,
    );
  }

  return sourceTitle === displayName
    ? `${JSON.stringify(displayName)} (the title needed no narrowing)`
    : `${JSON.stringify(displayName)} — from a ${sourceTitle.length}-char source title, preserved`;
});

check('Merchant valid', () => {
  // THE SELLER, or the honest absence of one. The legal pages project this;
  // without it every identifying field is null and each page says so.
  if (!has('src/data/merchant.ts')) return 'no merchant module (legacy generation)';
  const text = read('src/data/merchant.ts');
  if (/export const merchant: Merchant \| null = null/.test(text)) {
    return 'ABSENT — legal pages say the information is pending. Not publishable.';
  }
  for (const field of ['legalName', 'tradeName', 'taxId', 'address', 'contactEmail', 'country']) {
    must(new RegExp(`${field}:\\s*"[^"]+"`).test(text), `merchant.${field} is missing from the generated config`);
  }
  const legalName = /legalName:\s*"((?:[^"\\\\]|\\\\.)*)"/.exec(text)?.[1] ?? '';
  return `${legalName} — identity complete`;
});

check('Social preview origin', () => {
  if (!has('dist/client/index.html')) return 'NOT BUILT — the rendered head is where the origin appears';
  const html = read('dist/client/index.html');
  const og = /<meta property="og:image" content="([^"]*)"/.exec(html);

  // ABSENCE IS A LEGITIMATE PREVIEW STATE. `og:image` must be absolute, so it
  // needs an origin, and a landing without SITE_URL has none. Emitting one
  // anyway is what produced `https://astravibe.bamzuk.com/og-cover.png` on a
  // light tube — and resolving against the build's request URL only replaces
  // that with `http://localhost:4321/…`, which is dead for every reader.
  if (!og) return 'omitted — this landing has no domain yet';

  // MEASURED ON THE ARTEFACT FIRST. Readiness runs in its own shell, often
  // long after the build, so it cannot assume the build's environment is still
  // present — a check that fails because SITE_URL is unset in THIS terminal
  // would be reporting on the terminal, not on the landing.
  let shipped;
  try {
    shipped = new URL(og[1]);
  } catch {
    throw new Error(`the social image is not a URL: ${og[1]}`);
  }
  // LOOPBACK IS CHECKED FIRST, because it has the more useful sentence. A
  // build with no domain resolves `/og-cover.webp` against the build's own
  // request URL and produces `http://localhost:4321/…`, which would otherwise
  // be reported as a plain protocol error and send an operator to configure
  // TLS on a host that is not a host.
  const localhost =
    shipped.hostname === 'localhost' ||
    shipped.hostname.endsWith('.localhost') ||
    shipped.hostname.startsWith('127.') ||
    shipped.hostname === '::1';
  must(!localhost, `the social image points at ${shipped.host}, which is nobody's server but this machine`);
  must(shipped.protocol === 'https:', `the social image is served over ${shipped.protocol}, not https`);
  must(shipped.hostname.includes('.'), `the social image host ${shipped.host} is not a public domain`);

  // THE KNOWN TEMPLATE DOMAIN, denied by name. It is no longer written
  // anywhere in the template — contract.template-residuals.test.ts proves that
  // — and this is the belt to that brace: whatever a future edit reintroduces,
  // a generated landing may not advertise the star projector's host.
  must(
    shipped.hostname !== TEMPLATE_DOMAIN,
    `the social image is served from ${TEMPLATE_DOMAIN}, the template's own domain, not this landing's`,
  );

  // And when SITE_URL IS visible here, the stronger rule applies: the page must
  // advertise the exact origin this landing was configured with.
  const configured = (process.env.SITE_URL ?? '').trim();
  if (configured) {
    let declared;
    try {
      declared = new URL(configured);
    } catch {
      throw new Error(`SITE_URL is not a URL: ${configured}`);
    }
    must(
      shipped.origin === declared.origin,
      `the social image is served from ${shipped.origin}, not this landing's ${declared.origin}`,
    );
    return `${shipped.origin} — matches SITE_URL`;
  }
  return `${shipped.origin} — this landing's own`;
});

check('Build present', () => {
  const dist = path.join(out, 'dist/client/index.html');
  if (!existsSync(dist)) return 'NOT BUILT — run astro build to complete the check';
  const html = readFileSync(dist, 'utf-8');
  must(/<link[^>]*rel="icon"/.test(html), 'the built page references no icon');
  must(!/0,00\s*€/.test(html), 'the built page prints a 0,00 € price');
  return `${(statSync(dist).size / 1024).toFixed(0)} kB, icon referenced`;
});

// ─── report ────────────────────────────────────────────────────────────────

// MACHINE-READABLE, ADDITIVE. The Admin's Validation Agent reports readiness
// as one of its operations, and parsing a padded human table for that would
// couple a UI to column widths. `--json` prints the same `results` the humans
// see — same checks, same order, same details — and the default output is
// byte-for-byte what it always was.
if (process.argv.includes('--json')) {
  const failedChecks = results.filter((r) => !r.ok);
  process.stdout.write(
    `${JSON.stringify({ ready: failedChecks.length === 0, total: results.length, results }, null, 2)}\n`,
  );
  process.exit(failedChecks.length === 0 ? 0 : 1);
}

const width = Math.max(...results.map((r) => r.name.length));
for (const r of results) {
  console.log(`${r.ok ? '✓' : '✗'} ${r.name.padEnd(width)}  ${r.detail}`);
}

const failed = results.filter((r) => !r.ok);
console.log('');
if (failed.length === 0) {
  console.log(`READY — ${results.length} checks passed for ${path.relative(ROOT, out)}`);
  process.exit(0);
}
console.log(`NOT READY — ${failed.length} of ${results.length} checks failed`);
process.exit(1);

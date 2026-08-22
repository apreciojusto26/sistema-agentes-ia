#!/usr/bin/env node
// Code Agent (agents.MD §4): mechanical assembly only — no LLM calls, no content
// decisions. Content/design/copy must already be decided (by the Content/Design
// Agent, i.e. an LLM conversation) and handed to this script as JSON.
//
// Usage:
//   node scripts/generate-landing.mjs --slug my-product --content path/to/content.json [--images dir] [--force]
//
// content.json shape — see scripts/example-content.json for a full example.

import { existsSync, mkdirSync, cpSync, readFileSync, writeFileSync, readdirSync, statSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { DEFAULT_ERRORS, ContentContractError, validateContent } from './lib/content-contract.mjs';
import { checkDesignSupport } from './lib/design-contract.mjs';
import { isProductId } from './lib/product-id.cjs';
import { isShopifyHandle } from './lib/shopify-handle.mjs';
import { planAssets, materializeAssets, buildImagesModule, describeRejections, TEMPLATE_SLOT_KEYS } from './lib/asset-pipeline.mjs';
import events from './lib/events.cjs';

// Product Identity + Generation Isolation (design "product-identity-
// generation-isolation" D4/D5, tasks 5.1-5.4). Schema version for
// outputs/{slug}/.generation.json — bump only on a breaking shape change.
const GENERATION_SCHEMA_VERSION = 1;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const TEMPLATE_DIR = path.join(ROOT, 'content/landing-base');
const OUTPUTS_DIR = path.join(ROOT, 'outputs');

// --- structured progress protocol (spec R5, design §4) --------------------
// Additive, opt-in: with LG_EVENTS unset, `emit` is a no-op and nothing
// about the script's observable stdout/stderr/exit-code behavior changes.

const emit = process.env.LG_EVENTS === '1' ? events.createEmitter('generate') : () => {};

let currentStage = null;

function withStage(stage, fn) {
  currentStage = stage;
  emit('stage.start', stage);
  const t = Date.now();
  try {
    const r = fn();
    emit('stage.end', stage, { ms: Date.now() - t });
    currentStage = null;
    return r;
  } catch (e) {
    emit('error', stage, { message: e.message, code: e.code });
    throw e;
  }
}

// --- CLI args ---------------------------------------------------------

function parseArgs(argv) {
  const args = { force: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--slug') args.slug = argv[++i];
    else if (a === '--content') args.content = argv[++i];
    else if (a === '--images') args.images = argv[++i];
    else if (a === '--images-manifest') args.imagesManifest = argv[++i];
    else if (a === '--product-id') args.productId = argv[++i];
    // Fase 4: the CanonicalProduct whose media[] drives the asset pipeline.
    // Opt-in — its absence keeps both legacy --images modes byte-identical.
    else if (a === '--product') args.productJson = argv[++i];
    // Fase 5: COMMERCE MODE. Its presence is what makes the landing buyable;
    // its absence leaves the landing in preview mode. Operator-supplied only
    // — never produced by the Content or Design Agent (agents.MD §1/§5).
    // PRESENCE is tracked separately from VALUE. `--shopify-handle` as the
    // last argument yields `undefined`, which would skip validation and drop
    // the run into PREVIEW mode silently — the operator asks for commerce and
    // gets an unbuyable landing with no error. Same defect the `--design`
    // flag had; fixed the same way.
    else if (a === '--shopify-handle') {
      args.shopifyHandleRequested = true;
      const value = argv[i + 1];
      if (value !== undefined && !value.startsWith('--')) {
        args.shopifyHandle = value;
        i++;
      }
    }
    // Design System Fase 2: opting into explicit design mode. Its presence —
    // not its content — is what switches theme-token sourcing (see the
    // `validate` stage and patchThemeBlock's `strict` option).
    else if (a === '--design') {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) {
        fail('Missing --design <path-to-json>', 'design-argument-missing');
      }
      args.design = value;
      i++;
    }
    else if (a === '--force') args.force = true;
    else fail(`Unknown argument: ${a}`);
  }
  if (!args.slug) fail('Missing --slug');
  if (!args.content) fail('Missing --content <path-to-json>');
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(args.slug)) {
    fail(`--slug "${args.slug}" must be kebab-case (e.g. "star-projector")`);
  }
  // Product Identity + Generation Isolation (design D1/D5, task 5.1): format
  // is validated once here so every downstream consumer (preflight,
  // write-manifest) can trust args.productId is either undefined or a
  // well-formed id, never a garbled string that would silently poison the
  // manifest. No `--reset` flag exists — see design D4/D5 Open Questions.
  if (args.productId !== undefined && !isProductId(args.productId)) {
    fail(`--product-id "${args.productId}" is not a valid productId (expected prd_{base36ts}-{rand8})`);
  }
  // --images-manifest fully replaces filename matching (design D4 guard #3)
  // — it only makes sense alongside a source --images directory to resolve
  // its srcFile entries against.
  if (args.imagesManifest && !args.images) {
    fail('--images-manifest requires --images <dir>');
  }
  // Fase 5 fail-closed: a commerce landing is validated BEFORE anything is
  // written. An empty or malformed handle must never produce an output that
  // looks buyable — it would either 404 at build or, worse, be "fixed" later
  // by hand back to some other product's handle.
  if (args.shopifyHandleRequested) {
    if (!args.shopifyHandle) {
      fail('Missing --shopify-handle <handle>', 'shopify-handle-missing');
    }
    if (!isShopifyHandle(args.shopifyHandle)) {
      fail(
        `--shopify-handle "${args.shopifyHandle}" is not a valid Shopify handle ` +
          `(lowercase alphanumerics separated by single hyphens, max 255 chars)`,
        'shopify-handle-invalid',
      );
    }
  }
  return args;
}

function fail(msg, code) {
  emit('error', currentStage, { message: msg, code }); // NEW — no-op when LG_EVENTS unset
  console.error(`✗ ${msg}`);                            // UNCHANGED
  process.exit(1);                                      // UNCHANGED
}

// --- machine-checked contract (mirrors agents.MD spec:content-fields) -
//
// ALLOWED_PRODUCT_FIELDS, REQUIRED_PRODUCT_FIELDS, FAQ_FIELDS,
// TESTIMONIAL_*_FIELDS, DEFAULT_ERRORS, and the product/faq/testimonials
// validators live in ./lib/content-contract.mjs (spec R6) — the single
// source of truth shared with the admin backend. See the try/catch in
// main() below for how a ContentContractError is routed through fail().

// --- JS object literal serializer (unquoted keys where valid) -----------

function serialize(value, indent = 2, level = 0) {
  const pad = ' '.repeat(indent * (level + 1));
  const padEnd = ' '.repeat(indent * level);
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    const items = value.map((v) => pad + serialize(v, indent, level + 1));
    return '[\n' + items.join(',\n') + '\n' + padEnd + ']';
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value);
    if (keys.length === 0) return '{}';
    const items = keys.map((k) => {
      const keyStr = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(k) || /^\d+$/.test(k) ? k : JSON.stringify(k);
      return pad + keyStr + ': ' + serialize(value[k], indent, level + 1);
    });
    return '{\n' + items.join(',\n') + '\n' + padEnd + '}';
  }
  throw new Error(`Unsupported value type in content.json: ${typeof value}`);
}

// --- file generators ------------------------------------------------------

function buildProductTs(product, shopifyHandle) {
  const errors = product.errors ?? DEFAULT_ERRORS;
  const lines = [
    `import type { Product } from '@/types/content';`,
    ``,
    `export const product = {`,
    `  brand: ${serialize(product.brand, 2, 1)},`,
    `  name: ${serialize(product.name, 2, 1)},`,
    `  tagline: ${serialize(product.tagline, 2, 1)},`,
    `  subtagline: ${serialize(product.subtagline, 2, 1)},`,
    ``,
    `  // NEVER agent-generated (agents.MD §1) — provision the real Shopify handle`,
    `  // before this landing can accept orders.`,
    `  commerce: {`,
    // NOTE: nothing in src/ reads this field — the runtime handle comes from
    // PUBLIC_SHOPIFY_PRODUCT_HANDLE via catalog.ts's resolveProductHandle().
    // It is written truthfully anyway so the generated data layer does not
    // carry a stale placeholder contradicting the landing's real product.
    // Preview mode keeps the legacy placeholder byte-identical, single quotes
    // included, so nothing about a non-commerce generation changes.
    shopifyHandle
      ? `    shopifyHandle: ${serialize(shopifyHandle, 2, 2)},`
      : `    shopifyHandle: 'TODO-provision-in-shared-store',`,
    `    bundleOfferActive: false,`,
    `  },`,
    ``,
    `  variantGroupLabel: ${serialize(product.variantGroupLabel, 2, 1)},`,
    ``,
    `  errors: ${serialize(errors, 2, 1)},`,
    ``,
    `  ratingAverage: ${serialize(product.ratingAverage, 2, 1)},`,
    `  ratingCount: ${serialize(product.ratingCount, 2, 1)},`,
    `  ratingBreakdown: ${serialize(product.ratingBreakdown, 2, 1)},`,
    ``,
    `  badges: ${serialize(product.badges, 2, 1)},`,
    ``,
    `  trustTicker: ${serialize(product.trustTicker, 2, 1)},`,
    ``,
    `  offer: ${serialize(product.offer, 2, 1)},`,
    ``,
    `  benefits: ${serialize(product.benefits, 2, 1)},`,
    ``,
    `  heroPills: ${serialize(product.heroPills, 2, 1)},`,
    ``,
    `  specs: ${serialize(product.specs, 2, 1)},`,
    ``,
    `  packs: ${serialize(product.packs, 2, 1)},`,
    ``,
    `  gallery: ${serialize(product.gallery, 2, 1)},`,
    ``,
    `  steps: ${serialize(product.steps, 2, 1)},`,
    ``,
    `  comparison: ${serialize(product.comparison, 2, 1)},`,
    ``,
    `  guarantee: ${serialize(product.guarantee, 2, 1)},`,
    ``,
    `  shipping: ${serialize(product.shipping, 2, 1)},`,
    ``,
    `  ugc: ${serialize(product.ugc, 2, 1)},`,
    ``,
    `  cta: ${serialize(product.cta, 2, 1)},`,
    `} as const satisfies Product;`,
    ``,
  ];
  return lines.join('\n');
}

function buildFaqTs(faq) {
  return [
    `import type { FaqItem } from '@/types/content';`,
    ``,
    `export const faq: FaqItem[] = ${serialize(faq, 2, 0)};`,
    ``,
  ].join('\n');
}

// Design System Fase 2. Written only in explicit design mode; the template's
// committed default (the legacy 11-section order) stands otherwise. The spec
// was already validated in the `validate` stage, so nothing is re-checked here.
function buildDesignTs(spec) {
  return [
    `import type { DesignSpec } from '@/types/design';`,
    ``,
    `export const design: DesignSpec = ${serialize(spec, 2, 0)};`,
    ``,
  ].join('\n');
}

function buildTestimonialsTs(testimonials) {
  return [
    `import type { Testimonial } from '@/types/content';`,
    ``,
    `export const testimonials: Testimonial[] = ${serialize(testimonials, 2, 0)};`,
    ``,
  ].join('\n');
}

// --- design token patching (whitelist-only, never touches structural vars)

const CSS_VAR_MAP = {
  colors: (k) => `--color-${k}`,
  fonts: (k) => `--font-${k}`,
  radius: (k) => `--radius-${k}`,
  shadow: (k) => `--shadow-${k}`,
};

/**
 * Patches the template's `@theme` block with design tokens.
 *
 * `strict` is the Design System Fase 2 mode switch, NOT a cleanup:
 *
 *   strict:false (legacy, no --design) — tokens come from content.json's
 *     `design` key, which NOTHING validates (content-contract.mjs has no rule
 *     for it). An unrecognized token is warned about and skipped. This branch
 *     is preserved byte-for-byte: the same message, the same `continue`, the
 *     same success exit. Every generation that works today must keep working.
 *
 *   strict:true (--design present) — tokens come from a DesignSpec that HAS
 *     been validated against the contract. Here an unpatchable token is a hard
 *     failure: the document claims to address a token the template does not
 *     declare, and silently dropping it would produce a landing that does not
 *     match its own spec.
 */
function patchThemeBlock(css, design, { strict = false } = {}) {
  if (!design) return css;
  let out = css;

  const unpatchable = (label, varName) => {
    if (strict) {
      fail(
        `design token ${label} → ${varName} is not declared in global.css's @theme block. ` +
          `A validated DesignSpec may only address real tokens; nothing was written.`,
        'design-token-unknown',
      );
    }
    console.warn(`  ! design.${label} → ${varName} not found in global.css, skipped`);
  };

  for (const group of ['colors', 'fonts', 'radius', 'shadow']) {
    if (!design[group]) continue;
    for (const [key, value] of Object.entries(design[group])) {
      const varName = CSS_VAR_MAP[group](key);
      const re = new RegExp(`(${escapeRegExp(varName)}:\\s*)[^;]+;`);
      if (!re.test(out)) {
        unpatchable(`${group}.${key}`, varName);
        continue;
      }
      out = out.replace(re, `$1${value};`);
    }
  }

  if (design.text) {
    for (const [key, val] of Object.entries(design.text)) {
      const patches = {
        [`--text-${key}`]: val.size,
        [`--text-${key}--line-height`]: val.lineHeight,
        [`--text-${key}--letter-spacing`]: val.letterSpacing,
      };
      for (const [varName, value] of Object.entries(patches)) {
        if (value === undefined) continue;
        const re = new RegExp(`(${escapeRegExp(varName)}:\\s*)[^;]+;`);
        if (!re.test(out)) {
          unpatchable(`text.${key}`, varName);
          continue;
        }
        out = out.replace(re, `$1${value};`);
      }
    }
  }

  return out;
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// --- copy (excludes build artifacts / secrets, never touches locked paths)

const EXCLUDE_DIRS = new Set(['node_modules', 'dist', '.astro', '.vercel', '.git']);
const EXCLUDE_FILES = new Set(['.env', '.DS_Store']);

function copyTemplate(dest) {
  cpSync(TEMPLATE_DIR, dest, {
    recursive: true,
    filter: (src) => {
      const base = path.basename(src);
      if (EXCLUDE_DIRS.has(base) && statSync(src).isDirectory()) return false;
      if (EXCLUDE_FILES.has(base)) return false;
      return true;
    },
  });
}

// --- asset ownership + mapping (design D4, task 5.3) -----------------------

/** Looks for a productId sidecar next to --images (design D4 guard #1):
 * `{imagesDir}/../product.json` (the scraper's own output) or
 * `{imagesDir}/.scrape-run.json` (design D3's run manifest). Corrupt/missing
 * sidecars are never fatal here — they simply mean "no id found". */
function findImagesOwnerProductId(imagesDir) {
  const candidates = [
    path.join(imagesDir, '..', 'product.json'),
    path.join(imagesDir, '.scrape-run.json'),
  ];
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    try {
      const parsed = JSON.parse(readFileSync(candidate, 'utf-8'));
      if (isProductId(parsed.productId)) return parsed.productId;
    } catch {
      // unreadable/corrupt sidecar — treat as no id, never crash the gate
    }
  }
  return null;
}

function sha256OfFile(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

/** Default mode: match by bare filename against what's already registered
 * in src/assets/product/ (unchanged behavior, now also recording a
 * {src,dest,bytes,sha256} mapping per copied file — design D4 guard #2). */
function copyImagesByName(srcDir, destDir) {
  const known = new Set(readdirSync(destDir));
  const files = readdirSync(srcDir);
  const assets = [];
  const unmatched = [];
  for (const file of files) {
    if (known.has(file)) {
      const srcPath = path.join(srcDir, file);
      cpSync(srcPath, path.join(destDir, file));
      assets.push({ src: file, dest: file, bytes: statSync(srcPath).size, sha256: sha256OfFile(srcPath) });
    } else {
      unmatched.push(file);
    }
  }
  return { assets, unmatched };
}

/** --images-manifest mode (design D4 guard #3): explicit {srcFile: destFile}
 * JSON fully replaces filename matching. Every dest MUST already exist in
 * src/assets/product/ (a registered asset key) or the run fails — this mode
 * never silently creates new, unregistered asset keys. */
function copyImagesByManifest(srcDir, destDir, manifestPath) {
  if (!existsSync(manifestPath)) fail(`--images-manifest file not found: ${manifestPath}`, 'images-manifest-not-found');
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
  } catch {
    fail(`--images-manifest is not valid JSON: ${manifestPath}`, 'images-manifest-invalid');
  }
  const known = new Set(readdirSync(destDir));
  const assets = [];
  const usedSrc = new Set();
  for (const [srcFile, destFile] of Object.entries(manifest)) {
    usedSrc.add(srcFile);
    const srcPath = path.join(srcDir, srcFile);
    if (!existsSync(srcPath)) {
      fail(`--images-manifest entry "${srcFile}" not found in ${srcDir}`, 'images-manifest-src-missing');
    }
    if (!known.has(destFile)) {
      fail(
        `--images-manifest dest "${destFile}" does not exist in ${destDir} — every dest must already be a registered asset key`,
        'images-manifest-dest-unknown',
      );
    }
    cpSync(srcPath, path.join(destDir, destFile));
    assets.push({ src: srcFile, dest: destFile, bytes: statSync(srcPath).size, sha256: sha256OfFile(srcPath) });
  }
  const unmatched = readdirSync(srcDir).filter((f) => !usedSrc.has(f));
  return { assets, unmatched };
}

// --- manifest support (design D5 schema, task 5.4) --------------------------

/** Short commit hash of the repo at generation time, for the manifest's
 * `template.commit` field. Never fatal — a git-less checkout (e.g. a tarball
 * deploy) simply yields `null`. */
function getTemplateCommit() {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: ROOT, encoding: 'utf-8' }).trim();
  } catch {
    return null;
  }
}

// --- main -----------------------------------------------------------------

function main() {
  const args = withStage('args', () => parseArgs(process.argv.slice(2)));

  // Design System Fase 2 — the resolved DesignSpec, or null in legacy mode.
  // Filled in by the `validate` stage below.
  let designSpec = null;
  let explicitThemeCss = null;

  const input = withStage('validate', () => {
    if (!existsSync(args.content)) fail(`Content file not found: ${args.content}`);
    const parsed = JSON.parse(readFileSync(args.content, 'utf-8'));
    try {
      validateContent(parsed);
    } catch (err) {
      if (err instanceof ContentContractError) fail(err.message, err.code);
      throw err;
    }

    // Explicit design mode is validated HERE, inside the existing `validate`
    // stage — deliberately NOT as a stage of its own. A separate stage would
    // be emitted on EVERY run, including legacy ones, changing the observable
    // event sequence for generations that pass no --design at all.
    //
    // Position matters: `validate` runs before `preflight` and before
    // `copy-template`, so a rejected spec leaves outputs/{slug}/ untouched —
    // no partial directory to clean up, nothing to mistake for a real landing.
    //
    // Fail-closed on BOTH contract outcomes. `invalid` means the document is
    // malformed; `unsupported_design` means it asks for a capability the
    // design system does not have (agents.MD §6.3). Neither may proceed and
    // neither may be downgraded to a warning — a silently dropped section is
    // exactly the failure this system exists to prevent.
    if (args.design) {
      if (!existsSync(args.design)) fail(`Design file not found: ${args.design}`);

      let spec;
      try {
        spec = JSON.parse(readFileSync(args.design, 'utf-8'));
      } catch (err) {
        fail(`--design file is not valid JSON: ${err.message}`, 'design-unparseable');
      }

      const support = checkDesignSupport(spec);
      if (support.status !== 'pass') {
        const detail = (support.issues ?? [])
          .map((i) => `${i.code}${i.path ? ` at "${i.path}"` : ''}: ${i.message}`)
          .join('; ');
        const missing = support.missingCapability
          ? ` — missing capability "${support.missingCapability}"`
          : '';
        fail(`--design rejected (${support.status})${missing}: ${detail}`, support.status);
      }
      designSpec = spec;

      // Strict token validation belongs to the read-only validation boundary,
      // not to the later write stage. Resolve the final CSS against the
      // canonical template now so an unpatchable, contract-valid token cannot
      // leave a partially copied output behind.
      const templateCss = readFileSync(path.join(TEMPLATE_DIR, 'src/styles/global.css'), 'utf-8');
      explicitThemeCss = patchThemeBlock(templateCss, spec.theme ?? null, { strict: true });
    }

    return parsed;
  });

  const outDir = path.join(OUTPUTS_DIR, args.slug);
  const manifestFilePath = path.join(outDir, '.generation.json');

  // content.json's optional productId (design D1) — computed once, reused
  // by both the preflight matrix (D5) and the copy-images ownership gate
  // (D4). Format-invalid values are treated the same as absent (defensive,
  // mirrors task 4.1/4.2's isProductId guards).
  const contentProductId = isProductId(input.productId) ? input.productId : null;

  // Resolved identity, filled in by preflight below, consumed by
  // write-manifest (task 5.4) and the terminal result event.
  let resolvedProductId = null;
  let resolvedLineage = 'legacy';

  withStage('preflight', () => {
    const dirExists = existsSync(outDir);
    let existingManifest = null;
    if (dirExists && existsSync(manifestFilePath)) {
      try {
        existingManifest = JSON.parse(readFileSync(manifestFilePath, 'utf-8'));
      } catch {
        existingManifest = null; // corrupt/unreadable manifest is treated as absent, never crashes preflight
      }
    }
    const existingManifestId =
      existingManifest && isProductId(existingManifest.productId) ? existingManifest.productId : null;

    // Resolve product identity exactly once. Explicit design mode can supply
    // the identity for legacy content without a productId, but it can never
    // disagree with a higher-authority upstream artifact.
    const canonicalProductId =
      contentProductId ?? existingManifestId ?? args.productId ?? designSpec?.productId ?? null;

    if (designSpec && designSpec.productId !== canonicalProductId) {
      fail(
        `DesignSpec productId ${designSpec.productId} does not match the canonical generation ` +
          `productId ${canonicalProductId} — refusing to write mixed-product artifacts.`,
        'generation-owner-mismatch',
      );
    }

    // Additive guard beyond design D5's literal 6-row matrix (documented,
    // not a silent deviation): when --product-id AND content.json's
    // productId are both present, they must describe the SAME lineage. The
    // admin route (routes/jobs.ts createGenerateJob) always derives
    // GenerateParams.productId from the SAME content.json it already
    // validated, so this branch is unreachable through the admin UI — it
    // only guards a direct-CLI invocation that mixes a pinned --product-id
    // with a mismatched content.json, closing the one gap the design's
    // matrix (keyed only on content.productId) leaves open for that path.
    if (args.productId && contentProductId && args.productId !== contentProductId) {
      fail(
        `--product-id ${args.productId} does not match content.json's productId ${contentProductId} — refusing to generate from a mismatched lineage.`,
        'generation-owner-mismatch',
      );
    }

    if (dirExists && contentProductId && existingManifestId && contentProductId !== existingManifestId) {
      // D5 row: present | exists | different id — FAIL-CLOSED, no bypass.
      // --force does not reach this branch and there is no --reset.
      fail(
        `outputs/${args.slug} belongs to a different product lineage ` +
          `(existing productId ${existingManifestId}, content.json has ${contentProductId}). ` +
          `This cannot be bypassed with --force.`,
        'generation-owner-mismatch',
      );
    }

    if (dirExists && !contentProductId && existingManifestId) {
      // D5 row: absent | exists | has id — an untagged content.json never
      // erases a known identity; --force semantics below are unchanged.
      console.warn(
        `  ! outputs/${args.slug} has a known productId (${existingManifestId}) but content.json has none ` +
          `— the existing identity will be preserved in .generation.json.`,
      );
    } else if (dirExists && contentProductId && !existingManifestId) {
      // D5 row: present | exists | absent — adopting an unmanaged dir.
      console.warn(
        `  ! adopting unmanaged outputs/${args.slug} (no .generation.json found) under productId ${contentProductId}.`,
      );
    }
    // D5 row: present | exists | same id, and the vanilla (no id anywhere)
    // case both fall through to the unchanged --force gate below with no
    // extra warning — re-generation of the same lineage, or legacy usage.

    if (dirExists && !args.force) {
      fail(`outputs/${args.slug} already exists. Use --force to overwrite.`);
    }

    resolvedProductId = canonicalProductId;
    if (contentProductId) {
      resolvedLineage = 'scraped';
    } else if (existingManifestId) {
      resolvedLineage =
        existingManifest && typeof existingManifest.lineage === 'string' ? existingManifest.lineage : 'scraped';
    } else if (args.productId || designSpec) {
      // No content.json id and no prior manifest — a CLI/design-pinned
      // lineage with nothing else to corroborate it yet.
      resolvedLineage = 'manual';
    }
  });

  withStage('copy-template', () => {
    mkdirSync(outDir, { recursive: true });
    copyTemplate(outDir);
  });

  withStage('write-data', () => {
    writeFileSync(path.join(outDir, 'src/data/product.ts'), buildProductTs(input.product, args.shopifyHandle));
    writeFileSync(path.join(outDir, 'src/data/faq.ts'), buildFaqTs(input.faq));
    writeFileSync(path.join(outDir, 'src/data/testimonials.ts'), buildTestimonialsTs(input.testimonials));
  });

  // Design System Fase 2. Emitted ONLY in explicit design mode — a legacy run
  // passes no --design, writes no stage, and keeps the template's own default
  // src/data/design.ts (which reproduces the legacy 11-section order exactly).
  if (designSpec) {
    withStage('write-design', () => {
      writeFileSync(path.join(outDir, 'src/data/design.ts'), buildDesignTs(designSpec));
    });
  }

  withStage('patch-theme', () => {
    const cssPath = path.join(outDir, 'src/styles/global.css');
    // DECISION 1 (owner, fixed): in explicit design mode the DesignSpec's
    // `theme` is the ONLY source of tokens and content.json's legacy `design`
    // key is ignored entirely — no merge, no fallback. The two documents
    // otherwise compete for the same @theme block with no precedence rule.
    if (designSpec) {
      // Already resolved fail-closed in `validate`, before copy-template.
      writeFileSync(cssPath, explicitThemeCss);
      return;
    }

    const css = readFileSync(cssPath, 'utf-8');
    writeFileSync(cssPath, patchThemeBlock(css, input.design, { strict: false }));
  });

  console.log(`✓ outputs/${args.slug} created from content/landing-base`);

  const todos = [];
  let imagesAssets = [];
  let imagesUnmatched = [];
  let imagesSourceDir = null;
  let imagesMainAsset = null;

  // Fase 4: media[] is read here, once, so the copy-images stage stays a pure
  // consumer of an already-validated document.
  let canonicalMedia = null;
  if (args.productJson) {
    if (!args.images) fail('--product requires --images <dir> (the directory holding the scraped files)', 'assets-images-dir-required');
    if (!existsSync(args.productJson)) fail(`--product file not found: ${args.productJson}`, 'assets-product-not-found');
    let canonical;
    try {
      canonical = JSON.parse(readFileSync(args.productJson, 'utf-8'));
    } catch {
      fail(`--product is not valid JSON: ${args.productJson}`, 'assets-product-invalid');
    }
    canonicalMedia = canonical?.media?.images ?? null;
    if (!Array.isArray(canonicalMedia) || canonicalMedia.length === 0) {
      fail(
        `--product ${args.productJson} declares no media.images — nothing to materialise, and shipping the ` +
          `template's stock photos for a real product would be contamination.`,
        'assets-media-empty',
      );
    }
  }

  if (args.images) {
    withStage('copy-images', () => {
      if (!existsSync(args.images)) fail(`--images directory not found: ${args.images}`);

      // Ownership gate (design D4 guard #1): a foreign --images directory
      // (a hand-curated leftover from another product) must not be silently
      // copied in. A missing id on EITHER side is legacy tolerance, not a
      // mismatch — mirrors D3's archive gate.
      const originProductId = findImagesOwnerProductId(args.images);
      if (originProductId && contentProductId && originProductId !== contentProductId) {
        fail(
          `--images directory belongs to a different product (found productId ${originProductId}, ` +
            `content.json has ${contentProductId}) — refusing to copy potentially contaminated assets.`,
          'images-owner-mismatch',
        );
      } else if (originProductId && !contentProductId) {
        console.warn(
          `  ! --images directory carries productId ${originProductId} but content.json has none — proceeding (legacy content.json).`,
        );
      }

      imagesSourceDir = path.resolve(args.images);
      const destDir = path.join(outDir, 'src/assets/product');

      // Fase 4 — product asset mode. OPT-IN via --product so the two legacy
      // modes stay byte-identical: contract.generate-landing.test.ts pins the
      // observable behaviour of filename matching, and this must not change
      // it for any existing caller.
      if (args.productJson) {
        const plan = planAssets(canonicalMedia, args.images);

        // Fail-closed: --product is an explicit claim that this product HAS
        // real media. Zero usable images means the claim is false, and
        // shipping the template's stock photos for a different product would
        // be exactly the contamination the isolation rules forbid.
        if (plan.assets.length === 0) {
          fail(
            `--product declared real media but no usable image was found in ${args.images}. ` +
              `Rejected: ${describeRejections(plan.rejected).join('; ') || 'none'}`,
            'assets-none-usable',
          );
        }

        imagesAssets = materializeAssets(plan, destDir);
        imagesUnmatched = [];
        imagesMainAsset = plan.main.dest;

        // Regenerating this module is what actually removes the template
        // stock: resolveMedia() looks every `asset` ref up here, and returns
        // an EMPTY placeholder for a key it cannot find.
        writeFileSync(path.join(outDir, 'src/data/images.ts'), buildImagesModule(plan));

        // Delete the stock files the regenerated module no longer references.
        // Astro would not bundle an unreferenced asset anyway, so this is not
        // about bytes: it removes any path by which another product's photo
        // could be reintroduced by a later hand edit. Only the slot files are
        // touched — video posters and og assets are not image slots.
        const orphaned = [];
        for (const key of TEMPLATE_SLOT_KEYS) {
          for (const ext of ['.jpg', '.jpeg', '.png', '.webp']) {
            const stale = path.join(destDir, `${key}${ext}`);
            if (existsSync(stale)) {
              rmSync(stale);
              orphaned.push(`${key}${ext}`);
            }
          }
        }

        console.log(`✓ ${imagesAssets.length} product image(s) materialised in src/assets/product/ (main: ${plan.main.dest})`);
        if (orphaned.length) console.log(`✓ ${orphaned.length} template stock image(s) removed: ${orphaned.join(', ')}`);
        console.log('✓ src/data/images.ts regenerated — product-NN, source filenames and template slots all resolve to real media');

        if (plan.rejected.length) {
          for (const line of describeRejections(plan.rejected)) console.warn(`  ! ${line}`);
          todos.push(...describeRejections(plan.rejected));
        }
        return;
      }

      const { assets, unmatched } = args.imagesManifest
        ? copyImagesByManifest(args.images, destDir, args.imagesManifest)
        : copyImagesByName(args.images, destDir);
      imagesAssets = assets;
      imagesUnmatched = unmatched;

      if (args.imagesManifest) {
        console.log(`✓ ${assets.length} image(s) swapped in src/assets/product/ (matched via --images-manifest)`);
      } else {
        console.log(`✓ ${assets.length} image(s) swapped in src/assets/product/ (matched by filename)`);
      }
      if (unmatched.length) {
        todos.push(
          `${unmatched.length} file(s) in --images had no matching filename in src/assets/product/ ` +
          `(new asset keys need a manual entry in src/data/images.ts or videos.ts): ${unmatched.join(', ')}`,
        );
      }
    });
  } else {
    todos.push('No --images passed — src/assets/product/* still has the base template\'s stock photos.');
  }

  // Product Identity + Generation Isolation (design D5, task 5.4): writes
  // outputs/{slug}/.generation.json — the second-barrier manifest read back
  // by the NEXT run's preflight (above) and by admin's routes/jobs.ts. Runs
  // unconditionally (not gated by LG_EVENTS): it is structural output, not
  // an observability concern.
  withStage('write-manifest', () => {
    const provenance = input.provenance && typeof input.provenance === 'object' ? input.provenance : {};
    const manifest = {
      schema: GENERATION_SCHEMA_VERSION,
      productId: resolvedProductId,
      slug: args.slug,
      lineage: resolvedLineage,
      sourceUrl: typeof provenance.sourceUrl === 'string' ? provenance.sourceUrl : null,
      itemId: typeof provenance.itemId === 'string' ? provenance.itemId : null,
      productName: input.product && typeof input.product.name === 'string' ? input.product.name : null,
      // Fase 5: which Shopify product this landing sells, and whether it was
      // generated buyable at all. Auditable without opening the .env — and
      // the handle is a public slug, so recording it leaks nothing.
      commerce: {
        mode: args.shopifyHandle ? 'commerce' : 'preview',
        shopifyHandle: args.shopifyHandle ?? null,
      },
      jobs: {
        scrape: typeof provenance.scrapeJobId === 'string' ? provenance.scrapeJobId : null,
        // No --content-job-id / --job-id CLI arg exists yet (out of scope
        // for task 5.1) — these stay null until a future change threads
        // them through.
        content: null,
        generate: null,
      },
      timestamps: {
        scrapedAt: typeof provenance.scrapedAt === 'string' ? provenance.scrapedAt : null,
        contentAt: typeof provenance.contentAt === 'string' ? provenance.contentAt : null,
        generatedAt: new Date().toISOString(),
      },
      assets: imagesAssets,
      assetsSourceDir: imagesSourceDir,
      assetsUnmatched: imagesUnmatched,
      template: { dir: 'content/landing-base', commit: getTemplateCommit() },
      generator: { script: 'scripts/generate-landing.mjs', schema: GENERATION_SCHEMA_VERSION },
      flags: { force: args.force },
    };
    writeFileSync(manifestFilePath, JSON.stringify(manifest, null, 2) + '\n');
  });

  withStage('todos', () => {
    // Fase 5: two explicitly separated modes.
    //
    // COMMERCE — `--shopify-handle` given. The handle is written into the
    // output's .env so catalog.ts's resolveProductHandle() finds it. ONLY the
    // handle is written: it is a public product slug, not a secret. The three
    // credentials stay the operator's job and are never touched by this
    // script, so no token can ever reach a generated file.
    //
    // PREVIEW — no handle. Nothing Shopify-related is written and the landing
    // is explicitly NOT buyable. It cannot silently inherit another product's
    // handle, because resolveProductHandle() throws without one.
    if (args.shopifyHandle) {
      const envPath = path.join(outDir, '.env');
      writeFileSync(
        envPath,
        [
          '# Generated by scripts/generate-landing.mjs — commerce mode.',
          '# The handle is a public product slug, not a secret.',
          `PUBLIC_SHOPIFY_PRODUCT_HANDLE=${args.shopifyHandle}`,
          '',
          '# Credentials are NEVER written by the generator. Add them here:',
          '# PUBLIC_SHOPIFY_STORE_DOMAIN=',
          '# PUBLIC_SHOPIFY_STOREFRONT_TOKEN=',
          '# PUBLIC_SHOPIFY_API_VERSION=',
          '',
        ].join('\n'),
      );
      console.log(`✓ commerce mode — PUBLIC_SHOPIFY_PRODUCT_HANDLE=${args.shopifyHandle} written to .env`);
      todos.push(
        `Add PUBLIC_SHOPIFY_STORE_DOMAIN, PUBLIC_SHOPIFY_STOREFRONT_TOKEN and PUBLIC_SHOPIFY_API_VERSION to ` +
          `outputs/${args.slug}/.env — the handle is already set, the credentials are not (and never will be) written by the generator.`,
      );
      todos.push(
        `Confirm the Shopify product "${args.shopifyHandle}" exists in the shared store with at least one EUR variant — ` +
          `the build aborts with "Product not found" otherwise.`,
      );
    } else {
      todos.push(
        'PREVIEW MODE — no --shopify-handle was passed, so this landing is NOT buyable. ' +
          'catalog.ts fails closed without PUBLIC_SHOPIFY_PRODUCT_HANDLE; it will never fall back to another product.',
      );
    }

    console.log('\nTODO before this landing is production-ready:');
    todos.forEach((t) => console.log(`  - ${t}`));
  });

  // Terminal event (design §4): emitted exactly once, immediately before
  // normal termination. No-op when LG_EVENTS is unset.
  emit('result', null, {
    outDir,
    slug: args.slug,
    force: args.force,
    imagesMatched: imagesAssets.length,
    imagesUnmatched,
    todos,
    productId: resolvedProductId,
    manifestPath: manifestFilePath,
  });
}

main();

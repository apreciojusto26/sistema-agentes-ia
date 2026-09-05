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
import { isProductId } from './lib/product-id.cjs';
import {
  resolveSourceIdentity,
  sameSourceProduct,
  formatSourceIdentity,
} from './lib/source-identity.mjs';
import { resolveFixedFavicon, writeFaviconFiles, paletteFromCss, FixedFaviconError } from './lib/fixed-favicon.mjs';
import { collectMerchantIssues, normalizeMerchant, MERCHANT_REQUIRED_FIELDS } from './lib/merchant.mjs';
import { assembleFixedProductData, FixedAssemblyError } from './lib/fixed-product-data.mjs';
import { projectFixedContent } from './lib/fixed-content-output.mjs';
import { produceFixedAssets, collectUnresolvedRefs, FixedAssetError } from './lib/fixed-asset-producer.mjs';
import { readCanonicalPalette, resolveFixedTheme, applyPalette, FixedThemeError } from './lib/fixed-theme.mjs';
import { isShopifyHandle } from './lib/shopify-handle.mjs';
import { FIXED_TEMPLATE_RELATIVE } from './lib/fixed-template.mjs';
import { writeLandingGitignore, initLandingRepo } from './lib/landing-scaffold.mjs';
import { planAssets, materializeAssets, buildImagesModule, describeRejections, TEMPLATE_SLOT_KEYS } from './lib/asset-pipeline.mjs';
import events from './lib/events.cjs';

// Product Identity + Generation Isolation (design "product-identity-
// generation-isolation" D4/D5, tasks 5.1-5.4). Schema version for
// outputs/{slug}/.generation.json — bump only on a breaking shape change.
const GENERATION_SCHEMA_VERSION = 1;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
// The constant that actually governs a landing's source. admin/src/server/
// config.ts has one with the same name, but that one only feeds the preview
// symlink and the health check — both now read the same authority so they
// cannot disagree.
const TEMPLATE_DIR = path.join(ROOT, FIXED_TEMPLATE_RELATIVE);
const OUTPUTS_DIR = path.join(ROOT, 'outputs');

// --- structured progress protocol (spec R5, design §4) --------------------
// Additive, opt-in: with LG_EVENTS unset, `emit` is a no-op and nothing
// about the script's observable stdout/stderr/exit-code behavior changes.

const emit = process.env.LG_EVENTS === '1' ? events.createEmitter('generate') : () => {};

let currentStage = null;

async function withStage(stage, fn) {
  currentStage = stage;
  emit('stage.start', stage);
  const t = Date.now();
  try {
    // Awaited so a stage MAY be async. Every synchronous body behaves exactly
    // as before — `await` on a non-promise resolves in the same tick.
    const r = await fn();
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
    // The landing's public origin. Persisted into the output so a later
    // build or deploy does not depend on remembering to export it.
    else if (a === '--site-url') args.siteUrl = argv[++i];
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
    // `--design` IS NOT AN ARGUMENT OF THIS GENERATOR ANY MORE.
    //
    // It took a DesignSpec — a per-product choice of sections, variants and
    // tokens — and that is precisely what Fixed AstraVibe does not do. The
    // structure is sealed by ASTRAVIBE_FIXED_STRUCTURAL_GRAMMAR_V1, so there is
    // nothing for a spec to decide. Passing it now fails as an unknown
    // argument, which is the honest answer: the flag does not exist here.
    //
    // The Design System itself is untouched. scripts/lib/design-contract.mjs
    // and design-registry.mjs still stand, and the suites that exercise them
    // against content/landing-base still run. What was removed is Fixed's
    // ability to CONSUME a spec, not the experimental tooling.
    else if (a === '--merchant') {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) {
        fail('Missing --merchant <path-to-json>', 'merchant-argument-missing');
      }
      args.merchant = value;
      i++;
    }
    // THE ASSET PIPELINE'S OWN ENTRY POINT.
    //
    // Without it the media authority has no way to speak: gallery could only
    // arrive inside content.json and the two clip lists could not arrive at
    // all. `--images` supplies BYTES and `--product` supplies the scrape's
    // media list; neither states which of those the page shows where, and that
    // assignment is a decision the asset pipeline makes.
    //
    // Optional, because the derived split still covers every existing caller.
    // Present, it REPLACES the derived media wholesale — a half-overridden
    // media set would leave nobody able to say where a given photograph came
    // from, which is the property this argument exists to restore.
    // THE OPERATOR'S PALETTE. A person decides the brand colours; the Content
    // Agent does not, and after F5 cannot — `content.json`'s `design` key no
    // longer reaches the stylesheet on the Fixed path.
    // THE OPERATOR'S MARK. PNG only — an SVG is a document, and this repo has
    // no sanitiser for one.
    else if (a === '--favicon') {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) {
        fail('Missing --favicon <path-to-png>', 'favicon-argument-missing');
      }
      args.favicon = value;
      i++;
    }
    else if (a === '--theme') {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) {
        fail('Missing --theme <path-to-json>', 'theme-argument-missing');
      }
      args.theme = value;
      i++;
    }
    else if (a === '--assets') {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) {
        fail('Missing --assets <path-to-json>', 'assets-argument-missing');
      }
      args.assets = value;
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
  if (args.siteUrl !== undefined) {
    // Validated in parseArgs, before anything is written: a malformed origin
    // must not reach disk and must not produce a half-generated landing.
    try {
      args.siteUrl = validateSiteUrl(args.siteUrl);
    } catch (err) {
      fail(err.message, 'site-url-invalid');
    }
  }

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

/**
 * Validates a public origin for THIS landing, or throws.
 *
 * ─── WHY THE GENERATOR OWNS THIS ───────────────────────────────────────────
 *
 * `SITE_URL` is the one authority for "where does this landing live": Astro
 * resolves `Astro.site` from it and the payment layer builds its SumUp callback
 * URLs from it. Until now it existed ONLY in the environment of whoever ran the
 * build, so a landing generated with a domain and rebuilt later without one
 * silently lost its canonical origin and stopped advertising a social card —
 * the operator had to remember to export it again, every time, forever.
 *
 * SAME RULES AS EVERY OTHER LAYER. astro.config.mjs enforces these at config
 * time and src/lib/site-origin.ts at runtime; they are restated here because
 * this is a plain node script that cannot import either, and a value that
 * passes here must pass there.
 *
 * NO FALLBACK, and specifically no fallback to the template's own domain: an
 * absent origin stays absent, and a preview says so.
 */
function validateSiteUrl(raw) {
  const value = String(raw ?? '').trim();
  if (!value) throw new Error('--site-url was given but empty. Omit the flag instead — a preview has no domain.');

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`--site-url must be a valid absolute URL origin, got ${JSON.stringify(value)}`);
  }
  const local =
    url.hostname === 'localhost' || url.hostname.endsWith('.localhost') || url.hostname.startsWith('127.');
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) {
    throw new Error('--site-url must use HTTPS outside localhost');
  }
  if (url.username || url.password) throw new Error('--site-url must not contain credentials');
  if (url.pathname !== '/' || url.search || url.hash) {
    throw new Error('--site-url must contain only an origin, without path, query or fragment');
  }
  return url.origin;
}

/**
 * Sets one key in a .env, NEVER clobbering the file.
 *
 * The operator is explicitly told to add their Shopify credentials to this
 * exact file, and a --force regeneration rewriting it from scratch silently
 * destroyed them — found by running the pipeline twice. Existing keys are
 * updated in place; everything else is preserved verbatim.
 */
function writeEnvKey(envPath, key, value, headerLines = []) {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${escapeRegExp(key)}=.*$`, 'm');

  if (!existsSync(envPath)) {
    const header = headerLines.length ? `${headerLines.join('\n')}\n` : '';
    writeFileSync(envPath, `${header}${line}\n`);
    return;
  }

  const previous = readFileSync(envPath, 'utf-8');
  writeFileSync(
    envPath,
    pattern.test(previous) ? previous.replace(pattern, line) : `${previous.replace(/\n*$/, '\n')}${line}\n`,
  );
}

/**
 * Fills in the three BOOLEAN pack flags that `as const` turns into a trap.
 *
 * PricePack declares `popular?`, `default?` and `freeGift?` as optional, and a
 * Content Agent reading that type will reasonably omit them on the packs where
 * they do not apply. But the generated src/data/product.ts ends in
 * `as const satisfies Product`, and `as const` does not widen: each pack keeps
 * its own literal type, so `product.packs` becomes a union whose members do not
 * share those keys. Then 05-buy-box.astro's `packs.find((p) => p.popular)` —
 * perfectly valid against PricePack — fails to compile against the union.
 *
 * The template's own product.ts never hit this because both of its packs happen
 * to spell out `popular` and `default`. That is an undeclared invariant, and an
 * invariant nothing enforces is one every generated product gets to violate.
 *
 * Only the booleans are filled: `false` is a real answer to "is this the
 * popular pack". `sublabel`, `badge` and `discountPercent` are left omitted,
 * because there is no honest default for a string or a discount, and their read
 * sites are inside islands where the `PricePack[]` prop type widens anyway.
 */
function normalizePacks(packs) {
  return packs.map((pack) => ({
    ...pack,
    popular: pack.popular ?? false,
    default: pack.default ?? false,
    freeGift: pack.freeGift ?? false,
  }));
}

/**
 * Splits content.json into the two authorities that were tangled inside it.
 *
 * THE SPLIT IS THE POINT. content.json is the Content Agent's document, but it
 * has always also carried `gallery` — which photographs the landing shows.
 * That is an asset decision wearing a content field's clothes, and while the
 * two travelled in one object nothing could tell them apart.
 *
 * So the provenance is made explicit HERE, at the one place that has both, and
 * the assembler downstream refuses a content output that still carries media.
 * The historical fixtures keep working unchanged: they hand this function a
 * mixed document and it does the separating, which is exactly the job a
 * boundary exists to do.
 */
/**
 * LEGACY DERIVATION — the media a content.json can still describe on its own.
 *
 * Used only when no scrape is part of the generation (`--product`/`--images`
 * absent) and no explicit `--assets` was supplied. Every Fixed run goes through
 * the real producer instead; this exists so the historical fixtures and the
 * Version A callers that predate the asset authority keep working unchanged.
 *
 * THE SPLIT IS STILL THE POINT. content.json has always carried `gallery` and
 * `step.media` — asset decisions wearing content fields' clothes — and while
 * they travelled in one object nothing could tell them apart. The provenance is
 * made explicit here, at the one place that has both, and the assembler refuses
 * a content output that still carries media.
 */
function deriveLegacyAssets(content) {
  const product = content.product;
  const gallery = Array.isArray(product.gallery) ? product.gallery : [];

  // `productMediaStrip` FEEDS THE TEMPLATE'S `ugcStrip`, which is a legacy
  // field name and not a claim: 09-ugc-strip.astro renders no heading, no
  // author and no attribution. It is a product media marquee, so the product's
  // own photographs belong in it. Each asset appears ONCE — the region is never
  // padded to reach a count.
  const seen = new Set();
  const productMediaStrip = [];
  for (const media of gallery) {
    if (!media || typeof media.asset !== 'string' || seen.has(media.asset)) continue;
    seen.add(media.asset);
    productMediaStrip.push({ asset: media.asset, alt: media.alt, ratio: '9/16' });
  }

  // Step media comes off the legacy step items, which is exactly the coupling
  // F4 removes for real generations — kept here because a Version A document
  // has nowhere else to put it.
  const stepMedia = {};
  (Array.isArray(product.steps) ? product.steps : []).forEach((step, i) => {
    if (step && step.media) stepMedia[`step-${i}`] = step.media;
  });

  return {
    contentOutput: projectFixedContent(content),
    assetOutput: { gallery, heroExtras: [], productMediaStrip, stepMedia },
  };
}

/**
 * EVERY FIELD THE ASSEMBLER OWNS IS EMITTED FROM IT.
 *
 * This read `product.*` — the raw Content Agent document — for fields whose
 * authority the assembler had already resolved, so the boundary was undone one
 * line before disk. It has now happened twice: `steps` in F4, and `brand` on
 * the first real landing, where a model's invented "LumiFlex" shipped over a
 * canonical `null`.
 *
 * THE VERSION A-ONLY SLOTS ARE EMITTED EMPTY, and they used to be the model's
 * own words passed straight through. `badges`, `offer`, `benefits`, `heroPills`
 * and `specs` were removed from the Fixed contract in F3A after a field-level
 * sweep found NO CONSUMER — re-verified here: not one component, layout or page
 * in the template reads any of them. They survive only because the template's
 * `Product` type still requires the keys.
 *
 * Laundering unvalidated model output into a typed module that nothing renders
 * is a build failure waiting for a bad day, and the bad day arrived three times
 * before this line was written: an `id` on every SpecItem, a `body` instead of
 * a `text` on every BenefitItem, and — on a real product, live — `icon:
 * "brightness"`, which is not in the design system's registered icon set. None
 * of the three could ever have reached a pixel. All three abort a build.
 *
 * This is the rule generate-content.mjs already applies to `packs` and
 * `testimonials`: the schema requires the key, so it is EMPTIED rather than
 * deleted, and the model has no authority it can exercise through it. An empty
 * slot renders exactly what a slot nobody reads rendered before: nothing.
 */
const VERSION_A_COMPAT = {
  badges: [],
  heroPills: [],
  benefits: [],
  specs: [],
  // Not an array, so "empty" is its inert form: no countdown, no labels.
  offer: { durationMinutes: 0, label: '', expiredLabel: '' },
};

function buildProductTs(shopifyHandle, fixed) {
  const lines = [
    `import type { Product } from '@/types/content';`,
    ``,
    // ANNOTATED, NOT `as const satisfies`.
    //
    // `as const` does not widen, so every value in this module kept its own
    // literal type — and the components that read it were then typed by THIS
    // product's data instead of by their own contract. It failed three ways
    // before this line was written, each one invisible until the build stage
    // started type-checking what it builds:
    //
    //   packs: []       -> `never[]`, so `packs[0].units` in 05-buy-box does
    //                      not compile. Every Admin run without a merchant.
    //   comparison      -> every `rival` a string literal, so `typeof rival
    //                      === 'boolean'` narrows the row to `never`.
    //   packs: [{…}]    -> a union of pack literals not sharing `popular`,
    //                      which is what normalizePacks below exists to patch.
    //
    // The declared type is what the components are written against, so it is
    // what this module should present. Excess-property checking on an object
    // literal is unchanged, so a field no type declares is still an error —
    // the narrowness was never buying anything, and nothing reads a literal
    // type off this module (audited).
    `export const product: Product = {`,
    `  brand: ${serialize(fixed.identity.brand, 2, 1)},`,
    `  name: ${serialize(fixed.identity.name, 2, 1)},`,
    `  tagline: ${serialize(fixed.copy.tagline, 2, 1)},`,
    `  subtagline: ${serialize(fixed.copy.subtagline, 2, 1)},`,
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
    `  variantGroupLabel: ${serialize(fixed.copy.variantGroupLabel, 2, 1)},`,
    ``,
    `  errors: ${serialize(fixed.copy.commerceMessages, 2, 1)},`,
    ``,
    `  ratingAverage: ${serialize(fixed.socialProof.ratingAverage, 2, 1)},`,
    `  ratingCount: ${serialize(fixed.socialProof.ratingCount, 2, 1)},`,
    ``,
    `  badges: ${serialize(VERSION_A_COMPAT.badges, 2, 1)},`,
    ``,
    `  trustTicker: ${serialize(fixed.copy.trustTicker, 2, 1)},`,
    ``,
    `  offer: ${serialize(VERSION_A_COMPAT.offer, 2, 1)},`,
    ``,
    `  benefits: ${serialize(VERSION_A_COMPAT.benefits, 2, 1)},`,
    ``,
    `  heroPills: ${serialize(VERSION_A_COMPAT.heroPills, 2, 1)},`,
    ``,
    `  specs: ${serialize(VERSION_A_COMPAT.specs, 2, 1)},`,
    ``,
    `  packs: ${serialize(normalizePacks(fixed.commercial.packs), 2, 1)},`,
    ``,
    // FROM THE ASSEMBLER, not from content.json. The value is the same one the
    // Content Agent's document carried, but it now arrives having passed
    // through the media authority — and a content output that tried to set it
    // directly would have been rejected before reaching here.
    `  gallery: ${serialize(fixed.media.gallery, 2, 1)},`,
    ``,
    // FROM THE ASSEMBLER. The copy is the Content Agent's and the photograph is
    // the asset layer's, joined by position — emitting `product.steps` here
    // would have shipped the media the content document happened to name and
    // quietly undone the merge one line before it reached disk.
    `  steps: ${serialize(fixed.narrative.steps, 2, 1)},`,
    ``,
    `  comparison: ${serialize(fixed.narrative.comparison, 2, 1)},`,
    ``,
    // `comparisonRival` IS NO LONGER EMITTED. It named the generic alternative
    // for landing-base's comparison heading; the Fixed template labels that
    // column "Otros" in its own markup, so the field had no consumer and its
    // presence failed the `satisfies Product` check outright.
    //
    // `ugc` is gone for the same reason: its only reader was
    // 13-results-gallery.astro, which the Fixed page does not mount.
    //
    // THESE THREE ARE NEW, and each is read by a section the Fixed page really
    // renders: the hero's own clips, the scrolling strip, and the store's
    // free-shipping threshold that the cart reads for its progress bar.
    //
    // EACH ONE NOW HAS AN AUTHOR. They used to be read off content.json as
    // `?? []` while the content contract rejected any document that supplied
    // them, so the fallback was the only reachable branch and every generated
    // landing shipped the same three empty answers. The media pair comes from
    // the asset pipeline and the threshold from merchant config; whether they
    // are empty is now a statement by the layer that would know.
    `  heroExtras: ${serialize(fixed.media.heroExtras, 2, 1)},`,
    ``,
    `  ugcStrip: ${serialize(fixed.media.ugcStrip, 2, 1)},`,
    ``,
    `  shipping: ${serialize({ freeOverCents: fixed.commercial.freeShippingOverCents }, 2, 1)},`,
    ``,
    `  cta: ${serialize(fixed.copy.cta, 2, 1)},`,
    `};`,
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

function buildTestimonialsTs(testimonials) {
  return [
    `import type { Testimonial } from '@/types/content';`,
    ``,
    `export const testimonials: Testimonial[] = ${serialize(testimonials, 2, 0)};`,
    ``,
  ].join('\n');
}

// --- design token patching (whitelist-only, never touches structural vars)

// CSS_VAR_MAP AND patchThemeBlock WERE HERE, and they are deleted rather than
// left unused. The map let a caller address `--font-*`, `--radius-*` and
// `--shadow-*`, which are typography and shape rather than palette; the patcher
// interpolated the value into the stylesheet with no validation of any kind.
// Together they were a CSS injection vector whose input came from a language
// model. scripts/lib/fixed-theme.mjs replaces both: sixteen colour tokens, hex
// only, re-normalised at the moment of writing.

// --- copy (excludes build artifacts / secrets, never touches locked paths)

const EXCLUDE_DIRS = new Set(['node_modules', 'dist', '.astro', '.vercel', '.git']);
/**
 * Build output under any name, not just `dist`.
 *
 * The A/B fingerprint harness writes `dist-ab-{a,b}-{preview,commerce}/` inside
 * the template. Those are gitignored, so they never showed up in a diff — and
 * they were being copied verbatim into every generated landing, where `astro
 * check` then walked minified React bundles and reported warnings against code
 * the operator never wrote.
 */
const EXCLUDE_DIR_PATTERN = /^dist(-|$)/;
/**
 * The template's alternate Astro configs alias `src/data/*` onto files under
 * `test-fixtures/`, which copyTemplate already refuses to copy. Shipping a
 * config that resolves to nothing is the same defect as shipping the tests.
 */
const EXCLUDE_FILE_PATTERN = /^astro\.config\..+\.mjs$/;
const EXCLUDE_FILES = new Set(['.env', '.DS_Store']);

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
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function copyTemplate(dest) {
  cpSync(TEMPLATE_DIR, dest, {
    recursive: true,
    filter: (src) => {
      const base = path.basename(src);
      const isDir = statSync(src).isDirectory();
      if (isDir && (EXCLUDE_DIRS.has(base) || EXCLUDE_DIR_PATTERN.test(base))) return false;
      if (EXCLUDE_FILES.has(base)) return false;
      if (!isDir && EXCLUDE_FILE_PATTERN.test(base)) return false;
      // The template's own contract tests are DEVELOPMENT artefacts of the
      // generator, not part of a shipped landing. Copying them also broke
      // portability outright: renderer.integration.test.ts imports a fixture
      // from admin/test/fixtures/, a path that does not exist inside a
      // landing, so `pnpm test` in a copied-out project failed on a file the
      // operator never wrote.
      if (/\.test\.(ts|tsx|mjs|js)$/.test(base)) return false;
      if (base === 'test-fixtures' && statSync(src).isDirectory()) return false;
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

// ASYNC because the favicon chain may call an injected provider. Every stage
// body stays synchronous today; awaiting one that is not a promise resolves in
// the same tick, so the observable stage sequence is unchanged.
async function main() {
  const args = await withStage('args', () => parseArgs(process.argv.slice(2)));

  // Design System Fase 2 — the resolved DesignSpec, or null in legacy mode.
  // Filled in by the `validate` stage below.
  const input = await withStage('validate', () => {
    if (!existsSync(args.content)) fail(`Content file not found: ${args.content}`);
    const parsed = JSON.parse(readFileSync(args.content, 'utf-8'));
    try {
      validateContent(parsed);
    } catch (err) {
      if (err instanceof ContentContractError) fail(err.message, err.code);
      throw err;
    }

    // MERCHANT CONFIG, validated in this same stage and for the same reason as
    // --design: before preflight and before copy-template, so a bad config
    // writes nothing to disk.
    //
    // READINESS. Absent config is NOT an error — a preview landing is allowed
    // to exist without seller identity, and its legal pages say so plainly.
    // But a config that is PRESENT and wrong (missing a required fact, an
    // unfilled "[TU EMPRESA]", a malformed email) fails here: publishing a
    // placeholder is worse than publishing nothing, because nothing blocks a
    // deploy and a placeholder does not.
    if (args.merchant !== undefined) {
      if (!existsSync(args.merchant)) fail(`Merchant config not found: ${args.merchant}`, 'merchant-file-missing');
      let merchantRaw;
      try {
        merchantRaw = JSON.parse(readFileSync(args.merchant, 'utf-8'));
      } catch (err) {
        fail(`--merchant file is not valid JSON: ${err.message}`, 'merchant-unparseable');
      }
      const issues = collectMerchantIssues(merchantRaw);
      if (issues.length) {
        fail(
          `--merchant rejected: ${issues.map((i) => i.message).join(' | ')}`,
          issues[0].code,
        );
      }
      parsed.__merchant = normalizeMerchant(merchantRaw);
      // The RAW config is kept alongside the normalised one because they answer
      // different questions. `__merchant` is what merchant.ts renders for the
      // legal pages; `__merchantConfig` is the operator's commercial
      // configuration, and it is where the Fixed assembler reads the
      // free-shipping threshold from. normalizeMerchant deliberately drops that
      // field so the number exists in exactly one generated module.
      parsed.__merchantConfig = merchantRaw;
    }

    if (args.theme !== undefined) {
      if (!existsSync(args.theme)) fail(`Theme file not found: ${args.theme}`, 'theme-file-missing');
      try {
        parsed.__theme = JSON.parse(readFileSync(args.theme, 'utf-8'));
      } catch (err) {
        fail(`--theme file is not valid JSON: ${err.message}`, 'theme-unparseable');
      }
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
  /**
   * WHICH PRODUCT this landing is, as opposed to which run produced it.
   *
   * Written to .generation.json so the NEXT run can compare against something
   * that does not change every execution. `productId` stays exactly what it
   * has always been — this run's lineage id — and the two now say different
   * things on purpose.
   */
  let resolvedSource = null;

  await withStage('preflight', () => {
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
      contentProductId ?? existingManifestId ?? args.productId ?? null;


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

    // ─── LINEAGE: PRODUCT IDENTITY, NOT RUN IDENTITY ─────────────────────
    //
    // This compared `productId`, which is minted once per SCRAPE JOB. So a
    // second run of the SAME product carried a new productId and was refused
    // as if it were a takeover attempt:
    //
    //   outputs/1005007345199501 belongs to a different product lineage
    //   (existing prd_mto7a4ia-…, content.json has prd_mtoiv4y5-…)
    //
    // The guard was right to fire and its rule was wrong. Running a product
    // again does not make it another product.
    //
    // THE PROTECTION IS NOT WEAKENED, THE COMPARISON IS CORRECTED. The slug is
    // still never consulted — "the folder name matches" is not evidence — and
    // `--force` still does not reach any branch below.
    const existingSource = existingManifest ? resolveSourceIdentity(existingManifest.sourceUrl) : null;
    const currentSource = resolveSourceIdentity(
      input.provenance && typeof input.provenance === 'object' ? input.provenance.sourceUrl : null,
    );

    if (dirExists && existingManifest) {
      if (existingSource && currentSource) {
        // BOTH PROVABLE — the only case where identity gets to decide.
        if (!sameSourceProduct(existingSource, currentSource)) {
          fail(
            `outputs/${args.slug} belongs to a different product ` +
              `(existing ${formatSourceIdentity(existingSource)}, this run is ` +
              `${formatSourceIdentity(currentSource)}). ` +
              `This cannot be bypassed with --force.`,
            'generation-owner-mismatch',
          );
        }
        // Same product, new run. A differing productId is EXPECTED here and is
        // not evidence of anything: it is this execution's id.
      } else if (contentProductId && existingManifestId && contentProductId !== existingManifestId) {
        // IDENTITY NOT PROVABLE ON BOTH SIDES — fall back to the run id, which
        // fails closed exactly as it did before. An unresolvable source URL is
        // an unknown, and two unknowns are never treated as a match.
        const why = !existingSource
          ? `the existing landing's source URL does not identify a product`
          : `this run's source URL does not identify a product`;
        fail(
          `outputs/${args.slug} belongs to a different product lineage ` +
            `(existing productId ${existingManifestId}, content.json has ${contentProductId}), ` +
            `and ${why}, so the two cannot be proved to be the same. ` +
            `This cannot be bypassed with --force.`,
          'generation-owner-mismatch',
        );
      }
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

    resolvedSource = currentSource ?? existingSource;
    resolvedProductId = canonicalProductId;
    if (contentProductId) {
      resolvedLineage = 'scraped';
    } else if (existingManifestId) {
      resolvedLineage =
        existingManifest && typeof existingManifest.lineage === 'string' ? existingManifest.lineage : 'scraped';
    } else if (args.productId) {
      // No content.json id and no prior manifest — a CLI/design-pinned
      // lineage with nothing else to corroborate it yet.
      resolvedLineage = 'manual';
    }
  });

  let repoResult = null;

  await withStage('copy-template', () => {
    mkdirSync(outDir, { recursive: true });
    copyTemplate(outDir);

    // Isolation & portability. Done INSIDE copy-template rather than as a new
    // stage: materialising the project skeleton is exactly what this stage is,
    // and a new stage would break the sequence pins in
    // contract.generate-landing.test.ts for every existing caller.
    //
    // Without these two steps the landing sits inside the GENERATOR's working
    // tree — `git rev-parse --show-toplevel` returns the generator's root, so
    // `git add .` stages against the parent index and the folder cannot be
    // pushed to its own repo or imported by Vercel on its own.
    writeLandingGitignore(outDir);
    repoResult = initLandingRepo(outDir);
  });

  if (repoResult?.initialized) {
    console.log('✓ landing initialised as its own git repository (branch main, no commit made)');
  } else if (repoResult?.reason === 'already-a-repo') {
    console.log('✓ landing already has its own .git — existing history left untouched');
  }

  // Read back after the stage so the TODO can be reported alongside the others
  // — `todos` is not declared until later, and a second list would be a second
  // place to forget.
  let packsConfigured = false;
  /**
   * THE BRAND THE ASSEMBLER RESOLVED — the only value any later stage may use.
   *
   * The favicon stage read `input.product.brand`, the Content Agent's own
   * document, so a model that invented a brand got its invention stamped into
   * the monogram on every tab. Hoisted for the same reason `packsConfigured`
   * is: the authority is decided in write-data and consumed after it.
   */
  let assembledBrand = null;
  /** The real asset production, when a scrape drove it. Reused by copy-images. */
  let producedAssets = null;
  /** Set when the template's social cover was removed for want of a PNG. */
  let ogCoverRemoved = null;
  /** The operator's palette, or null. Read once, applied in patch-theme. */
  const themeOverride = input.__theme ?? null;
  /**
   * A favicon manifest from a PREVIOUS generation of this same slug, read
   * before the template overwrites the tree. It is what makes "generate once"
   * real: an artefact whose fingerprint still matches is reused, not remade.
   */
  const existingFaviconManifest = (() => {
    const prior = path.join(OUTPUTS_DIR, args.slug, '.favicon.json');
    if (!existsSync(prior)) return null;
    try {
      return JSON.parse(readFileSync(prior, 'utf-8'));
    } catch {
      return null;
    }
  })();

  await withStage('write-data', () => {
    // THE ASSEMBLY BOUNDARY. Every field written below arrives having been
    // attributed to the authority allowed to state it.
    //
    // The CanonicalProduct is PRE-READ here rather than validated: --product's
    // real gate, with its own fail codes, still runs in the copy-images stage
    // exactly where it did, and moving it would change the failure ordering
    // that contract.generate-landing.test.ts pins. This read only needs the
    // media list, and a document too broken to parse simply yields null and is
    // rejected properly a few stages later.
    let canonicalProduct = null;
    if (args.productJson && existsSync(args.productJson)) {
      try {
        canonicalProduct = JSON.parse(readFileSync(args.productJson, 'utf-8'));
      } catch {
        canonicalProduct = null;
      }
    }

    const { contentOutput, assetOutput: derivedAssets } = deriveLegacyAssets(input);

    // THREE SOURCES OF MEDIA, IN DESCENDING ORDER OF AUTHORITY.
    //
    //   --assets      an asset output stated outright by the caller
    //   the PRODUCER  real media, selected from the scrape by scripts/lib/
    //                 fixed-asset-producer.mjs — the F4 path
    //   the legacy    what a content.json can describe on its own
    //                 derivation
    //
    // The producer runs whenever a scrape is part of the generation, because
    // then there IS a media authority and letting the content document speak
    // for it is the coupling F4 removed.
    let assetOutput = derivedAssets;
    if (args.assets !== undefined) {
      if (!existsSync(args.assets)) fail(`--assets file not found: ${args.assets}`, 'assets-file-missing');
      try {
        assetOutput = JSON.parse(readFileSync(args.assets, 'utf-8'));
      } catch (err) {
        fail(`--assets file is not valid JSON: ${err.message}`, 'assets-unparseable');
      }
    } else if (canonicalProduct && args.images) {
      try {
        const produced = produceFixedAssets({
          canonicalProduct,
          imagesDir: args.images,
          // Planned here, COPIED in the copy-images stage. The plan is pure and
          // deterministic, so computing it early to assemble the data layer
          // does not move where the bytes are written or when a bad --images
          // directory is reported.
          destDir: null,
          stepCount: Array.isArray(contentOutput.steps) ? contentOutput.steps.length : 0,
        });
        assetOutput = produced.assetOutput;
        producedAssets = produced;
      } catch (err) {
        if (err instanceof FixedAssetError) fail(`asset production failed: ${err.message}`, 'assets-none-usable');
        throw err;
      }
    }
    let fixed;
    try {
      fixed = assembleFixedProductData({
        // Without --product the scrape is not part of this generation at all,
        // and identity falls back to the content document's own name. That is
        // the legacy path, not the Fixed one.
        //
        // BRAND IS NOT AMONG THE FIELDS IT MAY FALL BACK TO, and that closes
        // this bypass at its source. Passing the content document's brand here
        // made it CanonicalProduct.identity.brand one line before the assembler
        // read it — so the assembler's "only the scrape decides brand" rule
        // held perfectly while a model's invention walked through the front
        // door wearing the scrape's name. No scrape means no brand: `null`.
        canonicalProduct: canonicalProduct ?? { identity: { brand: null, name: input.product.name } },
        contentOutput,
        assetOutput,
        merchantConfig: input.__merchantConfig ?? null,
        // Preview is the ABSENCE of a link. --shopify-handle names the product
        // but carries neither shop nor storefront, which are server-side
        // configuration — so it cannot construct one, and F3C wires the real
        // link through its own argument.
        shopifyProductLink: null,
      });
    } catch (err) {
      if (err instanceof FixedAssemblyError) {
        fail(`FixedProductData assembly rejected: ${err.issues.map((i) => i.message).join(' | ')}`, err.issues[0].code);
      }
      throw err;
    }

    packsConfigured = fixed.commercial.packs.length > 0;
    assembledBrand = fixed.identity.brand;

    writeFileSync(path.join(outDir, 'src/data/product.ts'), buildProductTs(args.shopifyHandle, fixed));
    writeFileSync(path.join(outDir, 'src/data/faq.ts'), buildFaqTs(input.faq));
    // FROM THE ASSEMBLER, which took them from the scrape. `input.testimonials`
    // is the Content Agent's document and is NOT written here: emitting it
    // would ship invented customers, which is the whole defect this closes.
    writeFileSync(
      path.join(outDir, 'src/data/testimonials.ts'),
      buildTestimonialsTs(fixed.socialProof.reviews),
    );

    // MERCHANT — written here rather than as its own stage, deliberately. It IS
    // data, and a separate stage would be emitted on every run including the
    // ones that pass no --merchant, changing the observable event sequence for
    // every existing legacy generation.
    //
    // Without --merchant the template's own `export const merchant = null`
    // survives untouched, which is the PREVIEW state: the landing builds, the
    // legal pages are navigable, and each says the information is pending
    // configuration instead of inventing a legal name.
    if (input.__merchant) {
      writeFileSync(
        path.join(outDir, 'src/data/merchant.ts'),
        "import type { Merchant } from '@/types/merchant';\n\n" +
          `export const merchant: Merchant | null = ${serialize(input.__merchant)};\n`,
      );
    }
  });

  // There is no `write-design` stage. A DesignSpec chose sections, variants
  // and tokens per product; Fixed AstraVibe renders one sealed structure, so
  // there is nothing for such a document to decide and none is written.

  await withStage('patch-theme', () => {
    // THE PALETTE IS THE ONE THING A PRODUCT MAY CHANGE. Recolouring rewrites
    // custom-property VALUES inside global.css's @theme block and never touches
    // markup, which is why the structural fingerprint does not move.
    //
    // `content.json`'s `design` KEY IS NO LONGER READ HERE. It used to be, and
    // nothing validated it: content-contract.mjs has no rule for `design` and
    // the old patcher interpolated the value straight into the stylesheet, so a
    // value of `red; } body { display: none } /*` closed the block and injected
    // a rule — written by a language model. The palette now comes from the
    // operator, falling back to the template's own canonical colours.
    const cssPath = path.join(outDir, 'src/styles/global.css');
    const css = readFileSync(cssPath, 'utf-8');
    try {
      const { theme, manifest } = resolveFixedTheme({
        override: themeOverride,
        // No derived palette yet: nothing in any runtime can read a pixel —
        // see the note on --theme parsing below.
        derived: null,
        canonical: readCanonicalPalette(css),
      });
      writeFileSync(cssPath, applyPalette(css, theme));
      writeFileSync(path.join(outDir, '.theme.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    } catch (err) {
      if (err instanceof FixedThemeError) fail(err.message, err.issues[0]?.code ?? 'theme-invalid');
      throw err;
    }
  });

  // FAVICON — after patch-theme on purpose: it reads the tokens that stage
  // just resolved. Every landing gets its OWN icon; the template's generic
  // favicon is deleted rather than kept as a fallback (owner decision D5), so
  // an output can never silently ship the shared one.
  await withStage('write-favicon', async () => {
    // THE MARK RESOLVES THROUGH A STATED CHAIN: an operator file, a previously
    // approved artefact with the same fingerprint, a generated one, then the
    // deterministic monogram. The monogram never fails, so a landing always has
    // an icon.
    //
    // The palette is read from the stylesheet AFTER patch-theme, so the mark is
    // drawn from the colours this landing actually ships. F5 owns colour; this
    // consumes its result and decides nothing about it.
    const cssPath = path.join(outDir, 'src/styles/global.css');
    const palette = paletteFromCss(readFileSync(cssPath, 'utf-8'));

    // NO PROVIDER IS WIRED. There is no image-generation SDK, API, model or
    // credential anywhere in this repo — audited, not assumed. The slot exists
    // so a backend plugs in without redesign; until one does, the chain falls
    // through to the monogram.
    try {
      const { files, manifest } = await resolveFixedFavicon({
        operatorPath: args.favicon ?? null,
        previous: existingFaviconManifest,
        generate: null,
        // FROM THE ASSEMBLER. This read the Content Agent's document, so the
        // monogram on every tab could be a brand no source ever published.
        brand: assembledBrand,
        productName: input.product?.name ?? null,
        palette,
      });
      writeFaviconFiles(path.join(outDir, 'public'), files);
      writeFileSync(path.join(outDir, '.favicon.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    } catch (err) {
      if (err instanceof FixedFaviconError) fail(err.message, err.code);
      throw err;
    }
  });

  console.log(`✓ outputs/${args.slug} created from ${FIXED_TEMPLATE_RELATIVE}`);

  const todos = [];


  // SAID OUT LOUD, never papered over. FIXED_GRAMMAR seals buy/packs at min 1
  // with zero: 'invalid-input', so a landing with no bundles does not pass
  // structural validation. Packs are merchant configuration now, and the only
  // honest thing the generator can do about an unconfigured store is report
  // it — inventing a "Pack x1" would be exactly the fabrication this whole
  // authority split exists to prevent.
  if (!packsConfigured) {
    todos.push(
      'NO PACKS CONFIGURED — merchant.packs is absent, so this landing has no bundles. Packs moved ' +
        'to merchant config in F3 (they are merchandising, not copy) and the Fixed structural grammar ' +
        'requires at least one, so this landing will FAIL structural validation until the operator ' +
        'configures them.',
    );
  }

  // Reported, never swallowed: the landing still builds without its own repo,
  // but it is NOT isolated — it resolves the parent's git root — and the
  // operator has to know that before pushing it anywhere.
  if (repoResult && !repoResult.initialized && repoResult.reason !== 'already-a-repo') {
    console.warn(`  ! could not initialise the landing's own git repo — ${repoResult.reason}`);
    todos.push(
      `This landing has NO .git of its own (${repoResult.reason}). It currently resolves the PARENT repository, so ` +
        `\`git add .\` inside it stages against the generator. Run \`git init -b main\` in outputs/${args.slug} before pushing it anywhere.`,
    );
  }
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
    await withStage('copy-images', () => {
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
        // REUSED, not recomputed. The write-data stage already produced this
        // plan to build the asset output; planning twice would hash every file
        // twice and, worse, open the door to the two halves disagreeing about
        // which files exist.
        const plan = producedAssets?.plan ?? planAssets(canonicalMedia, args.images);

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

        // THE SOCIAL PREVIEW, from this product's own photograph.
        //
        // Every landing used to ship the template's og-cover.png — and worse,
        // Base.astro resolved it against a hardcoded `astravibe.bamzuk.com`, so
        // a real product advertised another product's artwork on another
        // product's domain.
        //
        // THE REAL EXTENSION IS KEPT. The layout reads the filename from
        // src/data/og.ts now, so there is no fixed `.png` to satisfy and no
        // reason to rename a JPEG into a lie about a file other systems read.
        // The template's own cover is deleted either way: it belongs to a
        // different product and nothing generated may serve it.
        const ogSource = plan.assets[0];
        const staleCover = path.join(outDir, 'public/og-cover.png');
        if (existsSync(staleCover)) rmSync(staleCover);

        let ogName = null;
        if (ogSource) {
          ogName = `og-cover${path.extname(ogSource.dest)}`;
          cpSync(ogSource.srcPath, path.join(outDir, 'public', ogName));
        } else {
          ogCoverRemoved = 'sin media utilizable';
        }
        writeFileSync(
          path.join(outDir, 'src/data/og.ts'),
          `// GENERATED by scripts/generate-landing.mjs — this product's own photograph.\n` +
            `export const ogImageFile: string | null = ${ogName ? `'${ogName}'` : 'null'};\n`,
        );

        // PROVENANCE, WRITTEN DOWN. Enough to prove no file was invented: each
        // copied asset tied back to the source reference the scrape recorded,
        // its sha256, its real dimensions when the header could be read, and
        // the classification — product/promotional listing media, never `ugc`.
        if (producedAssets) {
          writeFileSync(
            path.join(outDir, '.assets.json'),
            `${JSON.stringify(producedAssets.manifest, null, 2)}\n`,
          );

          // EVERY REF MUST RESOLVE. The deleted fixed-content.json referenced
          // `video-02` and `video-03`, keys present in no images module —
          // resolveMedia() answers an unknown key with an empty placeholder, so
          // they rendered blank frames behind a green build. A ref nothing can
          // resolve is an error, and it is one HERE rather than a blank box in
          // production.
          const resolvable = new Set(producedAssets.manifest.assets.map((a) => a.key));
          const unresolved = collectUnresolvedRefs(producedAssets.assetOutput, resolvable);
          if (unresolved.length) {
            fail(
              `asset references resolve to nothing: ${unresolved.map((u) => u.message).join(' | ')}`,
              'asset-ref-unresolved',
            );
          }
        }

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
  await withStage('write-manifest', () => {
    const provenance = input.provenance && typeof input.provenance === 'object' ? input.provenance : {};
    const manifest = {
      schema: GENERATION_SCHEMA_VERSION,
      productId: resolvedProductId,
      slug: args.slug,
      lineage: resolvedLineage,
      sourceUrl: typeof provenance.sourceUrl === 'string' ? provenance.sourceUrl : null,
      itemId: typeof provenance.itemId === 'string' ? provenance.itemId : null,
      // THE PUBLIC ORIGIN this landing was generated for, when it has one.
      // A hostname is not a secret; nothing else about deployment is recorded.
      siteUrl: args.siteUrl ?? null,
      // PRODUCT IDENTITY, beside the run identity above. `sourceUrl` is kept
      // verbatim for provenance and debugging — it is where the scrape
      // actually went — and `source.canonicalUrl` is the same link with the
      // recommendation context removed.
      source: resolvedSource,
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
      template: { dir: FIXED_TEMPLATE_RELATIVE, commit: getTemplateCommit() },
      generator: { script: 'scripts/generate-landing.mjs', schema: GENERATION_SCHEMA_VERSION },
      flags: { force: args.force },
    };
    writeFileSync(manifestFilePath, JSON.stringify(manifest, null, 2) + '\n');
  });

  await withStage('todos', () => {
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
    // THE PUBLIC ORIGIN, PERSISTED WITH THE LANDING.
    //
    // Written to the output's own .env so the NEXT build reads it without the
    // operator exporting anything. It is a public hostname, not a secret — the
    // same reason the Shopify handle may be written here and the three
    // credentials may not.
    //
    // Absent stays absent: no key is written at all, `Astro.site` stays
    // undefined, and the landing advertises no canonical origin rather than
    // inventing one.
    if (args.siteUrl) {
      writeEnvKey(path.join(outDir, '.env'), 'SITE_URL', args.siteUrl, [
        '# Generated by scripts/generate-landing.mjs.',
        '# SITE_URL is this landing\'s public origin — a hostname, not a secret.',
      ]);
      console.log(`✓ site origin — SITE_URL=${args.siteUrl} written to .env`);
    }

    if (args.shopifyHandle) {
      const envPath = path.join(outDir, '.env');

      // NEVER clobber an existing .env. The operator is explicitly told to
      // add the three credentials to this file, and a --force regeneration
      // rewriting it from scratch silently destroyed them — found by running
      // the pipeline twice. Only the handle line is inserted or updated;
      // everything else the operator put there is preserved verbatim.
      writeEnvKey(envPath, 'PUBLIC_SHOPIFY_PRODUCT_HANDLE', args.shopifyHandle, [
        '# Generated by scripts/generate-landing.mjs — commerce mode.',
        '# The handle is a public product slug, not a secret.',
      ]);
      writeEnvKey(envPath, 'PUBLIC_COMMERCE_MODE', 'shopify');
      // Credentials are NEVER written here — only offered as commented keys
      // the operator fills in, so no token can ever reach a generated file.
      const env = readFileSync(envPath, 'utf-8');
      if (!/PUBLIC_SHOPIFY_STORE_DOMAIN/.test(env)) {
        writeFileSync(
          envPath,
          `${env.replace(/\n*$/, '\n')}\n# Credentials are NEVER written by the generator. Add them here:\n` +
            '# PUBLIC_SHOPIFY_STORE_DOMAIN=\n# PUBLIC_SHOPIFY_STOREFRONT_TOKEN=\n# PUBLIC_SHOPIFY_API_VERSION=\n',
        );
      }
      console.log(`✓ commerce mode — PUBLIC_SHOPIFY_PRODUCT_HANDLE=${args.shopifyHandle} · PUBLIC_COMMERCE_MODE=shopify`);
      todos.push(
        `Add PUBLIC_SHOPIFY_STORE_DOMAIN, PUBLIC_SHOPIFY_STOREFRONT_TOKEN and PUBLIC_SHOPIFY_API_VERSION to ` +
          `outputs/${args.slug}/.env — the handle is already set, the credentials are not (and never will be) written by the generator.`,
      );
      todos.push(
        `Confirm the Shopify product "${args.shopifyHandle}" exists in the shared store with at least one EUR variant — ` +
          `the build aborts with "Product not found" otherwise.`,
      );
    } else {
      // PREVIEW MODE gets an .env too, carrying ONLY the mode. Without it the
      // landing could not render at all: catalog.ts fails closed on a missing
      // handle, which is right for a commerce landing and wrong for one that
      // was never meant to sell. The flag is explicit precisely so "the
      // credentials are broken" stays distinguishable from "this landing has
      // no commerce" — inferring the mode from a missing token would collapse
      // the two, and the first must remain a hard error.
      writeEnvKey(path.join(outDir, '.env'), 'PUBLIC_COMMERCE_MODE', 'preview', [
        '# Generated by scripts/generate-landing.mjs — preview mode.',
        '# This landing has no Shopify product and makes no Storefront call.',
      ]);
      console.log('✓ preview mode — PUBLIC_COMMERCE_MODE=preview written to .env (no Shopify call at build time)');
      todos.push(
        'PREVIEW MODE — no --shopify-handle was passed, so this landing is NOT buyable. It builds and previews ' +
          'with real content, design and images; purchase controls render unavailable because there is no trustworthy price.',
      );
    }

    // Reported HERE rather than where `todos` is declared: the flag is set by
    // the copy-images stage, which runs later, so a push at declaration time
    // always read null. Same ordering trap the packs TODO hit.
    if (ogCoverRemoved !== null) {
      todos.push(
        `NO SOCIAL PREVIEW — the product's main image is ${ogCoverRemoved || 'not a PNG'} and Base.astro ` +
          "requests a fixed /og-cover.png. The template's own cover was DELETED rather than shipped, because " +
          "sharing this link would otherwise preview AstraVibe's product instead of yours. Supply a PNG main " +
          'image, or place one by hand at public/og-cover.png.',
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

// A rejected promise here must exit non-zero. Without the catch, a throw after
// the first await would surface as an unhandled rejection and, in some Node
// versions, an exit code that claims success.
main().catch((err) => {
  console.error(err);
  process.exit(1);
});

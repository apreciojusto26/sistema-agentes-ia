#!/usr/bin/env node
// Code Agent (agents.MD §4): mechanical assembly only — no LLM calls, no content
// decisions. Content/design/copy must already be decided (by the Content/Design
// Agent, i.e. an LLM conversation) and handed to this script as JSON.
//
// Usage:
//   node scripts/generate-landing.mjs --slug my-product --content path/to/content.json [--images dir] [--force]
//
// content.json shape — see scripts/example-content.json for a full example.

import { existsSync, mkdirSync, cpSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_ERRORS, ContentContractError, validateContent } from './lib/content-contract.mjs';
import events from './lib/events.cjs';

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
    else if (a === '--force') args.force = true;
    else fail(`Unknown argument: ${a}`);
  }
  if (!args.slug) fail('Missing --slug');
  if (!args.content) fail('Missing --content <path-to-json>');
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(args.slug)) {
    fail(`--slug "${args.slug}" must be kebab-case (e.g. "star-projector")`);
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

function buildProductTs(product) {
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
    `    shopifyHandle: 'TODO-provision-in-shared-store',`,
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

function patchThemeBlock(css, design) {
  if (!design) return css;
  let out = css;

  for (const group of ['colors', 'fonts', 'radius', 'shadow']) {
    if (!design[group]) continue;
    for (const [key, value] of Object.entries(design[group])) {
      const varName = CSS_VAR_MAP[group](key);
      const re = new RegExp(`(${escapeRegExp(varName)}:\\s*)[^;]+;`);
      if (!re.test(out)) {
        console.warn(`  ! design.${group}.${key} → ${varName} not found in global.css, skipped`);
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
          console.warn(`  ! design.text.${key} → ${varName} not found in global.css, skipped`);
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

function copyImages(srcDir, destDir) {
  const known = new Set(readdirSync(destDir));
  const files = readdirSync(srcDir);
  let matched = 0;
  let unmatched = [];
  for (const file of files) {
    if (known.has(file)) {
      cpSync(path.join(srcDir, file), path.join(destDir, file));
      matched++;
    } else {
      unmatched.push(file);
    }
  }
  return { matched, unmatched };
}

// --- main -----------------------------------------------------------------

function main() {
  const args = withStage('args', () => parseArgs(process.argv.slice(2)));

  const input = withStage('validate', () => {
    if (!existsSync(args.content)) fail(`Content file not found: ${args.content}`);
    const parsed = JSON.parse(readFileSync(args.content, 'utf-8'));
    try {
      validateContent(parsed);
    } catch (err) {
      if (err instanceof ContentContractError) fail(err.message, err.code);
      throw err;
    }
    return parsed;
  });

  const outDir = path.join(OUTPUTS_DIR, args.slug);
  withStage('preflight', () => {
    if (existsSync(outDir) && !args.force) {
      fail(`outputs/${args.slug} already exists. Use --force to overwrite.`);
    }
  });

  withStage('copy-template', () => {
    mkdirSync(outDir, { recursive: true });
    copyTemplate(outDir);
  });

  withStage('write-data', () => {
    writeFileSync(path.join(outDir, 'src/data/product.ts'), buildProductTs(input.product));
    writeFileSync(path.join(outDir, 'src/data/faq.ts'), buildFaqTs(input.faq));
    writeFileSync(path.join(outDir, 'src/data/testimonials.ts'), buildTestimonialsTs(input.testimonials));
  });

  withStage('patch-theme', () => {
    const cssPath = path.join(outDir, 'src/styles/global.css');
    const css = readFileSync(cssPath, 'utf-8');
    writeFileSync(cssPath, patchThemeBlock(css, input.design));
  });

  console.log(`✓ outputs/${args.slug} created from content/landing-base`);

  const todos = [];
  let imagesMatched = 0;
  let imagesUnmatched = [];

  if (args.images) {
    withStage('copy-images', () => {
      if (!existsSync(args.images)) fail(`--images directory not found: ${args.images}`);
      const { matched, unmatched } = copyImages(args.images, path.join(outDir, 'src/assets/product'));
      imagesMatched = matched;
      imagesUnmatched = unmatched;
      console.log(`✓ ${matched} image(s) swapped in src/assets/product/ (matched by filename)`);
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

  withStage('todos', () => {
    todos.push('commerce.shopifyHandle is a placeholder ("TODO-provision-in-shared-store") — provision the real product handle in the shared Shopify store before enabling checkout.');
    todos.push(`Create outputs/${args.slug}/.env with PUBLIC_SHOPIFY_STORE_DOMAIN, PUBLIC_SHOPIFY_STOREFRONT_TOKEN, PUBLIC_SHOPIFY_API_VERSION (see content/landing-base/README.md — note: no .env.example is checked into the repo, so there's nothing to copy from).`);

    console.log('\nTODO before this landing is production-ready:');
    todos.forEach((t) => console.log(`  - ${t}`));
  });

  // Terminal event (design §4): emitted exactly once, immediately before
  // normal termination. No-op when LG_EVENTS is unset.
  emit('result', null, {
    outDir,
    slug: args.slug,
    force: args.force,
    imagesMatched,
    imagesUnmatched,
    todos,
  });
}

main();

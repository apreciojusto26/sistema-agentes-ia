// Formal unit coverage for scripts/lib/product-id.cjs (design D1, task 7.1).
// A manual (uncommitted) smoke test was run during Batch 1 confirming this
// behavior informally — see apply-progress Batch 1/7. This file is the
// formal vitest home promised there. No `scripts/lib/**` include glob exists
// in vitest.config.ts, so this lives under admin/test/ (already included)
// and imports the .cjs module directly — the same pattern
// no-duplicated-contract.test.ts and contract.generate-landing.test.ts use
// for scripts/lib/content-contract.mjs.
import { describe, test, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const MODULE_PATH = path.join(REPO_ROOT, 'scripts/lib/product-id.cjs');
const MODULE_URL = pathToFileURL(MODULE_PATH).href;

async function loadProductId() {
  // .cjs from an ESM test file — this is the SAME cross-module-format import
  // generate-landing.mjs itself already does (`import { isProductId } from
  // './lib/product-id.cjs'`): Node's ESM loader statically analyzes
  // product-id.cjs's `module.exports = { ... }` shape (cjs-module-lexer) and
  // exposes named exports for it, same as any other CJS interop import.
  return import(MODULE_URL);
}

describe('product-id.cjs — PRODUCT_ID_RE / isProductId (format)', () => {
  test('newProductId() always returns a string matching PRODUCT_ID_RE', async () => {
    const { newProductId, PRODUCT_ID_RE } = await loadProductId();
    const id = newProductId();
    expect(typeof id).toBe('string');
    expect(id).toMatch(PRODUCT_ID_RE);
    expect(id.startsWith('prd_')).toBe(true);
  });

  test('isProductId accepts a freshly minted id', async () => {
    const { newProductId, isProductId } = await loadProductId();
    expect(isProductId(newProductId())).toBe(true);
  });

  test('isProductId rejects malformed values: wrong prefix, missing dash, uppercase, non-hex suffix, empty, non-strings', async () => {
    const { isProductId } = await loadProductId();
    expect(isProductId('')).toBe(false);
    expect(isProductId('prd_')).toBe(false);
    expect(isProductId('prod_abc123-12345678')).toBe(false); // wrong prefix
    expect(isProductId('prd_abc123_12345678')).toBe(false); // missing dash
    expect(isProductId('prd_ABC123-12345678')).toBe(false); // uppercase base36 segment not allowed
    expect(isProductId('prd_abc123-ABCDEFGH')).toBe(false); // non-hex suffix
    expect(isProductId('prd_abc123-1234567')).toBe(false); // suffix too short (7 hex chars, not 8)
    expect(isProductId('prd_a-12345678')).toBe(false); // timestamp segment too short (<6 chars)
    expect(isProductId(undefined)).toBe(false);
    expect(isProductId(null)).toBe(false);
    expect(isProductId(12345)).toBe(false);
    expect(isProductId({})).toBe(false);
  });

  test('isProductId accepts the documented boundary lengths (6 and 12 char base36 timestamp segments)', async () => {
    const { isProductId } = await loadProductId();
    expect(isProductId('prd_abcdef-12345678')).toBe(true); // 6 chars
    expect(isProductId('prd_abcdef0123ab-12345678')).toBe(true); // 12 chars
  });
});

describe('product-id.cjs — newProductId() sortability/uniqueness', () => {
  test('two ids minted back-to-back are never equal, even within the same millisecond', async () => {
    const { newProductId } = await loadProductId();
    const ids = new Set(Array.from({ length: 200 }, () => newProductId()));
    expect(ids.size).toBe(200);
  });

  test('the base36-timestamp segment is non-decreasing across sequential calls (lexicographic ≈ chronological, design D1)', async () => {
    const { newProductId } = await loadProductId();
    const extractTs = (id: string) => parseInt(id.slice('prd_'.length, id.indexOf('-')), 36);

    const first = extractTs(newProductId());
    await new Promise((r) => setTimeout(r, 5));
    const second = extractTs(newProductId());

    expect(second).toBeGreaterThanOrEqual(first);
  });

  test('the timestamp segment round-trips through Date.now().toString(36) for a known instant', async () => {
    const { newProductId } = await loadProductId();
    const before = Date.now();
    const id = newProductId();
    const after = Date.now();
    const ts = parseInt(id.slice('prd_'.length, id.indexOf('-')), 36);
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });
});

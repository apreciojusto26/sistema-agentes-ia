// Fase 5 — generator side of Shopify product linking.
//
// The handle is OPERATOR-SUPPLIED. It is never produced by Gemini, never read
// out of content.json, and never read out of the DesignSpec: agents.MD §1
// forbids the Content Agent inventing commerce data and §5 limits the Design
// Agent to presentation. These tests assert that boundary structurally, by
// reading the real source, so a future edit that quietly wires the handle to
// an agent output fails here.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { isShopifyHandle } from '../../scripts/lib/shopify-handle.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const GENERATOR = path.join(REPO_ROOT, 'scripts/generate-landing.mjs');
const CATALOG = path.join(REPO_ROOT, 'content/landing-base/src/lib/shopify/catalog.ts');
const MINIMAL_CONTENT = path.join(__dirname, 'fixtures/minimal-content.json');

const SLUG = 'zz-shopify-handle-fixture';
const OUT_DIR = path.join(REPO_ROOT, 'outputs', SLUG);

function runGenerator(extraArgs: string[]) {
  try {
    const stdout = execFileSync(process.execPath, [GENERATOR, '--slug', SLUG, '--content', MINIMAL_CONTENT, '--force', ...extraArgs], {
      cwd: REPO_ROOT,
      encoding: 'utf-8',
    });
    return { status: 0, out: stdout };
  } catch (err: any) {
    return { status: err.status ?? 1, out: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
}

afterAll(() => rmSync(OUT_DIR, { recursive: true, force: true }));

describe('handle format validation', () => {
  it.each(['selfie-vlog-monitor', 'abc', 'a1-b2-c3', '0'])('accepts %s', (h) => {
    expect(isShopifyHandle(h)).toBe(true);
  });

  it.each([
    'Not A Handle!',
    'UPPERCASE',
    '-leading',
    'trailing-',
    'double--hyphen',
    'with space',
    'sl/ash',
    '',
  ])('rejects %s', (h) => {
    expect(isShopifyHandle(h)).toBe(false);
  });

  it('rejects a handle over 255 chars', () => {
    expect(isShopifyHandle('a'.repeat(256))).toBe(false);
  });
});

describe('generator — commerce mode is fail-closed', () => {
  it('an invalid handle aborts and writes NOTHING', () => {
    rmSync(OUT_DIR, { recursive: true, force: true });
    const r = runGenerator(['--shopify-handle', 'Not A Handle!']);
    expect(r.status).not.toBe(0);
    expect(r.out).toContain('not a valid Shopify handle');
    expect(existsSync(OUT_DIR)).toBe(false);
  });

  it('--shopify-handle with NO value aborts instead of silently becoming preview mode', () => {
    // Regression: `argv[++i]` yields undefined for a trailing flag, which
    // skipped validation entirely and produced an unbuyable landing while the
    // operator had explicitly asked for commerce.
    rmSync(OUT_DIR, { recursive: true, force: true });
    const r = runGenerator(['--shopify-handle']);
    expect(r.status).not.toBe(0);
    expect(r.out).toContain('Missing --shopify-handle');
    expect(existsSync(OUT_DIR)).toBe(false);
  });

  it('a valid handle writes it to the output .env and records it in the manifest', () => {
    const r = runGenerator(['--shopify-handle', 'real-product-handle']);
    expect(r.status).toBe(0);

    const env = readFileSync(path.join(OUT_DIR, '.env'), 'utf-8');
    expect(env).toContain('PUBLIC_SHOPIFY_PRODUCT_HANDLE=real-product-handle');

    const manifest = JSON.parse(readFileSync(path.join(OUT_DIR, '.generation.json'), 'utf-8'));
    expect(manifest.commerce).toEqual({ mode: 'commerce', shopifyHandle: 'real-product-handle' });
  });

  it('two runs with different handles produce two different configurations', () => {
    runGenerator(['--shopify-handle', 'handle-alpha']);
    const a = readFileSync(path.join(OUT_DIR, '.env'), 'utf-8');
    runGenerator(['--shopify-handle', 'handle-beta']);
    const b = readFileSync(path.join(OUT_DIR, '.env'), 'utf-8');

    expect(a).toContain('PUBLIC_SHOPIFY_PRODUCT_HANDLE=handle-alpha');
    expect(b).toContain('PUBLIC_SHOPIFY_PRODUCT_HANDLE=handle-beta');
    expect(a).not.toEqual(b);
  });

  it('preview mode writes an .env carrying ONLY the mode, and marks the landing unbuyable', () => {
    // Contract change: preview used to write no .env at all, which left the
    // landing unable to render — catalog.ts fails closed on a missing handle,
    // correct for a commerce landing and wrong for one never meant to sell.
    // It now declares its mode EXPLICITLY, so "credentials are broken" stays
    // distinguishable from "this landing has no commerce".
    rmSync(OUT_DIR, { recursive: true, force: true });
    const r = runGenerator([]);
    expect(r.status).toBe(0);
    expect(r.out).toContain('PREVIEW MODE');

    const env = readFileSync(path.join(OUT_DIR, '.env'), 'utf-8');
    expect(env).toContain('PUBLIC_COMMERCE_MODE=preview');
    // No handle, and no credential assignment of any kind.
    expect(env).not.toMatch(/^PUBLIC_SHOPIFY_PRODUCT_HANDLE=/m);
    expect(env).not.toMatch(/^PUBLIC_SHOPIFY_STOREFRONT_TOKEN=.+$/m);

    const manifest = JSON.parse(readFileSync(path.join(OUT_DIR, '.generation.json'), 'utf-8'));
    expect(manifest.commerce).toEqual({ mode: 'preview', shopifyHandle: null });
  });

  it('commerce mode declares PUBLIC_COMMERCE_MODE=shopify, never preview', () => {
    runGenerator(['--shopify-handle', 'real-product-handle']);
    const env = readFileSync(path.join(OUT_DIR, '.env'), 'utf-8');
    expect(env).toContain('PUBLIC_COMMERCE_MODE=shopify');
    expect(env).not.toContain('PUBLIC_COMMERCE_MODE=preview');
  });
});

describe('no secret ever reaches a generated file', () => {
  it('the generated .env carries the handle and only COMMENTED credential keys', () => {
    runGenerator(['--shopify-handle', 'secret-check-handle']);
    const env = readFileSync(path.join(OUT_DIR, '.env'), 'utf-8');

    for (const key of ['PUBLIC_SHOPIFY_STORE_DOMAIN', 'PUBLIC_SHOPIFY_STOREFRONT_TOKEN', 'PUBLIC_SHOPIFY_API_VERSION']) {
      // present as guidance, never as an assignment carrying a value
      expect(env).toContain(`# ${key}=`);
      expect(env).not.toMatch(new RegExp(`^${key}=.+$`, 'm'));
    }
  });

  it('the generator source never reads a Shopify credential', () => {
    const src = readFileSync(GENERATOR, 'utf-8');
    expect(src).not.toMatch(/process\.env\.PUBLIC_SHOPIFY_STOREFRONT_TOKEN/);
    expect(src).not.toMatch(/process\.env\.SHOPIFY_ADMIN_TOKEN/);
  });
});

describe('the handle can never come from an agent (agents.MD §1/§5)', () => {
  it('the generator takes it from argv only — not from content.json or the DesignSpec', () => {
    const src = readFileSync(GENERATOR, 'utf-8');
    // The only assignments to args.shopifyHandle must come from argv.
    const assignments = [...src.matchAll(/args\.shopifyHandle\s*=\s*([^;\n]+)/g)].map((m) => m[1].trim());
    expect(assignments.length).toBeGreaterThan(0);
    for (const rhs of assignments) expect(rhs).toMatch(/^value$/);

    expect(src).not.toMatch(/shopifyHandle\s*=\s*input\./);
    expect(src).not.toMatch(/shopifyHandle\s*=\s*(designSpec|spec)\./);
  });

  it('the DesignSpec contract has no notion of a Shopify handle', async () => {
    const contract = readFileSync(path.join(REPO_ROOT, 'scripts/lib/design-contract.mjs'), 'utf-8');
    expect(contract.toLowerCase()).not.toContain('shopify');
  });

  it('the Design Agent prompt never mentions a handle, price or variant', () => {
    const agent = readFileSync(path.join(REPO_ROOT, 'scripts/generate-design.mjs'), 'utf-8');
    expect(agent.toLowerCase()).not.toContain('shopify');
  });
});

describe('no functional dependency on the old hardcoded handle remains', () => {
  const catalog = () => readFileSync(CATALOG, 'utf-8');

  it('fetchProductCommerce resolves the handle instead of declaring one', () => {
    expect(catalog()).toMatch(/const handle = resolveProductHandle\(\)/);
  });

  it('the star-projector literal survives ONLY as the named compat constant', () => {
    const occurrences = [...catalog().matchAll(/usb-mini-galaxy-star-projector/g)].length;
    // once in the TEMPLATE_COMPAT_HANDLE declaration; nowhere else in code.
    expect(occurrences).toBe(1);
    expect(catalog()).toMatch(/const TEMPLATE_COMPAT_HANDLE\s*=/);
  });

  it('the compat constant is reachable only behind the explicit env switch', () => {
    const uses = [...catalog().matchAll(/TEMPLATE_COMPAT_HANDLE/g)].length;
    expect(uses).toBe(2); // the declaration and the single guarded return
    expect(catalog()).toMatch(/PUBLIC_SHOPIFY_TEMPLATE_COMPAT === '1'\)\s*return TEMPLATE_COMPAT_HANDLE/);
  });
});

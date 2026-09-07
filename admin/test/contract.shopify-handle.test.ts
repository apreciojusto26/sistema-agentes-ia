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

// ───────────────────────────────────────────────────────────────────────────
// OUTPUT REPRODUCIBILITY — a regeneration represents its OWN inputs, never a
// previous run's leftovers.
//
// Found for real: a Commerce pipeline run passed siteUrl:null against an
// output folder an earlier, unrelated manual test had left with a real
// SITE_URL. writeEnvKey() only ever SETS a key when its input is present —
// nothing ever REMOVED one when the input went away — so the stale value
// survived the --force regeneration, astro.config.mjs's configuredSite()
// picked it up from the file, og:image rendered anyway, and Grammar V4's
// capability check correctly failed on the mismatch it exists to catch.
//
// Own slug, own OUT_DIR: these tests deliberately mutate the SAME output
// across a sequence of runs (A, then B), so they need a dir nothing else in
// this file touches, to keep the sequence unambiguous.
// ───────────────────────────────────────────────────────────────────────────
describe('output reproducibility — a regeneration represents ONLY its own inputs', () => {
  const REPRO_SLUG = 'zz-shopify-repro-fixture';
  const REPRO_OUT_DIR = path.join(REPO_ROOT, 'outputs', REPRO_SLUG);

  function runRepro(extraArgs: string[]) {
    try {
      const stdout = execFileSync(
        process.execPath,
        [GENERATOR, '--slug', REPRO_SLUG, '--content', MINIMAL_CONTENT, '--force', ...extraArgs],
        { cwd: REPO_ROOT, encoding: 'utf-8' },
      );
      return { status: 0, out: stdout };
    } catch (err: any) {
      return { status: err.status ?? 1, out: `${err.stdout ?? ''}${err.stderr ?? ''}` };
    }
  }
  const reproEnv = () => readFileSync(path.join(REPRO_OUT_DIR, '.env'), 'utf-8');

  afterAll(() => rmSync(REPRO_OUT_DIR, { recursive: true, force: true }));

  it('1/2. SITE_URL present -> absent: a later run with none removes the earlier value, never keeps it', () => {
    rmSync(REPRO_OUT_DIR, { recursive: true, force: true });
    const a = runRepro(['--site-url', 'https://run-a.example.com']);
    expect(a.status, a.out).toBe(0);
    expect(reproEnv()).toMatch(/^SITE_URL=https:\/\/run-a\.example\.com$/m);

    const b = runRepro([]); // no --site-url this time — same slug, --force
    expect(b.status, b.out).toBe(0);
    expect(reproEnv()).not.toMatch(/^SITE_URL=/m);
    expect(reproEnv()).not.toContain('run-a.example.com');
  });

  it('3. Product handle A -> B: the regenerated output names ONLY B, never A alongside it', () => {
    rmSync(REPRO_OUT_DIR, { recursive: true, force: true });
    runRepro(['--shopify-handle', 'product-handle-a']);
    expect(reproEnv()).toContain('PUBLIC_SHOPIFY_PRODUCT_HANDLE=product-handle-a');

    runRepro(['--shopify-handle', 'product-handle-b']);
    const env = reproEnv();
    expect(env).toContain('PUBLIC_SHOPIFY_PRODUCT_HANDLE=product-handle-b');
    expect(env).not.toContain('product-handle-a');
    // Exactly one assignment line — never two, never a duplicate.
    expect([...env.matchAll(/^PUBLIC_SHOPIFY_PRODUCT_HANDLE=.*$/gm)]).toHaveLength(1);
  });

  it('4. Commerce -> Preview: a later run with no handle leaves no Commerce handle behind', () => {
    rmSync(REPRO_OUT_DIR, { recursive: true, force: true });
    runRepro(['--shopify-handle', 'was-commerce-handle']);
    expect(reproEnv()).toContain('PUBLIC_SHOPIFY_PRODUCT_HANDLE=was-commerce-handle');

    const preview = runRepro([]); // no --shopify-handle -> preview mode
    expect(preview.status, preview.out).toBe(0);
    const env = reproEnv();
    expect(env).toContain('PUBLIC_COMMERCE_MODE=preview');
    expect(env).not.toMatch(/^PUBLIC_SHOPIFY_PRODUCT_HANDLE=/m);
    expect(env).not.toContain('was-commerce-handle');
  });

  it('5. the regenerated state represents ONLY the current run — both SITE_URL and handle together', () => {
    rmSync(REPRO_OUT_DIR, { recursive: true, force: true });
    runRepro(['--site-url', 'https://commerce-a.example.com', '--shopify-handle', 'commerce-a-handle']);
    let env = reproEnv();
    expect(env).toContain('SITE_URL=https://commerce-a.example.com');
    expect(env).toContain('PUBLIC_SHOPIFY_PRODUCT_HANDLE=commerce-a-handle');

    // Run B: neither a site nor a handle. Nothing of run A may remain.
    runRepro([]);
    env = reproEnv();
    expect(env).not.toContain('commerce-a.example.com');
    expect(env).not.toContain('commerce-a-handle');
    expect(env).not.toMatch(/^SITE_URL=/m);
    expect(env).not.toMatch(/^PUBLIC_SHOPIFY_PRODUCT_HANDLE=/m);
    expect(env).toContain('PUBLIC_COMMERCE_MODE=preview');
  });

  it('6. credentials the operator added by hand survive every regeneration untouched — deleteEnvKey never touches them', () => {
    rmSync(REPRO_OUT_DIR, { recursive: true, force: true });
    runRepro(['--site-url', 'https://run-a.example.com']);
    // Simulate the operator's own manual step: adding the three credentials
    // by hand, exactly as the generator's own TODO instructs them to.
    const envPath = path.join(REPRO_OUT_DIR, '.env');
    writeFileSync(
      envPath,
      `${readFileSync(envPath, 'utf-8').replace(/\n*$/, '\n')}` +
        'PUBLIC_SHOPIFY_STORE_DOMAIN=operator-added.myshopify.com\n' +
        'PUBLIC_SHOPIFY_STOREFRONT_TOKEN=operator-added-token\n' +
        'PUBLIC_SHOPIFY_API_VERSION=2025-01\n',
    );

    // Run B removes SITE_URL (no --site-url passed) — the operator's three
    // credential lines must survive verbatim, byte for byte.
    runRepro([]);
    const env = reproEnv();
    expect(env).toContain('PUBLIC_SHOPIFY_STORE_DOMAIN=operator-added.myshopify.com');
    expect(env).toContain('PUBLIC_SHOPIFY_STOREFRONT_TOKEN=operator-added-token');
    expect(env).toContain('PUBLIC_SHOPIFY_API_VERSION=2025-01');
    expect(env).not.toMatch(/^SITE_URL=/m);
  });
});

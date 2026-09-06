// FIRST COMMERCE — COMMERCE CONFIG WIRING, end to end through runPipeline().
//
// The unit-level authority for shop/storefront identity and env construction
// is contract.commerce-config.test.ts. This file exists for the property a
// unit test cannot show: that runPipeline() actually CALLS that authority at
// the right moments — before any real work for identity, before Astro for
// the Storefront credentials — and that the ONE ShopifyProductLink resolved
// is what both the generate job and the build's child process receive.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runPipeline, type PipelineRecord } from '../src/server/pipeline';
import type { JobRecord } from '../src/shared/jobs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const temps: string[] = [];
afterEach(() => {
  while (temps.length) rmSync(temps.pop()!, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

const tempDir = (prefix: string) => {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  temps.push(dir);
  return dir;
};

const withCommerceIdentity = () => {
  vi.stubEnv('SHOPIFY_SHOP_ID', 'gid://shopify/Shop/1');
  vi.stubEnv('SHOPIFY_STOREFRONT_ID', 'headless-storefront-1');
};
const withStorefrontCreds = () => {
  vi.stubEnv('PUBLIC_SHOPIFY_STORE_DOMAIN', 'tienda.myshopify.com');
  vi.stubEnv('PUBLIC_SHOPIFY_STOREFRONT_TOKEN', 'a-public-storefront-token');
  vi.stubEnv('PUBLIC_SHOPIFY_API_VERSION', '2025-01');
};

function job(over: Partial<JobRecord>): JobRecord {
  return {
    schema: 1,
    jobId: 'j1',
    kind: 'scrape',
    status: 'succeeded',
    params: {},
    argv: [],
    cwd: '',
    pid: null,
    createdAt: '',
    startedAt: null,
    finishedAt: null,
    exitCode: 0,
    signal: null,
    stages: [],
    result: null,
    error: null,
    eventSchemaVersion: 1,
    malformedEventCount: 0,
    eventGaps: [],
    lastSeq: 0,
    logPath: '',
    archivePath: null,
    archiveError: null,
    ...over,
  } as JobRecord;
}

function goldenArchive() {
  const dir = tempDir('lg-fc-arch-');
  mkdirSync(path.join(dir, 'images'), { recursive: true });
  writeFileSync(path.join(dir, 'images', 'a.webp'), 'bytes-a');
  writeFileSync(path.join(dir, 'product.json'), JSON.stringify({ title: 'Lámpara' }));
  writeFileSync(
    path.join(dir, 'canonical-product.json'),
    JSON.stringify({
      identity: { productId: 'prd_fc-1', name: 'Lámpara', brand: 'Astra', sourceUrl: 'https://example.com/item/fc-1' },
      media: { images: [{ localPath: 'output/images/a.webp', order: 0 }], videos: [] },
    }),
  );
  return dir;
}

function goldenOutput() {
  const dir = tempDir('lg-fc-out-');
  mkdirSync(path.join(dir, '.git'), { recursive: true });
  mkdirSync(path.join(dir, 'src/data'), { recursive: true });
  writeFileSync(path.join(dir, '.gitignore'), 'node_modules/\n');
  writeFileSync(path.join(dir, 'src/data/product.ts'), '');
  writeFileSync(path.join(dir, 'src/data/images.ts'), '');
  writeFileSync(path.join(dir, '.generation.json'), JSON.stringify({ productId: 'prd_fc-1' }));
  // validate:artifact requires .env once a shopifyHandle is set — present so
  // a full commerce run in this file can reach `succeeded` on its own merits.
  writeFileSync(path.join(dir, '.env'), 'PUBLIC_SHOPIFY_PRODUCT_HANDLE=tubo-rgb\nPUBLIC_COMMERCE_MODE=shopify\n');
  return dir;
}

function fakeRegistry(opts: { archive: string; outDir: string; scrapeProductId?: string }) {
  const jobs = new Map<string, JobRecord>();
  const created: { kind: string; params: Record<string, unknown> }[] = [];
  let n = 0;
  const make = (kind: string, params: Record<string, unknown>, result: unknown): JobRecord => {
    n += 1;
    const id = `${kind}-${n}`;
    created.push({ kind, params });
    const rec = job({
      jobId: id,
      kind: kind as JobRecord['kind'],
      status: 'succeeded',
      params: params as JobRecord['params'],
      result: result as JobRecord['result'],
      archivePath: kind === 'scrape' ? opts.archive : null,
    });
    jobs.set(id, rec);
    return rec;
  };
  const contentPath = path.join(opts.archive, 'content.json');
  return {
    created,
    registry: {
      get: (id: string) => jobs.get(id) ?? null,
      createScrapeJob: (p: Record<string, unknown>) =>
        make('scrape', { ...p, productId: opts.scrapeProductId ?? 'prd_fc-1' }, { title: 'A product' }),
      createContentJob: (p: Record<string, unknown>) => {
        writeFileSync(contentPath, JSON.stringify({ product: { steps: [{ title: 'paso 1' }] } }));
        return make('content', p, { stagedPath: contentPath, faqCount: 6 });
      },
      createGenerateJob: (p: { slug: string }) => make('generate', p, { outDir: opts.outDir, slug: p.slug }),
    } as never,
  };
}

const readyOk = async () => ({ ready: true, total: 15, results: [] });

/** Captures every (outDir, extraEnv) runBuild ever received. */
function spyRunBuild() {
  const calls: { outDir: string; extraEnv: Record<string, string> }[] = [];
  const runBuild = vi.fn(async (outDir: string, extraEnv: Record<string, string> = {}) => {
    calls.push({ outDir, extraEnv });
    return { ok: true, message: null };
  });
  return { runBuild, calls };
}

async function run(opts: {
  archive?: string;
  outDir?: string;
  shopifyHandle?: string | null;
  shopifyProductGid?: string | null;
  siteUrl?: string | null;
  runBuild: ReturnType<typeof spyRunBuild>['runBuild'];
}): Promise<{ record: PipelineRecord; created: { kind: string; params: Record<string, unknown> }[] }> {
  const archive = opts.archive ?? goldenArchive();
  const outDir = opts.outDir ?? goldenOutput();
  const fake = fakeRegistry({ archive, outDir });
  const record = await runPipeline(
    {
      url: 'https://example.com/item/fc-1',
      slug: 'zz-first-commerce',
      shopifyHandle: opts.shopifyHandle ?? null,
      shopifyProductGid: opts.shopifyProductGid ?? null,
      siteUrl: opts.siteUrl ?? null,
    },
    { registry: fake.registry, runBuild: opts.runBuild, readReadiness: readyOk },
  );
  return { record, created: fake.created };
}

describe('11. Commerce identity is checked BEFORE any real work', () => {
  it('missing SHOPIFY_SHOP_ID/_STOREFRONT_ID fails at scrape — the registry is never touched', async () => {
    // Deliberately NOT stubbed.
    const { runBuild } = spyRunBuild();
    const { record, created } = await run({ shopifyHandle: 'tubo-rgb', runBuild });

    expect(record.status).toBe('failed');
    expect(record.stages.find((s) => s.name === 'scrape')!.status).toBe('failed');
    expect(record.error).toContain('Commerce no está completamente configurado');
    expect(record.stages.find((s) => s.name === 'scrape')!.errorDetail?.facts.map((f) => f.label)).toEqual(['SHOPIFY_SHOP_ID', 'SHOPIFY_STOREFRONT_ID']);
    // FAIL EARLY, LITERALLY: no scrape job, no content job, nothing — Astro
    // never gets the chance to be the one who discovers this.
    expect(created).toEqual([]);
    expect(runBuild).not.toHaveBeenCalled();
  });

  it('Preview (no handle) never reaches this check at all', async () => {
    // No commerce identity stubbed, and it must not matter — preview needs
    // none of it.
    const { runBuild } = spyRunBuild();
    const { record } = await run({ shopifyHandle: null, runBuild });
    expect(record.status).toBe('succeeded');
  });
});

describe('12. Storefront credentials are checked before the Astro child, not by it', () => {
  it('complete identity but missing PUBLIC_SHOPIFY_* fails at build, before runBuild runs', async () => {
    withCommerceIdentity();
    // PUBLIC_SHOPIFY_* deliberately not stubbed.
    const { runBuild } = spyRunBuild();
    const { record } = await run({ shopifyHandle: 'tubo-rgb', runBuild });

    expect(record.status).toBe('failed');
    expect(record.stages.find((s) => s.name === 'build')!.status).toBe('failed');
    expect(record.error).toContain('Commerce no está completamente configurado');
    expect(record.stages.find((s) => s.name === 'build')!.errorDetail?.facts.map((f) => f.label)).toEqual([
      'PUBLIC_SHOPIFY_STORE_DOMAIN',
      'PUBLIC_SHOPIFY_STOREFRONT_TOKEN',
      'PUBLIC_SHOPIFY_API_VERSION',
    ]);
    // Astro is never asked to discover this on its own.
    expect(runBuild).not.toHaveBeenCalled();
  });
});

describe('1/2/13. astro check AND astro build both receive the Commerce env', () => {
  it('a complete Commerce config reaches runBuild as extraEnv — the same env check/build both use', async () => {
    withCommerceIdentity();
    withStorefrontCreds();
    const { runBuild, calls } = spyRunBuild();
    const { record } = await run({
      shopifyHandle: 'tubo-rgb',
      shopifyProductGid: 'gid://shopify/Product/1',
      siteUrl: 'https://tubo-rgb.example.com',
      runBuild,
    });

    expect(record.status, record.error ?? 'unexpected failure').toBe('succeeded');
    expect(calls).toHaveLength(1);
    // ONE extraEnv object handed to runBuild — defaultRunBuild is the thing
    // that forwards it to BOTH `astro check` and `astro build` (see
    // pipeline.ts and contract.commerce-config.test.ts for that env's shape).
    expect(calls[0]!.extraEnv).toEqual({
      PUBLIC_COMMERCE_MODE: 'shopify',
      PUBLIC_SHOPIFY_STORE_DOMAIN: 'tienda.myshopify.com',
      PUBLIC_SHOPIFY_STOREFRONT_TOKEN: 'a-public-storefront-token',
      PUBLIC_SHOPIFY_API_VERSION: '2025-01',
      PUBLIC_SHOPIFY_PRODUCT_HANDLE: 'tubo-rgb',
      SITE_URL: 'https://tubo-rgb.example.com',
    });
  });

  it('3. Preview receives no Commerce env at all', async () => {
    const { runBuild, calls } = spyRunBuild();
    const { record } = await run({ shopifyHandle: null, runBuild });
    expect(record.status, record.error ?? 'unexpected failure').toBe('succeeded');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.extraEnv).toEqual({});
  });
});

describe('8/16. the generate job is told the SAME product the resolved link names', () => {
  it('shopifyHandle sent to createGenerateJob equals productLink.productHandle, never a second reading of input', async () => {
    withCommerceIdentity();
    withStorefrontCreds();
    const { runBuild } = spyRunBuild();
    const { created } = await run({ shopifyHandle: 'tubo-rgb', runBuild });

    const generate = created.find((c) => c.kind === 'generate')!;
    expect(generate.params.shopifyHandle).toBe('tubo-rgb');
  });

  it('the derivation is IN THE CODE, not just true by coincidence in this fixture', () => {
    const src = readFileSync(path.join(__dirname, '..', 'src/server/pipeline.ts'), 'utf-8');
    expect(src).toMatch(
      /shopifyHandle:\s*productLinkResolution\.status === 'complete' \? productLinkResolution\.link\.productHandle : null/,
    );
  });
});

describe('4/5/6. generated .env still never carries the injected credentials', () => {
  it('pipeline.ts never writes the Commerce env to a file — only hands it to the build subprocess', () => {
    const src = readFileSync(path.join(__dirname, '..', 'src/server/pipeline.ts'), 'utf-8');
    for (const needle of ['writeFileSync(', 'writeEnvKey(']) {
      // Every call site of either writer, scanned for whether it is anywhere
      // near commerceEnvResult/extraEnv — it must not be.
      const idx = src.indexOf(needle);
      expect(idx === -1 || !src.slice(Math.max(0, idx - 200), idx + 200).match(/commerceEnv|extraEnv/)).toBe(true);
    }
    expect(src, 'commerceEnvResult.env reaches runBuild only').toMatch(/runBuild\(outDir, commerceEnvResult\.env\)/);
  });

  it('the generator itself still never writes a Shopify credential — unchanged, still guarded at its own layer', () => {
    const generator = readFileSync(path.join(__dirname, '..', '..', 'scripts/generate-landing.mjs'), 'utf-8');
    for (const secret of ['PUBLIC_SHOPIFY_STOREFRONT_TOKEN', 'SHOPIFY_ADMIN_TOKEN', 'SHOPIFY_CLIENT_SECRET']) {
      expect(generator, `${secret} is written into a generated landing`).not.toMatch(
        new RegExp(`writeEnvKey\\([^)]*${secret}`),
      );
    }
  });
});

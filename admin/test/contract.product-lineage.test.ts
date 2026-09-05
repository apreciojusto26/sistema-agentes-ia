// PRODUCT LINEAGE — which product an output directory belongs to.
//
// ─── THE DEFECT ────────────────────────────────────────────────────────────
//
// An operator ran the Admin against an AliExpress item, and then ran it again
// against THE SAME item. The second run was refused:
//
//   outputs/1005007345199501 belongs to a different product lineage
//   (existing productId prd_mto7a4ia-e40e4b7d,
//    content.json has prd_mtoiv4y5-0a148ae9).
//   This cannot be bypassed with --force.
//
// Nothing was wrong with the product, the URL or the operator. `productId` is
// minted once per SCRAPE JOB in JobRegistry.createScrapeJob, so a second scrape
// of one product produces a second id — and the guard, which compared exactly
// that, could not tell a re-run from a takeover.
//
// ─── THE DISTINCTION THIS SUITE PINS ───────────────────────────────────────
//
//   PRODUCT IDENTITY   provider + externalProductId. Stable forever.
//   RUN IDENTITY       productId, jobId, scrapedAt. New every execution.
//   NOT IDENTITY       the slug. An output PATH an operator may set by hand.
//
// The guard is NOT relaxed here, and that is the point of half these tests: a
// genuinely different product still cannot take an existing directory, an
// unprovable identity still fails closed, and `--force` still reaches none of
// it.
import { describe, test, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  resolveSourceIdentity,
  sameSourceProduct,
  formatSourceIdentity,
} from '../../scripts/lib/source-identity.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FIX = path.join(REPO_ROOT, 'admin/test/fixtures');

const ITEM = '1005007345199501';
const OTHER_ITEM = '1005009037319505';

/** The real link from the failing run, recommendation context and all. */
const TRACKED_URL =
  `https://es.aliexpress.com/item/${ITEM}.html?spm=a2g0o.home.pcJustForYou.139.39a670e5uixsnV` +
  '&gps-id=pcJustForYou&scm=1007.13562.416251.0&pvid=90b8e040-f17c-46dc-9276-c873bbe48d8e' +
  '&pdp_npi=6%40dis%21EUR%217.00%213.29&utparam-url=scene%3ApcJustForYou';
const CLEAN_URL = `https://es.aliexpress.com/item/${ITEM}.html`;

// ───────────────────────────────────────────────────────────────────────────
// THE IDENTITY MODEL
// ───────────────────────────────────────────────────────────────────────────

describe('source identity is the product, not the visit', () => {
  test('a tracked link and a clean link are the same product', () => {
    const tracked = resolveSourceIdentity(TRACKED_URL);
    const clean = resolveSourceIdentity(CLEAN_URL);
    expect(tracked).toEqual({
      provider: 'aliexpress',
      externalProductId: ITEM,
      canonicalUrl: CLEAN_URL,
    });
    expect(sameSourceProduct(tracked, clean)).toBe(true);
  });

  test('every recommendation parameter is dropped from the canonical URL', () => {
    // spm, gps-id, scm, pvid, pdp_npi, utparam-url — how the visitor ARRIVED,
    // not what they arrived at.
    expect(resolveSourceIdentity(TRACKED_URL)!.canonicalUrl).toBe(CLEAN_URL);
    expect(resolveSourceIdentity(TRACKED_URL)!.canonicalUrl).not.toContain('?');
  });

  test('the locale host is presentation, not identity', () => {
    // es./www./aliexpress.us serve the same item number; the host chooses
    // language and currency. A regeneration from the Spanish page is not a
    // different product from the English one.
    const es = resolveSourceIdentity(`https://es.aliexpress.com/item/${ITEM}.html`);
    const www = resolveSourceIdentity(`https://www.aliexpress.com/item/${ITEM}.html`);
    const us = resolveSourceIdentity(`https://www.aliexpress.us/item/${ITEM}.html`);
    expect(sameSourceProduct(es, www)).toBe(true);
    expect(sameSourceProduct(es, us)).toBe(true);
    // …and the canonical URL still records where the scrape actually went.
    expect(www!.canonicalUrl).toContain('www.aliexpress.com');
  });

  test('a different item is a different product', () => {
    expect(
      sameSourceProduct(
        resolveSourceIdentity(`https://es.aliexpress.com/item/${ITEM}.html`),
        resolveSourceIdentity(`https://es.aliexpress.com/item/${OTHER_ITEM}.html`),
      ),
    ).toBe(false);
  });

  test('an unidentifiable link resolves to null, and two nulls are never a match', () => {
    // `null` is a real answer. A caller that read "unknown" as "probably the
    // same" is the failure this model was written against.
    for (const url of [
      '',
      'not a url',
      'https://example.com/item/123.html',
      'https://a.aliexpress.com/_mabc123', // short link — the id is hidden
      `https://es.aliexpress.com/store/${ITEM}`,
      `https://es.aliexpress.com/item/${ITEM}`, // no .html
      null,
      undefined,
      42,
    ]) {
      expect(resolveSourceIdentity(url as unknown), `${String(url)} resolved`).toBeNull();
    }
    expect(sameSourceProduct(null, null)).toBe(false);
    expect(formatSourceIdentity(null)).toBe('unknown');
  });

  test('the URL validator and the identity resolver cannot drift apart', () => {
    // They answer different questions — "may this be scraped" and "which
    // product is this" — off ONE definition of what a product link is.
    const validator = readFileSync(
      path.join(REPO_ROOT, 'admin/src/server/validation/aliexpress-url.ts'),
      'utf-8',
    );
    expect(validator).toContain("PROVIDERS.find((p) => p.id === 'aliexpress')");
    expect(validator, 'the validator re-declared the patterns it should borrow').not.toMatch(
      /const HOST_RE = \//,
    );
  });
});

// ───────────────────────────────────────────────────────────────────────────
// THE GUARD, DRIVEN THROUGH THE REAL GENERATOR
// ───────────────────────────────────────────────────────────────────────────
//
// Every case below runs scripts/generate-landing.mjs for real. Nothing is
// stubbed: the preflight that refused the operator's second run is the code
// under test.

describe('the lineage guard compares products, not runs', () => {
  const PRD = (n: string) => `prd_mtest${n}-abcdef0${n}`;

  /** A content document with the productId and provenance a run would carry. */
  function contentFile(dir: string, productId: string, sourceUrl: string | null) {
    const doc = JSON.parse(readFileSync(path.join(FIX, 'fixed/content.json'), 'utf-8'));
    doc.productId = productId;
    doc.provenance = { sourceUrl, itemId: null, scrapedAt: null, scrapeJobId: null };
    const file = path.join(dir, 'content.json');
    writeFileSync(file, JSON.stringify(doc, null, 2));
    return file;
  }

  /** Plants the artefact a PREVIOUS run would have left behind. */
  function plantExisting(slug: string, productId: string, sourceUrl: string | null) {
    const out = path.join(REPO_ROOT, 'outputs', slug);
    mkdirSync(out, { recursive: true });
    writeFileSync(
      path.join(out, '.generation.json'),
      `${JSON.stringify({ schema: 1, productId, slug, lineage: 'scraped', sourceUrl, itemId: null }, null, 2)}\n`,
    );
    return out;
  }

  function generate(slug: string, contentPath: string, extra: string[] = []) {
    const r = spawnSync(
      process.execPath,
      [
        path.join(REPO_ROOT, 'scripts/generate-landing.mjs'),
        '--slug', slug,
        '--content', contentPath,
        '--merchant', path.join(FIX, 'fixed/merchant.json'),
        '--force',
        ...extra,
      ],
      { cwd: REPO_ROOT, encoding: 'utf-8' },
    );
    return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
  }

  /** Runs one case end to end and cleans up after itself. */
  function run(
    slug: string,
    existing: { productId: string; sourceUrl: string | null },
    current: { productId: string; sourceUrl: string | null },
    extra: string[] = [],
  ) {
    const dir = mkdtempSync(path.join(tmpdir(), 'lineage-'));
    const out = plantExisting(slug, existing.productId, existing.sourceUrl);
    try {
      const r = generate(slug, contentFile(dir, current.productId, current.sourceUrl), extra);
      const manifest = existsSync(path.join(out, '.generation.json'))
        ? JSON.parse(readFileSync(path.join(out, '.generation.json'), 'utf-8'))
        : null;
      return { ...r, out, manifest };
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(out, { recursive: true, force: true });
    }
  }

  // ── CASE 1 — same product, new run ───────────────────────────────────────
  test('CASE 1: the same item and the same URL regenerates, despite a new productId', () => {
    // Exactly what the operator did. Two scrapes of one product mint two
    // productIds; that is run identity, and it is not evidence of anything.
    const r = run(
      'zz-lin-same',
      { productId: PRD('1'), sourceUrl: TRACKED_URL },
      { productId: PRD('2'), sourceUrl: TRACKED_URL },
    );
    expect(r.stderr + r.stdout, 'the same product was refused').not.toMatch(/different product/);
    expect(r.status).toBe(0);
    expect(r.manifest.source).toEqual({
      provider: 'aliexpress',
      externalProductId: ITEM,
      canonicalUrl: CLEAN_URL,
    });
  });

  // ── CASE 2 — same product, different tracking parameters ─────────────────
  test('CASE 2: the same item reached from a different place is the same lineage', () => {
    const r = run(
      'zz-lin-tracking',
      { productId: PRD('1'), sourceUrl: TRACKED_URL },
      {
        productId: PRD('2'),
        sourceUrl: `https://es.aliexpress.com/item/${ITEM}.html?spm=a2g0o.search.0.0.abcdef&algo_pvid=zzz`,
      },
    );
    expect(r.status).toBe(0);
    expect(r.manifest.source.externalProductId).toBe(ITEM);
  });

  // ── CASE 3 — same product, different locale host ─────────────────────────
  test('CASE 3: the same item on a compatible locale host is the same lineage', () => {
    const r = run(
      'zz-lin-locale',
      { productId: PRD('1'), sourceUrl: `https://es.aliexpress.com/item/${ITEM}.html` },
      { productId: PRD('2'), sourceUrl: `https://www.aliexpress.com/item/${ITEM}.html` },
    );
    expect(r.status).toBe(0);
  });

  // ── CASE 4 — a genuinely different product ───────────────────────────────
  test('CASE 4: a different item cannot take an existing output directory', () => {
    // THE PROTECTION THAT SAVED US. It still fires, on the right evidence.
    const r = run(
      'zz-lin-collision',
      { productId: PRD('1'), sourceUrl: `https://es.aliexpress.com/item/${ITEM}.html` },
      { productId: PRD('2'), sourceUrl: `https://es.aliexpress.com/item/${OTHER_ITEM}.html` },
    );
    expect(r.status).not.toBe(0);
    const output = r.stderr + r.stdout;
    expect(output).toMatch(/belongs to a different product/);
    expect(output).toContain(`aliexpress:${ITEM}`);
    expect(output).toContain(`aliexpress:${OTHER_ITEM}`);
  });

  test('CASE 4b: and the same SLUG is not a defence — the path is not identity', () => {
    // The tempting wrong fix is `if slug matches → overwrite`. The slug is an
    // output path an operator may type by hand; both runs above used the same
    // one and the collision was still refused.
    const r = run(
      'zz-lin-slug',
      { productId: PRD('1'), sourceUrl: `https://es.aliexpress.com/item/${ITEM}.html` },
      { productId: PRD('2'), sourceUrl: `https://es.aliexpress.com/item/${OTHER_ITEM}.html` },
    );
    expect(r.status).not.toBe(0);
  });

  // ── CASE 5 — identity not provable ───────────────────────────────────────
  test('CASE 5: an unprovable identity falls back to the run id, and fails closed', () => {
    const r = run(
      'zz-lin-unknown',
      { productId: PRD('1'), sourceUrl: 'https://example.com/some/page' },
      { productId: PRD('2'), sourceUrl: 'https://example.com/some/page' },
    );
    expect(r.status, 'an unknown identity was treated as a match').not.toBe(0);
    expect(r.stderr + r.stdout).toMatch(/cannot be proved to be the same/);
  });

  test('CASE 5b: a missing source URL on either side is also unprovable', () => {
    for (const [existing, current] of [
      [null, `https://es.aliexpress.com/item/${ITEM}.html`],
      [`https://es.aliexpress.com/item/${ITEM}.html`, null],
    ] as const) {
      const r = run(
        'zz-lin-missing',
        { productId: PRD('1'), sourceUrl: existing },
        { productId: PRD('2'), sourceUrl: current },
      );
      expect(r.status, `existing=${existing} current=${current} was allowed`).not.toBe(0);
    }
  });

  // ── CASE 6 — a stale directory from another product ──────────────────────
  test('CASE 6: a stale output from another product is refused, not adopted', () => {
    const r = run(
      'zz-lin-stale',
      { productId: PRD('1'), sourceUrl: `https://es.aliexpress.com/item/${OTHER_ITEM}.html` },
      { productId: PRD('1'), sourceUrl: `https://es.aliexpress.com/item/${ITEM}.html` },
    );
    // Note the productIds are IDENTICAL here — the old comparison would have
    // waved this through. Identity is what decides now, in both directions.
    expect(r.status).not.toBe(0);
    expect(r.stderr + r.stdout).toMatch(/belongs to a different product/);
  });

  // ── CASE 7 — a different jobId for the same product ──────────────────────
  test('CASE 7: same product, different scrape job, regenerates', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'lineage-'));
    const out = plantExisting('zz-lin-job', PRD('1'), CLEAN_URL);
    try {
      const doc = JSON.parse(readFileSync(path.join(FIX, 'fixed/content.json'), 'utf-8'));
      doc.productId = PRD('2');
      doc.provenance = { sourceUrl: CLEAN_URL, itemId: null, scrapedAt: null, scrapeJobId: 'job-999' };
      const file = path.join(dir, 'content.json');
      writeFileSync(file, JSON.stringify(doc, null, 2));
      expect(generate('zz-lin-job', file).status).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(out, { recursive: true, force: true });
    }
  });

  // ── CASE 8 — --force still reaches none of it ────────────────────────────
  test('CASE 8: --force cannot bypass a real product collision', () => {
    // Every case above already passes --force, because --force is what lets a
    // legitimate regeneration overwrite its own directory. It has never been a
    // lineage override and it still is not.
    const r = run(
      'zz-lin-force',
      { productId: PRD('1'), sourceUrl: `https://es.aliexpress.com/item/${ITEM}.html` },
      { productId: PRD('2'), sourceUrl: `https://es.aliexpress.com/item/${OTHER_ITEM}.html` },
      ['--force'],
    );
    expect(r.status).not.toBe(0);
    expect(r.stderr + r.stdout).toMatch(/cannot be bypassed with --force/);
  });

  test('and the generator ACCEPTS no lineage override of any kind', () => {
    // Scanned over the ARGUMENT PARSER, not the prose. generate-landing.mjs
    // documents that no `--reset` exists, and a rule that forbids naming the
    // escape hatch forbids explaining why there isn't one.
    const src = readFileSync(path.join(REPO_ROOT, 'scripts/generate-landing.mjs'), 'utf-8');
    const parser = /function parseArgs\([\s\S]*?\n\}/
      .exec(src)?.[0]
      // Comments stripped: parseArgs itself carries the line "No `--reset` flag
      // exists", and a scan that flagged the explanation would force it to be
      // deleted — leaving the next reader to wonder whether one was intended.
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(parser, 'parseArgs is gone — this test is checking nothing').toBeTruthy();
    for (const escape of ['--reset', '--adopt', '--ignore-lineage', '--claim', '--overwrite-lineage']) {
      expect(parser!, `${escape} is accepted`).not.toContain(escape);
    }
    // `--force` IS accepted, and is the flag that must NOT have grown the
    // power. It overwrites a directory; it never reassigns one.
    expect(parser!).toContain("'--force'");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// RUN IDENTITY IS STILL RUN IDENTITY
// ───────────────────────────────────────────────────────────────────────────

describe('productId keeps its meaning, and stops carrying one it never had', () => {
  test('it is minted once per SCRAPE JOB — which is why it cannot be the product', () => {
    const registry = readFileSync(path.join(REPO_ROOT, 'admin/src/server/jobs/registry.ts'), 'utf-8');
    expect(registry).toMatch(/createScrapeJob\(params: ScrapeParams\)/);
    expect(registry).toMatch(/productId: params\.productId \?\? newProductId\(\)/);
  });

  test('the pipeline carries the resolved identity into the scrape job', () => {
    // It passed `itemId: ''` and the raw URL as `normalizedUrl`, discarding the
    // identity at the one moment it mattered.
    const pipeline = readFileSync(path.join(REPO_ROOT, 'admin/src/server/pipeline.ts'), 'utf-8');
    expect(pipeline).toMatch(/sourceIdentity = resolveSourceIdentity\(input\.url\)/);
    // Hoisted out of the scrape branch, because the GENERATE stage needs it to
    // explain a product conflict in the operator's language.
    expect(pipeline).toMatch(/let sourceIdentity: SourceProductIdentity \| null = null;/);
    expect(pipeline).toMatch(/itemId: identity\?\.externalProductId \?\? ''/);
    expect(pipeline).toMatch(/normalizedUrl: identity\?\.canonicalUrl \?\? input\.url/);
    expect(pipeline, 'the pipeline hardcodes a provider').not.toContain('validateAliExpressUrl');
  });

  test('the HTTP boundary refuses a link that names no product', () => {
    // Generic first: any registered provider will do. The AliExpress validator
    // is consulted only for the sentence.
    const route = readFileSync(path.join(REPO_ROOT, 'admin/src/server/routes/pipeline.ts'), 'utf-8');
    expect(route).toMatch(/if \(body\.url && !resolveSourceIdentity\(body\.url\)\)/);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// AND WHEN A REAL CONFLICT HAPPENS, IT READS LIKE A SENTENCE
// ───────────────────────────────────────────────────────────────────────────
//
// The operator's screen showed this, inside the Build Agent's panel, as one
// run-on line of technical text:
//
//   outputs/1005007345199501 belongs to a different product lineage (existing
//   productId prd_mto7a4ia-e40e4b7d, content.json has prd_mtoiv4y5-0a148ae9).
//   This cannot be bypassed with --force.
//
// After the fix that case does not arise at all. A genuine collision still
// can, and when it does the identifiers belong behind a disclosure rather than
// in front of one.

describe('a product conflict is explained, not dumped', () => {
  const pipeline = readFileSync(path.join(REPO_ROOT, 'admin/src/server/pipeline.ts'), 'utf-8');
  const panel = readFileSync(
    path.join(REPO_ROOT, 'admin/src/client/components/ActiveStagePanel.tsx'),
    'utf-8',
  );

  test('the stage carries a headline and the facts, separately', () => {
    expect(pipeline).toMatch(/export type PipelineStageErrorDetail = \{/);
    expect(pipeline).toMatch(/errorDetail: PipelineStageErrorDetail \| null;/);
    expect(pipeline).toContain(
      'Esta carpeta pertenece a otro producto y no se sobrescribirá para proteger sus datos.',
    );
  });

  test('the facts are read FIRST-HAND, never parsed back out of the message', () => {
    // A message is prose and prose changes. The existing manifest is on disk
    // and the current identity was resolved by this same process.
    expect(pipeline).toMatch(/readGenerationManifest\(path\.join\(OUTPUTS_DIR, input\.slug\)\)/);
    expect(pipeline).toMatch(/formatSourceIdentity\(sourceIdentity\)/);
    expect(pipeline, 'the conflict detail is built by parsing the child\'s message').not.toMatch(
      /error\.message\.match|\.exec\(generateDone\.error/,
    );
  });

  test('it is built ONLY for a failure we actually understand', () => {
    // Inventing a friendly headline for an unknown error hides the only
    // useful thing about it.
    expect(pipeline).toMatch(/generateDone\.error\?\.code === 'generation-owner-mismatch'/);
    expect(pipeline).toMatch(/return fail\('generate', jobFailure\(generateDone\)\);/);
  });

  test('the panel shows the sentence, and hides the identifiers behind a disclosure', () => {
    expect(panel).toContain('Conflicto de producto');
    expect(panel).toMatch(/failed\.errorDetail\.headline/);
    expect(panel).toContain('<details');
    expect(panel).toContain('Detalles técnicos');
    // And it still falls back to the raw message for everything else.
    expect(panel).toMatch(/failed\?\.error && \(/);
  });

  test('the three identities a reader would ask about are all there', () => {
    for (const label of [
      'Carpeta',
      'Producto existente',
      'Producto de esta ejecución',
      'Ejecución existente',
      'Ejecución actual',
    ]) {
      expect(pipeline, `${label} is missing from the conflict detail`).toContain(label);
    }
  });
});

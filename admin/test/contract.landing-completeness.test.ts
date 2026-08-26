// COMPLETENESS — a generated landing must not be able to reach READY while it
// is still wearing the template's clothes or pointing at pages that do not
// exist.
//
// Everything here is checked against the REAL sources and the REAL generated
// artefacts. No browser, no visual regression: a dead href, an unconfigured
// merchant and a shared favicon are all statically decidable.
import { describe, test, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const readRaw = (rel: string) => readFileSync(path.join(REPO_ROOT, rel), 'utf-8');

/**
 * Source scans strip comments. This is the FOURTH guard in this repo to need
 * it — after the B2 Tailwind scanner, buy-action.contract and
 * content-provenance — and every time for the same reason: a file that
 * documents the pattern it must not contain will fail a naive scan of itself.
 * Here it was the footer's own header ("render every one of them as
 * href=\"#\"") and merchant.mjs explaining that country is never inferred from
 * VAT_RATE 0.21.
 *
 * Treat this as the convention, not a workaround: assert on CODE.
 */
const read = (rel: string) =>
  readRaw(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*)/.test(l))
    .join('\n');
const merchantLib = await import(pathToFileURL(path.join(REPO_ROOT, 'scripts/lib/merchant.mjs')).href);

const TEST_MERCHANT = JSON.parse(readRaw('admin/test/fixtures/merchant/test-merchant.json'));

// --- navigation ------------------------------------------------------------

describe('navigation anchors are a contract, not a hopeful string', () => {
  const nav = read('content/landing-base/src/lib/navigation.ts');

  test('the ids are declared once and imported by the sections that emit them', () => {
    for (const [key, id] of [['HowItWorks', 'how-it-works'], ['Faq', 'faq'], ['Guarantee', 'guarantee'], ['BuyBox', 'buy']]) {
      expect(nav, `${key} missing from SECTION_ANCHORS`).toContain(`${key}: '${id}'`);
    }
  });

  test.each([
    ['HowItWorks/VerticalSteps', 'content/landing-base/src/design-system/blocks/product/HowItWorks/VerticalSteps.astro', 'HowItWorks'],
    ['HowItWorks/HorizontalTimeline', 'content/landing-base/src/design-system/blocks/product/HowItWorks/HorizontalTimeline.astro', 'HowItWorks'],
    ['Faq/Accordion', 'content/landing-base/src/design-system/blocks/conversion/Faq/Accordion.astro', 'Faq'],
    ['Faq/OpenList', 'content/landing-base/src/design-system/blocks/conversion/Faq/OpenList.astro', 'Faq'],
    ['Guarantee (legacy)', 'content/landing-base/src/components/sections/12-guarantee.astro', 'Guarantee'],
    ['ProductGuarantee', 'content/landing-base/src/design-system/blocks/conversion/ProductGuarantee/Default.astro', 'Guarantee'],
  ])('%s emits its anchor from the shared constant', (_n, file, key) => {
    const src = read(file);
    expect(src).toContain(`id={SECTION_ANCHORS.${key}}`);
    // A hardcoded literal would drift the day the constant changes.
    expect(src, 'anchor hardcoded instead of imported').not.toMatch(/id="(how-it-works|faq|guarantee)"/);
  });

  test('EVERY variant of an anchored capability carries the id', () => {
    // The trap: anchoring only the variant the default spec happens to use, so
    // the footer breaks for any landing that picks the sibling.
    const pairs = [
      ['product/HowItWorks', ['VerticalSteps', 'HorizontalTimeline']],
      ['conversion/Faq', ['Accordion', 'OpenList']],
    ] as const;
    for (const [dir, variants] of pairs) {
      for (const v of variants) {
        const src = read(`content/landing-base/src/design-system/blocks/${dir}/${v}.astro`);
        expect(src, `${dir}/${v} has no anchor`).toContain('id={SECTION_ANCHORS.');
      }
    }
  });

  test('the footer builds from the same source — no second array of labels', () => {
    const footer = read('content/landing-base/src/components/sections/14-site-footer.astro');
    expect(footer).toContain("from '@/lib/navigation'");
    expect(footer).toContain('FOOTER_COLUMNS.map');
    expect(footer).toContain('href={link.href}');
    // The defect this replaced.
    expect(footer, 'the footer still renders a dead anchor').not.toContain('href="#"');
  });
});

// --- legal routes ----------------------------------------------------------

describe('every footer route is a real page', () => {
  const nav = read('content/landing-base/src/lib/navigation.ts');
  const ROUTES = [...nav.matchAll(/'(\/legal\/[a-z-]+)'/g)].map((m) => m[1]);

  test('the navigation contract declares all seven', () => {
    expect(ROUTES.length).toBe(7);
  });

  test.each(['envios', 'devoluciones', 'contacto', 'terminos', 'privacidad', 'cookies', 'aviso-legal'])(
    '/legal/%s has a page file',
    (slug) => {
      expect(existsSync(path.join(REPO_ROOT, `content/landing-base/src/pages/legal/${slug}.astro`))).toBe(true);
    },
  );

  test('there are no orphan pages and no missing ones', () => {
    const files = readdirSync(path.join(REPO_ROOT, 'content/landing-base/src/pages/legal'))
      .filter((f) => f.endsWith('.astro'))
      .map((f) => `/legal/${f.replace('.astro', '')}`)
      .sort();
    expect(files).toEqual([...ROUTES].sort());
  });

  test('every legal page is static, not a per-request function', () => {
    for (const slug of ['envios', 'devoluciones', 'contacto', 'terminos', 'privacidad', 'cookies', 'aviso-legal']) {
      const src = read(`content/landing-base/src/pages/legal/${slug}.astro`);
      // `prerender` must be on the PAGE — Astro does not read it from a layout,
      // and a version of this that declared it in LegalPage.astro produced
      // seven SSR routes and zero static files.
      expect(src, `${slug} is not prerendered`).toContain('export const prerender = true');
    }
  });
});

// --- merchant facts --------------------------------------------------------

describe('merchant facts are configured, never invented', () => {
  test('the required set is the audited seven, not a defensive nine', () => {
    expect(merchantLib.MERCHANT_REQUIRED_FIELDS).toEqual([
      'legalName', 'taxId', 'address', 'contactEmail', 'country', 'returnsWindowDays', 'carrierName',
    ]);
    // shippingEtaLabel deliberately absent — product.shipping.etaLabel already
    // holds it, and two sources for one sentence is how they drift.
    expect(merchantLib.MERCHANT_ALL_FIELDS).not.toContain('shippingEtaLabel');
    expect(merchantLib.MERCHANT_OPTIONAL_FIELDS).toEqual(['dataControllerEmail']);
  });

  test('an absent config is reported, not defaulted', () => {
    const issues = merchantLib.collectMerchantIssues(null);
    expect(issues.map((i: { code: string }) => i.code)).toEqual(['merchant-missing']);
    expect(merchantLib.normalizeMerchant(null)).toBeNull();
  });

  test('each missing field names itself AND the page it breaks', () => {
    for (const field of merchantLib.MERCHANT_REQUIRED_FIELDS) {
      const partial = { ...TEST_MERCHANT };
      delete partial[field];
      const issue = merchantLib
        .collectMerchantIssues(partial)
        .find((i: { field?: string }) => i.field === field);
      expect(issue, `${field} missing was not reported`).toBeDefined();
      expect(issue.message, `${field} error names no page`).toMatch(
        new RegExp(merchantLib.MERCHANT_FIELD_PAGES[field].split(',')[0].trim()),
      );
    }
  });

  test('unfilled template values are rejected — worse than absence, because they publish', () => {
    for (const bad of ['[TU EMPRESA]', 'example@example.com', '12345678X', 'TODO', 'Lorem ipsum']) {
      const issues = merchantLib.collectMerchantIssues({ ...TEST_MERCHANT, legalName: bad });
      expect(
        issues.some((i: { code: string }) => i.code === 'merchant-placeholder' || i.code === 'merchant-field-invalid'),
        `${bad} was accepted`,
      ).toBe(true);
    }
  });

  test('dataControllerEmail is the ONE derivation, and it falls back honestly', () => {
    const n = merchantLib.normalizeMerchant(TEST_MERCHANT);
    expect(n.dataControllerEmail).toBe(TEST_MERCHANT.contactEmail);
    const withDpo = merchantLib.normalizeMerchant({ ...TEST_MERCHANT, dataControllerEmail: 'dpo@test.invalid' });
    expect(withDpo.dataControllerEmail).toBe('dpo@test.invalid');
  });

  test('country is NEVER inferred from the hardcoded VAT rate', () => {
    const lib = read('scripts/lib/merchant.mjs');
    expect(lib).not.toMatch(/0\.21|VAT_RATE|España'/);
    // and it is required, so it cannot be quietly omitted
    expect(merchantLib.MERCHANT_REQUIRED_FIELDS).toContain('country');
  });

  test('the test fixture is unmistakably test data and lives only in tests', () => {
    expect(TEST_MERCHANT.legalName).toMatch(/FIXTURE DE TEST/);
    expect(TEST_MERCHANT.contactEmail).toMatch(/\.invalid$/); // RFC 2606 reserved
    // It must never be referenced from the generator or the template.
    expect(read('scripts/generate-landing.mjs')).not.toContain('test-merchant');
    expect(existsSync(path.join(REPO_ROOT, 'content/landing-base/src/data/merchant.ts'))).toBe(true);
    expect(read('content/landing-base/src/data/merchant.ts')).not.toContain('FIXTURE');
  });

  test('the template default is null — the honest preview state', () => {
    expect(read('content/landing-base/src/data/merchant.ts')).toMatch(
      /export const merchant: Merchant \| null = null;/,
    );
  });
});

// --- the layers stay separate ---------------------------------------------

describe('merchant identity, policy facts and product content do not mix', () => {
  test('no merchant field can enter content.json', () => {
    const contract = read('scripts/lib/content-contract.mjs');
    for (const field of merchantLib.MERCHANT_ALL_FIELDS) {
      expect(contract, `${field} leaked into the content contract`).not.toContain(`'${field}'`);
    }
  });

  test('no agent writes merchant config', () => {
    // generate-content.mjs is the Content Agent. It must not know this layer.
    expect(read('scripts/generate-content.mjs')).not.toMatch(/merchant/i);
  });

  test('merchant config is not part of the DesignSpec either', () => {
    expect(read('scripts/lib/design-registry.mjs')).not.toMatch(/legalName|taxId|merchant/i);
  });
});

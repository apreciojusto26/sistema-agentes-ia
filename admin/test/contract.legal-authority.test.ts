// ONE AUTHORITY FOR WHO IS SELLING.
//
// ─── THE DEFECT ────────────────────────────────────────────────────────────
//
// `src/data/legal.ts` was a hand-written object holding a real legal name, a
// real NIF, a real address, a real email, a real phone and a real trade name —
// copied verbatim into every landing this system produces, while
// `src/data/merchant.ts`, generated from the operator's own config, held the
// same facts.
//
// TWO AUTHORITIES FOR ONE FACT, and the legal pages read the wrong one. Under
// LSSI-CE art. 10 those pages are a legally binding identification of who is
// selling: a landing generated for any other operator published one particular
// seller's NIF and address as its own. Nothing could notice — each page was
// reading exactly what it had been told to read.
//
// ─── WHAT THIS SUITE PROVES ────────────────────────────────────────────────
//
// Swap the merchant fixture and NOTHING of the previous one survives anywhere
// in the generated landing. Proved on the real generator output rather than on
// a rendered page, and deliberately so: the legal pages are SSR under
// `output: 'server'`, so they are not in `dist/`, and a value that exists
// nowhere in the source cannot be rendered by any request.
import { describe, test, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync, statSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MERCHANT_REQUIRED_FIELDS,
  MERCHANT_OPTIONAL_FIELDS,
  normalizeMerchant,
} from '../../scripts/lib/merchant.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FIX = path.join(REPO_ROOT, 'admin/test/fixtures');
const TEMPLATE = path.join(REPO_ROOT, 'content/landing-astravibe');

/**
 * Two sellers with NOTHING in common. Every string is unique enough to grep
 * for, so "did any of A survive" is a search rather than a judgement.
 */
const MERCHANT_A = {
  legalName: 'Alfa Comercio S.L.',
  tradeName: 'AlfaShop',
  taxId: 'A11111111',
  address: 'Calle Alfa 1, 11111 Villalfa',
  contactEmail: 'alfa@alfa.invalid',
  phone: '+34 911 111 111',
  country: 'Alfalandia',
  returnsWindowDays: 14,
  carrierName: 'Mensajería Alfa',
  shippingEtaLabel: 'Envío Alfa en 3 días',
  returnShippingPaidBy: 'merchant',
  dataControllerEmail: 'dpo-alfa@alfa.invalid',
  commercialGuaranteeDays: 30,
  freeShippingOverCents: 0,
  packs: [{ id: 'x2', units: 2, freeUnits: 0, label: 'Pack Alfa', default: true }],
};

const MERCHANT_B = {
  legalName: 'Beta Distribución S.A.',
  tradeName: 'BetaStore',
  taxId: 'B22222222',
  address: 'Avenida Beta 9, 22222 Betaburgo',
  contactEmail: 'beta@beta.invalid',
  phone: '+34 922 222 222',
  country: 'Betalandia',
  returnsWindowDays: 30,
  carrierName: 'Transportes Beta',
  shippingEtaLabel: 'Envío Beta en 24 horas',
  returnShippingPaidBy: 'customer',
  dataControllerEmail: 'dpo-beta@beta.invalid',
  commercialGuaranteeDays: null,
  freeShippingOverCents: 4900,
  packs: [{ id: 'x3', units: 3, freeUnits: 1, label: 'Pack Beta', default: true }],
};

/**
 * The values of a merchant that IDENTIFY it on a page.
 *
 * Named explicitly rather than swept off the object, because two of the string
 * fields are not identity at all: `returnShippingPaidBy` is the enum value
 * `'merchant'`, and scanning for that word matches half the codebase. A search
 * that cannot tell a seller's name from a vocabulary term reports contamination
 * everywhere and is therefore worth nothing.
 */
const IDENTIFYING_FIELDS = [
  'legalName', 'tradeName', 'taxId', 'address', 'contactEmail', 'phone', 'country',
  'carrierName', 'shippingEtaLabel', 'dataControllerEmail',
] as const;

const printableValues = (m: Record<string, unknown>): string[] =>
  IDENTIFYING_FIELDS.map((f) => m[f]).filter((v): v is string => typeof v === 'string' && v.trim() !== '');

function generateWith(slug: string, merchant: Record<string, unknown>) {
  const dir = mkdtempSync(path.join(tmpdir(), 'legal-'));
  const merchantPath = path.join(dir, 'merchant.json');
  writeFileSync(merchantPath, JSON.stringify(merchant, null, 2));
  const out = path.join(REPO_ROOT, 'outputs', slug);
  rmSync(out, { recursive: true, force: true });
  const r = spawnSync(
    process.execPath,
    [
      path.join(REPO_ROOT, 'scripts/generate-landing.mjs'),
      '--slug', slug,
      '--content', path.join(FIX, 'fixed/content.json'),
      '--merchant', merchantPath,
      '--force',
    ],
    { cwd: REPO_ROOT, encoding: 'utf-8' },
  );
  return { dir, out, status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

/** Every source file of a generated landing that could carry a seller's data. */
function landingSources(out: string): string[] {
  const files: string[] = [];
  const walk = (d: string) => {
    for (const entry of readdirSync(d)) {
      if (entry === 'node_modules' || entry === '.git' || entry === 'dist' || entry === '.astro') continue;
      const full = path.join(d, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(astro|ts|tsx|json|mjs)$/.test(entry)) files.push(full);
    }
  };
  walk(path.join(out, 'src'));
  files.push(path.join(out, '.generation.json'));
  return files;
}

// ───────────────────────────────────────────────────────────────────────────
// THE MANDATORY REGRESSION: A → B, and nothing of A survives
// ───────────────────────────────────────────────────────────────────────────

describe('swapping the merchant swaps every legal surface', () => {
  test('a landing generated for A carries A, and a landing for B carries no A at all', () => {
    const a = generateWith('zz-legal-a', MERCHANT_A);
    try {
      expect(a.status, a.stderr).toBe(0);
      const aFiles = landingSources(a.out);
      const aText = aFiles.map((f) => readFileSync(f, 'utf-8')).join('\n');
      // Sanity first: if A's data were not there, "B has none of it" would be
      // a vacuous pass.
      for (const value of printableValues(MERCHANT_A)) {
        expect(aText, `A's ${value} never reached its own landing`).toContain(value);
      }
    } finally {
      rmSync(a.dir, { recursive: true, force: true });
      rmSync(a.out, { recursive: true, force: true });
    }

    const b = generateWith('zz-legal-b', MERCHANT_B);
    try {
      expect(b.status, b.stderr).toBe(0);
      const bText = landingSources(b.out).map((f) => readFileSync(f, 'utf-8')).join('\n');

      // THE ASSERTION. Not one string belonging to A may appear anywhere in a
      // landing generated for B — not in a legal page, not in the footer, not
      // in a data module, not in the manifest.
      for (const value of printableValues(MERCHANT_A)) {
        expect(bText, `Merchant A's "${value}" survived into Merchant B's landing`).not.toContain(value);
      }
      // And B's own facts are all present.
      for (const value of printableValues(MERCHANT_B)) {
        expect(bText, `Merchant B's "${value}" never arrived`).toContain(value);
      }
    } finally {
      rmSync(b.dir, { recursive: true, force: true });
      rmSync(b.out, { recursive: true, force: true });
    }
  }, 120_000);
});

// ───────────────────────────────────────────────────────────────────────────
// THE TEMPLATE ITSELF NAMES NO SELLER
// ───────────────────────────────────────────────────────────────────────────

describe('no seller is hardcoded in the template', () => {
  /** Everything that renders a legal surface. */
  const SURFACES = [
    'src/data/legal.ts',
    'src/layouts/Legal.astro',
    'src/pages/contacto.astro',
    'src/pages/checkout/index.astro',
    'src/components/sections/02-site-header.astro',
    'src/components/sections/14-site-footer.astro',
    'src/components/islands/CheckoutForm.tsx',
    ...readdirSync(path.join(TEMPLATE, 'src/pages/legal')).map((f) => `src/pages/legal/${f}`),
  ];

  const code = (rel: string) =>
    readFileSync(path.join(TEMPLATE, rel), 'utf-8')
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
      .replace(/\/\/.*$/gm, '');

  /**
   * The seller who WAS hardcoded here, plus the fixture sellers. Comments are
   * stripped first: this module documents the identity it removed, and a scan
   * that flagged its own explanation would force the explanation to be deleted.
   */
  const FORBIDDEN = [
    'Daniel Longone',
    'Bamzuk',
    'X9986124F',
    'Calle la Iglesia',
    'bamzukafiliados',
    '+34 602 057 976',
    ...printableValues(MERCHANT_A),
    ...printableValues(MERCHANT_B),
  ];

  test.each(SURFACES)('%s names no seller', (rel) => {
    const text = code(rel);
    for (const value of FORBIDDEN) {
      expect(text, `${rel} hardcodes "${value}"`).not.toContain(value);
    }
  });

  test('and no jurisdiction or shipping promise is hardcoded in the terms', () => {
    // `terminos.astro` stated one country as the delivery territory AND as the
    // applicable law, and promised free shipping outright — in a binding
    // document, for a merchant who might offer neither.
    const terms = code('src/pages/legal/terminos.astro');
    expect(terms).toMatch(/const country = orPending\(identity\.country\)/);
    expect(terms).toMatch(/const freeOver = product\.shipping\.freeOverCents/);
    expect(terms, 'the delivery territory is hardcoded again').not.toMatch(
      /territorio español|entrega en <strong>España/,
    );
    expect(terms, 'the applicable law is hardcoded again').not.toContain('legislación española');
    expect(terms, 'free shipping is promised unconditionally again').not.toContain('gratuito</strong> a toda');
  });

  test('legal.ts holds no identity value of its own — it projects merchant', () => {
    const adapter = code('src/data/legal.ts');
    expect(adapter).toContain("import { merchant } from '@/data/merchant';");
    // Every identity field reads from `merchant`. A literal here would be a
    // second authority again.
    for (const [field, source] of [
      ['holder', 'merchant.legalName'],
      ['tradeName', 'merchant.tradeName'],
      ['taxId', 'merchant.taxId'],
      ['address', 'merchant.address'],
      ['email', 'merchant.contactEmail'],
      ['phone', 'merchant.phone'],
      ['country', 'merchant.country'],
      ['dataControllerEmail', 'merchant.dataControllerEmail'],
    ] as const) {
      expect(adapter, `${field} is not projected from merchant`).toMatch(
        new RegExp(`${field}:\\s*${source.replace('.', '\\.')}`),
      );
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// ABSENCE
// ───────────────────────────────────────────────────────────────────────────

describe('with no merchant, the pages say pending rather than inventing a seller', () => {
  test('every identity field is null and there is one pending label', () => {
    const adapter = readFileSync(path.join(TEMPLATE, 'src/data/legal.ts'), 'utf-8');
    expect(adapter).toMatch(/const PENDING: LegalIdentity = \{/);
    expect(adapter).toContain("export const PENDING_LABEL = 'Pendiente de configuración';");
    // The store name is a STATE, not an invented word, and not an empty logo.
    expect(adapter).toMatch(/export const storeName: string = merchant\?\.tradeName \?\? 'Sin configurar';/);
  });

  test('a generation without --merchant still succeeds and reports what is missing', () => {
    // Absence is a real state: the landing builds, the legal pages are
    // navigable, and each says the information is pending. It does not invent
    // a seller and it does not refuse to run.
    const out = path.join(REPO_ROOT, 'outputs', 'zz-legal-none');
    rmSync(out, { recursive: true, force: true });
    const r = spawnSync(
      process.execPath,
      [
        path.join(REPO_ROOT, 'scripts/generate-landing.mjs'),
        '--slug', 'zz-legal-none',
        '--content', path.join(FIX, 'fixed/content.json'),
        '--force',
      ],
      { cwd: REPO_ROOT, encoding: 'utf-8' },
    );
    try {
      expect(r.status, r.stderr).toBe(0);
      expect(readFileSync(path.join(out, 'src/data/merchant.ts'), 'utf-8')).toContain(
        'export const merchant: Merchant | null = null',
      );
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  }, 60_000);
});

// ───────────────────────────────────────────────────────────────────────────
// THE FIELD SET
// ───────────────────────────────────────────────────────────────────────────

describe('the merchant owns every fact the legal pages state', () => {
  test('the nine facts a legal page can print all come from merchant config', () => {
    const all = [...MERCHANT_REQUIRED_FIELDS, ...MERCHANT_OPTIONAL_FIELDS];
    for (const field of [
      'legalName', 'tradeName', 'taxId', 'address', 'contactEmail', 'phone', 'country',
      'returnsWindowDays', 'shippingEtaLabel', 'returnShippingPaidBy', 'dataControllerEmail',
    ]) {
      expect(all, `${field} is not a merchant fact`).toContain(field);
    }
  });

  test('normalizeMerchant carries the two that used to be hardcoded', () => {
    const m = normalizeMerchant(MERCHANT_A) as Record<string, unknown>;
    expect(m.tradeName).toBe('AlfaShop');
    expect(m.phone).toBe('+34 911 111 111');
  });

  test('a merchant with no phone normalizes to null, never to an empty string', () => {
    // An empty string would render as a blank row that reads like a bug; null
    // renders as "No publicado", which is the true statement.
    const { phone: _drop, ...noPhone } = MERCHANT_A;
    const m = normalizeMerchant(noPhone) as Record<string, unknown>;
    expect(m.phone).toBeNull();
  });

  test('but a missing tradeName is refused — the legal notice requires it', () => {
    const { tradeName: _drop, ...noTrade } = MERCHANT_A;
    expect(normalizeMerchant.length).toBeGreaterThan(0);
    // Validation lives in collectMerchantIssues; the generator calls it before
    // anything is written.
    const issues = spawnSync(
      process.execPath,
      ['--input-type=module', '-e',
        `import {collectMerchantIssues} from './scripts/lib/merchant.mjs';` +
        `process.stdout.write(JSON.stringify(collectMerchantIssues(${JSON.stringify(noTrade)})));`],
      { cwd: REPO_ROOT, encoding: 'utf-8' },
    );
    const parsed = JSON.parse(issues.stdout || '[]') as { field?: string }[];
    expect(parsed.some((i) => i.field === 'tradeName')).toBe(true);
  });
});

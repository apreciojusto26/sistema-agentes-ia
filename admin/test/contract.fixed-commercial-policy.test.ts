// COMMERCIAL POLICY IN THE FIXED TEMPLATE — one authority, one sentence each.
//
// contract.commercial-policy.test.ts asserts this for content/landing-base.
// This is the same invariant for content/landing-astravibe, and it is NOT a
// copy of that file: the Fixed template has its own surfaces (a guarantee
// section, a sticky ticker, a cart drawer, a checkout form, an order
// confirmation and three legal pages) and its own history of writing policy
// into copy.
//
// WHAT WENT WRONG HERE. `product.guarantee` carried days:30, a title, a body
// and three bullet points — "Devolución simple dentro de los 30 días",
// "Reembolso completo, sin preguntas". `product.shipping.etaLabel` carried
// "Envío de 8 días hábiles". `badges` and `trustTicker` each restated the
// 30-day guarantee. Nothing configured any of it: the scraper supplies no
// returns window, no delivery term and no guarantee. Five authors, one promise,
// zero sources — and the ticker is sticky on every page, so a legal page could
// show a number in its header that its own body contradicted.
//
// Facts now come from src/data/merchant.ts and every sentence is derived in
// src/lib/policy.ts. These tests exist so that stays true.
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const T = 'content/landing-astravibe/src';

const readRaw = (rel: string) => readFileSync(path.join(REPO_ROOT, rel), 'utf-8');

/** Comments stripped — these files document the claims they may not make. */
const read = (rel: string) =>
  readRaw(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*)/.test(l))
    .join('\n');

/** Every surface that can state a returns, delivery or guarantee claim. */
const POLICY_SURFACES = [
  `${T}/components/sections/01-utility-bar.astro`,
  `${T}/components/sections/05-buy-box.astro`,
  `${T}/components/sections/12-guarantee.astro`,
  `${T}/components/sections/14-site-footer.astro`,
  `${T}/components/islands/CartDrawer.tsx`,
  `${T}/components/islands/CheckoutForm.tsx`,
  `${T}/components/islands/OrderConfirmation.tsx`,
  `${T}/pages/legal/envios.astro`,
  `${T}/pages/legal/devoluciones.astro`,
  `${T}/pages/legal/terminos.astro`,
];

describe('the Content Agent has no authority over policy', () => {
  test('the product contract carries no guarantee', () => {
    expect(read(`${T}/types/content.ts`)).not.toMatch(/^\s*guarantee\s*[?:]/m);
  });

  test('the product contract carries no delivery estimate', () => {
    // `shipping` survives, but only as the store's own pricing threshold.
    const types = read(`${T}/types/content.ts`);
    expect(types).not.toMatch(/etaLabel/);
    expect(types, 'freeOverCents is commerce config and belongs here').toMatch(/freeOverCents/);
  });

  test('the product data states no guarantee and no delivery term', () => {
    const data = read(`${T}/data/product.ts`);
    expect(data).not.toMatch(/^\s*guarantee\s*:/m);
    expect(data).not.toMatch(/etaLabel/);
  });

  test.each(POLICY_SURFACES)('%s reads no policy field off the product', (file) => {
    const src = read(file);
    expect(src, 'still reads product.guarantee').not.toMatch(/product\.guarantee/);
    expect(src, 'still reads a delivery term off the product').not.toMatch(/product\.shipping\.etaLabel/);
  });
});

describe('no copy array restates a policy promise', () => {
  const data = () => read(`${T}/data/product.ts`);

  const arrayItems = (name: string): string => {
    const m = new RegExp(`${name}:\\s*\\[([\\s\\S]*?)\\]`).exec(data());
    expect(m, `${name} not found — renamed?`).not.toBeNull();
    return m![1];
  };

  test('badges assert no guarantee', () => {
    expect(arrayItems('badges')).not.toMatch(/garant[íi]a/i);
  });

  test('the trust ticker asserts no guarantee', () => {
    // The sharpest case: the ticker is sticky on every page, so a guarantee
    // claim here appeared in the header of the very legal pages that state the
    // real policy in their body.
    expect(arrayItems('trustTicker')).not.toMatch(/garant[íi]a/i);
  });

  test('the ticker composes copy and derived policy at the render, not in the data', () => {
    const bar = read(`${T}/components/sections/01-utility-bar.astro`);
    expect(bar).toMatch(/policyTickerItems\(/);
    expect(bar, 'the two authorities were merged into one array').toMatch(/product\.trustTicker/);
  });
});

describe('the returns window and a commercial guarantee are never the same claim', () => {
  test('policy.ts models them as separate fields', () => {
    const policy = read(`${T}/lib/policy.ts`);
    expect(policy).toMatch(/returns:\s*\{/);
    expect(policy).toMatch(/commercialGuarantee/);
  });

  test('a commercial guarantee is null by default, never 30', () => {
    const merchantType = read(`${T}/types/merchant.ts`);
    expect(merchantType).toMatch(/commercialGuaranteeDays:\s*number\s*\|\s*null/);
    const policy = read(`${T}/lib/policy.ts`);
    expect(policy, 'a default guarantee was introduced').not.toMatch(/commercialGuaranteeDays\s*\?\?\s*\d/);
  });

  test('the guarantee section headlines RETURNS, and states a guarantee only if configured', () => {
    const section = read(`${T}/components/sections/12-guarantee.astro`);
    expect(section).toMatch(/returnsHeadline\(/);
    expect(section).toMatch(/commercialGuaranteeHeadline\(/);
  });

  test('the legal pages keep the statutory right separate from the commercial promise', () => {
    // `legal.withdrawalDays` is a right under RDL 1/2007 and is unconditional.
    // The commercial guarantee is voluntary and appears only when configured.
    for (const page of ['devoluciones', 'terminos']) {
      const src = read(`${T}/pages/legal/${page}.astro`);
      expect(src, `${page} lost the statutory withdrawal period`).toMatch(/legal\.withdrawalDays/);
      expect(src, `${page} states a guarantee unconditionally`).toMatch(
        /commercialGuaranteeDays !== null/,
      );
    }
  });
});

describe('preview states no policy at all', () => {
  test('merchant config is null until one is supplied', () => {
    expect(read(`${T}/data/merchant.ts`)).toMatch(/merchant:\s*Merchant\s*\|\s*null\s*=\s*null/);
  });

  test('policy is null when merchant is', () => {
    expect(read(`${T}/lib/policy.ts`)).toMatch(/PolicyFacts \| null = merchant\s*\?/);
  });

  test.each(POLICY_SURFACES)('%s guards on policy rather than defaulting', (file) => {
    const src = read(file);
    // Any surface that mentions policy must also handle its absence. A file
    // that imports it and renders unconditionally would crash the preview
    // build — or worse, be "fixed" later with a plausible default.
    if (!/from '@\/lib\/policy'/.test(src)) return;
    expect(src, 'imports policy but never checks for its absence').toMatch(
      /policy\s*\?|policy\s*&&|facts\s*&&|!== null|\?\./,
    );
  });

  test('no surface invents a policy number when none is configured', () => {
    for (const file of POLICY_SURFACES) {
      const src = read(file);
      expect(src, `${file} defaults a returns window`).not.toMatch(/returnsWindowDays\s*\?\?\s*\d/);
      expect(src, `${file} hardcodes the old 30-day promise`).not.toMatch(/\b30 d[íi]as\b/);
    }
  });
});

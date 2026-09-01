// COMMERCIAL POLICY CONSISTENCY.
//
// Before this contract, five independent authors wrote the same promise and
// none of them had a source: product.guarantee.{days,title,text,points},
// product.badges, product.trustTicker, the generated FAQ answer, and
// product.shipping.etaLabel — all Content Agent output, all shaped by nothing
// but a few-shot example carrying `days: 30`.
//
// The result was a landing that contradicted itself on one screen. The trust
// ticker is sticky on EVERY page, so /legal/devoluciones displayed "Garantía de
// 30 días" in its own header while its body, correctly reading merchant config,
// said "Disponés de 14 días".
//
// The fix is structural, not detective: facts live in merchant config, sentences
// are derived from them in landing-base/src/lib/policy.ts, and the fields the
// model used to write them into are gone from the contract. These tests exist so
// that stays true.
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const B = 'content/landing-base/src';
const read = (rel: string) => readFileSync(path.join(REPO_ROOT, rel), 'utf-8');

/** The house convention: a guard that scans source must not trip on prose. */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('policy fields cannot come back through generated content', () => {
  test('the content contract no longer accepts guarantee or shipping', () => {
    const contract = read('scripts/lib/content-contract.mjs');
    const code = stripComments(contract);
    expect(code).not.toMatch(/'guarantee'/);
    expect(code).not.toMatch(/'shipping'/);
  });

  test('the landing types no longer declare them either', () => {
    // A type that still described the shape would invite a renderer to read it.
    const types = stripComments(read(`${B}/types/content.ts`));
    expect(types).not.toMatch(/\bguarantee\s*:/);
    expect(types).not.toMatch(/freeOverCents/);
  });

  test('NO renderer reads product.guarantee or product.shipping', () => {
    // The one that matters. If a section goes back to generated policy copy,
    // this fails wherever it happens.
    const files = [
      `${B}/design-system/blocks/conversion/Guarantee/Default.astro`,
      `${B}/design-system/blocks/conversion/BuyBox/Card.astro`,
      `${B}/design-system/blocks/conversion/BuyBox/Compact.astro`,
      `${B}/design-system/blocks/conversion/Faq/faq-items.ts`,
      `${B}/components/sections/01-utility-bar.astro`,
      `${B}/pages/legal/devoluciones.astro`,
      `${B}/pages/legal/envios.astro`,
    ];
    for (const f of files) {
      const code = stripComments(read(f));
      expect(code, `${f} reads product.guarantee`).not.toMatch(/product\.guarantee/);
      expect(code, `${f} reads product.shipping`).not.toMatch(/product\.shipping/);
    }
  });

  test('every policy surface goes through the ONE policy module', () => {
    for (const f of [
      `${B}/design-system/blocks/conversion/Guarantee/Default.astro`,
      `${B}/design-system/blocks/conversion/BuyBox/Card.astro`,
      `${B}/design-system/blocks/conversion/BuyBox/Compact.astro`,
      `${B}/design-system/blocks/conversion/Faq/faq-items.ts`,
      `${B}/components/sections/01-utility-bar.astro`,
      `${B}/pages/legal/devoluciones.astro`,
    ]) {
      expect(read(f), `${f} bypasses lib/policy`).toMatch(/@\/lib\/policy/);
    }
    // /legal/envios reads merchant directly — it is a legal page stating the
    // carrier and the estimate, and both are merchant fields verbatim with no
    // derivation. Asserted explicitly so the exception is a decision, not a gap.
    const envios = stripComments(read(`${B}/pages/legal/envios.astro`));
    expect(envios).toMatch(/merchant\.shippingEtaLabel/);
    expect(envios).toMatch(/merchant\.carrierName/);
  });
});

describe('the Content Agent is not a source of commercial policy', () => {
  test('the boundary holds: it still knows nothing about merchant', () => {
    // Deliberately NOT relaxed. The Content Agent generates product copy; the
    // deterministic layer combines it with merchant policy afterwards, so the
    // model never needs — and never receives — seller identity or config.
    expect(read('scripts/generate-content.mjs')).not.toMatch(/merchant/i);
  });

  test('the prompt forbids policy claims in every free-text field', () => {
    const agent = read('scripts/generate-content.mjs');
    expect(agent).toMatch(/NUNCA generes políticas comerciales/);
    for (const topic of [/devoluci/i, /garantía/i, /reembolso/i, /envío/i]) {
      expect(agent, `prompt does not name ${topic}`).toMatch(topic);
    }
    // And the FAQ scope is stated, since free prose was the hardest vector.
    expect(agent).toMatch(/FAQ que generás es de PRODUCTO/);
  });

  test('the few-shot no longer TEACHES a policy', () => {
    // The example is the strongest instruction in the prompt. It carried
    // `days: 30`, a free-shipping threshold and a guarantee FAQ answer, and the
    // model copied all three.
    const example = JSON.parse(read('scripts/example-content.json'));
    expect(example.product.guarantee).toBeUndefined();
    expect(example.product.shipping).toBeUndefined();

    const free = [
      ...(example.product.badges ?? []),
      ...(example.product.trustTicker ?? []),
      ...example.faq.flatMap((f: { question: string; answer: string }) => [f.question, f.answer]),
    ].join(' ');
    for (const claim of [/garant/i, /devoluc/i, /reembols/i, /\bd[íi]as\b/i, /env[íi]o gratis/i]) {
      expect(free, `few-shot still teaches ${claim}`).not.toMatch(claim);
    }
  });
});

describe('no shipped asset carries a baked policy', () => {
  test('the 30-day seal is gone and nothing references it', () => {
    // public/sello-garantia.webp had "GARANTIA 30 DIAS" rendered into its
    // pixels, so it contradicted any merchant whose window was not 30 and could
    // never be derived from config. The crest is ICONS.shield now.
    expect(() => read('content/landing-base/public/sello-garantia.webp')).toThrow();
    const guarantee = read(`${B}/design-system/blocks/conversion/Guarantee/Default.astro`);
    expect(stripComments(guarantee)).not.toMatch(/sello-garantia/);
    expect(guarantee).toMatch(/ICONS\.shield/);
  });

  test('the crest is labelled from a fact, never from a hardcoded day count', () => {
    const code = stripComments(
      read(`${B}/design-system/blocks/conversion/Guarantee/Default.astro`),
    );
    expect(code).toMatch(/aria-label=\{headline\}/);
    expect(code, 'a literal day count came back').not.toMatch(/\d+\s*días/);
  });
});

describe('Ready requires policy; Preview invents none', () => {
  test('the returns window and who pays are BOTH required for a configured merchant', async () => {
    const merchantLib = await import('../../scripts/lib/merchant.mjs');
    expect(merchantLib.MERCHANT_REQUIRED_FIELDS).toContain('returnsWindowDays');
    expect(merchantLib.MERCHANT_REQUIRED_FIELDS).toContain('returnShippingPaidBy');
    expect(merchantLib.MERCHANT_REQUIRED_FIELDS).toContain('shippingEtaLabel');
  });

  test('the template default is still null — preview has no policy to state', () => {
    const data = read(`${B}/data/merchant.ts`);
    expect(data).toMatch(/export const merchant: Merchant \| null = null;/);
  });

  test('every policy surface guards on absence rather than defaulting', () => {
    // A `?? 30` anywhere here would be the whole defect, restored.
    for (const f of [
      `${B}/design-system/blocks/conversion/Guarantee/Default.astro`,
      `${B}/design-system/blocks/conversion/BuyBox/Card.astro`,
      `${B}/design-system/blocks/conversion/BuyBox/Compact.astro`,
      `${B}/components/sections/01-utility-bar.astro`,
      `${B}/lib/policy.ts`,
    ]) {
      const code = stripComments(read(f));
      expect(code, `${f} defaults a policy fact`).not.toMatch(/\?\?\s*\d/);
      expect(code, `${f} hardcodes a day count`).not.toMatch(/\b(14|30)\s*días/);
    }
  });
});

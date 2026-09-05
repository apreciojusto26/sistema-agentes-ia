// THE PRODUCT'S NAME: a factual title, preserved, and a rendered form derived
// from it.
//
// ─── THE PROBLEM THE FIRST REAL LANDING SHOWED ─────────────────────────────
//
// The scrape's title was 156 characters of keyword field:
//
//   "Tubo de luz de tubo colorido, luz RGB de 17cm/32cm, luz nocturna USB,
//    palo de luz azul púrpura, lámpara de habitación, luz de relleno colgante
//    de mano, foto"
//
// Factual, and unusable in a cart line or in the sticky purchase bar, which
// renders "{n}x {name}" on one `whitespace-nowrap` line.
//
// ─── AND THE ANSWER THAT WAS NOT ACCEPTABLE ────────────────────────────────
//
// Asked for a product name for that exact listing, Gemini produced
// "LuminArt — Tubo de Luz LED RGB Portátil" — a company that does not exist,
// welded to a description. It reached `.generation.json` as the product's name
// while the landing itself correctly shipped the factual title. Same defect as
// the invented "LumiFlex" brand, one field over: identity is not a writing
// task.
//
// ─── WHAT MAKES THE DERIVATION SAFE ────────────────────────────────────────
//
// One invariant, asserted rather than hoped: EVERY WORD of the display name
// appears in the source title, in order. No rule in display-name.mjs can
// produce a word the source did not contain, so invention is structurally
// impossible rather than merely discouraged.
import { describe, test, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  deriveDisplayName,
  isDerivedFrom,
  DISPLAY_NAME_MAX_CHARS,
} from '../../scripts/lib/display-name.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const TEMPLATE = path.join(REPO_ROOT, 'content/landing-astravibe');

/** The real one, from the run that started this. */
const REAL_TITLE =
  'Tubo de luz de tubo colorido, luz RGB de 17cm/32cm, luz nocturna USB, palo de luz azul ' +
  'púrpura, lámpara de habitación, luz de relleno colgante de mano, foto';

/** What the model offered instead, and must never be reachable. */
const INVENTED = 'LuminArt — Tubo de Luz LED RGB Portátil';

// ───────────────────────────────────────────────────────────────────────────
// THE INVARIANT
// ───────────────────────────────────────────────────────────────────────────

describe('a display name is a narrowing of the source title, never a rewrite', () => {
  const TITLES = [
    REAL_TITLE,
    'Almohada cervical de espuma viscoelástica para dormir de lado, funda lavable, soporte ortopédico',
    '2024 New 2pcs Mini Proyector Estrellas Galaxia LED USB Luz Nocturna Habitación Decoración',
    'Free Shipping! Hot Sale Wireless Bluetooth Earbuds TWS 5.3',
    '🔥 OFERTA - Set de 3 sartenes antiadherentes de aluminio fundido con mango de baquelita',
    'Cafetera',
    'Cable USB-C 2m | Carga rápida 65W | Nylon trenzado · Negro',
  ];

  test.each(TITLES)('every word comes from the source: %s', (title) => {
    const name = deriveDisplayName(title);
    expect(name, 'the derivation produced nothing').not.toBe('');
    expect(
      isDerivedFrom(name, title),
      `"${name}" contains a word the source title never had`,
    ).toBe(true);
  });

  test('the invariant REJECTS the name the model actually proposed', () => {
    // The probe that makes every assertion above mean something. "LuminArt"
    // appears nowhere in the listing, so no derivation can reach it.
    expect(isDerivedFrom(INVENTED, REAL_TITLE)).toBe(false);
    expect(deriveDisplayName(REAL_TITLE)).not.toContain('LuminArt');
  });

  test('and it rejects a word merely REORDERED out of the source', () => {
    // Order is part of the claim: "luz nocturna USB" and "USB luz nocturna"
    // are different phrases, and a derivation that reorders is authoring.
    expect(isDerivedFrom('nocturna Tubo', REAL_TITLE)).toBe(false);
  });

  test('the real title yields something a cart line can render', () => {
    const name = deriveDisplayName(REAL_TITLE);
    expect(name).toBe('Tubo de luz de tubo colorido');
    expect(name.length).toBeLessThanOrEqual(DISPLAY_NAME_MAX_CHARS);
    // It is CLUMSY, and that is the trade. Making it elegant means writing.
    expect(REAL_TITLE.length).toBeGreaterThan(150);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// THE RULES, ONE AT A TIME
// ───────────────────────────────────────────────────────────────────────────

describe('the derivation is deterministic and does exactly what it says', () => {
  test('it is a pure function of the title', () => {
    expect(deriveDisplayName(REAL_TITLE)).toBe(deriveDisplayName(REAL_TITLE));
  });

  test('leading marketplace noise is removed, from a CLOSED list', () => {
    expect(deriveDisplayName('2024 New 2pcs Mini Proyector Estrellas')).toBe('Mini Proyector Estrellas');
    expect(deriveDisplayName('Free Shipping! Hot Sale Wireless Earbuds')).toBe('Wireless Earbuds');
    expect(deriveDisplayName('🔥 Set de sartenes')).toBe('Set de sartenes');
    // NOT a general "remove marketing words" sweep, which would eventually eat
    // a real product noun. A promo word in the MIDDLE is left alone.
    expect(deriveDisplayName('Lámpara de sal Hot para escritorio')).toContain('Hot');
  });

  test('it cuts at the first keyword separator', () => {
    expect(deriveDisplayName('Cable USB-C 2m | Carga rápida 65W | Nylon')).toBe('Cable USB-C 2m');
    expect(deriveDisplayName('Taza térmica; acero inoxidable; 500ml')).toBe('Taza térmica');
  });

  test('it never ends on a connective', () => {
    // "Tubo de luz de" reads as a truncation bug rather than as a name.
    for (const title of [
      'Soporte de pared para televisor de 55 pulgadas orientable e inclinable',
      REAL_TITLE,
    ]) {
      expect(deriveDisplayName(title)).not.toMatch(/\s(de|del|con|para|y|o|en|la|el|un|una)$/i);
    }
  });

  test('it never cuts mid-word', () => {
    const long = 'Organizador multifuncional plegable para armario dormitorio salón y entrada';
    const name = deriveDisplayName(long);
    expect(name.length).toBeLessThanOrEqual(DISPLAY_NAME_MAX_CHARS);
    expect(long.startsWith(name)).toBe(true);
    // The character after the cut is a space, so a whole word survived.
    expect(long[name.length] === ' ' || long.length === name.length).toBe(true);
  });

  test('a title shorter than the budget is untouched', () => {
    expect(deriveDisplayName('Cafetera italiana 6 tazas')).toBe('Cafetera italiana 6 tazas');
  });

  test('it never returns empty for a title that has content', () => {
    // Absence of a name is not an option here — a cart line has to say
    // something — so a title made ENTIRELY of noise keeps the original.
    for (const title of ['Hot Sale', 'NUEVO', '2pcs']) {
      expect(deriveDisplayName(title), `${title} produced nothing`).not.toBe('');
    }
    expect(deriveDisplayName('')).toBe('');
    expect(deriveDisplayName(null as unknown as string)).toBe('');
  });

  test('the budget comes from a real consumer, not from taste', () => {
    // 08-sticky-bar renders `{units}x {displayName}` on one nowrap line beside
    // the CTA. If that constraint ever disappears, the number should be
    // re-derived rather than kept out of habit.
    const bar = readFileSync(
      path.join(TEMPLATE, 'src/components/islands/StickyAddToCart.tsx'),
      'utf-8',
    );
    expect(bar).toContain('whitespace-nowrap');
    expect(bar).toMatch(/\{projection\.totalUnits\}x \{product\.displayName\}/);
    expect(DISPLAY_NAME_MAX_CHARS).toBe(40);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// THE AUTHORITY CHAIN, THROUGH THE REAL GENERATOR
// ───────────────────────────────────────────────────────────────────────────

describe('the source title is preserved and the model never names the product', () => {
  const FIX = path.join(REPO_ROOT, 'admin/test/fixtures');
  const SCRAPE = path.join(FIX, 'e2e/scrape');

  test('the landing ships BOTH: the title verbatim and the narrowed form', () => {
    const out = path.join(REPO_ROOT, 'outputs', 'zz-display-name');
    rmSync(out, { recursive: true, force: true });
    const r = spawnSync(
      process.execPath,
      [
        path.join(REPO_ROOT, 'scripts/generate-landing.mjs'),
        '--slug', 'zz-display-name',
        '--content', path.join(FIX, 'fixed/content.json'),
        '--product', path.join(SCRAPE, 'canonical-product.json'),
        '--images', path.join(SCRAPE, 'images'),
        '--merchant', path.join(FIX, 'fixed/merchant.json'),
        '--force',
      ],
      { cwd: REPO_ROOT, encoding: 'utf-8' },
    );
    try {
      expect(r.status, r.stderr).toBe(0);
      const emitted = readFileSync(path.join(out, 'src/data/product.ts'), 'utf-8');
      const name = JSON.parse(/^  name: ("(?:[^"\\]|\\.)*")/m.exec(emitted)![1]) as string;
      const display = JSON.parse(/^  displayName: ("(?:[^"\\]|\\.)*")/m.exec(emitted)![1]) as string;

      const canonical = JSON.parse(readFileSync(path.join(SCRAPE, 'canonical-product.json'), 'utf-8')) as {
        identity: { name: string };
      };
      // THE SOURCE TITLE IS THE SCRAPE'S, byte for byte. Never shortened in
      // place to obtain a prettier one.
      expect(name).toBe(canonical.identity.name);
      expect(isDerivedFrom(display, name)).toBe(true);

      // And the manifest records the ASSEMBLER's name, not the Content Agent's
      // — it used to read the model's document, which is how "LuminArt" got
      // written down as this product's name.
      const manifest = JSON.parse(readFileSync(path.join(out, '.generation.json'), 'utf-8')) as {
        productName: string;
        productDisplayName: string;
      };
      expect(manifest.productName).toBe(name);
      expect(manifest.productDisplayName).toBe(display);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  }, 60_000);

  test('the emitter reads the assembler for both, never the content document', () => {
    const emitter = readFileSync(path.join(REPO_ROOT, 'scripts/generate-landing.mjs'), 'utf-8');
    expect(emitter).toContain('`  name: ${serialize(fixed.identity.name, 2, 1)},`');
    expect(emitter).toContain('`  displayName: ${serialize(fixed.identity.displayName, 2, 1)},`');
    expect(emitter).toContain('productName: resolvedSourceTitle');
  });

  test('the assembler derives it — the Content Agent has no say', () => {
    const assembler = readFileSync(path.join(REPO_ROOT, 'scripts/lib/fixed-product-data.mjs'), 'utf-8');
    expect(assembler).toContain("import { deriveDisplayName } from './display-name.mjs';");
    expect(assembler).toMatch(/displayName: deriveDisplayName\(sourceTitle\) \|\| sourceTitle,/);
    // `contentOutput.name` survives only as the legacy path's last resort,
    // where there is no scrape at all.
    expect(assembler).toMatch(/canonicalProduct\?\.identity\?\.name \?\? canonicalProduct\?\.name \?\? contentOutput\.name/);
  });

  test('analytics keeps the factual title — a record is not a label', () => {
    // An item name in a report has to be joinable against the source. The
    // VISIBLE surfaces narrow; this one does not.
    const confirmation = readFileSync(
      path.join(TEMPLATE, 'src/components/islands/OrderConfirmation.tsx'),
      'utf-8',
    );
    expect(confirmation).toMatch(/item_name: product\.name/);
    expect(confirmation).toMatch(/Empaquetamos tu \$\{product\.displayName\}/);
  });
});

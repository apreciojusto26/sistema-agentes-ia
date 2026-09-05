// NO PRODUCT SURVIVES ITS OWN TEMPLATE.
//
// The first real landing — an RGB light tube — was generated, built, checked
// and reported READY while its H1 read "24 ambientes. Un solo proyector.", its
// how-it-works section read "Cómo usar mi Astra Vibe", its purchase bar sold
// "1x Astra Vibe", and its social card pointed at
// https://astravibe.bamzuk.com/og-cover.png. None of that came from the
// product, the scrape, or the Content Agent. It came from the TEMPLATE, which
// is copied verbatim into every landing this system will ever produce.
//
// ─── WHY THIS IS A SOURCE TEST, AND NOT A SCAN OF GENERATED COPY ───────────
//
// A regex over a rendered landing looking for suspicious words is a heuristic,
// and it fails in both directions. A real customer review saying "todo llegó
// perfecto" is not contamination; a landing that legitimately sells a
// projector would trip every word on any list. Worse, it can only ever notice
// AFTER a landing has been produced.
//
// This asserts the thing that is actually true and actually checkable: THE
// LITERALS ARE NOT IN THE TEMPLATE. A product-specific sentence that exists
// nowhere in the source cannot be rendered by any product, in any run, ever —
// and the check costs nothing and runs before anything is generated.
//
// ─── WHAT COUNTS AS A RESIDUAL ─────────────────────────────────────────────
//
// Only PRODUCT-SPECIFIC copy, in files that actually render. The audit that
// produced this list classified every match in the template into four buckets,
// and three of them are deliberately not here:
//
//   PRODUCT-SPECIFIC   the star projector's own copy. Removed — this file.
//   GENERIC UI COPY    "Comprar ahora", "Característica", "Otros". Hardcoded
//                      on purpose: it is true of every product, and turning it
//                      into a data slot would ask a model to write a sentence
//                      the layout already knows.
//   MERCHANT/LEGAL     the seller's name, tax id, address. Real facts about a
//                      real operator; not the product's, and not a residual.
//   TEST/HISTORICAL    fixtures, and the comments that record what was removed
//                      and why. Comments are stripped before scanning, because
//                      a rule that forbids naming the defect forbids explaining
//                      it — and the explanation is the thing that stops it
//                      coming back.
import { describe, test, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { structuralFingerprint } from '../../scripts/lib/fingerprint.mjs';
import { FIXED_GRAMMAR_V3, FIXED_OPTIONAL_SLOTS_V3 } from '../../scripts/lib/fixed-grammar-v3.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const TEMPLATE = path.join(REPO_ROOT, 'content/landing-astravibe');

/**
 * The render surface: everything that produces markup a buyer sees.
 *
 * `src/data` is deliberately absent. It is the PAYLOAD — the template's own
 * product.ts describes the star projector because the template IS the star
 * projector's landing, and the generator overwrites every one of those modules
 * per product. `src/lib` is absent for the same reason its `astravibe:` storage
 * keys are: that namespace is a separate, documented decision with its own
 * migration, and it is not rendered copy.
 */
const RENDER_DIRS = ['src/components', 'src/layouts', 'src/pages'];

/** Everything a buyer could read, minus the commentary explaining the fix. */
function renderedCode(file: string): string {
  return readFileSync(file, 'utf-8')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '') // Astro/JSX comment expressions
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\/\/.*$/gm, '');
}

function renderFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.(astro|tsx|ts)$/.test(entry)) continue;
      if (/\.test\.tsx?$/.test(entry)) continue; // TEST/HISTORICAL
      out.push(full);
    }
  };
  for (const rel of RENDER_DIRS) walk(path.join(TEMPLATE, rel));
  return out;
}

/**
 * The literals the audit found, each one unmistakably about the star projector.
 *
 * `AstraVibe` as a bare token is NOT on this list and that is deliberate: it is
 * the name of the sealed grammar (ASTRAVIBE_FIXED_STRUCTURAL_GRAMMAR_V*), which
 * is an identifier for this template's structure rather than a claim about any
 * product. The identifier is matched around instead.
 */
const RESIDUALS: Array<{ pattern: RegExp; what: string }> = [
  { pattern: /Astra\s+Vibe/, what: 'the star projector\'s product name' },
  { pattern: /24 ambientes/, what: 'the star projector\'s headline' },
  { pattern: /Un solo proyector/, what: 'the star projector\'s headline' },
  { pattern: /proyector/i, what: 'the star projector\'s product category' },
  { pattern: /proyecci[óo]n(es)?\b/i, what: 'the star projector\'s feature' },
  { pattern: /cielo estrellado/i, what: 'the star projector\'s promise' },
  { pattern: /gal[áa]xia|galaxias/i, what: 'the star projector\'s promise' },
  { pattern: /l[áa]mparas decorativas comunes/i, what: 'the star projector\'s rival category' },
  { pattern: /pel[íi]culas intercambiables/i, what: 'the star projector\'s accessory' },
  { pattern: /astravibe\.bamzuk\.com/i, what: 'the star projector\'s domain' },
];

describe('no product-specific copy is hardcoded in the render surface', () => {
  const files = renderFiles();

  test('the scan actually found the template to scan', () => {
    // A walk that silently found nothing would pass every assertion below.
    expect(files.length).toBeGreaterThan(30);
    expect(files.some((f) => f.endsWith('03-hero.astro'))).toBe(true);
    expect(files.some((f) => f.endsWith('Base.astro'))).toBe(true);
  });

  test.each(RESIDUALS)('$what is gone', ({ pattern, what }) => {
    const hits: string[] = [];
    for (const file of files) {
      const code = renderedCode(file);
      for (const [i, line] of code.split('\n').entries()) {
        if (pattern.test(line)) hits.push(`${path.relative(TEMPLATE, file)}:${i + 1}  ${line.trim()}`);
      }
    }
    expect(hits, `${what} is still hardcoded:\n${hits.join('\n')}`).toEqual([]);
  });

  test('the probe is real — it fires on a line that carries a residual', () => {
    // A scan whose patterns match nothing anywhere proves nothing. This is the
    // exact H1 that shipped on a light tube.
    const shipped = '24 ambientes.<br />Un solo proyector.';
    expect(RESIDUALS.some((r) => r.pattern.test(shipped))).toBe(true);
  });

  test('and the comment stripper does not blind the scan to real markup', () => {
    // Comments are stripped so the template can explain what was removed. If
    // the stripper ate real code, every assertion above would pass vacuously.
    const sample = renderedCode(path.join(TEMPLATE, 'src/components/sections/03-hero.astro'));
    expect(sample).toContain('{product.tagline}');
    expect(sample).not.toContain('24 ambientes');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// THE DOMAIN
// ───────────────────────────────────────────────────────────────────────────

describe('the template names no site of its own', () => {
  test('astravibe.bamzuk.com appears in no production module', () => {
    // It was `site:` in astro.config.mjs, so Base.astro resolved EVERY absolute
    // URL — canonical, og:image, og:url — against it. And it was
    // `legal.identity.site`, so a light tube's legal notice stated, as a fact
    // under LSSI-CE art. 10, that it was served from the projector's domain.
    //
    // Both are gone, and the authority is SITE_URL: the origin this repo
    // already resolves for payment callbacks. A landing has ONE origin.
    const roots = [
      path.join(TEMPLATE, 'astro.config.mjs'),
      path.join(TEMPLATE, 'src/data/legal.ts'),
      ...renderFiles(),
    ];
    const hits = roots.filter((f) => existsSync(f) && /astravibe\.bamzuk\.com/i.test(renderedCode(f)));
    expect(hits.map((f) => path.relative(REPO_ROOT, f))).toEqual([]);
  });

  test('and `site` is read from SITE_URL, with no fallback of any kind', () => {
    const config = readFileSync(path.join(TEMPLATE, 'astro.config.mjs'), 'utf-8');
    expect(config).toMatch(/process\.env\.SITE_URL/);
    // `||` or `??` after the read would be a fallback, which is how a template
    // domain becomes every product's domain. Absent must stay absent.
    expect(config).not.toMatch(/process\.env\.SITE_URL[^\n]*(\|\||\?\?)\s*['"`]/);
    // Spread rather than `site: undefined` — an absent key, which is the state
    // Astro documents for "this landing has no domain yet".
    expect(config).toMatch(/\.\.\.\(site \? \{ site \} : \{\}\)/);
  });

  test('a value that is not an https origin is refused, not shipped', async () => {
    // Astro would accept any string here and emit it into every canonical and
    // OG URL on the page. The rules are the ones src/lib/site-origin.ts already
    // enforces at runtime for payment callbacks, applied at config time.
    const configPath = path.join(TEMPLATE, 'astro.config.mjs');
    const source = readFileSync(configPath, 'utf-8');
    const body = /function configuredSite\(\) \{[\s\S]*?\n\}/.exec(source)?.[0];
    expect(body, 'configuredSite() is gone — this test is checking nothing').toBeTruthy();

    const configuredSite = new Function(
      'process',
      `${body}\nreturn configuredSite;`,
    )({ env: {} }) as () => string | undefined;
    const withEnv = (SITE_URL: string | undefined) =>
      (new Function('process', `${body}\nreturn configuredSite;`)({ env: { SITE_URL } }) as () => string | undefined)();

    expect(configuredSite(), 'no SITE_URL means no site').toBeUndefined();
    expect(withEnv(''), 'an empty SITE_URL is absence, not an origin').toBeUndefined();
    expect(withEnv('https://tienda.example')).toBe('https://tienda.example');
    expect(withEnv('http://localhost:4321')).toBe('http://localhost:4321');

    for (const bad of [
      'not-a-url',
      'http://tienda.example',                 // plaintext outside localhost
      'https://user:pw@tienda.example',        // credentials
      'https://tienda.example/una/ruta',       // more than an origin
      'https://tienda.example/?utm=1',
    ]) {
      expect(() => withEnv(bad), `${bad} was accepted as a site origin`).toThrow();
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// AND IN THE BUILT PAGE
// ───────────────────────────────────────────────────────────────────────────

const AB = (who: 'a' | 'b', mode: 'preview' | 'commerce') =>
  path.join(TEMPLATE, `dist-ab-${who}-${mode}/client/index.html`);

const AB_BUILT = (['a', 'b'] as const).every((w) =>
  (['preview', 'commerce'] as const).every((m) => existsSync(AB(w, m))),
);

describe.runIf(AB_BUILT)('a built landing advertises itself and nobody else', () => {
  test.each([
    ['a', 'preview'], ['a', 'commerce'], ['b', 'preview'], ['b', 'commerce'],
  ] as const)('%s %s emits no astravibe.bamzuk.com URL', (who, mode) => {
    expect(readFileSync(AB(who, mode), 'utf-8')).not.toMatch(/astravibe\.bamzuk\.com/i);
  });

  // THERE IS DELIBERATELY NO WORD-SCAN OF THE RENDERED COPY HERE, and the
  // reason is a real false positive rather than a principle stated in advance.
  //
  // Run over these builds, the residual list flagged "6 proyecciones" — a
  // VARIANT TITLE in the hermetic Shopify catalog these fixtures ship. Nothing
  // about it came from the template; a product that genuinely sells projections
  // is entitled to the word, exactly as a real customer review is entitled to
  // say "todo llegó perfecto".
  //
  // That is the heuristic trap. A scan of generated output cannot tell a
  // product's own vocabulary from a previous product's leftovers, so it must
  // either miss residuals or reject honest copy. The SOURCE scan above has no
  // such ambiguity: a sentence that exists nowhere in the template cannot be
  // rendered by anything.
  //
  // The domain is different, and that is why it stays. No product's data
  // contains a host — a host in the output can only have come from the
  // template's own configuration.
});

// ───────────────────────────────────────────────────────────────────────────
// AND NONE OF IT WAS A STRUCTURAL CHANGE
// ───────────────────────────────────────────────────────────────────────────
//
// Every replacement above swapped TEXT. No element was added, removed, wrapped
// or made conditional — the `<br />` in the hero and in the how-it-works
// heading were kept for exactly that reason, even where the new sentence did
// not need one.
//
// That claim has to be MEASURED, not asserted, because "I only changed text"
// is what everyone believes right up until a heading gets a wrapper span. The
// sealed grammars are the instrument: V1 and V2 still hash to their own seals
// (contract.fixed-grammar-v3.test.ts), and the pages built from this template
// still fingerprint identically to each other. No new grammar version was
// created for these edits, and none was needed.

describe.runIf(AB_BUILT)('replacing copy is not a structural change', () => {
  const fp = (p: string) =>
    structuralFingerprint(readFileSync(p, 'utf-8'), FIXED_GRAMMAR_V3, FIXED_OPTIONAL_SLOTS_V3);

  test('two products still fingerprint identically after the copy moved to data', () => {
    // The premise of the whole Fixed architecture, re-measured on builds
    // produced AFTER the H1, the buy-box paragraph, the how-it-works heading,
    // the comparison heading and both logos changed.
    expect(fp(AB('a', 'preview')).hash).toBe(fp(AB('b', 'preview')).hash);
    expect(fp(AB('a', 'commerce')).hash).toBe(fp(AB('b', 'commerce')).hash);
  });

  test('and rewriting the H1 and the H2 by hand does not move the hash', () => {
    // The direct form of the claim: take the real built page, change the two
    // headings this fix pack touched, and require the fingerprint to hold.
    const page = readFileSync(AB('a', 'preview'), 'utf-8');
    const base = structuralFingerprint(page, FIXED_GRAMMAR_V3, FIXED_OPTIONAL_SLOTS_V3).hash;

    const h1 = /(<h1[^>]*>[\s\S]*?<\/h1>)/.exec(page)?.[1];
    expect(h1, 'no h1 in the built page — this test is checking nothing').toBeTruthy();
    const rewritten = page.replace(
      h1!,
      h1!.replace(/>([^<>]+)</g, (m, text: string) => (text.trim() ? '>OTRA COSA<' : m)),
    );
    expect(rewritten, 'the h1 rewrite was a no-op').not.toBe(page);
    expect(structuralFingerprint(rewritten, FIXED_GRAMMAR_V3, FIXED_OPTIONAL_SLOTS_V3).hash).toBe(base);

    // And an H2: the how-it-works heading's sibling paragraph is data too.
    const h2 = /(<h2[^>]*>[\s\S]*?<\/h2>)/.exec(page)?.[1];
    expect(h2).toBeTruthy();
    const both = rewritten.replace(
      h2!,
      h2!.replace(/>([^<>]+)</g, (m, text: string) => (text.trim() ? '>UN TÍTULO DISTINTO<' : m)),
    );
    expect(both).not.toBe(rewritten);
    expect(structuralFingerprint(both, FIXED_GRAMMAR_V3, FIXED_OPTIONAL_SLOTS_V3).hash).toBe(base);
  });

  test('while REMOVING the <br /> the copy kept WOULD move it', () => {
    // The calibration. The line breaks were preserved on purpose; this shows
    // that dropping one is a structural change the seal would have caught, so
    // "only text moved" is a measured claim rather than a hopeful one.
    const page = readFileSync(AB('a', 'preview'), 'utf-8');
    const base = structuralFingerprint(page, FIXED_GRAMMAR_V3, FIXED_OPTIONAL_SLOTS_V3).hash;
    const stripped = page.replace('<br>', '');
    expect(stripped, 'no <br> in the built page — this probe is wrong').not.toBe(page);
    expect(structuralFingerprint(stripped, FIXED_GRAMMAR_V3, FIXED_OPTIONAL_SLOTS_V3).hash).not.toBe(base);
  });
});

// THE FIXED E2E FIXTURE, AND WHAT IT PROVES.
//
// The old E2E fixture was `minimal-content.json` — one document standing in for
// every authority at once, which is precisely the confusion F3 took apart. A
// content-only fixture cannot describe a FixedProductData, because most of a
// FixedProductData is not content.
//
// So there are now FOUR, one per authority, and their names say who wrote them:
//
//   fixtures/fixed/content.json    the Content Agent — copy and narrative
//   fixtures/fixed/assets.json     the asset pipeline — gallery, clips, strip
//   fixtures/fixed/merchant.json   the operator — identity and commercial policy
//   (no link)                      preview; F3C's commerce link is the fourth
//
// A predecessor of this file, `fixtures/fixed-content.json`, was written as a
// single 9.5k monolith and is deleted rather than wired: it mixed all three
// authorities AND it invented media, referencing `video-02` and `video-03`,
// keys that exist in no images module. Those would have resolved to empty
// placeholders and rendered blank frames with no error — the exact silent
// degradation this suite exists to catch. Every media ref below resolves.
import { describe, test, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectContentErrors } from '../../scripts/lib/content-contract.mjs';
import { collectAssetOutputIssues } from '../../scripts/lib/fixed-asset-output.mjs';
import { collectMerchantIssues } from '../../scripts/lib/merchant.mjs';
import { assembleFixedProductData } from '../../scripts/lib/fixed-product-data.mjs';
import { projectFixedContent } from '../../scripts/lib/fixed-content-output.mjs';
import { structuralFingerprint } from '../../scripts/lib/fingerprint.mjs';
import { FIXED_GRAMMAR, FIXED_OPTIONAL_SLOTS } from '../../scripts/lib/fixed-grammar.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const F = (name: string) => path.join(REPO_ROOT, 'admin/test/fixtures/fixed', name);
const read = (p: string) => JSON.parse(readFileSync(p, 'utf-8'));

// ───────────────────────────────────────────────────────────────────────────
// EACH FIXTURE ANSWERS TO ITS OWN CONTRACT
// ───────────────────────────────────────────────────────────────────────────

describe('the Fixed E2E fixtures are separated by authority', () => {
  test('the content fixture satisfies the content contract, and nothing else', () => {
    expect(collectContentErrors(read(F('content.json')))).toEqual([]);
  });

  test('the content fixture states no media the asset pipeline owns', () => {
    // `gallery` is the exception, and it is a legacy one: it remains inside the
    // Content Agent's whitelist because removing it is a Version A-breaking
    // change, and scope-boundaries pins content-contract.mjs line for line. The
    // generator's split routes it to the asset authority anyway, so nothing
    // downstream reads it as content.
    const product = read(F('content.json')).product;
    expect(product).not.toHaveProperty('heroExtras');
    expect(product).not.toHaveProperty('ugcStrip');
    expect(product).not.toHaveProperty('shipping');
  });

  test('the asset fixture satisfies the asset contract', () => {
    expect(collectAssetOutputIssues(read(F('assets.json')))).toEqual([]);
  });

  test('every media ref resolves in the template images module', () => {
    // The defect the deleted monolith carried. resolveMedia() answers an
    // unknown key with an empty placeholder rather than an error, so a typo
    // renders a blank frame and a green build.
    const images = readFileSync(
      path.join(REPO_ROOT, 'content/landing-astravibe/src/data/images.ts'),
      'utf-8',
    );
    const keys = new Set([...images.matchAll(/^\s*'([^']+)':/gm)].map((m) => m[1]!));
    const assets = read(F('assets.json'));
    const refs = [
      ...assets.gallery,
      ...assets.heroExtras,
      ...assets.productMediaStrip,
      ...Object.values(assets.stepMedia ?? {}),
    ].map((m) => (m as { asset: string }).asset);
    expect(refs.length).toBeGreaterThan(0);
    expect(refs.filter((r) => !keys.has(r)), 'media refs that resolve to an empty placeholder').toEqual([]);
  });

  test('the merchant fixture satisfies the merchant contract and states a threshold', () => {
    const merchant = read(F('merchant.json'));
    expect(collectMerchantIssues(merchant)).toEqual([]);
    expect(merchant.freeShippingOverCents).toBe(4900);
  });

  test('the three compose into a FixedProductData', () => {
    const content = read(F('content.json'));
    // THROUGH THE PROJECTION, exactly as the generator does. Hand-destructuring
    // the Version A document here would test a composition no caller performs
    // and would quietly carry the packs decoy into the assembler.
    const fixed = assembleFixedProductData({
      canonicalProduct: { identity: { brand: content.product.brand, name: content.product.name } },
      contentOutput: projectFixedContent(content),
      assetOutput: read(F('assets.json')),
      merchantConfig: read(F('merchant.json')),
      shopifyProductLink: null,
    });
    expect(fixed.media.ugcStrip, 'the legacy template slot is fed from productMediaStrip').toHaveLength(3);
    expect(fixed.commercial.freeShippingOverCents).toBe(4900);
    expect(fixed.narrative.faq.length).toBeGreaterThan(0);
    expect(fixed.socialProof.reviews.length).toBeGreaterThan(0);
    // Preview is the absence of a link, stated rather than reached.
    expect(fixed.shopifyProductLink).toBeNull();
  });

  test('the content fixture keeps a packs slot, and it is inert', () => {
    // Version A's contract REQUIRES packs, so the Fixed content fixture must
    // still carry one to be a valid content.json at all. It is filled with a
    // decoy that could never render, and merchant.json holds the real bundles.
    const content = read(F('content.json'));
    expect(content.product.packs, 'the Version A compat slot vanished').toBeDefined();
    expect(projectFixedContent(content)).not.toHaveProperty('packs');
    expect(read(F('merchant.json')).packs.length).toBeGreaterThan(0);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// THE FIXTURE OBEYS THE SEALED GRAMMAR
// ───────────────────────────────────────────────────────────────────────────

describe('the comparison table closes on a shape the grammar seals', () => {
  test('the last row is text/text or false/false — never check/cross', () => {
    // NOT a cosmetic rule. FIXED_GRAMMAR seals exactly two CLOSING shapes for
    // comparison/rows (L01 text|text, L02 cross|cross) alongside four body
    // shapes. A table ending on a body shape does not collapse into its tuple
    // form, and the whole page then fingerprints differently — which is how
    // this fixture first missed the Preview profile by 26 elements.
    //
    // The grammar was NOT relaxed to accept it. The fixture was corrected,
    // because the grammar was describing the template accurately and the
    // fixture was the thing that was wrong.
    const rows = read(F('content.json')).product.comparison;
    const last = rows[rows.length - 1];
    const closes =
      (typeof last.ours === 'string' && typeof last.rival === 'string') ||
      (last.ours === false && last.rival === false);
    expect(closes, `the closing row ${JSON.stringify(last)} matches no sealed L-shape`).toBe(true);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// PROFILE CONFORMANCE — measured on real builds when they exist
// ───────────────────────────────────────────────────────────────────────────
//
// Reproduce with scripts/e2e/fixed-profile.sh. Gated the same way the A/B
// assertions are: outputs/ is not committed, so a checkout without the builds
// skips rather than failing on an artifact it was never given.

const T = path.join(REPO_ROOT, 'content/landing-astravibe');
const PROFILE = {
  preview: path.join(T, 'dist-ab-a-preview/client/index.html'),
  commerce: path.join(T, 'dist-ab-a-commerce/client/index.html'),
};
const GENERATED = {
  preview: path.join(REPO_ROOT, 'outputs/zz-fixed-preview/dist/client/index.html'),
  commerce: path.join(REPO_ROOT, 'outputs/zz-fixed-commerce/dist-commerce/client/index.html'),
};
/** The same product built with a different palette — F5's A/B. */
const RECOLOURED = path.join(REPO_ROOT, 'outputs/zz-fixed-preview-alt');

const fingerprint = (p: string) =>
  structuralFingerprint(readFileSync(p, 'utf-8'), FIXED_GRAMMAR, FIXED_OPTIONAL_SLOTS);

for (const mode of ['preview', 'commerce'] as const) {
  const ready = existsSync(PROFILE[mode]) && existsSync(GENERATED[mode]);

  describe.runIf(ready)(`a generated ${mode} landing matches the sealed ${mode} profile`, () => {
    test('same structural fingerprint, same element count', () => {
      // THE POINT OF THE WHOLE PHASE. A landing built by the assembler out of
      // four separated fixtures is structurally indistinguishable from the
      // sealed A/B profile — different product, different words, different
      // photographs, same page.
      const profile = fingerprint(PROFILE[mode]);
      const generated = fingerprint(GENERATED[mode]);
      expect(generated.elements).toBe(profile.elements);
      expect(generated.hash).toBe(profile.hash);
    });
  });
}

describe.runIf(existsSync(GENERATED.preview))('the generated preview sells nothing', () => {
  const page = () => readFileSync(GENERATED.preview, 'utf-8');

  test('no fabricated price', () => {
    expect(page()).not.toMatch(/0,00\s*€/);
  });

  test('no Shopify identity', () => {
    expect(page()).not.toMatch(/gid:\/\/shopify/);
  });

  test('the CTA states unavailability rather than offering a cart', () => {
    expect(page()).toContain('data-preview-cta="true"');
  });
});

describe.runIf(existsSync(GENERATED.commerce))('the generated commerce landing prices from Shopify', () => {
  test('the rendered price is the fixture Shopify price, and no other', () => {
    // 3400 cents lives only in the hermetic catalog fixture. Neither
    // content.json nor CanonicalProduct carries a price at all, so this number
    // cannot have leaked in from source data.
    const page = readFileSync(GENERATED.commerce, 'utf-8');
    expect(page).toMatch(/34,00\s*€/);
    expect(page).not.toMatch(/0,00\s*€/);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// A RECOLOUR CHANGES COLOURS AND NOTHING ELSE
// ───────────────────────────────────────────────────────────────────────────

describe.runIf(existsSync(path.join(RECOLOURED, 'dist/client/index.html')) && existsSync(GENERATED.preview))(
  'two palettes, one structure',
  () => {
    const cssOf = (root: string) => {
      const dir = path.join(root, 'dist/client/_astro');
      return readdirSync(dir)
        .filter((f) => f.endsWith('.css'))
        .map((f) => readFileSync(path.join(dir, f), 'utf-8'))
        .join('\n');
    };

    test('the two builds really do ship different colours', () => {
      // Asserted on the COMPILED stylesheet, not on the source token: a test
      // that only read global.css would pass even if the value never reached
      // the bundle.
      expect(cssOf(path.dirname(path.dirname(path.dirname(GENERATED.preview))))).toMatch(/#7c3aed/i);
      expect(cssOf(RECOLOURED)).toMatch(/#0f766e/i);
      expect(cssOf(RECOLOURED)).not.toMatch(/#7c3aed/i);
    });

    test('and both fingerprint identically to the sealed Preview profile', () => {
      const profile = fingerprint(PROFILE.preview);
      const plain = fingerprint(GENERATED.preview);
      const recoloured = fingerprint(path.join(RECOLOURED, 'dist/client/index.html'));
      expect(plain.hash).toBe(profile.hash);
      expect(recoloured.hash).toBe(profile.hash);
      expect(recoloured.elements).toBe(profile.elements);
    });
  },
);

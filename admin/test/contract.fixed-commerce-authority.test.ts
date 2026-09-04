// WHO DECIDES WHAT A BUYER SEES ABOUT PRICE AND STOCK.
//
// Preview and Commerce answer that differently, and the difference is the
// whole point of the split:
//
//   PREVIEW   nobody decides, because nothing is for sale. No Shopify, no
//             storefront token, and NO PRICE — the provider's number is not
//             this store's selling price. A preview that prints one to look
//             finished is inventing a commercial fact.
//
//   COMMERCE  Shopify decides, alone. Price, compare-at, variants, variant
//             ids, availability and cart identity all come from it, and there
//             is no fallback to source data. "Commerce requested -> Shopify
//             unavailable -> show scraped numbers" is the forbidden path.
//
// Asserted on the four hermetic A/B builds where they exist, and on source
// otherwise. No network, no credentials, no real .env.
import { describe, test, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const T = path.join(REPO_ROOT, 'content/landing-astravibe');

const build = (who: 'a' | 'b', mode: 'preview' | 'commerce') =>
  path.join(T, `dist-ab-${who}-${mode}/client/index.html`);
const BUILDS = (['a', 'b'] as const).every((w) =>
  (['preview', 'commerce'] as const).every((m) => existsSync(build(w, m))),
);
const html = (who: 'a' | 'b', mode: 'preview' | 'commerce') => readFileSync(build(who, mode), 'utf-8');

const src = (rel: string) =>
  readFileSync(path.join(T, 'src', rel), 'utf-8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*)/.test(l))
    .join('\n');

describe('preview sells nothing, and says so', () => {
  test('the mode is explicit, never inferred from missing credentials', () => {
    // Inference makes "the token is broken" and "this was never meant to sell"
    // indistinguishable, and the first has to stay a hard error.
    const catalog = src('lib/shopify/catalog.ts');
    expect(catalog).toMatch(/PUBLIC_COMMERCE_MODE\?\.trim\(\) === 'preview'/);
    expect(catalog).toMatch(/=== 'preview' \? 'preview' : 'shopify'/);
  });

  test('preview short-circuits BEFORE any Shopify call', () => {
    const catalog = src('lib/shopify/catalog.ts');
    const guard = catalog.indexOf("resolveCommerceMode() === 'preview'");
    const call = catalog.indexOf('await storefront<');
    expect(guard).toBeGreaterThan(-1);
    expect(guard, 'the preview check runs after the network call').toBeLessThan(call);
  });

  test('preview emits no variants, so no purchase control can resolve', () => {
    const fn = /function previewCommerce\(\)[\s\S]*?\n\}/.exec(src('lib/shopify/catalog.ts'))?.[0] ?? '';
    expect(fn.length).toBeGreaterThan(0);
    expect(fn).toMatch(/variants:\s*\[\]/);
    expect(fn).toMatch(/anyAvailable:\s*false/);
    expect(fn, 'preview fabricates a price').not.toMatch(/PriceCents:\s*\d/);
  });

  test.runIf(BUILDS).each(['a', 'b'] as const)('%s preview prints no fabricated price', (who) => {
    // The failure this guards: an empty variant list rendered through a
    // formatter that treats absence as zero, which puts "0,00 €" on a page
    // for a product nobody priced.
    expect(html(who, 'preview')).not.toMatch(/0,00\s*€/);
  });

  test.runIf(BUILDS).each(['a', 'b'] as const)('%s preview offers no real purchase control', (who) => {
    const page = html(who, 'preview');
    expect(page).toContain('data-preview-cta="true"');
    expect(page).toContain('compra no disponible');
    // The sticky bar is absent rather than disabled: a control that cannot do
    // its one job should not follow the visitor down the page.
    //
    // Checked against RENDERED text, not the raw file. Astro serializes every
    // island's props into an <astro-island props="..."> attribute, so the CTA
    // label is present in the HTML source even when the component returns
    // null. Asserting on the whole file would fail on a page that is correct.
    const rendered = page.replace(/props="[^"]*"/g, '');
    expect(rendered).not.toMatch(/Agregar al carrito|Añadir al carrito/);
  });

  test.runIf(BUILDS).each(['a', 'b'] as const)('%s preview invents no Shopify identity', (who) => {
    // No variant gids, no handles — nothing that would look like a real
    // Shopify product to anything reading the page.
    expect(html(who, 'preview')).not.toMatch(/gid:\/\/shopify/);
  });
});

describe('commerce takes price and stock from Shopify, and only from Shopify', () => {
  test('the product handle is resolved per landing, never baked in', () => {
    const catalog = src('lib/shopify/catalog.ts');
    expect(catalog).toMatch(/PUBLIC_SHOPIFY_PRODUCT_HANDLE/);
    // The template's own handle is reachable only behind an explicit opt-in
    // that no generated output sets.
    expect(catalog).toMatch(/PUBLIC_SHOPIFY_TEMPLATE_COMPAT === '1'/);
    expect([...catalog.matchAll(/usb-mini-galaxy-star-projector/g)]).toHaveLength(1);
  });

  test.runIf(BUILDS)('the rendered price is the fixture Shopify price', () => {
    // Fixture A's DEFAULT variant is the 6-projection one at 3400 cents —
    // catalog.ts prefers it, which is itself part of the behaviour under test.
    // Nothing in CanonicalProduct or the product data carries a price at all,
    // so this number can only have come from the commerce layer.
    expect(html('a', 'commerce')).toMatch(/34,00\s*€/);
  });

  test.runIf(BUILDS)('a different Shopify price renders differently', () => {
    // Fixture B prices its default variant at 6900. If source data were
    // leaking in, both products would agree on a number neither configured.
    expect(html('b', 'commerce')).toMatch(/69,00\s*€/);
    expect(html('b', 'commerce')).not.toMatch(/34,00\s*€/);
  });

  test.runIf(BUILDS)('Shopify availability controls the purchase UI', () => {
    // Fixture B marks two of its four variants unavailable. Counted, not just
    // detected: exactly two radios carry aria-disabled, matching exactly the
    // two variants Shopify reports as unavailable.
    //
    // `aria-disabled` and not the class list, because two other things wear
    // the same clothes: `line-through` is also the compare-at strikethrough on
    // a discounted pack (A shows 68,00 struck to 61,20 with every variant in
    // stock), and `cursor-not-allowed` appears twice in A too. Availability is
    // the only thing being asserted here, so the marker has to mean only that.
    const disabledRadios = (who: 'a' | 'b') =>
      html(who, 'commerce').replace(/props="[^"]*"/g, '').match(/aria-disabled="true"/g)?.length ?? 0;
    expect(disabledRadios('b')).toBe(2);
    // And A, whose variants are all available, disables nothing.
    expect(disabledRadios('a')).toBe(0);
    expect(html('b', 'commerce').replace(/props="[^"]*"/g, '')).toContain('Agotado');
  });

  test('no code path substitutes source data for a Shopify price', () => {
    // The forbidden path, asserted at the boundary: the catalog either
    // returns preview's empty shape or Shopify's, and never merges them.
    const catalog = src('lib/shopify/catalog.ts');
    expect(catalog, 'a catch swallows a Shopify failure into a preview').not.toMatch(
      /catch[\s\S]{0,120}previewCommerce\(\)/,
    );
  });
});

describe('commerce fails closed', () => {
  test('a missing product handle throws instead of falling back', () => {
    const catalog = src('lib/shopify/catalog.ts');
    expect(catalog).toMatch(/throw new ShopifyError\(/);
    expect(catalog).toMatch(/Missing PUBLIC_SHOPIFY_PRODUCT_HANDLE/);
    expect(catalog, 'the error suggests a silent fallback exists').toMatch(
      /No silent fallback exists on purpose/,
    );
  });

  test('missing storefront credentials throw at the client boundary', () => {
    expect(src('lib/shopify/client.ts')).toMatch(/export function assertEnv\(\)/);
  });

  test('zero variants in commerce is still an error', () => {
    // Only preview may have none. In commerce an empty list means something
    // upstream failed, and it must stay loud.
    const selection = src('components/islands/parts/use-selection.ts');
    const previewReturn = selection.indexOf('if (isPreviewMode()) return null');
    const thrown = selection.indexOf("throw new Error('commerce.variants is empty");
    expect(previewReturn).toBeGreaterThan(-1);
    expect(thrown).toBeGreaterThan(-1);
    expect(previewReturn, 'the throw is unreachable').toBeLessThan(thrown);
  });
});

describe('the Fixed pipeline no longer depends on landing-base', () => {
  const generator = readFileSync(path.join(REPO_ROOT, 'scripts/generate-landing.mjs'), 'utf-8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*)/.test(l))
    .join('\n');

  test('the generator names one template, through the shared authority', () => {
    expect(generator).toMatch(/FIXED_TEMPLATE_RELATIVE/);
    expect(generator, 'the generator still names the experimental template').not.toMatch(
      /content\/landing-base/,
    );
  });

  test('admin resolves the same authority rather than its own literal', () => {
    const config = readFileSync(path.join(REPO_ROOT, 'admin/src/server/config.ts'), 'utf-8');
    expect(config).toMatch(/FIXED_TEMPLATE_NAME/);
    expect(config, 'admin declares its own template path').not.toMatch(/'landing-base'/);
  });

  test('the generator consumes no design spec', () => {
    for (const gone of ['designSpec', 'checkDesignSupport', 'buildDesignTs', "'--design'"]) {
      expect(generator, `the generator still references ${gone}`).not.toMatch(gone);
    }
  });

  test('but the palette path survives — recolouring is what Fixed DOES allow', () => {
    // patchThemeBlock reads content.json's `design` key, not a DesignSpec. It
    // rewrites custom-property values and never markup, which is exactly why
    // the structural fingerprint does not move when a product recolours.
    expect(generator).toMatch(/patchThemeBlock\(css, input\.design/);
  });
});

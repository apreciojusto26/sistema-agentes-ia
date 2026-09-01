// Contract tests for the DesignSpec v1 contract (agents.MD §5.7):
// scripts/lib/design-contract.mjs + scripts/lib/design-registry.mjs.
//
// No `scripts/lib/**` include glob exists in vitest.config.ts, so this lives
// under admin/test/ (already included) and imports the .mjs modules directly
// via a dynamic import() over their file:// URLs — the same pattern
// admin/test/product-normalizer.test.ts and admin/test/product-id.test.ts use.
//
// The thesis this file exists to prove: a future Design Agent cannot invent
// capabilities. Every capability-shaped input that is not registered must be
// REJECTED EXPLICITLY — never substituted, never approximated, never silently
// dropped.
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

const CONTRACT_URL = pathToFileURL(path.join(REPO_ROOT, 'scripts/lib/design-contract.mjs')).href;
const REGISTRY_URL = pathToFileURL(path.join(REPO_ROOT, 'scripts/lib/design-registry.mjs')).href;
const GLOBAL_CSS_PATH = path.join(REPO_ROOT, 'content/landing-base/src/styles/global.css');
const FIXTURES = path.join(__dirname, 'fixtures/design-spec');

const contract = await import(CONTRACT_URL);
const registryModule = await import(REGISTRY_URL);

function fixture(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path.join(FIXTURES, `${name}.json`), 'utf-8'));
}

/** Deep clone so per-test mutations never leak between cases. */
function mutate(
  name: string,
  fn: (spec: Record<string, any>) => void,
): Record<string, unknown> {
  const spec = fixture(name);
  fn(spec as Record<string, any>);
  return spec;
}

function codes(issues: Array<{ code: string }>): string[] {
  return issues.map((i) => i.code);
}

// A registry that declares constraints the PRODUCTION registry truthfully does
// not have yet (no section component takes props; no incompatibility rules
// have been established). Used only to prove the validation ENGINE handles
// them — these capabilities must never appear in the real registry.
const FIXTURE_REGISTRY = [
  {
    category: 'hero', type: 'Hero', variant: 'default', component: 'fixture',
    propsSchema: {}, familiesAllowed: '*', densityAllowed: '*',
    incompatibleWith: ['media/Gallery/immersive'],
  },
  {
    category: 'media', type: 'Gallery', variant: 'immersive', component: 'fixture',
    propsSchema: {}, familiesAllowed: '*', densityAllowed: '*', incompatibleWith: [],
  },
  {
    category: 'conversion', type: 'Cta', variant: 'default', component: 'fixture',
    propsSchema: {
      align: { type: 'string', enum: ['left', 'center'], required: true },
      compact: { type: 'boolean' },
    },
    familiesAllowed: ['premium'], densityAllowed: ['balanced', 'airy'], incompatibleWith: [],
  },
];

function fixtureSpec(sections: unknown[], overrides: Record<string, unknown> = {}) {
  return {
    schema: 1,
    productId: 'prd_msyyd9nm-e48bcce7',
    design: { family: 'premium', density: 'balanced' },
    sections,
    ...overrides,
  };
}

describe('DesignSpec v1 — contract (agents.MD §5.7)', () => {
  // --- 1. valid ------------------------------------------------------------
  describe('valid specs', () => {
    test('the full reference fixture passes with zero issues', () => {
      expect(contract.collectDesignErrors(fixture('valid'))).toEqual([]);
      expect(contract.checkDesignSupport(fixture('valid'))).toEqual({ status: 'pass' });
      expect(() => contract.validateDesignSpec(fixture('valid'))).not.toThrow();
    });

    test('theme is optional — a spec overriding no tokens is valid', () => {
      expect(contract.collectDesignErrors(fixture('valid-no-theme'))).toEqual([]);
      expect(contract.checkDesignSupport(fixture('valid-no-theme'))).toEqual({ status: 'pass' });
    });

    test('two sections may share a CATEGORY when their types differ (UgcStrip + ReviewsReel)', () => {
      const spec = fixtureSpec([
        { category: 'hero', type: 'Hero', variant: 'default', order: 0 },
        { category: 'socialProof', type: 'UgcStrip', variant: 'strip', order: 1 },
        { category: 'socialProof', type: 'ReviewsReel', variant: 'carousel', order: 2 },
        { category: 'conversion', type: 'BuyBox', variant: 'card', order: 3 },
      ]);
      expect(contract.collectDesignErrors(spec)).toEqual([]);
    });
  });

  // --- 2. schema -----------------------------------------------------------
  describe('schema', () => {
    test.each([[2], [0], ['1'], [null], [undefined]])('rejects schema %p', (bad) => {
      const spec = mutate('valid', (s) => { s.schema = bad; });
      expect(codes(contract.collectDesignErrors(spec))).toContain('schema-invalid');
    });

    test('a non-object spec is rejected, not coerced', () => {
      for (const bad of [null, 'x', 42, []]) {
        expect(codes(contract.collectDesignErrors(bad))).toContain('spec-not-object');
      }
    });
  });

  // --- 3/4. family + density ----------------------------------------------
  describe('design.family / design.density', () => {
    test('accepts every family agents.MD §5.1 registers', () => {
      for (const family of registryModule.DESIGN_FAMILIES) {
        const spec = mutate('valid', (s) => { s.design.family = family; });
        expect(contract.collectDesignErrors(spec), `family ${family}`).toEqual([]);
      }
    });

    test('accepts every registered density', () => {
      for (const density of registryModule.DESIGN_DENSITIES) {
        const spec = mutate('valid', (s) => { s.design.density = density; });
        expect(contract.collectDesignErrors(spec), `density ${density}`).toEqual([]);
      }
    });

    test('rejects an invented family', () => {
      const spec = mutate('valid', (s) => { s.design.family = 'cyberpunk'; });
      expect(codes(contract.collectDesignErrors(spec))).toContain('design-family-invalid');
    });

    test('rejects an invented density', () => {
      const spec = mutate('valid', (s) => { s.design.density = 'ultra-airy'; });
      expect(codes(contract.collectDesignErrors(spec))).toContain('design-density-invalid');
    });

    test('rejects unknown keys inside design (no silent acceptance)', () => {
      const spec = mutate('valid', (s) => { s.design.mood = 'dramatic'; });
      expect(codes(contract.collectDesignErrors(spec))).toContain('design-unknown-fields');
    });
  });

  // --- 5/6/7/10. capability existence -> unsupported_design ----------------
  describe('capability existence (agents.MD §6.3)', () => {
    test('unknown category is rejected as unsupported_design', () => {
      const spec = mutate('valid', (s) => { s.sections[1].category = 'storytelling'; });
      const issues = contract.collectDesignErrors(spec);
      expect(codes(issues)).toContain('section-unknown-category');
      expect(contract.checkDesignSupport(spec).status).toBe('unsupported_design');
    });

    test('unknown type is rejected as unsupported_design', () => {
      const spec = mutate('valid', (s) => { s.sections[0].type = 'ImmersiveHero'; });
      const issues = contract.collectDesignErrors(spec);
      expect(codes(issues)).toContain('section-unknown-type');
      expect(contract.checkDesignSupport(spec).status).toBe('unsupported_design');
    });

    test('unknown variant is rejected as unsupported_design', () => {
      // 'split' stood here and stopped being unknown when hero/Hero absorbed
      // hero/ProductHero/split as its second variant.
      const spec = mutate('valid', (s) => { s.sections[0].variant = 'immersive'; });
      const issues = contract.collectDesignErrors(spec);
      expect(codes(issues)).toContain('section-unknown-variant');
      expect(contract.checkDesignSupport(spec).status).toBe('unsupported_design');
    });

    test('unsupported_design names the exact missing capability', () => {
      const result = contract.checkDesignSupport(fixture('unsupported-capability'));
      expect(result.status).toBe('unsupported_design');
      expect(result.missingCapability).toBe('hero/ImmersiveHero/parallax');
    });

    test('a malformed document is "invalid", never "unsupported_design"', () => {
      const spec = mutate('valid', (s) => { s.design.family = 'cyberpunk'; });
      expect(contract.checkDesignSupport(spec).status).toBe('invalid');
    });
  });

  // --- 11. no silent fallback ---------------------------------------------
  describe('no silent fallback (the core guarantee)', () => {
    test('an unknown variant never resolves to another registered variant', () => {
      // 'hero/Hero/split' stood here until the hero taxonomy was unified and it
      // became REAL. Same trap the ProductHero line fell into one phase
      // earlier: an assertion that keeps passing while it stops testing
      // anything. Use a variant nothing declares.
      expect(registryModule.resolveCapability('hero', 'Hero', 'immersive')).toBeNull();
      expect(registryModule.resolveCapability('hero', 'NeverRegisteredHero', 'default')).toBeNull();
      expect(registryModule.resolveCapability('nope', 'Hero', 'default')).toBeNull();
    });

    test('checkDesignSupport has exactly three outcomes — none of them is a substitution', () => {
      const outcomes = [
        contract.checkDesignSupport(fixture('valid')).status,
        contract.checkDesignSupport(fixture('unsupported-capability')).status,
        contract.checkDesignSupport(mutate('valid', (s) => { s.schema = 9; })).status,
      ];
      expect(outcomes).toEqual(['pass', 'unsupported_design', 'invalid']);
    });

    test('unknown keys are reported at every level, never ignored', () => {
      const topLevel = mutate('valid', (s) => { s.motion = { hero: 'entrance' }; });
      expect(codes(contract.collectDesignErrors(topLevel))).toContain('spec-unknown-fields');

      const sectionLevel = mutate('valid', (s) => { s.sections[0].animation = 'fade'; });
      expect(codes(contract.collectDesignErrors(sectionLevel))).toContain('section-unknown-fields');

      const themeLevel = mutate('valid', (s) => { s.theme.spacing = { lg: '4rem' }; });
      expect(codes(contract.collectDesignErrors(themeLevel))).toContain('theme-unknown-group');
    });

    test('motion is NOT silently accepted — it is out of v1 scope by rejection, not omission', () => {
      const spec = mutate('valid', (s) => { s.motion = { hero: 'entrance', sections: 'scroll-reveal' }; });
      const issues = contract.collectDesignErrors(spec);
      expect(codes(issues)).toContain('spec-unknown-fields');
      expect(issues.find((i: any) => i.code === 'spec-unknown-fields').fields).toContain('motion');
    });
  });

  // --- 12/13. productId ----------------------------------------------------
  describe('productId (reuses isProductId — never re-implements PRODUCT_ID_RE)', () => {
    test('accepts a well-formed productId', () => {
      const spec = mutate('valid', (s) => { s.productId = 'prd_msyy80ue-7337e84b'; });
      expect(codes(contract.collectDesignErrors(spec))).not.toContain('product-id-invalid');
    });

    test.each([
      ['prd_BADCASE-e48bcce7'],
      ['prd_msyyd9nm-ZZZZZZZZ'],
      ['msyyd9nm-e48bcce7'],
      ['prd_msyyd9nm-e48bcce'],
      [''],
      [undefined],
      [null],
      [42],
    ])('rejects productId %p', (bad) => {
      const spec = mutate('valid', (s) => { s.productId = bad; });
      expect(codes(contract.collectDesignErrors(spec))).toContain('product-id-invalid');
    });

    test('productId is REQUIRED (unlike content.json\'s optional one — agents.MD §8)', () => {
      const spec = mutate('valid', (s) => { delete s.productId; });
      expect(codes(contract.collectDesignErrors(spec))).toContain('product-id-invalid');
    });
  });

  // --- structural invariants ----------------------------------------------
  describe('structural invariants', () => {
    test('hero is mandatory', () => {
      const spec = fixtureSpec([
        { category: 'conversion', type: 'BuyBox', variant: 'card', order: 0 },
      ]);
      expect(codes(contract.collectDesignErrors(spec))).toContain('hero-missing');
    });

    test('hero must be first', () => {
      const spec = fixtureSpec([
        { category: 'conversion', type: 'BuyBox', variant: 'card', order: 0 },
        { category: 'hero', type: 'Hero', variant: 'default', order: 1 },
      ]);
      expect(codes(contract.collectDesignErrors(spec))).toContain('hero-not-first');
    });

    test('at least one conversion section is required', () => {
      const spec = fixtureSpec([
        { category: 'hero', type: 'Hero', variant: 'default', order: 0 },
        { category: 'media', type: 'GalleryStrip', variant: 'strip', order: 1 },
      ]);
      expect(codes(contract.collectDesignErrors(spec))).toContain('conversion-missing');
    });

    test('a type may appear at most once (exactly one variant per slot)', () => {
      const spec = fixtureSpec([
        { category: 'hero', type: 'Hero', variant: 'default', order: 0 },
        { category: 'conversion', type: 'BuyBox', variant: 'card', order: 1 },
        { category: 'conversion', type: 'BuyBox', variant: 'card', order: 2 },
      ]);
      expect(codes(contract.collectDesignErrors(spec))).toContain('section-duplicate-type');
    });

    test('order must equal array position — gaps, dupes and reshuffles all rejected', () => {
      for (const bad of [5, 0, -1, '1', undefined]) {
        const spec = mutate('valid', (s) => { s.sections[1].order = bad; });
        expect(codes(contract.collectDesignErrors(spec)), `order ${String(bad)}`)
          .toContain('section-order-invalid');
      }
    });

    test('sections must be a non-empty array', () => {
      for (const bad of [[], {}, null, 'hero']) {
        const spec = mutate('valid', (s) => { s.sections = bad; });
        expect(codes(contract.collectDesignErrors(spec))).toContain('sections-not-array');
      }
    });
  });

  // --- 14. theme tokens vs the REAL @theme block ---------------------------
  describe('theme tokens', () => {
    test('rejects a token that does not exist in the template @theme', () => {
      const spec = mutate('valid', (s) => { s.theme.colors.neon = '#00FF00'; });
      expect(codes(contract.collectDesignErrors(spec))).toContain('theme-unknown-token');
    });

    test('rejects a non-string token value', () => {
      const spec = mutate('valid', (s) => { s.theme.colors.rust = 42; });
      expect(codes(contract.collectDesignErrors(spec))).toContain('theme-token-invalid');
    });

    test('text tokens must be {size,lineHeight,letterSpacing} objects', () => {
      const flat = mutate('valid', (s) => { s.theme.text.hero = '2rem'; });
      expect(codes(contract.collectDesignErrors(flat))).toContain('theme-text-invalid');

      const badField = mutate('valid', (s) => { s.theme.text.hero = { size: '2rem', weight: '700' }; });
      expect(codes(contract.collectDesignErrors(badField))).toContain('theme-text-invalid');
    });

    test('every THEME_TOKENS key really exists in content/landing-base/src/styles/global.css', () => {
      const css = readFileSync(GLOBAL_CSS_PATH, 'utf-8');
      const themeBlock = extractThemeBlock(css);
      const declared = new Set(
        [...themeBlock.matchAll(/(--[a-z0-9-]+(?:--[a-z-]+)?)\s*:/gi)].map((m) => m[1]),
      );

      const prefix: Record<string, string> = {
        colors: '--color-', fonts: '--font-', radius: '--radius-', shadow: '--shadow-', text: '--text-',
      };

      for (const [group, keys] of Object.entries(registryModule.THEME_TOKENS)) {
        for (const key of keys as string[]) {
          expect(declared.has(`${prefix[group]}${key}`), `${prefix[group]}${key} missing from global.css @theme`).toBe(true);
        }
      }
    });

    test('protected structural tokens are unreachable through any theme group (agents.MD §5.6)', () => {
      const prefixes = ['--color-', '--font-', '--radius-', '--shadow-', '--text-'];
      for (const protectedToken of registryModule.PROTECTED_STRUCTURAL_TOKENS) {
        for (const p of prefixes) {
          const reachable = (registryModule.THEME_TOKENS as Record<string, string[]>);
          const anyKeyProduces = Object.values(reachable).flat().some((k) => `${p}${k}` === protectedToken);
          expect(anyKeyProduces, `${protectedToken} reachable via ${p}`).toBe(false);
        }
      }
    });
  });

  // --- production registry honesty ----------------------------------------
  describe('production registry declares only real capabilities', () => {
    // Fase 2 raised the count from 11 to 14 by ADDING three building blocks.
    // Asserted by identity, not just by length: a bare length check would go
    // green if a legacy capability were swapped for a block.
    const LEGACY_KEYS = [
      // 'socialProof/FeaturedTestimonial/default' LEFT this list: it is a block
      // now, and 07-featured-testimonial.astro is a shim.
      // 'conversion/Guarantee/default' left for the same reason one phase later,
      // absorbing 'conversion/ProductGuarantee/default' on the way out. ONE
      // legacy capability is left.
      'socialProof/RealResults/default',
    ];
    const BLOCK_KEYS = [
      // hero/Hero is the one capability that did not merely GAIN variants: it
      // absorbed a second type. 'hero/Hero/default' left LEGACY_KEYS above
      // (03-hero.astro is a shim now) and 'hero/ProductHero/split' stopped
      // existing entirely, becoming this pair.
      'hero/Hero/default',
      'hero/Hero/split',
      // The first hero composition with NO legacy ancestor — proof the unified
      // capability can grow a genuinely new variant without a new type.
      'hero/Hero/editorial',
      // socialProof/FeaturedTestimonial is the mirror image of hero/Hero above.
      // Hero absorbed a second TYPE and kept both compositions as variants;
      // this one absorbed 'socialProof/FeaturedQuote/default' and kept a single
      // composition, because the two were never structurally different. The
      // difference between them is a `tone` prop — plain | light | muted — and
      // blocks.render.test.ts fails if those three ever stop emitting an
      // identical tag sequence.
      'socialProof/FeaturedTestimonial/default',
      // conversion/Guarantee is the third and last of 19f60d5's duplicate
      // types to be collapsed. Same shape as FeaturedTestimonial above: one
      // composition, one variant, a `tone` dial — except this pair was also
      // emitting two id="guarantee" elements when a spec named both.
      'conversion/Guarantee/default',
      // Structural variants v1: socialProof/ReviewsReel LEFT the legacy list.
      // Its composition moved into these two blocks and
      // components/sections/10-reviews-reel.astro became a shim, so the byte-
      // locked legacy golden fixture still resolves and
      // legacy-render.golden.test.ts still proves the default DesignSpec
      // renders byte-identically to the pre-registry page.
      'socialProof/ReviewsReel/carousel',
      'socialProof/ReviewsReel/grid',
      // media/GalleryStrip took the same route, for the same reason. Its
      // composition moved into these two and
      // components/sections/04-gallery-strip.astro became a shim.
      'media/GalleryStrip/strip',
      'media/GalleryStrip/grid',
      'socialProof/UgcStrip/strip',
      'socialProof/UgcStrip/grid',
      // First conversion OUTSIDE socialProof/media — the pattern did not
      // change for a different category.
      'conversion/Faq/accordion',
      'conversion/Faq/open-list',
      'product/HowItWorks/vertical-steps',
      'product/HowItWorks/horizontal-timeline',
      'product/Comparison/table',
      'product/Comparison/cards',
      // The first ADDITIVE pair in this series: there is no legacy Benefits
      // section to convert. product.benefits was only ever rendered inside
      // 05-buy-box.astro, which is untouched and stays byte-locked. See the
      // registry note — and note the consequence: Benefits has no historical
      // golden, because it has no history.
      'product/Benefits/icon-grid',
      'product/Benefits/feature-list',
      // conversion/BuyBox LEFT the legacy list: 05-buy-box.astro is a shim now
      // and `default` stopped existing. `card` carries the legacy composition.
      'conversion/BuyBox/card',
      'conversion/BuyBox/compact',
    ];
    const keyOf = (e: { category: string; type: string; variant: string }) =>
      `${e.category}/${e.type}/${e.variant}`;

    // 24 -> 23 -> 22. Two consecutive phases have now REMOVED a duplicate
    // capability rather than adding one. Both times the block count held at 21
    // (a duplicate left, the surviving type arrived as a block) and the legacy
    // count is what fell: 3 -> 2 -> 1.
    test('registers exactly the 1 legacy section plus the 21 building blocks', () => {
      expect(registryModule.REGISTRY).toHaveLength(22);
      expect(registryModule.REGISTRY.map(keyOf)).toEqual([...LEGACY_KEYS, ...BLOCK_KEYS]);
    });

    test('the remaining legacy capabilities still point at their original section files', () => {
      for (const key of LEGACY_KEYS) {
        const entry = registryModule.REGISTRY.find((e) => keyOf(e) === key);
        expect(entry, `${key} missing`).toBeDefined();
        expect(entry!.component, `${key} re-pointed`).toMatch(/^@\/components\/sections\//);
      }
    });

    // INVERTED. This test used to assert that the two capabilities coexisted —
    // "ProductGuarantee is an ADDITIONAL capability, never a replacement".
    // That arrangement shipped a defect: both types emitted
    // id={SECTION_ANCHORS.Guarantee}, so a DesignSpec naming both validated,
    // built, and served two id="guarantee" elements repeating the same promise,
    // with the footer's href="#guarantee" resolving to whichever came first.
    //
    // The types are merged. The combination is no longer expressible.
    test('conversion/ProductGuarantee is GONE, and Guarantee resolves in its place', () => {
      // NEGATIVE half.
      expect(
        registryModule.resolveCapability('conversion', 'ProductGuarantee', 'default'),
        'ProductGuarantee still registered',
      ).toBeNull();

      // POSITIVE half — without this the negative half above would stay green
      // if `resolveCapability` broke and started returning null for everything.
      const entry = registryModule.resolveCapability('conversion', 'Guarantee', 'default');
      expect(entry, 'Guarantee no longer resolves').not.toBeNull();
      expect(entry!.component).toBe('@/design-system/blocks/conversion/Guarantee/Default.astro');
      expect(entry!.propsSchema.tone!.enum, 'tone lost a value').toEqual(['gold', 'plain']);

      // …and no OTHER capability claims the guarantee anchor's territory.
      const guaranteeish = registryModule.REGISTRY.filter((e: { type: string }) =>
        /Guarantee/.test(e.type),
      );
      expect(guaranteeish.map((e: { type: string }) => e.type)).toEqual(['Guarantee']);
    });

    test('no shell component is addressable as a building block (agents.MD §5.3)', () => {
      const shell = ['utility-bar', 'site-header', 'site-footer', 'sticky-bar', 'CartDrawer'];
      for (const entry of registryModule.REGISTRY) {
        for (const forbidden of shell) {
          expect(entry.component).not.toContain(forbidden);
        }
      }
    });

    // The Fase 1 guardrail is UNCHANGED in substance: no family limit, no
    // density limit, no incompatibility may be invented. Only the props rule
    // splits, because building blocks now back a real rendering difference.
    test('declares NO fictional constraints — no family or density limits on any capability', () => {
      // families and densities remain semantic-only: styles/design-system.css
      // re-declares CSS custom properties and nothing more, so no composition
      // in this registry is illegible under any of them. A restriction here
      // would still be taste dressed up as a contract.
      for (const entry of registryModule.REGISTRY) {
        expect(entry.familiesAllowed, `${entry.type} familiesAllowed`).toBe('*');
        expect(entry.densityAllowed, `${entry.type} densityAllowed`).toBe('*');
      }
    });

    test('the ONLY declared incompatibility is a proven one, and it is symmetric in effect', () => {
      // This assertion used to read `incompatibleWith).toEqual([])` for every
      // capability, and it was right for as long as no honest conflict existed.
      // One does now, so the invariant tightens rather than disappears: the
      // registry may declare incompatibilities, but only real ones, and this
      // test enumerates them so a fictional one cannot be slipped in beside it.
      const declared = registryModule.REGISTRY.filter(
        (e: { incompatibleWith: string[] }) => e.incompatibleWith.length > 0,
      ).map((e: Entry & { incompatibleWith: string[] }) => [keyOf(e), [...e.incompatibleWith].sort()]);

      expect(declared).toEqual([
        [
          'conversion/BuyBox/card',
          ['product/Benefits/feature-list', 'product/Benefits/icon-grid'],
        ],
      ]);

      // WHY IT IS REAL, asserted rather than asserted-in-prose: card renders
      // product.benefits itself, and every Benefits variant renders the same
      // array. Composing them prints each benefit twice.
      const cardSrc = readFileSync(
        path.join(REPO_ROOT, 'content/landing-base/src/design-system/blocks/conversion/BuyBox/Card.astro'),
        'utf-8',
      );
      expect(cardSrc, 'card no longer renders benefits — then the incompatibility is fiction').toContain(
        'product.benefits.map',
      );

      // EVERY Benefits variant must be listed. A third one added later without
      // updating card's list would silently become composable with a buy box
      // that already shows the same tiles.
      const benefitsKeys = registryModule
        .listVariants('product', 'Benefits')
        .map((v: string) => `product/Benefits/${v}`)
        .sort();
      const cardEntry = registryModule.resolveCapability('conversion', 'BuyBox', 'card');
      expect(
        [...cardEntry.incompatibleWith].sort(),
        'a Benefits variant exists that BuyBox/card does not declare',
      ).toEqual(benefitsKeys);

      // …and compact declares none, which is what makes the pair useful.
      expect(
        registryModule.resolveCapability('conversion', 'BuyBox', 'compact').incompatibleWith,
      ).toEqual([]);
    });

    test('legacy sections still declare zero props — none of them accepts one', () => {
      for (const entry of registryModule.REGISTRY.filter((e) => !registryModule.isBuildingBlock(e))) {
        expect(entry.propsSchema, `${entry.type} propsSchema`).toEqual({});
      }
    });

    // The inverse guard: a block must add something REAL over the legacy
    // section it derives from, or it is a capability pretending to be one.
    //
    // Until structural variants there was exactly one way to add something —
    // a props contract — so this test demanded a non-empty propsSchema. There
    // are now TWO, and socialProof/ReviewsReel/{carousel,grid} take the other:
    // the choice they offer is the registry VARIANT itself, resolved to a
    // different component, so encoding it as a prop as well would be the
    // parallel taxonomy the registry forbids.
    //
    // The fiction this test exists to catch is unchanged and still caught: a
    // block with no props AND no sibling variant offers nothing the legacy
    // section did not, and fails here.
    test('every building block adds a real capability — props, or a sibling variant', () => {
      const blocks = registryModule.REGISTRY.filter(registryModule.isBuildingBlock);
      expect(blocks.map(keyOf)).toEqual(BLOCK_KEYS);

      for (const entry of blocks) {
        const props = Object.entries(entry.propsSchema);
        const siblings = registryModule.listVariants(entry.category, entry.type);

        expect(
          props.length > 0 || siblings.length > 1,
          `${keyOf(entry)} declares no props and is the only variant of its type — ` +
            'it adds nothing over a legacy section',
        ).toBe(true);

        for (const [prop, rule] of props) {
          expect(rule.type, `${entry.type}.${prop} type`).toBe('string');
          expect(rule.enum?.length, `${entry.type}.${prop} enum`).toBeGreaterThan(1);
        }
      }
    });

    test('every registered component path points at a section file that really exists', () => {
      for (const entry of registryModule.REGISTRY) {
        const rel = entry.component.replace('@/', 'content/landing-base/src/');
        expect(
          readFileSync(path.join(REPO_ROOT, rel), 'utf-8').length,
          `${entry.component} unreadable`,
        ).toBeGreaterThan(0);
      }
    });

    // Fase 2 introduces the FIRST non-default variant. The guardrail is not
    // "everything is default" any more, it is "only a declared variant is
    // registered" — no capability may quietly gain an alias.
    test('legacy sections all use variant "default"', () => {
      for (const entry of registryModule.REGISTRY.filter((e) => !registryModule.isBuildingBlock(e))) {
        expect(entry.variant, `${entry.type} variant`).toBe('default');
      }
    });

    test('the hero is ONE capability with three variants — ProductHero is gone', () => {
      for (const variant of ['default', 'split', 'editorial']) {
        expect(
          registryModule.resolveCapability('hero', 'Hero', variant),
          `hero/Hero/${variant} does not resolve`,
        ).not.toBeNull();
      }

      // Not deprecated, not aliased, not kept "for compatibility": absent.
      for (const variant of ['default', 'split', 'left', 'center']) {
        expect(
          registryModule.resolveCapability('hero', 'ProductHero', variant),
          `ProductHero/${variant} still resolves`,
        ).toBeNull();
      }
      expect(registryModule.listTypes('hero')).toEqual(['Hero']);

      // …and the Design Agent's catalogue cannot mention it either, since the
      // catalogue is derived from the registry rather than hand-listed.
      const catalogue = registryModule.REGISTRY.map(
        (e: { category: string; type: string; variant: string }) =>
          `${e.category}/${e.type}/${e.variant}`,
      );
      expect(catalogue.filter((k: string) => k.includes('ProductHero'))).toEqual([]);
      expect(registryModule.listVariants('hero', 'Hero').sort()).toEqual(
        ['default', 'editorial', 'split'],
      );
    });

    test('align stays a PROP of hero/Hero/split — never a pair of variants', () => {
      // The taxonomy claim this whole migration exists to demonstrate:
      // `variant` chooses a composition, `propsSchema` dials one that already
      // exists. split-left / split-center would have collapsed the two axes
      // into one and doubled the catalogue for a single class swap.
      const split = registryModule.resolveCapability('hero', 'Hero', 'split');
      expect(split.propsSchema.align).toEqual({ type: 'string', enum: ['left', 'center'] });
      expect(registryModule.listVariants('hero', 'Hero')).not.toContain('split-left');
      expect(registryModule.listVariants('hero', 'Hero')).not.toContain('split-center');

      // `align` belongs to split ALONE. A variant never inherits a sibling's
      // props, so editorial cannot be handed an align it does not implement —
      // the contract would reject it as section-props-unknown.
      expect(registryModule.resolveCapability('hero', 'Hero', 'editorial').propsSchema).toEqual({});
      // …and `default` declares NO props either: it is the legacy composition,
      // which never had a dial.
      expect(registryModule.resolveCapability('hero', 'Hero', 'default').propsSchema).toEqual({});
    });

    test('product/Benefits is ADDITIVE — BuyBox keeps rendering its own tiles', () => {
      // The audit that produced this capability, pinned so a later refactor
      // cannot quietly "tidy up" by extracting the tiles out of BuyBox: that
      // would change what every legacy generation renders, and BuyBox is
      // imported by the byte-locked LegacyIndex2074c93 fixture.
      // BuyBox has since been converted; its composition is blocks/conversion/
      // BuyBox/Card.astro and 05-buy-box.astro is a shim. The invariant this
      // test protects is unchanged: the legacy composition still renders its own
      // tiles and does not delegate to a Benefits block.
      const card = registryModule.resolveCapability('conversion', 'BuyBox', 'card');
      expect(card.component).toBe('@/design-system/blocks/conversion/BuyBox/Card.astro');
      expect(
        readFileSync(path.join(REPO_ROOT, 'content/landing-base/src/design-system/blocks/conversion/BuyBox/Card.astro'), 'utf-8'),
        'BuyBox/card stopped rendering benefits — that is a legacy behaviour change',
      ).toContain('product.benefits.map');

      for (const variant of ['icon-grid', 'feature-list']) {
        const entry = registryModule.resolveCapability('product', 'Benefits', variant);
        expect(entry, `product/Benefits/${variant} does not resolve`).not.toBeNull();
        expect(registryModule.isBuildingBlock(entry)).toBe(true);
        expect(entry.propsSchema, `${variant} grew props`).toEqual({});
        expect(entry.requiresData, `${variant} requiresData`).toEqual(['product.benefits']);
      }
      expect(registryModule.listVariants('product', 'Benefits')).toEqual([
        'icon-grid',
        'feature-list',
      ]);
      // No fallback, no sibling substitution.
      expect(registryModule.resolveCapability('product', 'Benefits', 'default')).toBeNull();
      expect(registryModule.resolveCapability('product', 'Benefits', 'cards')).toBeNull();

      // NOT in the default DesignSpec: a generation without --design keeps
      // rendering exactly what it renders today.
      const defaultSpec = readFileSync(
        path.join(REPO_ROOT, 'content/landing-base/src/data/design.ts'), 'utf-8',
      );
      expect(defaultSpec, 'Benefits entered the default spec').not.toContain("'Benefits'");
    });

    test('hero/Hero/editorial is registered, and gated exactly like its siblings', () => {
      const editorial = registryModule.resolveCapability('hero', 'Hero', 'editorial');
      expect(editorial.component).toBe('@/design-system/blocks/hero/Hero/Editorial.astro');
      expect(registryModule.isBuildingBlock(editorial)).toBe(true);
      // Same data gate as default and split: a new variant is never a way
      // around the data-aware requirement.
      for (const variant of ['default', 'split', 'editorial']) {
        expect(
          registryModule.resolveCapability('hero', 'Hero', variant).requiresData,
          `hero/Hero/${variant} requiresData`,
        ).toEqual(['product.gallery']);
      }
      // NOT extended with a `>=3` grammar to prop up the cluster — the block
      // degrades from three images to one on its own.
      expect(editorial.requiresData.join()).not.toMatch(/[<>=]/);
    });
  });

  // --- 8/9. constraint ENGINE, proven against a fixture registry -----------
  describe('constraint engine (fixture registry — these capabilities are NOT in production)', () => {
    test('rejects an incompatible pair, symmetrically', () => {
      const spec = fixtureSpec([
        { category: 'hero', type: 'Hero', variant: 'default', order: 0 },
        { category: 'media', type: 'Gallery', variant: 'immersive', order: 1 },
        { category: 'conversion', type: 'Cta', variant: 'default', order: 2, props: { align: 'left' } },
      ]);
      const issues = contract.collectDesignErrors(spec, FIXTURE_REGISTRY);
      expect(codes(issues)).toContain('section-incompatible-pair');
    });

    test('rejects an unknown prop', () => {
      const spec = fixtureSpec([
        { category: 'hero', type: 'Hero', variant: 'default', order: 0 },
        { category: 'conversion', type: 'Cta', variant: 'default', order: 1, props: { align: 'left', glow: true } },
      ]);
      expect(codes(contract.collectDesignErrors(spec, FIXTURE_REGISTRY))).toContain('section-props-unknown');
    });

    test('rejects a prop of the wrong type', () => {
      const spec = fixtureSpec([
        { category: 'hero', type: 'Hero', variant: 'default', order: 0 },
        { category: 'conversion', type: 'Cta', variant: 'default', order: 1, props: { align: 'left', compact: 'yes' } },
      ]);
      expect(codes(contract.collectDesignErrors(spec, FIXTURE_REGISTRY))).toContain('section-props-invalid');
    });

    test('rejects a value outside a prop enum', () => {
      const spec = fixtureSpec([
        { category: 'hero', type: 'Hero', variant: 'default', order: 0 },
        { category: 'conversion', type: 'Cta', variant: 'default', order: 1, props: { align: 'diagonal' } },
      ]);
      expect(codes(contract.collectDesignErrors(spec, FIXTURE_REGISTRY))).toContain('section-props-invalid');
    });

    test('rejects a missing required prop', () => {
      const spec = fixtureSpec([
        { category: 'hero', type: 'Hero', variant: 'default', order: 0 },
        { category: 'conversion', type: 'Cta', variant: 'default', order: 1 },
      ]);
      expect(codes(contract.collectDesignErrors(spec, FIXTURE_REGISTRY))).toContain('section-props-invalid');
    });

    test('rejects a capability not allowed for the chosen family', () => {
      const spec = fixtureSpec(
        [
          { category: 'hero', type: 'Hero', variant: 'default', order: 0 },
          { category: 'conversion', type: 'Cta', variant: 'default', order: 1, props: { align: 'left' } },
        ],
        { design: { family: 'brutal-minimal-nope', density: 'balanced' } },
      );
      // family itself invalid -> family issue; use a REAL but disallowed family:
      const spec2 = fixtureSpec(
        [
          { category: 'hero', type: 'Hero', variant: 'default', order: 0 },
          { category: 'conversion', type: 'Cta', variant: 'default', order: 1, props: { align: 'left' } },
        ],
        { design: { family: 'tech', density: 'balanced' } },
      );
      expect(codes(contract.collectDesignErrors(spec2, FIXTURE_REGISTRY))).toContain('section-family-incompatible');
      expect(codes(contract.collectDesignErrors(spec, FIXTURE_REGISTRY))).toContain('design-family-invalid');
    });

    test('rejects a capability not allowed for the chosen density', () => {
      const spec = fixtureSpec(
        [
          { category: 'hero', type: 'Hero', variant: 'default', order: 0 },
          { category: 'conversion', type: 'Cta', variant: 'default', order: 1, props: { align: 'left' } },
        ],
        { design: { family: 'premium', density: 'compact' } },
      );
      expect(codes(contract.collectDesignErrors(spec, FIXTURE_REGISTRY))).toContain('section-density-incompatible');
    });

    test('the fixture registry never leaks into production capabilities', () => {
      expect(registryModule.resolveCapability('conversion', 'Cta', 'default')).toBeNull();
      expect(registryModule.resolveCapability('media', 'Gallery', 'immersive')).toBeNull();
    });
  });

  // --- fail-fast / collect-all parity --------------------------------------
  describe('fail-fast and collect-all stay in sync', () => {
    test('validateDesignSpec throws exactly the FIRST issue collectDesignErrors reports', () => {
      const spec = mutate('valid', (s) => {
        s.schema = 3;
        s.design.family = 'cyberpunk';
      });
      const [first] = contract.collectDesignErrors(spec);
      expect(() => contract.validateDesignSpec(spec)).toThrow(first.message);

      try {
        contract.validateDesignSpec(spec);
      } catch (err: any) {
        expect(err.name).toBe('DesignContractError');
        expect(err.code).toBe(first.code);
        expect(err.path).toBe(first.path);
      }
    });

    test('a valid spec never throws', () => {
      expect(() => contract.validateDesignSpec(fixture('valid'))).not.toThrow();
    });
  });
});

/** Brace-balanced @theme slice — same mechanism as admin/test/theme-tokens.test.ts. */
function extractThemeBlock(source: string): string {
  const start = source.indexOf('@theme');
  if (start === -1) throw new Error('no @theme block found in global.css');
  const openBrace = source.indexOf('{', start);
  let depth = 0;
  for (let i = openBrace; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) return source.slice(openBrace + 1, i);
    }
  }
  throw new Error('@theme block never closes (unbalanced braces)');
}

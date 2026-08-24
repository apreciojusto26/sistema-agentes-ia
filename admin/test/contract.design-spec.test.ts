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
        { category: 'socialProof', type: 'UgcStrip', variant: 'default', order: 1 },
        { category: 'socialProof', type: 'ReviewsReel', variant: 'carousel', order: 2 },
        { category: 'conversion', type: 'BuyBox', variant: 'default', order: 3 },
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
      const spec = mutate('valid', (s) => { s.sections[0].variant = 'split'; });
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
      expect(registryModule.resolveCapability('hero', 'Hero', 'split')).toBeNull();
      // A genuinely unregistered type. This used to name 'ProductHero', which
      // Fase 2 turned into a REAL capability — the assertion kept passing but
      // stopped testing what it was written to test. The ProductHero
      // variant-isolation case now has its own dedicated test below.
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
        { category: 'conversion', type: 'BuyBox', variant: 'default', order: 0 },
      ]);
      expect(codes(contract.collectDesignErrors(spec))).toContain('hero-missing');
    });

    test('hero must be first', () => {
      const spec = fixtureSpec([
        { category: 'conversion', type: 'BuyBox', variant: 'default', order: 0 },
        { category: 'hero', type: 'Hero', variant: 'default', order: 1 },
      ]);
      expect(codes(contract.collectDesignErrors(spec))).toContain('hero-not-first');
    });

    test('at least one conversion section is required', () => {
      const spec = fixtureSpec([
        { category: 'hero', type: 'Hero', variant: 'default', order: 0 },
        { category: 'media', type: 'GalleryStrip', variant: 'default', order: 1 },
      ]);
      expect(codes(contract.collectDesignErrors(spec))).toContain('conversion-missing');
    });

    test('a type may appear at most once (exactly one variant per slot)', () => {
      const spec = fixtureSpec([
        { category: 'hero', type: 'Hero', variant: 'default', order: 0 },
        { category: 'conversion', type: 'BuyBox', variant: 'default', order: 1 },
        { category: 'conversion', type: 'BuyBox', variant: 'default', order: 2 },
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
      'hero/Hero/default',
      'media/GalleryStrip/default',
      'conversion/BuyBox/default',
      'product/HowItWorks/default',
      'socialProof/FeaturedTestimonial/default',
      'conversion/Faq/default',
      'socialProof/UgcStrip/default',
      'product/Comparison/default',
      'conversion/Guarantee/default',
      'socialProof/RealResults/default',
    ];
    const BLOCK_KEYS = [
      'hero/ProductHero/split',
      'socialProof/FeaturedQuote/default',
      'conversion/ProductGuarantee/default',
      // Structural variants v1: socialProof/ReviewsReel LEFT the legacy list.
      // Its composition moved into these two blocks and
      // components/sections/10-reviews-reel.astro became a shim, so the byte-
      // locked legacy golden fixture still resolves and
      // legacy-render.golden.test.ts still proves the default DesignSpec
      // renders byte-identically to the pre-registry page.
      'socialProof/ReviewsReel/carousel',
      'socialProof/ReviewsReel/grid',
    ];
    const keyOf = (e: { category: string; type: string; variant: string }) =>
      `${e.category}/${e.type}/${e.variant}`;

    test('registers exactly the 10 legacy sections plus the 5 building blocks', () => {
      expect(registryModule.REGISTRY).toHaveLength(15);
      expect(registryModule.REGISTRY.map(keyOf)).toEqual([...LEGACY_KEYS, ...BLOCK_KEYS]);
    });

    test('the 10 legacy capabilities still point at their original section files', () => {
      for (const key of LEGACY_KEYS) {
        const entry = registryModule.REGISTRY.find((e) => keyOf(e) === key);
        expect(entry, `${key} missing`).toBeDefined();
        expect(entry!.component, `${key} re-pointed`).toMatch(/^@\/components\/sections\//);
      }
    });

    // ProductGuarantee is an ADDITIONAL capability, never a replacement:
    // a generation without --design must keep rendering 12-guarantee.astro.
    test('conversion/Guarantee/default coexists with conversion/ProductGuarantee/default', () => {
      expect(registryModule.resolveCapability('conversion', 'Guarantee', 'default')?.component).toBe(
        '@/components/sections/12-guarantee.astro',
      );
      expect(
        registryModule.resolveCapability('conversion', 'ProductGuarantee', 'default')?.component,
      ).toBe('@/design-system/blocks/conversion/ProductGuarantee/Default.astro');
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
    test('declares NO fictional constraints — no family/density limits, no incompatibilities, on any capability', () => {
      for (const entry of registryModule.REGISTRY) {
        expect(entry.familiesAllowed, `${entry.type} familiesAllowed`).toBe('*');
        expect(entry.densityAllowed, `${entry.type} densityAllowed`).toBe('*');
        expect(entry.incompatibleWith, `${entry.type} incompatibleWith`).toEqual([]);
      }
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

    test('ProductHero is registered under "split" ONLY — "default" must not resolve', () => {
      expect(registryModule.resolveCapability('hero', 'ProductHero', 'split')).not.toBeNull();
      expect(registryModule.resolveCapability('hero', 'ProductHero', 'default')).toBeNull();
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

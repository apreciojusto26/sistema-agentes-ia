// Design Integrity & data-aware rendering (fase corta).
//
// Locks the five defects the first real generated landing exposed. Every test
// here maps to one of them, and each asserts the MECHANISM, not the symptom —
// a test that only checked "the current registry happens to declare reel"
// would pass again the day someone deletes the requirement.
//
// The five:
//   1. testimonials the renderer selects on, with no coverage guarantee
//   2. `card` — contract-valid data no component ever read
//   3. capabilities selectable without the data to feed them
//   4. family presets silently beating the DesignSpec's own tokens
//   5. a section that renders chrome around nothing instead of failing
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const at = (rel: string) => path.join(REPO_ROOT, rel);
const read = (rel: string) => readFileSync(at(rel), 'utf-8');
const load = (rel: string) => import(pathToFileURL(at(rel)).href);

/**
 * A component's own source plus every relative module it imports.
 *
 * Needed since ReviewsReel gained variants: `carousel` and `grid` deliberately
 * do NOT re-declare the reel selector, they share `./reel-reviews.ts`. A
 * scanner that only read the .astro file would report "this component never
 * selects reel" and be WRONG — it would push the next author to duplicate the
 * selector just to satisfy a test, which is the opposite of the rule.
 */
function readWithLocalImports(rel: string): string {
  const src = read(rel);
  const dir = path.dirname(rel);
  const local = [...src.matchAll(/from '(\.\/[^']+)'/g)].map((m) => m[1]);
  return [
    src,
    ...local.map((spec) => {
      const base = path.join(dir, spec);
      for (const candidate of [base, `${base}.ts`, `${base}.astro`]) {
        try {
          return read(candidate);
        } catch {
          /* try the next extension */
        }
      }
      throw new Error(`${rel} imports ${spec}, which does not resolve`);
    }),
  ].join('\n');
}

/**
 * Does `src` select testimonials on this variant?
 *
 * Accepts BOTH the inline literal (`t.variant === 'reel'`) and a named
 * constant (`const REEL_VARIANT = 'reel'` … `t.variant === REEL_VARIANT`).
 * The shared selector uses the constant on purpose — the discriminator is
 * declared once — and a scanner that only understood the literal would have
 * pushed the next author to inline it just to satisfy this test. The
 * guardrail must follow the code, not bend it.
 */
function selectsVariant(src: string, variant: string): boolean {
  if (src.includes(`=== '${variant}'`)) return true;
  const consts = [...src.matchAll(/const\s+([A-Z][A-Z0-9_]*)\s*=\s*'([^']+)'/g)]
    .filter((m) => m[2] === variant)
    .map((m) => m[1]);
  return consts.some((name) => new RegExp(`===\\s*${name}\\b`).test(src));
}

const contract = await load('scripts/lib/content-contract.mjs');
const registry = await load('scripts/lib/design-registry.mjs');
const design = await load('scripts/lib/design-contract.mjs');
const agent = await load('scripts/generate-design.mjs');
const { design: defaultSpec } = await load('content/landing-base/src/data/design.ts');

/** A DesignSpec that is valid on every axis EXCEPT the ones a test varies. */
function specWith(sections: Array<Record<string, unknown>>) {
  return {
    schema: 1,
    productId: 'prd_aaaaaaaa-11111111',
    design: { family: 'premium', density: 'balanced' },
    sections: sections.map((s, i) => ({ variant: 'default', order: i, ...s })),
  };
}

const HERO = { category: 'hero', type: 'Hero' };
const BUYBOX = { category: 'conversion', type: 'BuyBox' };
const REVIEWS_REEL = { category: 'socialProof', type: 'ReviewsReel', variant: 'carousel' };

/** content.json that satisfies EVERY registered requirement. */
function richContent() {
  return contentWith([{ variant: 'quote' }, { variant: 'reel' }]);
}

/** content.json shaped just enough to satisfy every OTHER requirement. */
function contentWith(testimonials: Array<{ variant: string }>) {
  return {
    testimonials,
    faq: [{ id: 'f1', question: 'q', answer: 'a' }],
    product: {
      gallery: [{ asset: 'product-01' }],
      steps: [{ title: 's' }],
      ugc: [{ asset: 'ugc-01' }],
      comparison: { rows: [] , us: [], them: [] },
    },
  };
}

// ---------------------------------------------------------------------------
// 1 + 2. testimonial variants: coverage, and no orphans
// ---------------------------------------------------------------------------

describe('testimonial variants — every accepted variant has a real consumer', () => {
  // The defect: 'card' was an accepted variant with no selector anywhere, so
  // 3 of the 4 testimonials the first live run produced were unrenderable.
  test('TESTIMONIAL_VARIANTS contains exactly the variants some component selects', () => {
    // Derived from the registry, not hand-listed: a new capability that
    // selects a variant must be covered here automatically.
    const sources = [
      ...registry.REGISTRY.map((e: { component: string }) =>
        readWithLocalImports(e.component.replace('@/', 'content/landing-base/src/')),
      ),
    ].join('\n');

    // Every variant the contract accepts must be selected by real source.
    for (const variant of contract.TESTIMONIAL_VARIANTS) {
      expect(
        selectsVariant(sources, variant),
        `variant "${variant}" is accepted by the contract but no component selects it`,
      ).toBe(true);
    }

    // …and the inverse: no component selects a variant the contract rejects.
    const selected = [
      ...[...sources.matchAll(/\.variant === '([a-z]+)'/g)].map((m) => m[1]),
      ...[...sources.matchAll(/const\s+[A-Z][A-Z0-9_]*\s*=\s*'([a-z]+)' as const/g)].map((m) => m[1]),
    ];
    for (const variant of new Set(selected)) {
      expect(
        contract.TESTIMONIAL_VARIANTS,
        `a component selects variant "${variant}", which the contract does not accept`,
      ).toContain(variant);
    }
  });

  test("'card' is gone from the contract, the runtime type and the few-shot", () => {
    expect(contract.TESTIMONIAL_VARIANTS).not.toContain('card');

    // The UNION itself, not the file — the surrounding prose explains why
    // 'card' was removed and must be allowed to say the word.
    const union = read('content/landing-base/src/types/content.ts')
      .split('\n')
      .find((l) => l.trim().startsWith('variant:'))!;
    expect(union).toBeDefined();
    expect(union).not.toContain("'card'");
    for (const variant of contract.TESTIMONIAL_VARIANTS) {
      expect(union, `runtime type is missing "${variant}"`).toContain(`'${variant}'`);
    }
    const example = JSON.parse(read('scripts/example-content.json'));
    expect(example.testimonials.map((t: { variant: string }) => t.variant)).not.toContain('card');
  });

  test('content missing a consumed variant is REJECTED (coverage, not just membership)', () => {
    const base = JSON.parse(read('scripts/example-content.json'));

    // The exact shape the first live generation produced: every testimonial
    // valid, every field present, and zero `reel`.
    const noReel = {
      ...base,
      testimonials: base.testimonials.filter((t: { variant: string }) => t.variant !== 'reel'),
    };
    const issues = contract.collectContentErrors(noReel);
    const coverage = issues.filter((i: { code: string }) => i.code === 'testimonials-variant-uncovered');
    expect(coverage).toHaveLength(1);
    expect(coverage[0].variant).toBe('reel');
  });

  test('the few-shot Gemini imitates covers every consumed variant', () => {
    // ROOT CAUSE of the empty band: the example showed quote+card+card, and
    // the model reproduced that distribution literally.
    const example = JSON.parse(read('scripts/example-content.json'));
    expect(contract.collectContentErrors(example)).toEqual([]);
    for (const variant of contract.TESTIMONIAL_VARIANTS) {
      expect(
        example.testimonials.some((t: { variant: string }) => t.variant === variant),
        `the few-shot has no "${variant}" testimonial, so the model will not produce one`,
      ).toBe(true);
    }
  });

  test("the Content Agent's prompt derives its variant rule from the contract", () => {
    // Not "the prompt mentions reel" — that the prompt cannot DRIFT from the
    // contract, because it is generated from the same constant.
    const src = read('scripts/generate-content.mjs');
    expect(src).toMatch(/TESTIMONIAL_VARIANTS/);
    expect(src, 'the prompt hardcodes a variant list').not.toMatch(/'quote'\|'card'\|'reel'/);
  });
});

// ---------------------------------------------------------------------------
// 3. data-aware capability resolution
// ---------------------------------------------------------------------------

describe('data-aware capability resolution', () => {
  test('requirements come from the REGISTRY, never hardcoded in an agent', () => {
    for (const variant of registry.listVariants('socialProof', 'ReviewsReel')) {
      const entry = registry.resolveCapability('socialProof', 'ReviewsReel', variant);
      expect(entry.requiresData, `${variant} lost its data requirement`).toEqual(['testimonials:reel']);
    }

    // The agent and the contract must be capability-agnostic: no file may name
    // a specific capability's data need. That is what keeps the registry the
    // single source of truth.
    for (const file of ['scripts/generate-design.mjs', 'scripts/lib/design-contract.mjs']) {
      const src = read(file)
        // comments are documentation, not logic
        .split('\n')
        .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
        .join('\n');
      expect(src, `${file} hardcodes a ReviewsReel data rule`).not.toMatch(/testimonials:reel/);
    }
  });

  test('every declared requirement is backed by the component actually reading it', () => {
    // The registry's honesty contract, mechanised: an unfounded requirement
    // rejects landings that would have rendered perfectly.
    for (const entry of registry.REGISTRY) {
      const src = readWithLocalImports(entry.component.replace('@/', 'content/landing-base/src/'));
      for (const req of entry.requiresData) {
        const [dotPath, variant] = req.split(':');
        if (variant) {
          expect(
            selectsVariant(src, variant),
            `${entry.type} declares ${req} but never selects variant "${variant}"`,
          ).toBe(true);
        } else if (dotPath.startsWith('product.')) {
          expect(src, `${entry.type} declares ${req} but never reads ${dotPath}`).toContain(dotPath);
        } else {
          expect(src, `${entry.type} declares ${req} but never imports @/data/${dotPath}`)
            .toContain(`@/data/${dotPath}`);
        }
      }
    }
  });

  test('ReviewsReel cannot be selected when no reel testimonial exists', () => {
    const spec = specWith([HERO, BUYBOX, REVIEWS_REEL]);
    const verdict = design.checkDesignSupport(spec, undefined, contentWith([{ variant: 'quote' }]));

    expect(verdict.status).toBe('unsatisfied_data');
    expect(verdict.unsatisfied).toEqual([
      { capability: 'socialProof/ReviewsReel/carousel', requirement: 'testimonials:reel' },
    ]);
  });

  test('the same spec PASSES once the content carries a reel testimonial', () => {
    const spec = specWith([HERO, BUYBOX, REVIEWS_REEL]);
    const content = contentWith([{ variant: 'quote' }, { variant: 'reel' }]);
    expect(design.checkDesignSupport(spec, undefined, content).status).toBe('pass');
  });

  test('an empty array is unsatisfied — presence is not the bar', () => {
    // product.* fields are all REQUIRED by the content contract, so they are
    // always PRESENT. `[]` is what actually ships an empty section.
    const spec = specWith([HERO, BUYBOX, { category: 'socialProof', type: 'UgcStrip', variant: 'strip' }]);
    const content = contentWith([{ variant: 'quote' }, { variant: 'reel' }]);
    content.product.ugc = [];
    const verdict = design.checkDesignSupport(spec, undefined, content);
    expect(verdict.status).toBe('unsatisfied_data');
    expect(verdict.unsatisfied[0].requirement).toBe('product.ugc');
  });

  test('with NO content the verdict is unchanged (shape-only callers keep working)', () => {
    const spec = specWith([HERO, BUYBOX, REVIEWS_REEL]);
    expect(design.checkDesignSupport(spec).status).toBe('pass');
  });

  test('unsatisfied_data is NOT reported as unsupported_design', () => {
    // Different failures, different fixes. "This capability does not exist" is
    // permanent; "this content cannot feed it" is true of one product only.
    // Conflating them teaches the agent to abandon a working section.
    expect(design.UNSUPPORTED_CAPABILITY_CODES).not.toContain(design.UNSATISFIED_DATA_CODE);

    const unknown = specWith([HERO, BUYBOX, { category: 'socialProof', type: 'NopeReel' }]);
    expect(design.checkDesignSupport(unknown, undefined, contentWith([{ variant: 'quote' }])).status)
      .toBe('unsupported_design');
  });

  test('the Design Agent gets a data-specific correction it can act on', () => {
    const src = read('scripts/generate-design.mjs');
    expect(src).toContain("support.status === 'unsatisfied_data'");
    // The correction must name the capability AND the missing data.
    expect(src).toMatch(/u\.capability.*u\.requirement|u\.requirement.*u\.capability/);
    // The loop must actually retry rather than fail outright.
    expect(src).toMatch(/attempt\+\+;\s*\n\s*continue;/);
  });

  test('generate-landing gates on content too (the renderer is never first to find out)', () => {
    const src = read('scripts/generate-landing.mjs');
    expect(src).toMatch(/checkDesignSupport\(spec,\s*undefined,\s*parsed\)/);
  });
});

// ---------------------------------------------------------------------------
// 4. family vs DesignSpec theme precedence
// ---------------------------------------------------------------------------

describe('theme precedence — base defaults -> family -> DesignSpec', () => {
  const generator = read('scripts/generate-landing.mjs');

  test('the spec override selector out-specifies every family selector', () => {
    const familyCss = read('content/landing-base/src/styles/design-system.css');
    // family: one element + one attribute  = (0,1,1)
    expect(familyCss).toMatch(/body\[data-design-family="energetic"\]/);
    // spec:   one element + two attributes = (0,2,1)  -> always wins
    expect(generator).toContain('body[data-design-family][data-density] {');
  });

  test('both attributes the override relies on are ALWAYS emitted', () => {
    // A conditional attribute would make the override silently stop matching.
    const base = read('content/landing-base/src/layouts/Base.astro');
    expect(base).toMatch(/<body data-design-family=\{[^}]+\} data-density=\{[^}]+\}>/);
  });

  test('the override is appended to design-system.css, never to global.css', () => {
    // global.css is scanned by patchThemeBlock's regexes; a second declaration
    // of any token there would weaken its strict fail-closed check.
    expect(generator).toMatch(/design-system\.css['"]\)[\s\S]{0,120}override/);
    expect(generator).not.toMatch(/global\.css[\s\S]{0,80}\+ override/);
  });

  test('token -> CSS var mapping is not duplicated in the template', () => {
    // The override is emitted by the generator precisely so CSS_VAR_MAP stays
    // the one source of truth for this mapping.
    const base = read('content/landing-base/src/layouts/Base.astro');
    expect(base).not.toMatch(/--color-\$\{|CSS_VAR_MAP/);
  });
});

// ---------------------------------------------------------------------------
// 5. fail-closed backstop
// ---------------------------------------------------------------------------

describe('ReviewsReel backstop', () => {
  // Moved out of the legacy section and into the selector both variants share,
  // so a new variant cannot be a way around it.
  const src = read('content/landing-base/src/design-system/blocks/social-proof/ReviewsReel/reel-reviews.ts');

  test('throws when composed with zero reel testimonials', () => {
    expect(src).toMatch(/if \(reviews\.length === 0\) \{\s*\n\s*throw new Error\(/);
  });

  test('the error tells the operator both real fixes', () => {
    expect(src).toContain('add at least one testimonial with variant "${REEL_VARIANT}"');
    expect(src).toContain('remove the socialProof/ReviewsReel section');
  });

  test('the error names WHICH variant was composed', () => {
    // "something was empty" is not actionable when a type has two variants.
    expect(src).toContain('variant "${composedBy}"');
  });

  test('it is documented as a backstop, with the rule for repeating it', () => {
    // Scope control: this pattern must not metastasise into every component.
    expect(src).toMatch(/BACKSTOP, not the primary validation/);
    expect(
      read('content/landing-base/src/design-system/blocks/social-proof/ReviewsReel/Carousel.astro'),
    ).toMatch(/A component earns a guard only when/);
  });

  test('every ReviewsReel variant routes through the shared selector', () => {
    // The guard is only a guarantee if no variant can bypass it.
    for (const variant of registry.listVariants('socialProof', 'ReviewsReel')) {
      const entry = registry.resolveCapability('socialProof', 'ReviewsReel', variant);
      const code = read(entry.component.replace('@/', 'content/landing-base/src/'));
      expect(code, `${variant} does not use reelReviews()`).toMatch(/reelReviews\('/);
      expect(code, `${variant} re-implements the reel selector`).not.toMatch(/\.filter\(/);
    }
  });

  test('no legacy section grew a defensive throw', () => {
    const dir = 'content/landing-base/src/components/sections';
    const guarded = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '11', '12', '13', '14', '15']
      .map((n) => {
        const file = [
          '01-utility-bar', '02-site-header', '03-hero', '04-gallery-strip', '05-buy-box',
          '06-how-it-works', '07-featured-testimonial', '08-faq', '09-ugc-strip',
          '11-comparison', '12-guarantee', '13-real-results', '14-site-footer', '15-sticky-bar',
        ].find((f) => f.startsWith(n))!;
        return { file, src: read(`${dir}/${file}.astro`) };
      })
      .filter(({ src: s }) => s.includes('throw new Error'));

    expect(guarded.map((g) => g.file), 'a section grew an undocumented guard').toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Structural variants v1 — socialProof/ReviewsReel/{carousel,grid}
//
// The RENDER-level proof (different HTML, controls vs no controls, island vs
// no island) lives next to the components, in
// content/landing-base/src/design-system/blocks/social-proof/ReviewsReel/
// variants.render.test.ts — it needs the Astro container. What belongs HERE is
// the contract half: the vocabulary, the gate, and the single source of truth.
// ---------------------------------------------------------------------------

describe('structural variants — socialProof/ReviewsReel', () => {
  const VARIANTS = ['carousel', 'grid'];

  test('the registry declares exactly these two variants', () => {
    expect(registry.listVariants('socialProof', 'ReviewsReel').sort()).toEqual([...VARIANTS].sort());
    // The placeholder variant is gone, not kept as a third alias.
    expect(registry.resolveCapability('socialProof', 'ReviewsReel', 'default')).toBeNull();
  });

  test('each variant resolves to its OWN component — not one wrapping the other', () => {
    const components = VARIANTS.map(
      (v) => registry.resolveCapability('socialProof', 'ReviewsReel', v).component,
    );
    expect(new Set(components).size, 'two variants share one component').toBe(2);

    for (const component of components) {
      expect(component).toMatch(/^@\/design-system\/blocks\/social-proof\/ReviewsReel\//);
      const src = read(component.replace('@/', 'content/landing-base/src/'));
      for (const other of components.filter((c) => c !== component)) {
        const name = other.split('/').pop()!.replace('.astro', '');
        expect(src, `${component} imports its sibling ${name}`).not.toContain(`./${name}.astro`);
      }
    }
  });

  test('a DesignSpec naming an unknown ReviewsReel variant is rejected', () => {
    const spec = specWith([HERO, BUYBOX, { category: 'socialProof', type: 'ReviewsReel', variant: 'masonry' }]);
    const verdict = design.checkDesignSupport(spec, undefined, contentWith([{ variant: 'reel' }]));
    expect(verdict.status).toBe('unsupported_design');
    expect(verdict.missingCapability).toBe('socialProof/ReviewsReel/masonry');
  });

  test('BOTH variants are valid DesignSpec choices with reel data present', () => {
    for (const variant of VARIANTS) {
      const spec = specWith([HERO, BUYBOX, { category: 'socialProof', type: 'ReviewsReel', variant }]);
      const verdict = design.checkDesignSupport(spec, undefined, contentWith([{ variant: 'reel' }]));
      expect(verdict.status, `${variant}: ${JSON.stringify(verdict)}`).toBe('pass');
    }
  });

  test('NEITHER variant can be used without reel data — a variant is not an escape hatch', () => {
    for (const variant of VARIANTS) {
      const spec = specWith([HERO, BUYBOX, { category: 'socialProof', type: 'ReviewsReel', variant }]);
      const verdict = design.checkDesignSupport(spec, undefined, contentWith([{ variant: 'quote' }]));
      expect(verdict.status, `${variant} slipped past the data gate`).toBe('unsatisfied_data');
      expect(verdict.unsatisfied[0].requirement).toBe('testimonials:reel');
    }
  });

  test('the Design Agent gets both variants from the REGISTRY, never a literal', () => {
    // The catalogue is derived, so a third variant would appear in the prompt
    // with no edit to the agent at all.
    const catalogue = agent.buildCapabilityCatalogue();
    for (const variant of VARIANTS) {
      expect(catalogue.map((c: { key: string }) => c.key)).toContain(
        `socialProof/ReviewsReel/${variant}`,
      );
    }

    const src = read('scripts/generate-design.mjs');
    for (const variant of VARIANTS) {
      expect(src, `generate-design.mjs hardcodes the "${variant}" variant`).not.toContain(
        `ReviewsReel/${variant}`,
      );
    }
    // …and no steering rule was smuggled in.
    expect(src).not.toMatch(/family\s*===?\s*['"]tech['"]/);
    expect(src).not.toMatch(/density\s*===?\s*['"]/);
  });

  test('the vocabulary reaches the actual system instruction', () => {
    const instruction = agent.buildSystemInstruction();
    for (const variant of VARIANTS) {
      expect(instruction).toContain(`socialProof/ReviewsReel/${variant}`);
    }
    // Both must advertise the same data requirement, or the model could think
    // one of them is the cheap way out.
    const lines = instruction
      .split('\n')
      .filter((l: string) => l.includes('socialProof/ReviewsReel/'));
    expect(lines).toHaveLength(2);
    for (const line of lines) expect(line).toContain('testimonials:reel');
  });

  test('the two variants cannot both be composed into one landing', () => {
    // Already guaranteed by `section-duplicate-type`, which is WHY the registry
    // leaves incompatibleWith empty instead of restating it as metadata.
    const spec = specWith([
      HERO,
      BUYBOX,
      { category: 'socialProof', type: 'ReviewsReel', variant: 'carousel' },
      { category: 'socialProof', type: 'ReviewsReel', variant: 'grid' },
    ]);
    const issues = design.collectDesignErrors(spec);
    expect(issues.map((i: { code: string }) => i.code)).toContain('section-duplicate-type');

    for (const variant of VARIANTS) {
      const entry = registry.resolveCapability('socialProof', 'ReviewsReel', variant);
      expect(entry.incompatibleWith, 'redundant metadata restating section-duplicate-type').toEqual([]);
      expect(entry.familiesAllowed, 'a family restriction with no evidence behind it').toBe('*');
    }
  });

  test('the reel selector is declared ONCE, not per variant', () => {
    const shared = 'content/landing-base/src/design-system/blocks/social-proof/ReviewsReel/reel-reviews.ts';
    expect(read(shared)).toContain("REEL_VARIANT = 'reel'");

    // No variant re-implements it, and the legacy path is a shim rather than a
    // second copy of the carousel.
    for (const variant of VARIANTS) {
      const entry = registry.resolveCapability('socialProof', 'ReviewsReel', variant);
      const src = read(entry.component.replace('@/', 'content/landing-base/src/'));
      expect(src, `${variant} re-declares the discriminator`).not.toContain("'reel'");
      expect(src).toContain("from './reel-reviews'");
    }

    const legacy = read('content/landing-base/src/components/sections/10-reviews-reel.astro');
    expect(legacy, 'the legacy section still holds a copy of the markup').not.toContain('<section');
    expect(legacy).toContain('ReviewsReel/Carousel.astro');
  });
});

// ---------------------------------------------------------------------------
// Structural variants — media/GalleryStrip/{strip,grid}
//
// SECOND capability on the variant axis. The render-level proof (island vs
// none, thumbnail rail vs column grid, one <li> per image) lives beside the
// components in content/landing-base/src/design-system/blocks/media/
// GalleryStrip/variants.render.test.ts — it needs the Astro container. What
// belongs here is the contract half.
//
// Written against a LIST of converted capabilities rather than one literal, so
// the third conversion inherits every assertion instead of copying it.
// ---------------------------------------------------------------------------

describe('structural variants — the variant axis, per converted capability', () => {
  const CONVERTED = [
    { category: 'socialProof', type: 'ReviewsReel', variants: ['carousel', 'grid'], requires: 'testimonials:reel' },
    { category: 'media', type: 'GalleryStrip', variants: ['strip', 'grid'], requires: 'product.gallery' },
    { category: 'socialProof', type: 'UgcStrip', variants: ['strip', 'grid'], requires: 'product.ugc' },
    { category: 'conversion', type: 'Faq', variants: ['accordion', 'open-list'], requires: 'faq' },
    {
      category: 'product',
      type: 'HowItWorks',
      variants: ['vertical-steps', 'horizontal-timeline'],
      requires: 'product.steps',
    },
  ];

  test.each(CONVERTED)('$category/$type declares exactly its variants', ({ category, type, variants }) => {
    expect(registry.listVariants(category, type).sort()).toEqual([...variants].sort());
    // The placeholder variant is gone, not kept as an alias.
    expect(registry.resolveCapability(category, type, 'default')).toBeNull();
  });

  test.each(CONVERTED)('$type: each variant has its OWN component, none wraps a sibling', ({ category, type, variants }) => {
    const components = variants.map((v) => registry.resolveCapability(category, type, v).component);
    expect(new Set(components).size, 'two variants share one component').toBe(variants.length);

    for (const component of components) {
      expect(component).toMatch(/^@\/design-system\/blocks\//);
      const src = read(component.replace('@/', 'content/landing-base/src/'));
      for (const other of components.filter((c) => c !== component)) {
        const name = other.split('/').pop()!.replace('.astro', '');
        expect(src, `${component} imports its sibling ${name}`).not.toContain(`./${name}.astro`);
      }
    }
  });

  test.each(CONVERTED)('$type: every variant carries the SAME data requirement', ({ category, type, variants, requires }) => {
    for (const variant of variants) {
      const entry = registry.resolveCapability(category, type, variant);
      expect(entry.requiresData, `${variant} drifted`).toEqual([requires]);
    }
  });

  test.each(CONVERTED)('$type: an unknown variant is rejected as unsupported_design', ({ category, type }) => {
    const spec = specWith([HERO, BUYBOX, REVIEWS_REEL, { category, type, variant: 'nope' }]);
    const verdict = design.checkDesignSupport(spec, undefined, richContent());
    expect(verdict.status).toBe('unsupported_design');
    expect(verdict.missingCapability).toBe(`${category}/${type}/nope`);
  });

  test.each(CONVERTED)('$type: every variant validates when the data IS there', ({ category, type, variants }) => {
    for (const variant of variants) {
      const sections = [HERO, BUYBOX];
      if (type !== 'ReviewsReel') sections.push(REVIEWS_REEL);
      sections.push({ category, type, variant });
      const verdict = design.checkDesignSupport(specWith(sections), undefined, richContent());
      expect(verdict.status, `${type}/${variant}: ${JSON.stringify(verdict)}`).toBe('pass');
    }
  });

  test.each(CONVERTED)('$type: NO variant can be used without its data', ({ category, type, variants, requires }) => {
    for (const variant of variants) {
      const content = richContent();
      // Starve exactly this capability's requirement, leave the rest intact.
      if (requires === 'testimonials:reel') content.testimonials = [{ variant: 'quote' }];
      else if (requires === 'product.ugc') content.product.ugc = [];
      else if (requires === 'faq') content.faq = [];
      else if (requires === 'product.steps') content.product.steps = [];
      else content.product.gallery = [];

      const sections = [HERO, BUYBOX];
      if (type !== 'ReviewsReel') sections.push(REVIEWS_REEL);
      sections.push({ category, type, variant });

      const verdict = design.checkDesignSupport(specWith(sections), undefined, content);
      expect(verdict.status, `${type}/${variant} slipped past the data gate`).toBe('unsatisfied_data');
      expect(verdict.unsatisfied.some((u: { requirement: string }) => u.requirement === requires)).toBe(true);
    }
  });

  test.each(CONVERTED)('$type: both variants reach the Design Agent from the registry', ({ category, type, variants, requires }) => {
    const catalogue = agent.buildCapabilityCatalogue().map((c: { key: string }) => c.key);
    const instruction = agent.buildSystemInstruction();

    for (const variant of variants) {
      expect(catalogue).toContain(`${category}/${type}/${variant}`);
      expect(instruction).toContain(`${category}/${type}/${variant}`);
    }

    // Same advertised requirement on every variant, or the model could read
    // one of them as the cheap way around the data gate.
    const lines = instruction.split('\n').filter((l: string) => l.includes(`${category}/${type}/`));
    expect(lines).toHaveLength(variants.length);
    for (const line of lines) expect(line).toContain(requires);
  });

  test.each(CONVERTED)('$type: the agent hardcodes neither the variants nor a steering rule', ({ type, variants }) => {
    const src = read('scripts/generate-design.mjs');
    for (const variant of variants) {
      expect(src, `generate-design.mjs hardcodes ${type}/${variant}`).not.toContain(`${type}/${variant}`);
    }
    expect(src).not.toMatch(/family\s*===?\s*['"]/);
    expect(src).not.toMatch(/density\s*===?\s*['"]/);
  });

  test.each(CONVERTED)('$type: the two variants cannot both be composed into one landing', ({ category, type, variants }) => {
    // Guaranteed by `section-duplicate-type`, which is WHY incompatibleWith
    // stays empty instead of restating it as metadata.
    const sections = [HERO, BUYBOX, REVIEWS_REEL, ...variants.map((variant) => ({ category, type, variant }))];
    const issues = design.collectDesignErrors(specWith(sections));
    expect(issues.map((i: { code: string }) => i.code)).toContain('section-duplicate-type');

    for (const variant of variants) {
      const entry = registry.resolveCapability(category, type, variant);
      expect(entry.incompatibleWith, 'metadata restating section-duplicate-type').toEqual([]);
      expect(entry.familiesAllowed, 'a family restriction with no evidence behind it').toBe('*');
    }
  });

  test.each(CONVERTED)('$type: the data mapping is declared ONCE, not per variant', ({ category, type, variants }) => {
    const dirs = new Set(
      variants.map((v) => {
        const c = registry.resolveCapability(category, type, v).component;
        return c.slice(0, c.lastIndexOf('/'));
      }),
    );
    expect(dirs.size, 'variants live in different directories').toBe(1);

    for (const variant of variants) {
      const entry = registry.resolveCapability(category, type, variant);
      const src = read(entry.component.replace('@/', 'content/landing-base/src/'));
      // The shared module is imported; the mapping is not re-derived.
      expect(src, `${variant} does not use the shared selector`).toMatch(/from '\.\/[a-z-]+'/);
      expect(src, `${variant} re-implements the selector`).not.toMatch(/\.filter\(|resolveMediaList|resolveShopifyImages/);
    }
  });

  test.each(CONVERTED)('$type: the legacy section is a shim onto the DEFAULT variant', ({ category, type, variants }) => {
    // Compatibility, not cleanliness: design-system/test-fixtures/
    // LegacyIndex2074c93.astro imports these paths statically and
    // legacy-render.golden.test.ts requires the legacy import path and the
    // registry path to render identically.
    //
    // The promoted variant is read from the TEMPLATE DEFAULT SPEC, not from
    // variants[0]. Position is not the contract: product/HowItWorks lists
    // vertical-steps first but it is horizontal-timeline that carries the
    // legacy composition. Deriving it from src/data/design.ts asserts the
    // real invariant — the shim and a --design-less generation reach the same
    // component — instead of a coincidence that held for the first four.
    const defaultSection = defaultSpec.sections.find(
      (s: { category: string; type: string }) => s.category === category && s.type === type,
    );
    expect(defaultSection, `${type} is absent from the template default spec`).toBeDefined();
    expect(variants, `${type}/${defaultSection.variant} is not a registered variant`).toContain(
      defaultSection.variant,
    );

    const promoted = registry.resolveCapability(category, type, defaultSection.variant).component;
    const legacyFile = {
      ReviewsReel: 'content/landing-base/src/components/sections/10-reviews-reel.astro',
      GalleryStrip: 'content/landing-base/src/components/sections/04-gallery-strip.astro',
      UgcStrip: 'content/landing-base/src/components/sections/09-ugc-strip.astro',
      Faq: 'content/landing-base/src/components/sections/08-faq.astro',
      HowItWorks: 'content/landing-base/src/components/sections/06-how-it-works.astro',
    }[type]!;

    const legacy = read(legacyFile);
    expect(legacy, 'the legacy section still holds a copy of the markup').not.toContain('<section');
    expect(legacy).toContain(promoted.split('/').slice(-2).join('/'));

    const fixture = read('content/landing-base/src/design-system/test-fixtures/LegacyIndex2074c93.astro');
    expect(fixture, 'the golden fixture no longer imports the legacy path').toContain(
      legacyFile.replace('content/landing-base/src/', '@/'),
    );
  });
});

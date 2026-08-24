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

const contract = await load('scripts/lib/content-contract.mjs');
const registry = await load('scripts/lib/design-registry.mjs');
const design = await load('scripts/lib/design-contract.mjs');

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
const REVIEWS_REEL = { category: 'socialProof', type: 'ReviewsReel' };

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
    const sources = [
      'content/landing-base/src/components/sections/07-featured-testimonial.astro',
      'content/landing-base/src/components/sections/10-reviews-reel.astro',
      'content/landing-base/src/design-system/blocks/social-proof/FeaturedQuote/Default.astro',
    ].map(read).join('\n');

    // Every variant the contract accepts must be selected by real source.
    for (const variant of contract.TESTIMONIAL_VARIANTS) {
      expect(
        sources.includes(`=== '${variant}'`),
        `variant "${variant}" is accepted by the contract but no component selects it`,
      ).toBe(true);
    }

    // …and the inverse: no component selects a variant the contract rejects.
    const selected = [...sources.matchAll(/t\.variant === '([a-z]+)'/g)].map((m) => m[1]);
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
    const entry = registry.resolveCapability('socialProof', 'ReviewsReel', 'default');
    expect(entry.requiresData).toEqual(['testimonials:reel']);

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
      const src = read(entry.component.replace('@/', 'content/landing-base/src/'));
      for (const req of entry.requiresData) {
        const [dotPath, variant] = req.split(':');
        if (variant) {
          expect(src, `${entry.type} declares ${req} but never selects variant "${variant}"`)
            .toContain(`=== '${variant}'`);
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
      { capability: 'socialProof/ReviewsReel/default', requirement: 'testimonials:reel' },
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
    const spec = specWith([HERO, BUYBOX, { category: 'socialProof', type: 'UgcStrip' }]);
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
  const src = read('content/landing-base/src/components/sections/10-reviews-reel.astro');

  test('throws when composed with zero reel testimonials', () => {
    expect(src).toMatch(/if \(reelReviews\.length === 0\) \{\s*\n\s*throw new Error\(/);
  });

  test('the error tells the operator both real fixes', () => {
    expect(src).toContain('add at least one testimonial with variant "reel"');
    expect(src).toContain('remove the socialProof/ReviewsReel section');
  });

  test('it is documented as a backstop, with the rule for repeating it', () => {
    // Scope control: this pattern must not metastasise into every component.
    expect(src).toMatch(/BACKSTOP, not the primary validation/);
    expect(src).toMatch(/HOW TO REPEAT THIS PATTERN/);
  });

  test('no other section grew a defensive throw in this phase', () => {
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

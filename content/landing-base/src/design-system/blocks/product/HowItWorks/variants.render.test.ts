// Structural variants — product/HowItWorks/{vertical-steps,horizontal-timeline}.
//
// These assertions RENDER both blocks and read the resulting HTML. The claims
// being defended are that the two produce genuinely different compositions of
// the same steps, that NEITHER invents interaction or progress state, and that
// the step numbers come from the data rather than from array position.
import { afterEach, describe, expect, test, vi } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import reactServer from '@astrojs/react/server.js';

import { product } from '@/data/product';
import type { HowToStep } from '@/types/content';
import VerticalSteps from './VerticalSteps.astro';
import HorizontalTimeline from './HorizontalTimeline.astro';
import { howItWorksSteps, STEPS_EYEBROW, STEPS_HEADING } from './steps';

const render = async (Component: unknown) => {
  const container = await AstroContainer.create({
    renderers: [{ name: '@astrojs/react', ssr: reactServer }] as never,
  });
  return container.renderToString(Component as never);
};

// Same widening as steps.ts: product.ts is authored `as const satisfies Product`.
const steps: HowToStep[] = [...product.steps];

const BOTH = [
  ['vertical-steps', VerticalSteps],
  ['horizontal-timeline', HorizontalTimeline],
] as const;

describe('both variants consume exactly the same steps', () => {
  test('the fixture actually has steps to render', () => {
    // Guards everything below: an empty list would make these pass vacuously.
    expect(steps.length).toBeGreaterThan(1);
  });

  test('the shared accessor returns product.steps verbatim for either variant', () => {
    expect(howItWorksSteps('vertical-steps')).toEqual(steps);
    expect(howItWorksSteps('horizontal-timeline')).toEqual(steps);
  });

  test.each(BOTH)('%s renders every step title and text, uncut', async (_name, Component) => {
    const html = await render(Component);
    for (const step of steps) {
      expect(html, `missing title of step ${step.step}`).toContain(step.title);
      expect(html, `missing or truncated text of step ${step.step}`).toContain(step.text);
    }
  });

  test.each(BOTH)('%s renders the AUTHORED step number, never the array index', async (_name, Component) => {
    const html = await render(Component);
    // Rendered inside the badge/rail span, so the assertion is about the
    // number reaching the document, not about incidental digits elsewhere.
    for (const step of steps) {
      expect(html, `step number ${step.step} is missing`).toMatch(
        new RegExp(`>\\s*${step.step}\\s*<`),
      );
    }
  });

  test.each(BOTH)('%s renders one media slot per step', async (_name, Component) => {
    const html = await render(Component);
    const slots = [...html.matchAll(/aspect-\[4\/3\]/g)].length;
    expect(slots).toBe(steps.length);
  });

  test('both carry the same framing copy, from one declaration', async () => {
    for (const [, Component] of BOTH) {
      const html = await render(Component);
      expect(html).toContain(STEPS_EYEBROW);
      expect(html).toContain(STEPS_HEADING);
    }
  });
});

describe('neither variant invents interaction or progress', () => {
  test.each(BOTH)('%s hydrates nothing — no island, no JS', async (_name, Component) => {
    const html = await render(Component);
    expect(html, 'this section grew an island').not.toContain('astro-island');
  });

  test.each(BOTH)('%s has no controls', async (_name, Component) => {
    const html = await render(Component);
    expect(html, 'grew a button').not.toMatch(/<button\b/);
    expect(html, 'grew an expand toggle').not.toContain('aria-expanded');
    expect(html, 'grew a tablist').not.toContain('role="tablist"');
  });

  test.each(BOTH)('%s is an explanation, not a tracker', async (_name, Component) => {
    const html = await render(Component);
    // No progress state and no current-step highlighting.
    expect(html, 'grew a progress element').not.toMatch(/<progress\b/);
    expect(html, 'grew a progressbar role').not.toContain('role="progressbar"');
    expect(html, 'grew aria-current').not.toContain('aria-current');
    expect(html, 'grew a valuenow').not.toContain('aria-valuenow');

    // No percentage shown to the READER. Checked on visible text only: the
    // raw HTML is full of `%` from url-encoded image srcs (`origWidth%3D714`),
    // so scanning the markup would fail on Astro's own asset pipeline rather
    // than on anything this component renders.
    const visible = html.replace(/<[^>]+>/g, ' ');
    expect(visible, 'shows a percentage to the reader').not.toMatch(/\d+\s*%/);
  });
});

describe('the two compositions are genuinely different', () => {
  test('timeline goes horizontal on lg; vertical stays one column at EVERY breakpoint', async () => {
    const vertical = await render(VerticalSteps);
    const timeline = await render(HorizontalTimeline);

    expect(timeline).toContain('lg:grid-cols-3');
    expect(
      vertical,
      'vertical-steps lays out columns somewhere — it must stay a single stack',
    ).not.toMatch(/(sm|md|lg|xl):grid-cols-/);
    expect(vertical, 'vertical-steps grew a grid').not.toMatch(/\bgrid-cols-/);
  });

  test('vertical is an ordered list; timeline is a card grid', async () => {
    const vertical = await render(VerticalSteps);
    const timeline = await render(HorizontalTimeline);

    expect(vertical).toMatch(/<ol\b/);
    expect([...vertical.matchAll(/<li\b/g)].length, 'one <li> per step').toBe(steps.length);
    expect(timeline, 'the timeline became a list').not.toMatch(/<ol\b/);
    expect(timeline).toContain('rounded-card bg-surface shadow-card');
  });

  test('vertical puts the number in its own rail; timeline overlays it on the media', async () => {
    const vertical = await render(VerticalSteps);
    const timeline = await render(HorizontalTimeline);

    expect(timeline, 'the timeline lost its overlaid badge').toContain('absolute left-4 top-4');
    expect(vertical, 'vertical-steps overlays its number like the timeline').not.toContain(
      'absolute left-4 top-4',
    );
    expect(vertical, 'vertical-steps lost its number rail').toContain('shrink-0 place-items-center');
  });

  test('vertical puts media beside the copy from md; timeline puts it above', async () => {
    const vertical = await render(VerticalSteps);
    const timeline = await render(HorizontalTimeline);

    expect(vertical).toContain('md:flex-row');
    expect(timeline, 'the timeline grew a side-by-side step').not.toContain('md:flex-row');
  });

  test('the two HTML outputs are not the same document', async () => {
    expect(await render(VerticalSteps)).not.toBe(await render(HorizontalTimeline));
  });
});

describe('the shared accessor is fail-closed for BOTH variants', () => {
  /** Starves the REAL module: product.steps emptied. */
  async function starved() {
    vi.resetModules();
    vi.doMock('@/data/product', () => ({ product: { ...product, steps: [] } }));
    const mod = await import('./steps');
    return mod.howItWorksSteps;
  }

  afterEach(() => {
    vi.doUnmock('@/data/product');
    vi.resetModules();
  });

  test('throws when product.steps is empty', async () => {
    const starvedSteps = await starved();
    expect(() => starvedSteps('vertical-steps')).toThrow(
      /`steps` in src\/data\/product\.ts is empty/,
    );
  });

  test('BOTH variants hit the same guard, and it names the one composed', async () => {
    const starvedSteps = await starved();
    expect(() => starvedSteps('vertical-steps')).toThrow(/variant "vertical-steps"/);
    expect(() => starvedSteps('horizontal-timeline')).toThrow(/variant "horizontal-timeline"/);
  });
});

// Structural variants — conversion/Faq/{accordion,open-list}.
//
// These assertions RENDER both blocks and read the resulting HTML. The claim
// being defended is that the two produce genuinely different compositions of
// the same questions — and, specifically, that the difference is about how the
// answers are PRESENTED, not about whether they reach the document. That
// second half is the one that invites hand-waving, so it is measured here
// rather than asserted in prose.
import { afterEach, describe, expect, test, vi } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import reactServer from '@astrojs/react/server.js';

import { faq } from '@/data/faq';
import Accordion from './Accordion.astro';
import OpenList from './OpenList.astro';
import { faqItems, FAQ_EYEBROW, FAQ_HEADING } from './faq-items';

const render = async (Component: unknown) => {
  const container = await AstroContainer.create({
    renderers: [{ name: '@astrojs/react', ssr: reactServer }] as never,
  });
  return container.renderToString(Component as never);
};

describe('both variants consume the SAME faq', () => {
  test('the fixture actually has questions to render', () => {
    // Guards everything below: an empty list would make these pass vacuously.
    expect(faq.length).toBeGreaterThan(2);
  });

  test('the shared accessor returns faq verbatim for either variant', () => {
    expect(faqItems('accordion')).toEqual([...faq]);
    expect(faqItems('open-list')).toEqual([...faq]);
  });

  test.each([
    ['accordion', Accordion],
    ['open-list', OpenList],
  ])('%s renders EVERY question and EVERY answer, uncut', async (_name, Component) => {
    const html = await render(Component);
    for (const item of faq) {
      expect(html, `missing question ${item.id}`).toContain(item.question);
      // Whole answer, not a truncation: the full string must be present.
      expect(html, `missing or truncated answer ${item.id}`).toContain(item.answer);
    }
  });

  test('both carry the same framing copy, from one declaration', async () => {
    for (const Component of [Accordion, OpenList]) {
      const html = await render(Component);
      expect(html).toContain(FAQ_EYEBROW);
      expect(html).toContain(FAQ_HEADING);
    }
  });
});

describe('content presence — measured, not claimed', () => {
  test('open-list has every answer in the HTML, visible with no interaction', async () => {
    const html = await render(OpenList);
    for (const item of faq) expect(html).toContain(item.answer);

    // Nothing gates visibility: no collapsed row, no hidden attribute, no
    // display:none, no zero-height track.
    expect(html, 'an answer is collapsed').not.toContain('grid-rows-[0fr]');
    expect(html, 'an answer is display:none').not.toContain('display:none');
    expect(html, 'an answer is hidden').not.toMatch(/\shidden(=|\s|>)/);
    expect(html, 'an answer is aria-hidden').not.toContain('aria-hidden="true"');
  });

  test('accordion keeps its answers in the HTML too — collapsed, never removed', async () => {
    // The honest comparison. FaqAccordion collapses with `grid-rows-[0fr]`, so
    // the copy ships either way; open-list does not put MORE text in the
    // document, it removes the interaction needed to read it. A test that
    // claimed otherwise would be selling an SEO story the code does not tell.
    const html = await render(Accordion);
    for (const item of faq) expect(html, `answer ${item.id} was omitted`).toContain(item.answer);

    expect(html, 'the accordion dropped its collapse mechanism').toContain('grid-rows-[0fr]');
    expect(html, 'the accordion hides answers from the document').not.toContain('display:none');
  });

  test('neither variant hides the answers from assistive technology', async () => {
    const accordion = await render(Accordion);
    const openList = await render(OpenList);

    // In the accordion each panel is a labelled region tied to its trigger.
    expect(accordion).toContain('role="region"');
    expect(accordion).toContain('aria-labelledby="faq-trigger-');
    // In open-list the semantics come from the elements themselves.
    expect(openList).toMatch(/<dl\b/);
    expect([...openList.matchAll(/<dt\b/g)].length).toBe(faq.length);
    expect([...openList.matchAll(/<dd\b/g)].length).toBe(faq.length);
  });
});

describe('the two compositions are genuinely different', () => {
  test('accordion ships an interactive island; open-list ships none', async () => {
    const accordion = await render(Accordion);
    const openList = await render(OpenList);

    expect(accordion, 'accordion lost its island').toContain('astro-island');
    expect(openList, 'open-list hydrates something — it must be fully static').not.toContain(
      'astro-island',
    );
  });

  test('accordion has real expansion controls, one per question', async () => {
    const html = await render(Accordion);
    expect([...html.matchAll(/<button\b/g)].length).toBe(faq.length);
    expect([...html.matchAll(/aria-expanded=/g)].length).toBe(faq.length);
    expect([...html.matchAll(/aria-controls="faq-panel-/g)].length).toBe(faq.length);
  });

  test('open-list has NO expansion controls at all', async () => {
    const html = await render(OpenList);
    expect(html, 'open-list grew a button').not.toMatch(/<button\b/);
    expect(html, 'open-list grew an expand toggle').not.toContain('aria-expanded');
    expect(html, 'open-list grew a controlled panel').not.toContain('aria-controls');
    expect(html, 'open-list grew a chevron').not.toContain('rotate-180');
  });

  test('open-list uses a definition list; accordion uses headed triggers', async () => {
    const openList = await render(OpenList);
    const accordion = await render(Accordion);

    expect(openList).toMatch(/<dl\b/);
    expect(accordion, 'accordion became a definition list').not.toMatch(/<dl\b/);
    expect(accordion, 'accordion lost its heading-wrapped triggers').toMatch(/<h3><button/);
  });

  test('open-list lays out two columns from md; accordion stays a single stack', async () => {
    const openList = await render(OpenList);
    const accordion = await render(Accordion);

    expect(openList).toContain('md:grid-cols-2');
    expect(accordion, 'accordion grew a column grid').not.toContain('md:grid-cols-2');
  });

  test('the two HTML outputs are not the same document', async () => {
    expect(await render(Accordion)).not.toBe(await render(OpenList));
  });
});

describe('the shared accessor is fail-closed for BOTH variants', () => {
  /** Starves the REAL module: faq emptied. */
  async function starved() {
    vi.resetModules();
    vi.doMock('@/data/faq', () => ({ faq: [] }));
    const mod = await import('./faq-items');
    return mod.faqItems;
  }

  afterEach(() => {
    vi.doUnmock('@/data/faq');
    vi.resetModules();
  });

  test('throws when src/data/faq.ts is empty', async () => {
    const faqItemsStarved = await starved();
    expect(() => faqItemsStarved('accordion')).toThrow(/src\/data\/faq\.ts is empty/);
  });

  test('BOTH variants hit the same guard, and it names the one composed', async () => {
    const faqItemsStarved = await starved();
    expect(() => faqItemsStarved('accordion')).toThrow(/variant "accordion"/);
    expect(() => faqItemsStarved('open-list')).toThrow(/variant "open-list"/);
  });
});

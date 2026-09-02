import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const pageSource = readFileSync(resolve(process.cwd(), 'src/pages/index.astro'), 'utf8');
const confirmedOrder = ['ReviewsReel', 'Guarantee', 'Faq', 'SiteFooter'] as const;

function renderedPosition(component: (typeof confirmedOrder)[number]): number {
  return pageSource.indexOf(`<${component} />`);
}

describe('landing sections after customer reviews', () => {
  it('renders every confirmed section', () => {
    for (const component of confirmedOrder) {
      expect(renderedPosition(component), `${component} must be rendered`).toBeGreaterThan(-1);
    }
  });

  it('keeps Reviews, Guarantee, FAQ, and Footer in the confirmed order', () => {
    const positions = confirmedOrder.map(renderedPosition);

    expect(positions).toEqual([...positions].sort((left, right) => left - right));
  });
});

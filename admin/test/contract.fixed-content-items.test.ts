// A MALFORMED ITEM MUST DIE AT THE CONTRACT, NOT IN ASTRO.
//
// content-contract.mjs validates that a collection KEY exists and, for
// testimonials, which keys each item carries. It never checked that the values
// inside an item were usable — which is how a `steps` array missing `media`
// reached the renderer and aborted a build with "Cannot read properties of
// undefined", with nothing upstream reporting a thing.
//
// Every rule here is derived from a real consumer in landing-astravibe, not
// from copying the historical types.
import { describe, test, expect } from 'vitest';
import {
  collectFixedItemIssues,
  collectFixedContentIssues,
  TESTIMONIAL_RATINGS,
  TESTIMONIAL_LAYOUTS,
} from '../../scripts/lib/fixed-content-output.mjs';

const codes = (input: unknown) => collectFixedItemIssues(input).map((i) => i.code);

describe('faq items', () => {
  test('a well-formed pair passes', () => {
    expect(codes({ faq: [{ question: '¿Se lava?', answer: 'Sí, a máquina.' }] })).toEqual([]);
  });

  test.each([
    ['a missing question', [{ answer: 'x' }]],
    ['an empty question', [{ question: '   ', answer: 'x' }]],
    ['a missing answer', [{ question: 'x' }]],
    ['a non-string answer', [{ question: 'x', answer: 42 }]],
    ['a null item', [null]],
  ])('%s is rejected', (_label, faq) => {
    expect(codes({ faq })).toContain('content-faq-item-invalid');
  });

  test('the removed `id` is NOT reintroduced as a requirement', () => {
    // F3A dropped it from the Fixed contract; requiring it here would put it
    // back through the side door.
    expect(codes({ faq: [{ question: 'x', answer: 'y' }] })).toEqual([]);
  });
});

describe('review items', () => {
  const review = (over: Record<string, unknown> = {}) => ({
    author: 'M***a',
    rating: 5,
    date: '2026-02-11',
    body: 'Dormí de un tirón.',
    ...over,
  });

  test('a well-formed review passes', () => {
    expect(codes({ reviews: [review()] })).toEqual([]);
  });

  test('an empty author is allowed — a source that recorded none is a real state', () => {
    // The mask IS the provenance; absence is not the same as invalid.
    expect(codes({ reviews: [review({ author: '' })] })).toEqual([]);
  });

  test.each([
    ['a fractional rating', { rating: 4.5 }],
    ['a rating out of range', { rating: 6 }],
    ['a string rating', { rating: '5' }],
    ['a non-ISO date', { date: '11/02/2026' }],
    ['a missing date', { date: undefined }],
    ['an empty body', { body: '' }],
    ['a numeric author', { author: 7 }],
  ])('%s is rejected', (_label, over) => {
    expect(codes({ reviews: [review(over)] })).toContain('content-review-item-invalid');
  });

  test('Stars is a closed domain, and it is the template\'s', () => {
    expect(TESTIMONIAL_RATINGS).toEqual([1, 2, 3, 4, 5]);
  });

  test.each(['location', 'verified'])('a %s field is refused — F2 removed it for a reason', (field) => {
    // Nothing upstream can supply either, so both could only be invented about
    // a stranger's purchase.
    expect(codes({ reviews: [review({ [field]: 'x' })] })).toContain('content-review-item-invalid');
  });

  test('media on a review is refused', () => {
    // No mounted section reads a testimonial media ref at all, and media is the
    // asset layer's regardless.
    expect(codes({ reviews: [review({ media: { asset: 'a' } })] })).toContain('content-review-media-forbidden');
  });

  test('the layout slots are named, and they are not product variants', () => {
    // `CanonicalReview.variant` is the purchased option ("Color: Gris").
    // `Testimonial.variant` is a rendering slot. Same word, different meaning.
    expect(TESTIMONIAL_LAYOUTS).toEqual(['quote', 'card', 'reel']);
  });
});

describe('comparison rows', () => {
  test.each([
    ['boolean | boolean', { feature: 'Soporte', ours: true, rival: false }],
    ['boolean | text', { feature: 'Espuma', ours: true, rival: 'Fibra' }],
    ['text | text', { feature: 'Altura', ours: 'Dos caras', rival: 'Única' }],
  ])('%s is accepted — the grammar knows these cells', (_label, row) => {
    expect(codes({ comparison: [row] })).toEqual([]);
  });

  test.each([
    ['a number cell', { feature: 'x', ours: 3, rival: false }],
    ['a null cell', { feature: 'x', ours: null, rival: false }],
    ['an empty string cell', { feature: 'x', ours: '', rival: false }],
    ['an object cell', { feature: 'x', ours: { v: 1 }, rival: false }],
    ['a missing feature', { ours: true, rival: false }],
  ])('%s is rejected', (_label, row) => {
    expect(codes({ comparison: [row] })).toContain('content-comparison-item-invalid');
  });

  test('the reason is stated: a third cell shape breaks the tuple collapse', () => {
    const issue = collectFixedItemIssues({ comparison: [{ feature: 'x', ours: 3, rival: false }] })[0];
    expect(issue.message).toMatch(/sealed grammar|R-shape|collapsing/);
  });
});

describe('steps', () => {
  test('copy-only steps pass', () => {
    expect(codes({ steps: [{ step: 1, title: 'Sacala', text: 'De la caja.' }] })).toEqual([]);
  });

  test.each([
    ['a missing title', { step: 1, text: 'x' }],
    ['an empty text', { step: 1, title: 'x', text: '' }],
    ['a non-integer order', { step: 1.5, title: 'x', text: 'y' }],
  ])('%s is rejected', (_label, step) => {
    expect(codes({ steps: [step] })).toContain('content-step-item-invalid');
  });

  test('media on a step is refused — F4 moved that to the asset layer', () => {
    expect(codes({ steps: [{ title: 'x', text: 'y', media: { asset: 'a' } }] })).toContain(
      'content-step-media-forbidden',
    );
  });
});

describe('the item rules run as part of the Fixed content contract', () => {
  test('a malformed item fails the whole validation, not just a helper', () => {
    // The rules are worthless if only a test calls them.
    const issues = collectFixedContentIssues({
      name: 'Producto',
      tagline: 't',
      subtagline: 's',
      cta: {},
      variantGroupLabel: 'v',
      trustTicker: [],
      faq: [{ question: 'x' }],
    });
    expect(issues.map((i) => i.code)).toContain('content-faq-item-invalid');
  });

  test('and a clean document still passes', () => {
    const issues = collectFixedContentIssues({
      name: 'Producto',
      tagline: 't',
      subtagline: 's',
      cta: {},
      variantGroupLabel: 'v',
      trustTicker: ['x'],
      faq: [{ question: '¿Sí?', answer: 'Sí.' }],
      comparison: [{ feature: 'f', ours: true, rival: false }],
      steps: [{ step: 1, title: 't', text: 'x' }],
      reviews: [{ author: '', rating: 4, date: '2026-01-01', body: 'b' }],
    });
    expect(issues).toEqual([]);
  });
});

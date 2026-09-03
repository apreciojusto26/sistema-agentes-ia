// SOCIAL PROOF MAY ONLY STATE WHAT SOMETHING UPSTREAM CAN SUPPORT.
//
// The Fixed AstraVibe template shipped four claims with no source behind them,
// and each was a statement about real people:
//
//   "✓ Compra verificada"   CanonicalReview carries NO verification signal
//   "· Madrid"              CanonicalReview carries NO reviewer location
//   "Marina Sosto"          ten invented Spanish personas; AliExpress publishes
//                           reviewer names already masked (`Y***t`)
//   5★:120 4★:4 3★:2 …      a rating distribution nothing ever measured
//
// Each is guarded at its ORIGIN — the TYPE and the DATA — not at the render.
// A component that merely stopped drawing a badge would leave `verified: true`
// in the data for the next component to find, which is how the badge appeared
// in two places to begin with.
//
// The template's OWN files are the subject here. content/landing-astravibe is
// the canonical source every Fixed landing is copied from, so a fabricated
// field here is a fabrication in every product this system will ever produce.
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const T = 'content/landing-astravibe';

const readRaw = (rel: string) => readFileSync(path.join(REPO_ROOT, rel), 'utf-8');

/**
 * Source with comments stripped. Same convention as
 * contract.content-provenance.test.ts, and needed for the same reason a second
 * time: these files DOCUMENT the claims they are forbidden to make, and a
 * scanner that flagged its own explanation would force the explanation out.
 */
const read = (rel: string) =>
  readRaw(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*)/.test(l))
    .join('\n');

/** Source with runs of whitespace collapsed. Rendered prose wraps across
 *  source lines, so a sentence assertion must not depend on where the
 *  formatter happened to break it. */
const readFlat = (rel: string) => read(rel).replace(/\s+/g, ' ');

const TYPES = `${T}/src/types/content.ts`;
const DATA_PRODUCT = `${T}/src/data/product.ts`;
const DATA_TESTIMONIALS = `${T}/src/data/testimonials.ts`;

/** Every surface that renders a review or a rating. */
const SOCIAL_PROOF_SURFACES = [
  `${T}/src/components/sections/07-featured-testimonial.astro`,
  `${T}/src/components/sections/10-reviews-reel.astro`,
  `${T}/src/components/sections/13-real-results.astro`,
  `${T}/src/components/sections/05-buy-box.astro`,
  `${T}/src/components/sections/01-utility-bar.astro`,
  `${T}/src/components/islands/ReviewCarousel.tsx`,
];

describe('purchase verification cannot be claimed', () => {
  test('the Testimonial type has no `verified` field', () => {
    // The origin. While this existed, every review had to assert something.
    expect(read(TYPES)).not.toMatch(/^\s*verified\s*[?:]/m);
  });

  test('no testimonial carries a verification flag', () => {
    expect(read(DATA_TESTIMONIALS)).not.toMatch(/\bverified\b/);
  });

  test.each(SOCIAL_PROOF_SURFACES)('%s renders no verification claim', (file) => {
    const src = read(file);
    expect(src, 'still reads .verified').not.toMatch(/\.verified\b/);
    expect(src, 'still prints a verification badge').not.toMatch(/[Cc]ompra verificada/);
    // Not just the badge — the WORD, in any customer-facing phrasing. The
    // reviews reel's own origin disclosure used to say "compradores
    // verificados", making the unsupported claim in the sentence written to
    // establish provenance.
    expect(src, 'still describes reviewers as verified').not.toMatch(/verificad[oa]s?/i);
  });
});

describe('reviewer location cannot be invented', () => {
  test('the Testimonial type has no `location` field', () => {
    expect(read(TYPES)).not.toMatch(/^\s*location\s*[?:]/m);
  });

  test('no testimonial carries a location', () => {
    expect(read(DATA_TESTIMONIALS)).not.toMatch(/\blocation\b/);
  });

  test.each(SOCIAL_PROOF_SURFACES)('%s renders no reviewer location', (file) => {
    expect(read(file)).not.toMatch(/\.location\b/);
  });
});

describe('reviewer identity is never fabricated', () => {
  test('the invented personas are gone from the data', () => {
    // The exact ten. Each was a full Spanish name attached to a review the
    // source published under a mask.
    const data = read(DATA_TESTIMONIALS);
    for (const name of [
      'Marina Sosto', 'Julián Ferreiro', 'Carla Bettini', 'Pablo Iriarte', 'Noelia Campos',
      'Diego Marconi', 'Sofía Aranda', 'Lucía Prado', 'Martín Ocampo', 'Rocío Ibáñez',
    ]) {
      expect(data, `${name} is still presented as a reviewer`).not.toContain(name);
    }
  });

  test('and so are the cities that were attached to them', () => {
    const data = read(DATA_TESTIMONIALS);
    for (const city of ['Valencia', 'Madrid', 'Sevilla', 'Bilbao', 'Zaragoza', 'Málaga', 'Alicante', 'Vigo', 'Córdoba', 'Granada']) {
      expect(data, `${city} is still attached to a reviewer`).not.toContain(city);
    }
  });

  test('every rendered author goes through the ONE display helper', () => {
    // The featured quote resolves at the render; the carousel is an island, so
    // its names are resolved BEFORE serialization — deriving inside the island
    // would ship the raw value in the <astro-island props> attribute while the
    // visible text read "Cliente".
    expect(read(`${T}/src/components/sections/07-featured-testimonial.astro`)).toMatch(/reviewerDisplayName\(/);
    expect(read(`${T}/src/components/sections/10-reviews-reel.astro`)).toMatch(/reviewerDisplayName\(/);
  });

  test('the island receives resolved names, never raw testimonials', () => {
    const carousel = read(`${T}/src/components/islands/ReviewCarousel.tsx`);
    expect(carousel, 'the island reaches for the data itself').not.toMatch(/from '@\/data\/testimonials'/);
    expect(carousel, 'the island masks names on its own').not.toMatch(/\*{2,}/);
  });

  test('the fallback states only what is true', () => {
    const helper = read(`${T}/src/lib/reviewer-identity.ts`);
    expect(helper).toContain("ANONYMOUS_REVIEWER = 'Cliente'");
    // "Cliente verificado" would smuggle the removed claim back through the
    // one place that is allowed to invent a display string.
    expect(helper).not.toMatch(/Cliente verificado/);
  });
});

describe('rating facts are aggregate-only, and optional', () => {
  test('ratingBreakdown is gone from the type', () => {
    expect(read(TYPES)).not.toMatch(/^\s*ratingBreakdown\s*[?:]/m);
  });

  test('ratingBreakdown is gone from the data', () => {
    expect(read(DATA_PRODUCT)).not.toMatch(/^\s*ratingBreakdown\s*:/m);
  });

  test('no renderer reads a breakdown or draws a distribution', () => {
    for (const file of SOCIAL_PROOF_SURFACES) {
      expect(read(file), `${file} reads ratingBreakdown`).not.toMatch(/ratingBreakdown/);
    }
  });

  test('the aggregate is nullable, so absence of data is absence of claim', () => {
    const types = read(TYPES);
    expect(types).toMatch(/ratingAverage:\s*number\s*\|\s*null/);
    expect(types).toMatch(/ratingCount:\s*number\s*\|\s*null/);
  });

  test('no renderer defaults a missing rating to a number', () => {
    // `?? 0` would render zeroed stars: a verdict, invented, about a product
    // nobody rated.
    for (const file of SOCIAL_PROOF_SURFACES) {
      const src = read(file);
      expect(src, `${file} defaults ratingAverage`).not.toMatch(/ratingAverage\s*\?\?/);
      expect(src, `${file} defaults ratingCount`).not.toMatch(/ratingCount\s*\?\?/);
    }
  });

  test('a rating-less product renders no rating row and no summary section', () => {
    // Both surfaces guard on the NUMBER, not on a derived label — astro check
    // does not typecheck expressions inside a conditional, so guarding on the
    // label would compile while handing <Stars> a null at runtime.
    expect(read(`${T}/src/components/sections/05-buy-box.astro`)).toMatch(/rating !== null &&/);
    expect(read(`${T}/src/components/sections/13-real-results.astro`)).toMatch(/rating !== null &&/);
  });
});

describe('the origin of the reviews is disclosed, and the brand is not hardcoded', () => {
  test('the reel discloses that reviews come from another marketplace', () => {
    // EU 2019/2161 (RDL 24/2021): reviews collected elsewhere may not be
    // presented as if they were left in this shop.
    const reel = readFlat(`${T}/src/components/sections/10-reviews-reel.astro`);
    expect(reel).toMatch(/recopiladas de plataformas de venta online/);
    expect(reel).toMatch(/No son opiniones dejadas en esta tienda/);
  });

  test('the summary discloses the same origin for its aggregate', () => {
    expect(readFlat(`${T}/src/components/sections/13-real-results.astro`)).toMatch(
      /recopiladas de plataformas de venta online/,
    );
  });

  test('the summary heading reads the brand instead of naming AstraVibe', () => {
    const src = read(`${T}/src/components/sections/13-real-results.astro`);
    expect(src, 'the template brand is still hardcoded').not.toMatch(/Astra ?Vibe/);
    expect(src).toMatch(/product\.brand/);
  });
});

describe('template leakage — a different product must inherit none of this', () => {
  // The rule stated once: nothing in the SOCIAL PROOF path may carry a fact
  // about AstraVibe or about a person, because every generated landing starts
  // as a copy of these files.
  const FORBIDDEN: Array<[string, RegExp]> = [
    ['a verification claim', /[Cc]ompra verificada/],
    ['a fabricated rating distribution', /ratingBreakdown/],
    ['a review count baked into copy', /\+\s*1[0-9]{2}\s*rese/i],
    ['a five-star claim in the ticker', /rese[ñn]as de 5 estrellas/i],
  ];

  test.each(FORBIDDEN)('no social-proof surface carries %s', (_label, pattern) => {
    for (const file of [...SOCIAL_PROOF_SURFACES, DATA_PRODUCT, DATA_TESTIMONIALS, TYPES]) {
      expect(read(file), `${file} still carries it`).not.toMatch(pattern);
    }
  });

  test('the trust ticker states no count it cannot derive', () => {
    // '+120 reseñas de 5 estrellas' read its number straight out of the
    // fabricated breakdown. Any ticker string with a baked-in count is also
    // wrong for the next product the moment its aggregate differs.
    const data = read(DATA_PRODUCT);
    const ticker = /trustTicker:\s*\[([\s\S]*?)\]/.exec(data)?.[1] ?? '';
    expect(ticker.length, 'trustTicker not found — has it been renamed?').toBeGreaterThan(0);
    // Scoped to SOCIAL-PROOF counts on purpose. "Hasta 24 proyecciones
    // intercambiables" is a product spec and belongs here; what may not is a
    // number attached to reviews, ratings or customers, because that is the
    // shape the fabricated one had.
    expect(ticker, 'a ticker item states a social-proof count').not.toMatch(
      /\d+[^,']*\b(rese[ñn]as?|valoraciones?|opiniones?|clientes?|compradores?|estrellas?)/i,
    );
    expect(ticker, 'a ticker item states a social-proof count').not.toMatch(
      /\b(rese[ñn]as?|valoraciones?|opiniones?|clientes?|compradores?)\b[^,']*\d/i,
    );
  });
});

// MUTATION TESTS FOR THE STRUCTURAL FINGERPRINT.
//
// A fingerprint that only ever passes is worse than none: it certifies drift.
// So this suite does not check that the hash is stable — it checks that the
// hash is stable for EXACTLY the mutations the Fixed AstraVibe contract calls
// dynamic, and moves for every mutation it calls structural.
//
// The two halves are written against the same fixture on purpose. Every
// "structural" case below is a real regression someone could ship by hand:
// widening a container, changing vertical rhythm, reordering two sections,
// moving a breakpoint, dropping a section. Every "dynamic" case is something a
// new product is SUPPOSED to change.
import { describe, expect, it } from 'vitest';
import { structuralFingerprint } from '../../scripts/lib/fingerprint.mjs';

/**
 * A slice of the real AstraVibe page: the Hero+BuyBox grid wrapper (whose
 * column definition is the most layout-bearing string in the template), a
 * media slot as ui/Media.astro renders it, the RealResults rating bar with its
 * inline width, and an Astro island with its build-identity attributes.
 */
const PAGE = `
<div class="bg-white">
  <div class="xl:mx-auto xl:grid xl:w-full xl:max-w-[80rem] xl:grid-cols-[minmax(0,1.1fr)_minmax(25rem,0.9fr)] xl:items-start xl:gap-8 xl:px-8 xl:py-8">
    <section id="hero" class="bg-white pb-6 pt-0">
      <h1 class="text-hero">24 ambientes. Un solo proyector.</h1>
      <img class="h-full w-full object-cover rounded-tile" src="/_astro/gallery-01.a1b2c3.webp" alt="El proyector sobre una mesa" style="aspect-ratio:4 / 5" />
    </section>
    <section id="buy" class="scroll-mt-14 bg-white">
      <p class="text-sm text-steel">4,9/5 basado en +128 compradores</p>
      <a class="bg-grape text-white rounded-pill px-6 py-4" href="/checkout">Finalizar compra</a>
    </section>
  </div>
</div>
<section class="bg-white pb-4 pt-12 md:pb-6 md:pt-16">
  <h2 class="text-display">Lo que dicen de Astra Vibe</h2>
  <div class="grid grid-cols-[auto_1fr_auto] items-center gap-3 text-xs">
    <span class="w-8 font-semibold text-graphite">5★</span>
    <span class="h-2 rounded-pill bg-graphite/10"><span class="block h-full rounded-pill bg-gold" style="width:72%"></span></span>
    <span class="tabular-nums text-steel">92</span>
  </div>
</section>
<section id="faq" class="bg-white py-12">
  <h2 class="text-display">Todo lo que necesitas saber</h2>
</section>
<astro-island uid="Z1qBcD" prefix="r9" component-url="/_astro/CartDrawer.9f2a1c.js" component-export="CartDrawer" renderer-url="/_astro/client.ab12.js" props="{&quot;price&quot;:4899}" ssr client="load"></astro-island>
`;

const hashOf = (html: string) => structuralFingerprint(html).hash;
const BASE = hashOf(PAGE);

/** Applies one textual mutation, asserting it actually changed the input. */
function mutate(from: string, to: string): string {
  expect(PAGE).toContain(from);
  return PAGE.replace(from, to);
}

describe('structural fingerprint — mutations that MUST fail', () => {
  it('rejects a change in vertical rhythm', () => {
    expect(hashOf(mutate('bg-white py-12', 'bg-white py-16'))).not.toBe(BASE);
  });

  it('rejects a change in container width', () => {
    expect(hashOf(mutate('xl:max-w-[80rem]', 'xl:max-w-[90rem]'))).not.toBe(BASE);
  });

  it('rejects a change in the grid definition', () => {
    expect(
      hashOf(mutate('xl:grid-cols-[minmax(0,1.1fr)_minmax(25rem,0.9fr)]', 'xl:grid-cols-2')),
    ).not.toBe(BASE);
  });

  it('rejects a moved breakpoint', () => {
    expect(hashOf(mutate('md:pb-6 md:pt-16', 'lg:pb-6 lg:pt-16'))).not.toBe(BASE);
  });

  it('rejects a reordered section', () => {
    const faq = '<section id="faq" class="bg-white py-12">\n  <h2 class="text-display">Todo lo que necesitas saber</h2>\n</section>';
    expect(PAGE).toContain(faq);
    // move the FAQ from last position to first
    expect(hashOf(faq + PAGE.replace(faq, ''))).not.toBe(BASE);
  });

  it('rejects a removed section', () => {
    expect(hashOf(mutate('<section id="faq" class="bg-white py-12">', '<section id="faq" class="bg-white py-12" hidden>'))).not.toBe(BASE);
  });

  it('rejects an added element', () => {
    expect(hashOf(mutate('<h2 class="text-display">Todo lo que', '<span class="badge"></span><h2 class="text-display">Todo lo que'))).not.toBe(BASE);
  });

  it('rejects a swapped island component', () => {
    expect(hashOf(mutate('component-export="CartDrawer"', 'component-export="CartSheet"'))).not.toBe(BASE);
  });

  it('rejects a changed media-slot aspect ratio', () => {
    expect(hashOf(mutate('aspect-ratio:4 / 5', 'aspect-ratio:1 / 1'))).not.toBe(BASE);
  });

  it('rejects an image that is NOT in a media slot', () => {
    expect(hashOf(mutate('<h2 class="text-display">Lo que dicen', '<img class="w-4" src="/x.svg" alt="" /><h2 class="text-display">Lo que dicen'))).not.toBe(BASE);
  });
});

describe('structural fingerprint — mutations that MUST pass', () => {
  it('ignores copy', () => {
    expect(hashOf(mutate('24 ambientes. Un solo proyector.', 'Aroma de bosque, en tu salón.'))).toBe(BASE);
  });

  it('ignores brand and product name', () => {
    expect(hashOf(mutate('Lo que dicen de Astra Vibe', 'Lo que dicen de Bosque Nordico'))).toBe(BASE);
  });

  it('ignores asset filenames and their content hashes', () => {
    expect(hashOf(mutate('/_astro/gallery-01.a1b2c3.webp', '/_astro/gallery-07.99ffee.webp'))).toBe(BASE);
  });

  it('ignores alt text', () => {
    expect(hashOf(mutate('alt="El proyector sobre una mesa"', 'alt="El difusor sobre una repisa"'))).toBe(BASE);
  });

  it('ignores link destinations', () => {
    expect(hashOf(mutate('href="/checkout"', 'href="/checkout?variant=42"'))).toBe(BASE);
  });

  it('ignores review statistics rendered as a bar width', () => {
    expect(hashOf(mutate('style="width:72%"', 'style="width:31%"'))).toBe(BASE);
  });

  it('ignores the island render counter, but not which island it is', () => {
    // `prefix` is Astro's per-render island counter. It is deterministic —
    // two identical builds produce identical prefixes — but it RENUMBERS when
    // an earlier island appears or disappears, so a preview build and a
    // commerce build disagree on it for every island after the first
    // difference. It encodes render order and nothing else.
    expect(hashOf(mutate('prefix="r9"', 'prefix="r42"'))).toBe(BASE);

    // …and the control that makes dropping it safe: the island's IDENTITY is
    // still compared, so a swap fails even though its counter is ignored.
    expect(hashOf(mutate('component-export="CartDrawer"', 'component-export="CartSheet"'))).not.toBe(BASE);
  });

  it('ignores island build identity and serialized props', () => {
    const rebuilt = PAGE
      .replace('uid="Z1qBcD"', 'uid="Q9zXyW"')
      .replace('/_astro/CartDrawer.9f2a1c.js', '/_astro/CartDrawer.7e4b8d.js')
      .replace('props="{&quot;price&quot;:4899}"', 'props="{&quot;price&quot;:2199}"');
    expect(hashOf(rebuilt)).toBe(BASE);
  });

  it('ignores a video standing in for an image inside a media slot', () => {
    const asVideo = mutate(
      '<img class="h-full w-full object-cover rounded-tile" src="/_astro/gallery-01.a1b2c3.webp" alt="El proyector sobre una mesa" style="aspect-ratio:4 / 5" />',
      '<video class="h-full w-full object-cover rounded-tile" src="/_astro/video-01.44ab.mp4" poster="/_astro/p.webp" style="aspect-ratio:4 / 5"></video>',
    );
    expect(hashOf(asVideo)).toBe(BASE);
  });

  it('ignores inline colour literals', () => {
    expect(hashOf(mutate('bg-graphite/10"><span class="block h-full rounded-pill bg-gold" style="width:72%"', 'bg-graphite/10"><span class="block h-full rounded-pill bg-gold" style="width:72%;background:#7C3AED"'))).not.toBe(BASE);
    // the declaration itself is structural; only its colour VALUE is ignored
    const withPurple = mutate('style="width:72%"', 'style="width:72%;background:#7C3AED"');
    const withOrange = mutate('style="width:72%"', 'style="width:72%;background:#A6421F"');
    expect(hashOf(withPurple)).toBe(hashOf(withOrange));
  });

  it('ignores class ordering and whitespace', () => {
    expect(hashOf(mutate('class="bg-white pb-6 pt-0"', 'class="pt-0   bg-white  pb-6"'))).toBe(BASE);
  });
});

describe('structural fingerprint — shape', () => {
  it('is a sha256 hex digest', () => {
    expect(BASE).toMatch(/^[0-9a-f]{64}$/);
  });

  it('reports the element count it compared', () => {
    expect(structuralFingerprint(PAGE).elements).toBeGreaterThan(15);
  });

  it('is empty and stable for empty input', () => {
    expect(structuralFingerprint('').elements).toBe(0);
  });
});

// ── Stars: the rating VALUE is data; everything around it is design ────────
//
// ui/Stars.astro renders each star as `<path opacity={fill}>`, so the rating
// leaks into an attribute. Stars appears seven or more times on a commerce
// page, which made two products with different ratings impossible to match on
// structure. The exception is keyed on (ancestor, element, attribute) — NOT on
// `opacity` globally, because elsewhere an opacity is a real design decision.
//
// Every case below is a control: normalizing the fill must not buy silence
// about the component's shape.
describe('Stars — contextual value normalization', () => {
  const stars = (fills: number[], opts: { tag?: string; pathClass?: string; wrapperRole?: string; d?: string } = {}) => {
    const { tag = 'path', pathClass = 'text-gold', wrapperRole = 'img', d = 'M10.868 2.884' } = opts;
    const cells = fills
      .map((f) => `<svg class="size-4 shrink-0"><${tag} class="${pathClass}" d="${d}" opacity="${f === 0 ? 0.25 : f}"/></svg>`)
      .join('');
    return `<div role="${wrapperRole}" class="inline-flex items-center gap-0.5" aria-label="x">${cells}</div>`;
  };
  const h = (html: string) => structuralFingerprint(html).hash;

  const RATING_49 = [1, 1, 1, 1, 0.9000000000000004];
  const RATING_42 = [1, 1, 1, 1, 0.2];
  const BASELINE = h(stars(RATING_49));

  it('a different rating does NOT change the structure', () => {
    expect(h(stars(RATING_42))).toBe(BASELINE);
  });

  it('a different NUMBER of stars does', () => {
    expect(h(stars([1, 1, 1, 1]))).not.toBe(BASELINE);
    expect(h(stars([1, 1, 1, 1, 1, 1]))).not.toBe(BASELINE);
  });

  it('changing the star geometry does', () => {
    expect(h(stars(RATING_49, { d: 'M0 0h10v10z' }))).not.toBe(BASELINE);
  });

  it('changing the item tag does', () => {
    expect(h(stars(RATING_49, { tag: 'rect' }))).not.toBe(BASELINE);
  });

  it('changing the star class does', () => {
    expect(h(stars(RATING_49, { pathClass: 'text-steel' }))).not.toBe(BASELINE);
  });

  it('changing the wrapper role does — the rule stops matching, which is the safe direction', () => {
    expect(h(stars(RATING_49, { wrapperRole: 'presentation' }))).not.toBe(BASELINE);
  });

  it('adding a child does', () => {
    expect(h(stars(RATING_49).replace('</div>', '<span class="x"></span></div>'))).not.toBe(BASELINE);
  });

  it('REMOVING the opacity attribute does — only its value is normalized', () => {
    expect(h(stars(RATING_49).replace(/ opacity="[^"]*"/g, ''))).not.toBe(BASELINE);
  });

  it('an opacity OUTSIDE Stars keeps its value and still fails', () => {
    const a = '<div class="overlay"><path class="veil" opacity="0.5"/></div>';
    const b = '<div class="overlay"><path class="veil" opacity="0.9"/></div>';
    expect(h(a)).not.toBe(h(b));
  });
});

// ── Media slots: an asset's pixels are metadata, its slot is design ────────
describe('media slot intrinsic dimensions', () => {
  const h = (html: string) => structuralFingerprint(html).hash;
  const slot = (w: number, ht: number, cls = 'aspect-[9/16] object-cover rounded-tile w-full') =>
    `<img class="${cls}" width="${w}" height="${ht}"/>`;

  it('swapping a photo for one of another size does NOT change the structure', () => {
    expect(h(slot(914, 1625))).toBe(h(slot(768, 1365)));
  });

  it('removing width does', () => {
    expect(h(slot(914, 1625))).not.toBe(h('<img class="aspect-[9/16] object-cover rounded-tile w-full" height="1625"/>'));
  });

  it('changing the slot classes does', () => {
    expect(h(slot(914, 1625))).not.toBe(h(slot(914, 1625, 'aspect-square object-cover w-full')));
  });

  it('a fixed-size template asset OUTSIDE a media slot keeps its dimensions', () => {
    // The guarantee seal: `mx-auto size-28`, always 112. That is a design
    // size, not an asset's intrinsic pixels, and it has neither object-cover
    // nor w-full — which is exactly why the slot signature excludes it.
    expect(h('<img class="mx-auto size-28" width="112" height="112"/>')).not.toBe(
      h('<img class="mx-auto size-28" width="140" height="140"/>'),
    );
  });
});

// ── Radio groups: the React id is noise, the GROUPING is not ──────────────
describe('radio group canonicalization', () => {
  const h = (html: string) => structuralFingerprint(html).hash;
  const radios = (names: string[]) =>
    `<div>${names.map((n) => `<input type="radio" name="${n}"/>`).join('')}</div>`;

  it('a renumbered React id does NOT change the structure', () => {
    expect(h(radios(['_r17R_3_', '_r17R_3_', '_r17R_0_', '_r17R_0_']))).toBe(
      h(radios(['_r99R_1_', '_r99R_1_', '_r99R_7_', '_r99R_7_'])),
    );
  });

  it('but two groups accidentally FUSED into one does', () => {
    // The failure a constant `<react-id>` would have hidden entirely.
    expect(h(radios(['_r17R_3_', '_r17R_3_', '_r17R_0_', '_r17R_0_']))).not.toBe(
      h(radios(['_r1R_0_', '_r1R_0_', '_r1R_0_', '_r1R_0_'])),
    );
  });

  it('and one group SPLIT across two names does', () => {
    expect(h(radios(['_r1R_0_', '_r1R_0_']))).not.toBe(h(radios(['_r1R_0_', '_r1R_1_'])));
  });

  it('a hand-written group name is left alone and still compared', () => {
    expect(h(radios(['shipping', 'shipping']))).not.toBe(h(radios(['billing', 'billing'])));
  });

  it('a non-radio input is never touched', () => {
    const a = '<div><input type="text" name="_r1R_0_"/></div>';
    const b = '<div><input type="text" name="_r9R_4_"/></div>';
    expect(h(a)).not.toBe(h(b));
  });
});

// ── Repeated items that carry their own DOM identity ──────────────────────
describe('relational identity inside a repeated item', () => {
  const item = (n: number, controls?: number) =>
    `<div class="faqitem"><button id="faq-trigger-${n}" aria-controls="faq-panel-${controls ?? n}"></button>` +
    `<div id="faq-panel-${n}" aria-labelledby="faq-trigger-${n}"></div></div>`;
  const faq = (ids: number[], crossLink = false) =>
    `<div class="divide-y rounded-tile">${ids.map((n, i) => item(n, crossLink && i === 0 ? ids[1] : undefined)).join('')}</div>`;

  const SHAPE =
    '<div class="faqitem">\n' +
    '  <button aria-controls="<item-ref-2>" id="<item-ref-1>">\n' +
    '  <div aria-labelledby="<item-ref-1>" id="<item-ref-2>">';
  const GRAMMAR = [
    {
      id: 'faq/items',
      wrapper: { tag: 'div', classes: ['divide-y', 'rounded-tile'] },
      kind: 'repeat',
      relationalIds: true,
      shapes: [{ name: 'FaqItem', skeleton: SHAPE }],
    },
  ];
  const h = (html: string) => structuralFingerprint(html, GRAMMAR).hash;

  it('a different NUMBER of items does not change the grammar', () => {
    expect(h(faq([0, 1, 2, 3]))).toBe(h(faq([0, 1, 2, 3, 4, 5, 6])));
  });

  it('a different ORDINAL does not either', () => {
    expect(h(faq([0, 1]))).toBe(h(faq([5, 9])));
  });

  it('but a trigger pointing at ANOTHER item\'s panel fails', () => {
    // The ordinal is wiring; the RELATION is structure. A cross-link leaves a
    // reference this item's map does not contain, so its shape stops matching.
    expect(h(faq([0, 1, 2, 3]))).not.toBe(h(faq([0, 1, 2, 3], true)));
  });

  it('and a missing aria-controls fails', () => {
    expect(h(faq([0, 1]))).not.toBe(h(faq([0, 1]).replace(/ aria-controls="[^"]*"/, '')));
  });
});

// ── Tuple repetition: a grid whose rows are flat sibling cells ────────────
describe('tuple repetition', () => {
  const cell = (c: string) => `<div class="${c}"></div>`;
  const grid = (rows: number, opts: { lastInMiddle?: boolean; noLast?: boolean } = {}) => {
    const body = Array.from({ length: rows }, (_, i) => {
      const last = i === rows - 1;
      const closed = opts.lastInMiddle ? i === 0 : last && !opts.noLast;
      return cell('row') + cell(closed ? 'rounded-b-card' : 'ours') + cell(closed ? 'rounded-b-card' : 'theirs');
    }).join('');
    return `<div class="grid">${cell('h1')}${cell('h2')}${cell('h3')}${body}</div>`;
  };
  const GRAMMAR = [
    {
      id: 'comparison/rows',
      wrapper: { tag: 'div', classes: ['grid'] },
      kind: 'repeat',
      tuple: {
        prefix: 3,
        size: 3,
        shapes: [{ name: 'Row', skeleton: '<div class="row">\n<div class="ours">\n<div class="theirs">' }],
        lastShape: {
          name: 'LastRow',
          skeleton: '<div class="row">\n<div class="rounded-b-card">\n<div class="rounded-b-card">',
        },
      },
    },
  ];
  const h = (html: string) => structuralFingerprint(html, GRAMMAR).hash;

  it('3 rows and 6 rows are the same grammar', () => {
    expect(h(grid(3))).toBe(h(grid(6)));
  });

  it('a missing cell fails — arity is structure, never truncated', () => {
    expect(h(grid(3))).not.toBe(h(grid(3).replace('<div class="theirs"></div>', '')));
  });

  it('an extra cell fails too', () => {
    expect(h(grid(3))).not.toBe(h(grid(3).replace('</div>', `${cell('extra')}</div>`)));
  });

  it('a changed header fails — the prefix is compared verbatim', () => {
    expect(h(grid(3))).not.toBe(h(grid(3).replace('class="h2"', 'class="hX"')));
  });

  it('the closing style in the MIDDLE fails — position is structure', () => {
    expect(h(grid(3))).not.toBe(h(grid(3, { lastInMiddle: true })));
  });

  it('and the closing style missing from the last row fails', () => {
    expect(h(grid(3))).not.toBe(h(grid(3, { noLast: true })));
  });
});

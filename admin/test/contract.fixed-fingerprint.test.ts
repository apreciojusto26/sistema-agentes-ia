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
<astro-island uid="Z1qBcD" component-url="/_astro/CartDrawer.9f2a1c.js" component-export="CartDrawer" renderer-url="/_astro/client.ab12.js" props="{&quot;price&quot;:4899}" ssr client="load"></astro-island>
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

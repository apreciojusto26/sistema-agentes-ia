// THE ONE navigation contract: anchor ids and legal routes, in one place.
//
// WHY IT EXISTS. 14-site-footer.astro built its links from a local array of
// LABELS and rendered every one of them as `<a href="#">` — a single href in
// the whole file. Ten dead links on every landing this system has produced.
//
// Fixing that with a second hand-written map would just move the problem: the
// footer would claim `#how-it-works` and nothing would notice the day a
// section stopped emitting it. So the ids live here, the SECTIONS import them,
// the FOOTER imports them, and a contract test asserts every internal anchor
// resolves against the real rendered page.
//
// NAMING. Kebab-case, English, matching the registry capability type — the
// same convention `id="buy"` already set. Deliberately NOT derived from the
// visible Spanish copy: an id is a stable contract, and "Cómo funciona" is
// editorial text a Content Agent may reword tomorrow.

/** Anchor ids emitted by real sections. The key is the registry capability. */
export const SECTION_ANCHORS = {
  BuyBox: 'buy',
  HowItWorks: 'how-it-works',
  Faq: 'faq',
  Guarantee: 'guarantee',
} as const;

export type SectionAnchor = (typeof SECTION_ANCHORS)[keyof typeof SECTION_ANCHORS];

/**
 * PENDING ROUTES. These labels have no page yet, so they keep the placeholder
 * they have always had rather than pointing at a 404 — a dead anchor is inert,
 * a broken route is a worse regression than the one being fixed. The legal
 * pages and their real hrefs land together in the very next commit; nothing
 * here is meant to survive it.
 */
const PENDING = '#';

export interface NavLink {
  label: string;
  href: string;
}

/**
 * The footer, as data. One source for the component and for every test — the
 * old version kept labels in the component and hrefs nowhere.
 */
export const FOOTER_COLUMNS: ReadonlyArray<{ title: string; links: readonly NavLink[] }> = [
  {
    title: 'Producto',
    links: [
      { label: 'Cómo funciona', href: `#${SECTION_ANCHORS.HowItWorks}` },
      { label: 'Preguntas frecuentes', href: `#${SECTION_ANCHORS.Faq}` },
      { label: 'Garantía', href: `#${SECTION_ANCHORS.Guarantee}` },
    ],
  },
  {
    title: 'Ayuda',
    links: [
      { label: 'Envíos', href: PENDING },
      { label: 'Devoluciones', href: PENDING },
      { label: 'Contacto', href: PENDING },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Términos y condiciones', href: PENDING },
      { label: 'Privacidad', href: PENDING },
      { label: 'Cookies', href: PENDING },
      { label: 'Aviso legal', href: PENDING },
    ],
  },
];

/** Every internal anchor the footer points at, for the resolves-to-a-real-id test. */
export function footerAnchorIds(): string[] {
  return FOOTER_COLUMNS.flatMap((c) => c.links)
    .filter((l) => l.href.startsWith('#'))
    .map((l) => l.href.slice(1));
}

/** Every route the footer points at, for the page-exists test. */
export function footerRoutes(): string[] {
  return FOOTER_COLUMNS.flatMap((c) => c.links)
    .filter((l) => l.href.startsWith('/'))
    .map((l) => l.href);
}

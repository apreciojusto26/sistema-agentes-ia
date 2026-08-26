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
 * Legal routes. Every one is a REAL page under src/pages/legal/; there is no
 * entry here that does not resolve, and a contract test proves it by reading
 * the filesystem rather than trusting this list.
 *
 * These were placeholders for exactly one commit — the anchor contract landed
 * first, and pointing at pages that did not exist yet would have traded ten
 * dead anchors for seven 404s.
 */
export const LEGAL_ROUTES = {
  shipping: '/legal/envios',
  returns: '/legal/devoluciones',
  contact: '/legal/contacto',
  terms: '/legal/terminos',
  privacy: '/legal/privacidad',
  cookies: '/legal/cookies',
  notice: '/legal/aviso-legal',
} as const;

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
      { label: 'Envíos', href: LEGAL_ROUTES.shipping },
      { label: 'Devoluciones', href: LEGAL_ROUTES.returns },
      { label: 'Contacto', href: LEGAL_ROUTES.contact },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Términos y condiciones', href: LEGAL_ROUTES.terms },
      { label: 'Privacidad', href: LEGAL_ROUTES.privacy },
      { label: 'Cookies', href: LEGAL_ROUTES.cookies },
      { label: 'Aviso legal', href: LEGAL_ROUTES.notice },
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

import type { Testimonial } from '@/types/content';

/**
 * Reviews of this product, taken from its AliExpress listing and translated /
 * lightly copy-edited. The BODIES are what real buyers wrote; everything that
 * once surrounded them was not.
 *
 * WHAT WAS REMOVED, AND WHY IT WAS NEVER REAL. Each entry used to carry a full
 * Spanish persona — `author: 'Marina Sosto'`, `location: 'Valencia'`,
 * `verified: true`. None of the three came from the listing. AliExpress
 * publishes reviewer names ALREADY MASKED (`Y***t`), publishes no reviewer
 * location, and exposes no purchase-verification signal — so the names, the
 * cities and the badges were all written here. Ten invented identities is not
 * a styling defect: it is ten fabricated people vouching for a product.
 *
 * `author: ''` is therefore the honest record, and it is deliberately not a
 * placeholder name: it means "the source gave us no author we may attribute".
 * lib/reviewer-identity.ts renders that as `Cliente`. If a future scrape DOES
 * carry an author, put it here verbatim — mask included.
 *
 * WHAT IS STILL IMPERFECT, recorded rather than quietly fixed:
 *   - every `rating` is 5. These are ten reviews curated FROM a 4.9-average
 *     listing, so the set is selection-biased and must never be used to derive
 *     a rating distribution (see 13-real-results.astro).
 *   - `date` is not rendered anywhere and is not sourced; `t-reel-1` is dated
 *     in the future. Inventing better-looking dates would be the same defect
 *     with nicer values, so they are left exactly as found.
 *
 * Origin is disclosed at the render (10-reviews-reel.astro), as EU 2019/2161
 * requires, and the site carries the footer demo disclaimer.
 */
export const testimonials: Testimonial[] = [
  {
    id: 't-featured',
    author: '',
    rating: 5,
    date: '2026-05-22',
    title: 'La atmósfera es muy fuerte',
    body: 'Estoy muy satisfecha. Solo cuando la habitación está completamente oscura se logra el efecto completo, y la atmósfera que crea es muy fuerte. Los niños duermen mucho mejor.',
    variant: 'quote',
  },
  {
    id: 't-reel-1',
    author: '',
    rating: 5,
    date: '2026-11-16',
    body: 'La proyección es clara y delicada, y la textura de la vía láctea es muy realista. Me resulta especialmente útil para dormir y relajarme después del trabajo.',
    variant: 'reel',
  },
  {
    id: 't-reel-2',
    author: '',
    rating: 5,
    date: '2026-05-22',
    body: 'Muy claro y fácil de usar, me gusta mucho. Lo usa mi hija todas las noches como luz de dormir.',
    variant: 'reel',
  },
  {
    id: 't-reel-3',
    author: '',
    rating: 5,
    date: '2026-05-12',
    body: 'Es hermoso y facilísimo de usar. Se enciende con un toque y en un segundo tienes el cielo estrellado en el techo.',
    variant: 'reel',
  },
  {
    id: 't-reel-4',
    author: '',
    rating: 5,
    date: '2026-05-27',
    body: 'Lo compré como regalo para un amigo y le gusta muchísimo. Proyección nítida y entrega rápida.',
    variant: 'reel',
  },
  {
    id: 't-reel-5',
    author: '',
    rating: 5,
    date: '2026-05-30',
    body: 'Es hermoso, tal cual lo muestran las fotos. Ojo con elegir bien la opción: la cantidad de películas varía según la variante que elijas.',
    variant: 'reel',
  },
  {
    id: 't-reel-6',
    author: '',
    rating: 5,
    date: '2026-06-13',
    body: 'Una buena luz nocturna con proyector. Lo mejor es que el enfoque se puede ajustar para que se vea nítido en cualquier distancia.',
    variant: 'reel',
  },
  {
    id: 't-card-1',
    author: '',
    rating: 5,
    date: '2026-06-29',
    body: 'Llegó en perfecto estado y muy bien embalado. Tiene un aspecto fantástico y la calidad es buena.',
    variant: 'card',
  },
  {
    id: 't-card-2',
    author: '',
    rating: 5,
    date: '2026-07-20',
    body: 'Increíble. Llegó rapidísimo, se ve de muy alta calidad y además tiene función de luz nocturna. Excelente compra.',
    variant: 'card',
  },
  {
    id: 't-card-3',
    author: '',
    rating: 5,
    date: '2026-06-20',
    body: 'Me siento como un astronauta. El efecto espacial en el techo es espectacular, lo recomiendo al 100%.',
    variant: 'card',
  },
];

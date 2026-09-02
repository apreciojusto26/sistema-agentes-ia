import type { Product } from '@/types/content';

/**
 * Single source of truth for ALL marketing copy, prices, image references,
 * bundle definitions, comparison rows, specs and badges.
 * Sections/islands MUST read from here — never hardcode strings/prices/images.
 */
export const product = {
  brand: 'AstraVibe',
  name: 'AstraVibe — Proyector de estrellas USB',
  tagline: 'El cielo estrellado, en tu habitación.',
  subtagline:
    'Proyector de estrellas con proyecciones intercambiables y luz nocturna: cambia la escena y transforma tu habitación en segundos.',

  commerce: {
    shopifyHandle:
      'usb-mini-galaxy-star-projector-star-with-24-sliding-projection-films-starry-space-atmosphere-nightlight-kid-car-home-decoration',
    // BXGY discount rule is NOT yet configured in Shopify admin — ship false.
    // Only flip to true once a real cart shows discountCents > 0 (see errors.noDiscount below).
    bundleOfferActive: false,
  },

  // Admin's internal option name is "Emitting Color" — NEVER shown to buyers.
  // The 9 values are projection configurations, not colors.
  variantGroupLabel: 'Elige tus proyecciones',

  errors: {
    network: 'No pudimos conectar con la tienda. Prueba de nuevo en unos segundos.',
    soldOut: 'Esta variante está agotada por el momento.',
    expired: 'Tu carrito expiró. Elige tu opción de nuevo para continuar.',
    noDiscount: 'El total mostrado es el precio final calculado por la tienda.',
    generic: 'Algo salió mal. Prueba de nuevo.',
  },

  ratingAverage: 4.9,
  ratingCount: 128,
  ratingBreakdown: {
    5: 120,
    4: 4,
    3: 2,
    2: 1,
    1: 1,
  },

  badges: ['Envío gratis', 'Cable USB incluido', 'Garantía 30 días'],

  trustTicker: [
    'Envío gratis a España',
    'Pago 100% seguro',
    '+120 reseñas de 5 estrellas',
    'Garantía de 30 días',
    'Hasta 24 proyecciones intercambiables',
  ],

  offer: {
    durationMinutes: 15,
    label: 'Oferta de lanzamiento termina en',
    expiredLabel: 'La oferta ha finalizado',
  },

  benefits: [
    {
      id: 'escenas',
      icon: 'sparkle',
      title: 'Escenas intercambiables',
      text: 'Desliza entre las películas de proyección de tu versión (hasta 24) y pasa de un cielo estrellado a la vía láctea en segundos.',
    },
    {
      id: 'luz-nocturna',
      icon: 'star',
      title: 'Luz nocturna estrellada',
      text: 'Emite una luz suave y relajante con efecto estrellado, ideal para dormir o relajarse en casa.',
    },
    {
      id: 'un-toque',
      icon: 'check',
      title: 'Se enciende con un toque',
      text: 'Sin apps ni mando: conéctalo por USB, toca, y la proyección arranca al instante.',
    },
    {
      id: 'abs-resistente',
      icon: 'shield',
      title: 'ABS resistente',
      text: 'Material ABS de alta resistencia y 30 cm compactos para cualquier estante, mesita o rincón.',
    },
  ],

  heroPills: ['Proyecciones intercambiables', 'Encendido con toque', 'Se conecta por USB'],

  specs: [
    { label: 'Modelo', value: 'AA1458' },
    { label: 'Material del cuerpo', value: 'ABS de alta resistencia' },
    { label: 'Longitud', value: '30 cm' },
    { label: 'Flujo luminoso', value: '249–2000 lúmenes' },
    { label: 'Potencia', value: '0–5 W' },
    { label: 'Alimentación', value: 'USB (cable incluido)' },
    { label: 'Activación', value: 'Con toque' },
  ],

  packs: [
    {
      id: 'x1',
      units: 1,
      freeUnits: 0,
      label: 'Pack 1 unidad',
      sublabel: 'Ideal para probar',
      default: true,
      popular: false,
    },
    {
      id: 'x2free1',
      units: 2,
      freeUnits: 0,
      discountPercent: 5,
      label: 'Pack 2 unidades',
      sublabel: 'El que más se lleva',
      popular: true,
      default: false,
    },
  ],

  gallery: [
    {
      id: 'g1',
      asset: 'gallery-01',
      alt: 'AstraVibe encendido proyectando estrellas junto al producto, toma nítida en penumbra',
      ratio: '4/5',
      label: 'Vista frontal',
    },
    {
      id: 'g2',
      asset: 'gallery-02',
      alt: 'Cielo de estrellas proyectado por AstraVibe en el techo de una habitación oscura',
      ratio: '4/5',
      label: 'Proyección estrellada',
    },
    {
      id: 'g3',
      asset: 'gallery-03',
      alt: 'Proyección de AstraVibe en acción con estrellas nítidas sobre una superficie',
      ratio: '4/5',
      label: 'Proyección en acción',
    },
    {
      id: 'g4',
      asset: 'gallery-04',
      alt: 'Efecto vía láctea azulada proyectado por AstraVibe en penumbra',
      ratio: '1/1',
      label: 'Efecto vía láctea',
    },
    {
      id: 'g5',
      asset: 'gallery-05',
      alt: 'AstraVibe en modo luz nocturna con resplandor cálido junto a la cama',
      ratio: '4/5',
      label: 'Modo luz nocturna',
    },
  ],

  /**
   * Own media appended AFTER the Shopify catalogue images in the hero
   * carousel. Empty on purpose: the photos and both clips live in the
   * scrolling strip below (`ugcStrip`), so the hero is the catalogue only.
   * The carousel still renders video — add an entry with kind: 'video' and a
   * poster to put one back.
   */
  heroExtras: [],

  /**
   * The scrolling strip. Real photographs first — they are the proof — then
   * the three generated illustrations. gallery-11 and gallery-12 are marked
   * because they misrepresent the product; see the note in each.
   */
  ugcStrip: [
    {
      asset: 'gallery-07',
      alt: 'Mano sosteniendo AstraVibe mientras cambia la película de proyección, con el resto de proyecciones alrededor',
      ratio: '9/16',
    },
    {
      asset: 'video-05',
      kind: 'video',
      poster: 'video-05-poster',
      alt: 'AstraVibe en la mano mostrando su cable USB y el botón táctil',
      ratio: '9/16',
    },
    {
      asset: 'gallery-09',
      alt: 'Manos sosteniendo la caja de AstraVibe al aire libre, con el proyector y el cable USB impresos en el envase',
      ratio: '9/16',
    },
    {
      asset: 'gallery-08',
      alt: 'Proyección de un planeta con bandas naranjas sobre una pared oscura',
      ratio: '9/16',
    },
    {
      asset: 'video-04',
      kind: 'video',
      poster: 'video-04-poster',
      alt: 'AstraVibe encendido en modo luz nocturna iluminando una habitación',
      ratio: '9/16',
    },
    {
      asset: 'gallery-06',
      alt: 'Proyección de una ballena entre estrellas sobre una superficie oscura',
      ratio: '9/16',
    },
    // Generadas, no fotografías del producto real.
    {
      asset: 'gallery-10',
      alt: 'AstraVibe apagado sobre una mesa de madera con su cuello flexible y el conector USB a la vista',
      ratio: '9/16',
    },
    // Muestra una proyección mucho mayor y más nítida de la que el producto
    // consigue realmente (comparar con gallery-06, que es una proyección real).
    {
      asset: 'gallery-11',
      alt: 'Habitación infantil a oscuras con una ballena proyectada en el techo mientras dos niños la miran desde la cama',
      ratio: '9/16',
    },
    // Renderiza el cuerpo en gris; el producto que se envía es blanco.
    {
      asset: 'gallery-12',
      alt: 'Mano encendiendo AstraVibe conectado a un adaptador USB junto a una mesita',
      ratio: '9/16',
    },
  ],

  steps: [
    {
      step: 1,
      title: 'Elige tu proyección',
      text: 'Escoge entre las versiones de 1, 6 o 24 proyecciones y encuentra el ambiente que más te guste.',
      media: {
        asset: 'step-01',
        alt: 'Cielo colorido proyectado por AstraVibe con efecto vía láctea y nebulosa',
        ratio: '4/3',
      },
    },
    {
      step: 2,
      title: 'Enciende Astra Vibe',
      text: 'Coloca tu proyector de galaxias donde quieras y actívalo fácilmente con su control táctil.',
      media: {
        asset: 'video-01',
        kind: 'video',
        poster: 'video-01-poster',
        alt: 'AstraVibe encendiéndose con un toque: la proyección estrellada aparece al instante',
        ratio: '4/3',
      },
    },
    {
      step: 3,
      title: 'Disfruta del ambiente',
      text: 'Apaga las luces y deja que Astra Vibe proyecte estrellas y galaxias para crear un espacio perfecto para relajarte o decorar tu habitación.',
      media: {
        asset: 'gallery-05',
        alt: 'AstraVibe en modo luz nocturna ambientando un rincón oscuro',
        ratio: '4/3',
      },
    },
  ],

  comparison: [
    { feature: 'Escenas de proyección deslizables (hasta 24)', ours: true, rival: 'Fija, sin cambios' },
    { feature: 'Proyección de estrellas en techo y paredes', ours: true, rival: false },
    { feature: 'Doble función: proyector y luz nocturna', ours: true, rival: 'Solo luz' },
    { feature: 'Encendido con toque, sin mando ni app', ours: true, rival: 'Requiere mando' },
    { feature: 'Portátil: hogar, coche y dormitorios', ours: true, rival: 'Fija en un lugar' },
    { feature: 'Alimentación por USB, cable incluido', ours: true, rival: false },
    { feature: 'Material ABS resistente', ours: true, rival: true },
  ],

  guarantee: {
    days: 30,
    title: 'Garantía de 30 días',
    text: 'Si AstraVibe no supera tus expectativas, te devolvemos el dinero. Sin vueltas.',
    points: [
      'Devolución simple dentro de los 30 días',
      'Reembolso completo, sin preguntas',
      'Atención al cliente en español',
    ],
  },

  shipping: {
    etaLabel: 'Envío de 8 días hábiles',
    // 0 = free on EVERY order, no minimum — shipping cost and margin are
    // already priced INTO the product, so there is nothing left to recover at
    // checkout. Also keeps the summary consistent with the unconditional
    // "Envío gratis a España" in trustTicker + TrustSignals; the old 2900
    // threshold contradicted that copy on the 21 € variant (2026-08-21).
    freeOverCents: 0,
  },

  ugc: [
    { asset: 'ugc-01', alt: 'Efecto vía láctea de AstraVibe sobre una superficie en penumbra', ratio: '9/16' },
    { asset: 'ugc-02', alt: 'AstraVibe como luz nocturna cálida junto a la cama', ratio: '9/16' },
    { asset: 'video-03', kind: 'video', alt: 'Proyección de la vía láctea de AstraVibe en movimiento', ratio: '9/16' },
    { asset: null, alt: '[PLACEHOLDER] AstraVibe colocado en un coche proyectando estrellas en el techo interior', ratio: '9/16' },
    { asset: 'video-02', kind: 'video', alt: 'Proyección de estrellas de AstraVibe, escena estable en movimiento', ratio: '9/16' },
    { asset: 'ugc-03', alt: 'Cielo de estrellas de AstraVibe en una habitación oscura', ratio: '9/16' },
  ],

  cta: {
    primary: 'Comprar ahora',
    sticky: 'Agregar al carrito',
    checkout: 'Finalizar compra',
    pending: 'Agregando...',
    soldOut: 'Agotado',
  },
} as const satisfies Product;

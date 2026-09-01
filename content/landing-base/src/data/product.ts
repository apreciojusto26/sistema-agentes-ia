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
    'Proyector de estrellas con 24 películas deslizables y luz nocturna: crea una atmósfera espacial mágica con un solo toque.',

  commerce: {
    shopifyHandle:
      'usb-mini-galaxy-star-projector-star-with-24-sliding-projection-films-starry-space-atmosphere-nightlight-kid-car-home-decoration',
    // BXGY discount rule is NOT yet configured in Shopify admin — ship false.
    // Only flip to true once a real cart shows discountCents > 0 (see errors.noDiscount below).
    bundleOfferActive: false,
  },

  // Admin's internal option name is "Emitting Color" — NEVER shown to buyers.
  // The 9 values are projection configurations, not colors.
  variantGroupLabel: 'Tipo de proyección',

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

  // PRODUCT badges only. 'Envío 24-48h' and 'Garantía 30 días' used to sit
  // here; both are merchant policy and are derived in lib/policy.ts now.
  badges: ['Pila incluida', '24 películas deslizables', 'USB-C'],

  // PRODUCT ticker copy only. The policy half — returns window, delivery
  // estimate, commercial guarantee — is prepended by 01-utility-bar.astro from
  // lib/policy.ts. 'Envío gratis desde 29€' and 'Garantía de 30 días' were here
  // and are gone: neither was configured anywhere.
  trustTicker: [
    'Pago 100% seguro',
    '+120 reseñas de 5 estrellas',
    '24 películas deslizables',
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
      title: '24 escenas deslizables',
      text: 'Desliza entre 24 películas de proyección y pasa de un cielo estrellado a la vía láctea en segundos.',
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
      text: 'Sin enchufe ni apps: toca y la proyección arranca al instante, con pila botón incluida.',
    },
    {
      id: 'abs-resistente',
      icon: 'shield',
      title: 'ABS resistente',
      text: 'Material ABS de alta resistencia y 30 cm compactos para cualquier estante, mesita o rincón.',
    },
  ],

  heroPills: ['24 películas deslizables', 'Encendido con toque', 'Pila incluida'],

  specs: [
    { label: 'Modelo', value: 'AA1458' },
    { label: 'Material del cuerpo', value: 'ABS de alta resistencia' },
    { label: 'Longitud', value: '30 cm' },
    { label: 'Flujo luminoso', value: '249–2000 lúmenes' },
    { label: 'Potencia', value: '0–5 W' },
    { label: 'Alimentación', value: 'Pila botón (incluida)' },
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
      freeUnits: 1,
      label: 'Pack 2 + 1 GRATIS',
      sublabel: 'El que más se lleva',
      badge: 'Más popular',
      popular: true,
      freeGift: true,
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

  steps: [
    {
      step: 1,
      title: 'Desliza para cambiar la escena',
      text: 'Las 24 películas deslizantes te dejan alternar entre cielos estrellados, nebulosas y la vía láctea con un simple gesto.',
      media: {
        asset: 'step-01',
        alt: 'Cielo colorido proyectado por AstraVibe con efecto vía láctea y nebulosa',
        ratio: '4/3',
      },
    },
    {
      step: 2,
      title: 'Un toque para encender',
      text: 'Sin enchufe ni dispositivos inteligentes: toca la superficie y la proyección arranca al instante, alimentada por pila botón incluida.',
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
      title: 'Ambiente nocturno en cualquier rincón',
      text: 'Sus 30 cm compactos y la batería por pila lo hacen perfecto para mesitas, estantes, coches o la habitación de los niños.',
      media: {
        asset: 'gallery-05',
        alt: 'AstraVibe en modo luz nocturna ambientando un rincón oscuro',
        ratio: '4/3',
      },
    },
  ],

  comparison: [
    { feature: '24 escenas de proyección deslizables', ours: true, rival: 'Fija, sin cambios' },
    { feature: 'Proyección de estrellas en techo y paredes', ours: true, rival: false },
    { feature: 'Doble función: proyector y luz nocturna', ours: true, rival: 'Solo luz' },
    { feature: 'Encendido con toque, sin cables', ours: true, rival: 'Requiere clavija' },
    { feature: 'Portátil: hogar, coche y dormitorios', ours: true, rival: 'Fija en un lugar' },
    { feature: 'Pila botón incluida', ours: true, rival: false },
    { feature: 'Material ABS resistente', ours: true, rival: true },
  ],

  // The GENERIC alternative, never a brand. Replaces the heading literal that
  // used to live in the Comparison component and claimed every product on
  // earth competed with a decorative lamp.
  comparisonRival: 'lámparas decorativas comunes',



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
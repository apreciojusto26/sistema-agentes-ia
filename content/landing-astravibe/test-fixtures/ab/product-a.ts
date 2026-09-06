// PRODUCT A — a contractual fixture, not a real listing.
//
// Exists to answer one question with Product B: do two unrelated products
// still render the same structural grammar? So every value here is chosen to
// DIFFER from B — brand, price, rating, media, cardinalities — while staying
// contractually valid. None of it may ever be reused as a fallback for a real
// landing.
import type { Product } from '@/types/content';

export const product = {
  brand: 'Nordika',
  name: 'Nordika — Difusor de aromas cerámico',
  // Derived exactly as a real generation would (scripts/lib/display-name
  // .mjs's deriveDisplayName): every word of it appears in `name`, in order.
  // Added when the buy box started reading `displayName` instead of `name`
  // for its heading — this fixture predated that field and was rendering an
  // empty <h2> in preview mode until it was.
  displayName: 'Nordika — Difusor de aromas cerámico',
  tagline: 'El aroma de un bosque, en tu salón.',
  subtagline: 'Difusor ultrasónico de cerámica con temporizador y luz cálida regulable.',

  commerce: { shopifyHandle: 'nordika-difusor-ceramico', bundleOfferActive: false },
  variantGroupLabel: 'Elige tu acabado',

  errors: {
    network: 'No pudimos conectar con la tienda.',
    soldOut: 'Este acabado está agotado.',
    expired: 'Tu carrito expiró.',
    noDiscount: 'El total mostrado es el precio final.',
    generic: 'Algo salió mal.',
  },

  ratingAverage: 4.9,
  ratingCount: 128,

  badges: ['Envío gratis', 'Cerámica esmaltada'],
  trustTicker: ['Envío gratis a España', 'Pago 100% seguro'],
  offer: { durationMinutes: 15, label: 'Oferta termina en', expiredLabel: 'Oferta finalizada' },

  benefits: [
    { id: 'aroma', icon: 'sparkle', title: 'Aroma envolvente', text: 'Difusión ultrasónica silenciosa que cubre hasta 30 m².' },
    { id: 'luz', icon: 'star', title: 'Luz cálida regulable', text: 'Tres intensidades para acompañar la noche.' },
    { id: 'temporizador', icon: 'clock', title: 'Temporizador', text: 'Ciclos de 1, 3 y 6 horas con apagado automático.' },
    { id: 'ceramica', icon: 'shield', title: 'Cerámica esmaltada', text: 'Acabado mate resistente a la humedad.' },
  ],
  heroPills: ['Cerámica esmaltada', 'Temporizador', 'Luz regulable'],
  specs: [
    { label: 'Material', value: 'Cerámica esmaltada' },
    { label: 'Capacidad', value: '300 ml' },
    { label: 'Autonomía', value: 'Hasta 6 h' },
  ],

  packs: [
    { id: 'x1', units: 1, freeUnits: 0, label: 'Pack 1 unidad', sublabel: 'Ideal para probar', default: true, popular: false },
    { id: 'x2', units: 2, freeUnits: 0, discountPercent: 10, label: 'Pack 2 unidades', sublabel: 'El más elegido', popular: true, default: false },
  ],

  // FOUR gallery images, 896x1200 and 900x1600 — deliberately different files
  // and different intrinsic dimensions from B's.
  gallery: [
    { id: 'g1', asset: 'gallery-01', alt: 'Difusor sobre una mesa de madera', ratio: '4/5', label: 'Vista frontal' },
    { id: 'g2', asset: 'gallery-02', alt: 'Vapor saliendo del difusor en penumbra', ratio: '4/5', label: 'En uso' },
    { id: 'g3', asset: 'gallery-06', alt: 'Detalle del esmalte mate', ratio: '4/5', label: 'Detalle' },
    { id: 'g4', asset: 'gallery-04', alt: 'Difusor junto a un sillón', ratio: '1/1', label: 'Ambiente' },
  ],
  heroExtras: [],

  // SIX strip items, mixing stills and one clip.
  ugcStrip: [
    { asset: 'gallery-07', alt: 'Mano llenando el depósito', ratio: '9/16' },
    { asset: 'video-05', kind: 'video', poster: 'video-05-poster', alt: 'Difusor encendido', ratio: '9/16' },
    { asset: 'gallery-08', alt: 'Luz cálida sobre la pared', ratio: '9/16' },
    { asset: 'gallery-09', alt: 'Caja del producto', ratio: '9/16' },
    { asset: 'gallery-06', alt: 'Textura del esmalte', ratio: '9/16' },
    { asset: 'gallery-10', alt: 'Difusor apagado en una repisa', ratio: '9/16' },
  ],

  steps: [
    { step: 1, title: 'Llena el depósito', text: 'Hasta la marca de 300 ml con agua templada.', media: { asset: 'step-01', alt: 'Depósito abierto', ratio: '4/3' } },
    { step: 2, title: 'Añade tu aceite', text: 'Entre tres y cinco gotas del aroma que prefieras.', media: { asset: 'gallery-03', alt: 'Aceite esencial', ratio: '4/3' } },
    { step: 3, title: 'Elige el ciclo', text: 'Uno, tres o seis horas con apagado automático.', media: { asset: 'gallery-05', alt: 'Panel de control', ratio: '4/3' } },
  ],

  // FOUR comparison rows, mixing boolean and text cells in both columns.
  comparison: [
    { feature: 'Material', ours: 'Cerámica', rival: 'Plástico' },
    { feature: 'Temporizador', ours: true, rival: false },
    { feature: 'Luz regulable', ours: true, rival: 'Fija' },
    { feature: 'Autonomía', ours: '6 h', rival: '2 h' },
  ],

  shipping: { freeOverCents: 0 },


  cta: { primary: 'Comprar ahora', sticky: 'Agregar al carrito', checkout: 'Finalizar compra', pending: 'Procesando…', soldOut: 'Agotado' },
} as const satisfies Product;

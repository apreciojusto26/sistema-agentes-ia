// PRODUCT B — deliberately a DIFFERENT product, not A with other words.
//
// Different category, different price band, different rating, different media
// files with different intrinsic dimensions, and different cardinalities in
// every collection: 6 gallery images against A's 4, 9 strip items against 6,
// 6 comparison rows against 4. If the structural grammar still matches A's,
// that is the claim this pair exists to prove.
import type { Product } from '@/types/content';

export const product = {
  brand: 'Roble & Sal',
  name: 'Roble & Sal — Tabla de corte de roble macizo',
  tagline: 'Una tabla que dura más que la cocina.',
  subtagline: 'Roble macizo con canal perimetral y pies antideslizantes, tratada con aceite alimentario.',

  commerce: { shopifyHandle: 'roble-sal-tabla-roble', bundleOfferActive: false },
  variantGroupLabel: 'Elige el tamaño',

  errors: {
    network: 'Sin conexión con la tienda.',
    soldOut: 'Ese tamaño no está disponible.',
    expired: 'El carrito caducó.',
    noDiscount: 'Precio final calculado por la tienda.',
    generic: 'Ha ocurrido un error.',
  },

  // 4.2, not 4.9 — the rating value that used to leak into the Stars opacity.
  ratingAverage: 4.2,
  ratingCount: 57,

  badges: ['Roble macizo', 'Hecho en España', 'Aceite alimentario'],
  trustTicker: ['Envío gratis a España', 'Pago 100% seguro', 'Madera de origen certificado'],
  offer: { durationMinutes: 30, label: 'Precio de lanzamiento', expiredLabel: 'Lanzamiento finalizado' },

  benefits: [
    { id: 'roble', icon: 'shield', title: 'Roble macizo', text: 'Una sola pieza, sin encolados ni contrachapados.' },
    { id: 'canal', icon: 'check', title: 'Canal perimetral', text: 'Recoge los jugos sin que lleguen a la encimera.' },
    { id: 'pies', icon: 'lock', title: 'Pies antideslizantes', text: 'Se queda quieta mientras cortas.' },
    { id: 'aceite', icon: 'sparkle', title: 'Aceite alimentario', text: 'Tratada con aceite apto para contacto con alimentos.' },
  ],
  heroPills: ['Roble macizo', 'Canal perimetral', 'Doble cara'],
  specs: [
    { label: 'Madera', value: 'Roble macizo' },
    { label: 'Medidas', value: '40 x 28 x 3 cm' },
    { label: 'Peso', value: '2,1 kg' },
    { label: 'Tratamiento', value: 'Aceite alimentario' },
  ],

  // THREE packs against A's two, and a different discount shape.
  packs: [
    { id: 'x1', units: 1, freeUnits: 0, label: 'Una tabla', sublabel: 'La medida estándar', default: true, popular: false },
    { id: 'x2', units: 2, freeUnits: 0, badge: 'Más vendido', label: 'Dos tablas', popular: true, default: false },
    { id: 'x3', units: 3, freeUnits: 0, discountPercent: 15, label: 'Tres tablas', sublabel: 'Para regalar', default: false, popular: false },
  ],

  // SIX gallery images against A's four, and different files: 768x1376 and
  // 714x1280 rather than A's 896x1200 / 900x1600.
  gallery: [
    { id: 'g1', asset: 'gallery-11', alt: 'Tabla sobre la encimera', ratio: '4/5', label: 'Vista frontal' },
    { id: 'g2', asset: 'gallery-12', alt: 'Canal perimetral en detalle', ratio: '4/5', label: 'Canal' },
    { id: 'g3', asset: 'ugc-01', alt: 'Tabla con pan recién cortado', ratio: '4/5', label: 'En uso' },
    { id: 'g4', asset: 'ugc-02', alt: 'Veta del roble', ratio: '1/1', label: 'Veta' },
    { id: 'g5', asset: 'ugc-03', alt: 'Pies antideslizantes', ratio: '4/5', label: 'Base' },
    { id: 'g6', asset: 'step-01', alt: 'Tabla colgada en la pared', ratio: '4/5', label: 'Guardado' },
  ],
  heroExtras: [],

  // NINE strip items against A's six, with two clips instead of one.
  ugcStrip: [
    { asset: 'gallery-11', alt: 'Tabla en la cocina', ratio: '9/16' },
    { asset: 'video-02', kind: 'video', alt: 'Cortando sobre la tabla', ratio: '9/16' },
    { asset: 'gallery-12', alt: 'Detalle del canal', ratio: '9/16' },
    { asset: 'ugc-01', alt: 'Pan sobre la tabla', ratio: '9/16' },
    { asset: 'video-04', kind: 'video', poster: 'video-04-poster', alt: 'Aceitando la madera', ratio: '9/16' },
    { asset: 'ugc-02', alt: 'Veta del roble', ratio: '9/16' },
    { asset: 'ugc-03', alt: 'Base antideslizante', ratio: '9/16' },
    { asset: 'gallery-10', alt: 'Tabla apoyada', ratio: '9/16' },
    { asset: 'step-01', alt: 'Tabla colgada', ratio: '9/16' },
  ],

  steps: [
    { step: 1, title: 'Lava a mano', text: 'Agua templada y jabón suave; nunca lavavajillas.', media: { asset: 'gallery-01', alt: 'Lavando la tabla', ratio: '4/3' } },
    { step: 2, title: 'Seca de pie', text: 'En vertical, para que ambas caras aireen por igual.', media: { asset: 'gallery-02', alt: 'Tabla secando', ratio: '4/3' } },
    { step: 3, title: 'Aceita cada mes', text: 'Una capa fina de aceite alimentario y deja reposar.', media: { asset: 'gallery-03', alt: 'Aplicando aceite', ratio: '4/3' } },
  ],

  // SIX comparison rows against A's four, with a different boolean/text mix.
  comparison: [
    { feature: 'Material', ours: 'Roble macizo', rival: 'Bambú prensado' },
    { feature: 'Canal perimetral', ours: true, rival: false },
    { feature: 'Doble cara', ours: true, rival: true },
    { feature: 'Pies antideslizantes', ours: true, rival: false },
    { feature: 'Grosor', ours: '3 cm', rival: '1,2 cm' },
    { feature: 'Apto lavavajillas', ours: false, rival: false },
  ],

  shipping: { freeOverCents: 0 },

  // FIVE ugc entries against A's three.
  ugc: [
    { asset: 'gallery-11', alt: 'Tabla en una cocina real', ratio: '9/16' },
    { asset: 'gallery-12', alt: 'Detalle del canal', ratio: '9/16' },
    { asset: 'ugc-03', alt: 'Base de la tabla', ratio: '9/16' },
    { asset: 'video-02', kind: 'video', alt: 'Cortando verduras', ratio: '9/16' },
    { asset: 'ugc-01', alt: 'Pan sobre la tabla', ratio: '9/16' },
  ],

  cta: { primary: 'Llévate la tuya', sticky: 'Añadir al carrito', checkout: 'Ir a pagar', pending: 'Un momento…', soldOut: 'Sin stock' },
} as const satisfies Product;

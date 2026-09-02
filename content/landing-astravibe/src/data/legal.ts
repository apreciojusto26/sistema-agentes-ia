/**
 * Single source of truth for the legal pages.
 *
 * ⚠️ REVISA `identity` ANTES DE PUBLICAR. La LSSI-CE (art. 10) obliga a
 * mostrar estos datos de forma "permanente, fácil, directa y gratuita".
 * Los valores marcados como PENDIENTE deben completarse: publicar un aviso
 * legal con datos incompletos o incorrectos es peor que no tenerlo.
 *
 * Estos textos son una base estándar para un e-commerce español, no
 * asesoramiento jurídico. Conviene que los revise un profesional antes de
 * lanzar campañas de pago.
 */

export const legal = {
  identity: {
    /** Nombre y apellidos del autónomo, o razón social si es sociedad. */
    holder: 'Daniel Longone',
    /** Nombre comercial con el que opera la tienda. */
    tradeName: 'Bamzuk',
    /** NIF/DNI del titular. Obligatorio (LSSI-CE art. 10.1.a). */
    taxId: 'X9986124F',
    address: 'Calle la Iglesia, 7, Fariza de Sayago, 49213 Zamora, España',
    email: 'bamzukafiliados@gmail.com',
    phone: '+34 602 057 976',
    site: 'astravibe.bamzuk.com',
  },

  /** Fecha de última revisión mostrada al pie de cada página legal. */
  lastUpdated: '22 de agosto de 2026',

  /** Plazo legal de desistimiento en la UE (RDL 1/2007, art. 71). */
  withdrawalDays: 14,
} as const;

export interface LegalPageMeta {
  slug: string;
  title: string;
  description: string;
}

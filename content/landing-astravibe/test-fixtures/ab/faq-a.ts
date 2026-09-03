// FOUR entries, and slugs that differ from B's — the content-derived DOM ids
// this template used to leak are exactly what the relational canonicalization
// has to absorb.
import type { FaqItem } from '@/types/content';
export const faq: FaqItem[] = [
  { id: 'que-es', question: '¿Qué es un difusor ultrasónico?', answer: 'Vibra el agua a alta frecuencia para dispersar el aceite en microgotas, sin calor.' },
  { id: 'consumo', question: '¿Cuánta agua consume?', answer: 'El depósito de 300 ml da para unas seis horas en el ciclo largo.' },
  { id: 'aceites', question: '¿Sirve cualquier aceite esencial?', answer: 'Sí, siempre que sea aceite esencial puro y no una esencia con base oleosa.' },
  { id: 'limpieza', question: '¿Cómo se limpia?', answer: 'Vacía el depósito y pásale un paño húmedo cada semana.' },
];

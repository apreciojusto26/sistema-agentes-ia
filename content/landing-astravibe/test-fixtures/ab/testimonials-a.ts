// FIVE reel reviews plus a featured quote. Synthetic contractual fixture: the
// authors are empty because no source recorded one, exactly as the canonical
// template does.
import type { Testimonial } from '@/types/content';
export const testimonials: Testimonial[] = [
  { id: 't-featured', author: '', rating: 5, date: '2026-05-01', title: 'Huele toda la casa', body: 'Lo pongo una hora antes de acostarme y el dormitorio queda perfecto.', variant: 'quote' },
  { id: 't-r1', author: '', rating: 5, date: '2026-05-02', body: 'Silencioso de verdad, no se oye desde la cama.', variant: 'reel' },
  { id: 't-r2', author: '', rating: 4, date: '2026-05-03', body: 'La luz cálida es preciosa, aunque me gustaría poder apagarla del todo.', variant: 'reel' },
  { id: 't-r3', author: '', rating: 5, date: '2026-05-04', body: 'La cerámica se ve mucho mejor que el plástico de otros.', variant: 'reel' },
  { id: 't-r4', author: '', rating: 5, date: '2026-05-05', body: 'El temporizador de seis horas cubre toda la noche.', variant: 'reel' },
  { id: 't-r5', author: '', rating: 4, date: '2026-05-06', body: 'Llena bien un salón mediano.', variant: 'reel' },
];

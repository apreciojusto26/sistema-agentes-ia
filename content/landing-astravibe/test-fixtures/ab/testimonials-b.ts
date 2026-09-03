// EIGHT reel reviews and NO featured quote — `featuredTestimonial` is absent,
// so B's capability signature differs from A's while the grammar must not.
import type { Testimonial } from '@/types/content';
export const testimonials: Testimonial[] = [
  { id: 't-r1', author: '', rating: 5, date: '2026-06-01', body: 'Pesa lo justo para no moverse mientras cortas.', variant: 'reel' },
  { id: 't-r2', author: '', rating: 4, date: '2026-06-02', body: 'El canal recoge bien los jugos del asado.', variant: 'reel' },
  { id: 't-r3', author: '', rating: 4, date: '2026-06-03', body: 'Hay que aceitarla más de lo que esperaba.', variant: 'reel' },
  { id: 't-r4', author: '', rating: 5, date: '2026-06-04', body: 'La veta es distinta en cada tabla, se nota que es maciza.', variant: 'reel' },
  { id: 't-r5', author: '', rating: 3, date: '2026-06-05', body: 'Buena tabla, pero llegó con una esquina rozada.', variant: 'reel' },
  { id: 't-r6', author: '', rating: 5, date: '2026-06-06', body: 'Los pies de goma cambian mucho la experiencia.', variant: 'reel' },
  { id: 't-r7', author: '', rating: 4, date: '2026-06-07', body: 'Ocupa sitio, pero es el tamaño que quería.', variant: 'reel' },
  { id: 't-r8', author: '', rating: 5, date: '2026-06-08', body: 'Tres centímetros de grosor se notan al cortar hueso.', variant: 'reel' },
];

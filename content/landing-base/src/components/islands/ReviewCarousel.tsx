import { useEffect, useRef, useState } from 'react';
import { Stars } from '@/components/islands/parts/Stars';
import type { Testimonial } from '@/types/content';

interface ReviewCarouselProps {
  reviews: Testimonial[];
  tone: 'dark';
}

const GAP_PX = 16; // matches gap-4 in the track className below

export function ReviewCarousel({ reviews }: ReviewCarouselProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const rafRef = useRef<number | null>(null);

  const scrollToIndex = (index: number) => {
    const track = trackRef.current;
    const card = track?.children[index] as HTMLElement | undefined;
    if (!track || !card) return;
    track.scrollTo({ left: card.offsetLeft - track.offsetLeft, behavior: 'smooth' });
  };

  const goPrev = () => scrollToIndex((activeIndex - 1 + reviews.length) % reviews.length);
  const goNext = () => scrollToIndex((activeIndex + 1) % reviews.length);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    const handleScroll = () => {
      if (rafRef.current !== null) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        const firstCard = track.children[0] as HTMLElement | undefined;
        if (!firstCard) return;
        const cardWidth = firstCard.offsetWidth + GAP_PX;
        const index = Math.round(track.scrollLeft / cardWidth);
        setActiveIndex(Math.max(0, Math.min(reviews.length - 1, index)));
      });
    };

    track.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      track.removeEventListener('scroll', handleScroll);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [reviews.length]);

  return (
    <div role="region" aria-roledescription="carousel" aria-label="Reseñas de clientes">
      <div className="flex items-center justify-end gap-2 pb-3">
        <button
          type="button"
          onClick={goPrev}
          aria-label="Reseña anterior"
          className="grid size-9 place-items-center rounded-full bg-white/10 text-bone hover:bg-white/20"
        >
          <svg viewBox="0 0 20 20" className="size-4 rotate-90" aria-hidden="true">
            <path
              fill="currentColor"
              d="M5.22 8.22a.75.75 0 011.06 0L10 11.94l3.72-3.72a.75.75 0 111.06 1.06l-4.25 4.25a.75.75 0 01-1.06 0L5.22 9.28a.75.75 0 010-1.06z"
            />
          </svg>
        </button>
        <button
          type="button"
          onClick={goNext}
          aria-label="Reseña siguiente"
          className="grid size-9 place-items-center rounded-full bg-white/10 text-bone hover:bg-white/20"
        >
          <svg viewBox="0 0 20 20" className="size-4 -rotate-90" aria-hidden="true">
            <path
              fill="currentColor"
              d="M5.22 8.22a.75.75 0 011.06 0L10 11.94l3.72-3.72a.75.75 0 111.06 1.06l-4.25 4.25a.75.75 0 01-1.06 0L5.22 9.28a.75.75 0 010-1.06z"
            />
          </svg>
        </button>
      </div>

      <div
        ref={trackRef}
        className="flex snap-x snap-mandatory gap-4 overflow-x-auto [scrollbar-width:none] motion-reduce:scroll-auto"
      >
        {reviews.map((review, i) => (
          <article
            key={review.id}
            aria-label={`${i + 1} de ${reviews.length}`}
            className="w-[78%] max-w-[19rem] shrink-0 snap-center rounded-card bg-graphite-soft p-4 ring-1 ring-white/10 lg:max-w-[22rem]"
          >
            <Stars rating={review.rating} className="mb-2" />
            <p className="text-sm text-bone/80">{review.body}</p>
            <p className="mt-3 text-xs font-semibold text-bone">
              {review.author}
              {review.location && <span className="font-normal text-bone/60">{` · ${review.location}`}</span>}
            </p>
          </article>
        ))}
      </div>

      <div className="mt-3 flex justify-center gap-1.5" role="tablist" aria-label="Seleccionar reseña">
        {reviews.map((review, i) => (
          <button
            key={review.id}
            type="button"
            role="tab"
            aria-selected={i === activeIndex}
            aria-label={`Ir a la reseña ${i + 1}`}
            onClick={() => scrollToIndex(i)}
            className={`size-1.5 rounded-full transition-colors ${i === activeIndex ? 'bg-gold' : 'bg-white/25'}`}
          />
        ))}
      </div>
    </div>
  );
}

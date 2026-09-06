import { useEffect, useRef, useState } from 'react';
import { Stars } from '@/components/islands/parts/Stars';
import type { Testimonial } from '@/types/content';

/**
 * WHAT THIS CARD NO LONGER SHOWS, and why it is not a styling choice.
 *
 *   `· Madrid`             CanonicalReview carries no reviewer location. Every
 *                          city ever printed beside a name was written by hand.
 *   `✓ Compra verificada`  CanonicalReview carries no verification signal, so
 *                          the badge asserted a transaction nothing witnessed.
 *
 * Both are gone from the `Testimonial` type as well, so this component could
 * not render them again even if someone re-added the markup.
 *
 * `review.author` IS rendered directly here, and that is deliberate: this is an
 * ISLAND, so its reviews are serialized into the `<astro-island props="...">`
 * attribute. Resolving the display name inside the component would still ship
 * the raw value into the page source — the visible text would read `Cliente`
 * while view-source read `Y***t`. 10-reviews-reel.astro therefore hands this
 * island names that are ALREADY resolved, and the raw author stays behind in
 * src/data/testimonials.ts where it belongs.
 */
interface ReviewCarouselProps {
  reviews: Testimonial[];
}

const GAP_PX = 16; // matches gap-4 in the track className below

export function ReviewCarousel({ reviews }: ReviewCarouselProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const rafRef = useRef<number | null>(null);

  /**
   * How many cards are actually visible at once — 1 on mobile, up to 3 at
   * `xl`. NOT read off a Tailwind breakpoint: the cards are 86%/48%/31% of
   * the track, fractions chosen for a peeking-next-card effect rather than an
   * exact 1/2/3 split, so the real count is MEASURED off the DOM instead of
   * guessed from the same breakpoint numbers that produced those fractions.
   *
   * THIS IS THE WHOLE FIX. The dots below used to render one per REVIEW,
   * which is the raw count of things in the data — not the number of
   * scroll-snap pages a viewer can actually land on. A visitor scanning three
   * cards at a time on desktop saw ten times more dots than pages, most of
   * them dead weight after the third click.
   */
  const [visibleCount, setVisibleCount] = useState(1);

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

  // RE-MEASURED ON RESIZE, not just on mount — a viewer who resizes the
  // window (or rotates a tablet) is looking at a different number of visible
  // cards a moment later, and a dot count frozen at first paint would then be
  // wrong for the rest of the session. ResizeObserver on the TRACK itself
  // rather than a window `resize` listener: it fires on the box that actually
  // determines cardsPerView, including layout changes a viewport-width
  // listener would miss (a sidebar opening, a font finishing its swap).
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    const measure = () => {
      const firstCard = track.children[0] as HTMLElement | undefined;
      if (!firstCard || firstCard.offsetWidth === 0) return;
      const cardWidth = firstCard.offsetWidth + GAP_PX;
      setVisibleCount(Math.max(1, Math.round(track.clientWidth / cardWidth)));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(track);
    return () => observer.disconnect();
  }, [reviews.length]);

  // ONE DOT PER PAGE, never per review. A page is however many cards fit in
  // one view; the last page may hold fewer if the count doesn't divide evenly,
  // and that is still one dot, not a fractional one.
  const pageCount = Math.max(1, Math.ceil(reviews.length / visibleCount));
  const activePage = Math.min(pageCount - 1, Math.floor(activeIndex / visibleCount));

  return (
    <div role="region" aria-roledescription="carousel" aria-label="Reseñas de clientes">
      <div className="hidden items-center justify-end gap-2 pb-3 md:flex">
        <button
          type="button"
          onClick={goPrev}
          aria-label="Reseña anterior"
          className="grid size-8 place-items-center rounded-full bg-white text-grape shadow-card transition hover:bg-grape/5"
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
          className="grid size-8 place-items-center rounded-full bg-white text-grape shadow-card transition hover:bg-grape/5"
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
        className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden motion-reduce:scroll-auto"
      >
        {reviews.map((review, i) => (
          <article
            key={review.id}
            aria-label={`${i + 1} de ${reviews.length}`}
            className="flex w-[86%] shrink-0 snap-start flex-col rounded-card bg-white p-5 text-left shadow-lift sm:w-[48%] xl:w-[31%]"
          >
            <Stars rating={review.rating} className="mb-3" />
            <p className="flex-1 text-sm leading-relaxed text-graphite">{review.body}</p>
            <div className="mt-4">
              <p className="text-xs font-bold text-graphite">{review.author}</p>
            </div>
          </article>
        ))}
      </div>

      <div className="mt-3 flex justify-center gap-1.5" role="tablist" aria-label="Seleccionar página de reseñas">
        {Array.from({ length: pageCount }, (_, page) => (
          <button
            key={page}
            type="button"
            role="tab"
            aria-selected={page === activePage}
            aria-label={`Ir a la página ${page + 1} de ${pageCount}`}
            onClick={() => scrollToIndex(page * visibleCount)}
            className={`size-1.5 rounded-full transition-colors ${page === activePage ? 'bg-grape' : 'bg-grape/25'}`}
          />
        ))}
      </div>
    </div>
  );
}

import { useRef, useState } from 'react';
import { useStore } from '@nanostores/react';
import { $lightboxIndex, $isLightboxOpen } from '@/stores/ui';
import { Lightbox } from '@/components/islands/parts/Lightbox';
import { PlaceholderShot } from '@/components/islands/parts/PlaceholderShot';
import type { ResolvedImage } from '@/types/content';

interface HeroCarouselProps {
  images: ResolvedImage[];
}

export function HeroCarousel({ images }: HeroCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const lightboxIndex = useStore($lightboxIndex);
  const isLightboxOpen = useStore($isLightboxOpen);
  const mainTriggerRef = useRef<HTMLButtonElement | null>(null);

  const count = images.length;
  const active = images[activeIndex];
  if (!active) return null;

  const goPrev = () => setActiveIndex((index) => (index - 1 + count) % count);
  const goNext = () => setActiveIndex((index) => (index + 1) % count);

  const chevronPath =
    'M5.22 8.22a.75.75 0 011.06 0L10 11.94l3.72-3.72a.75.75 0 111.06 1.06l-4.25 4.25a.75.75 0 01-1.06 0L5.22 9.28a.75.75 0 010-1.06z';

  return (
    <div>
      <div className="relative">
        <button
          ref={mainTriggerRef}
          type="button"
          onClick={() => $lightboxIndex.set(activeIndex)}
          aria-label={`Ampliar imagen: ${active.alt}`}
          className="block w-full overflow-hidden rounded-none motion-safe:transition-transform md:rounded-card"
        >
          {active.placeholder ? (
            <PlaceholderShot
              ratio="1/1"
              alt={active.alt}
              rounded="rounded-none md:rounded-card"
              className="w-full"
            />
          ) : active.kind === 'video' ? (
            // key forces a fresh element per slide: reusing one <video> across
            // sources leaves the previous frame painted until the next decodes.
            <video
              key={active.id}
              src={active.src}
              poster={active.poster}
              aria-label={active.alt}
              muted
              loop
              playsInline
              autoPlay
              preload="metadata"
              className="aspect-square w-full rounded-none object-cover md:rounded-card"
            />
          ) : (
            <img
              src={active.src}
              srcSet={active.srcset}
              width={active.width}
              height={active.height}
              alt={active.alt}
              className="aspect-square w-full rounded-none object-cover md:rounded-card"
            />
          )}
        </button>

        <button
          type="button"
          onClick={goPrev}
          aria-label="Imagen anterior"
          className="absolute left-3 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-white/40 text-graphite shadow-card ring-1 ring-graphite/15 backdrop-blur-sm motion-safe:transition hover:bg-white/60 active:scale-95"
        >
          <svg viewBox="0 0 20 20" className="size-5 rotate-90" aria-hidden="true">
            <path fill="currentColor" d={chevronPath} />
          </svg>
        </button>

        <button
          type="button"
          onClick={goNext}
          aria-label="Imagen siguiente"
          className="absolute right-3 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-white/40 text-graphite shadow-card ring-1 ring-graphite/15 backdrop-blur-sm motion-safe:transition hover:bg-white/60 active:scale-95"
        >
          <svg viewBox="0 0 20 20" className="size-5 -rotate-90" aria-hidden="true">
            <path fill="currentColor" d={chevronPath} />
          </svg>
        </button>

        <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2" role="tablist" aria-label="Seleccionar imagen">
          {images.map((img, i) => (
            <button
              key={img.id}
              type="button"
              role="tab"
              aria-selected={i === activeIndex}
              aria-label={`Ir a la imagen ${i + 1}`}
              onClick={() => setActiveIndex(i)}
              className={`size-2 rounded-full transition-colors ${i === activeIndex ? 'bg-white' : 'bg-white/40'}`}
            />
          ))}
        </div>
      </div>

      {isLightboxOpen && lightboxIndex !== null && (
        <Lightbox
          images={images}
          index={lightboxIndex}
          onClose={() => $lightboxIndex.set(null)}
          onNavigate={(next) => {
            $lightboxIndex.set(next);
            setActiveIndex(next);
          }}
          triggerRef={mainTriggerRef}
        />
      )}
    </div>
  );
}

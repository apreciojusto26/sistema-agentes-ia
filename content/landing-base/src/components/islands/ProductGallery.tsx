import { useRef, useState } from 'react';
import { useStore } from '@nanostores/react';
import { $lightboxIndex, $isLightboxOpen } from '@/stores/ui';
import { Lightbox } from '@/components/islands/parts/Lightbox';
import { PlaceholderShot } from '@/components/islands/parts/PlaceholderShot';
import type { ResolvedImage } from '@/types/content';

interface ProductGalleryProps {
  images: ResolvedImage[];
  initialIndex?: number;
}

export function ProductGallery({ images, initialIndex = 0 }: ProductGalleryProps) {
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const lightboxIndex = useStore($lightboxIndex);
  const isLightboxOpen = useStore($isLightboxOpen);
  const mainTriggerRef = useRef<HTMLButtonElement | null>(null);

  const active = images[activeIndex];
  if (!active) return null;

  return (
    <div>
      <button
        ref={mainTriggerRef}
        type="button"
        onClick={() => $lightboxIndex.set(activeIndex)}
        aria-label={`Ampliar imagen: ${active.alt}`}
        className="mx-auto block w-full max-w-[28rem] overflow-hidden rounded-card motion-safe:transition-transform md:max-w-[40rem]"
      >
        {active.placeholder ? (
          <PlaceholderShot ratio={active.ratio} alt={active.alt} rounded="rounded-card" className="w-full" />
        ) : (
          <img
            src={active.src}
            srcSet={active.srcset}
            width={active.width}
            height={active.height}
            alt={active.alt}
            className="aspect-[4/5] w-full rounded-card object-cover"
          />
        )}
      </button>

      <div className="mt-3 flex gap-2 overflow-x-auto px-5 [scrollbar-width:none] snap-x -mx-5" role="tablist" aria-label="Miniaturas de producto">
        {images.map((img, i) => (
          <button
            key={img.id}
            type="button"
            role="tab"
            aria-selected={i === activeIndex}
            data-active={i === activeIndex}
            onClick={() => setActiveIndex(i)}
            className="size-16 shrink-0 snap-start overflow-hidden rounded-tile ring-2 ring-transparent transition data-[active=true]:ring-rust"
          >
            {img.placeholder ? (
              <PlaceholderShot ratio="1/1" alt={img.alt} rounded="rounded-tile" className="size-full" />
            ) : (
              <img src={img.src} alt="" aria-hidden="true" className="size-full object-cover" />
            )}
          </button>
        ))}
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

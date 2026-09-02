import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { PlaceholderShot } from '@/components/islands/parts/PlaceholderShot';
import type { ResolvedImage } from '@/types/content';

interface LightboxProps {
  images: ResolvedImage[];
  index: number;
  onClose: () => void;
  onNavigate: (nextIndex: number) => void;
  triggerRef: React.RefObject<HTMLElement | null>;
}

const SWIPE_THRESHOLD = 40;

export function Lightbox({ images, index, onClose, onNavigate, triggerRef }: LightboxProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const touchStartX = useRef<number | null>(null);
  const image = images[index];

  const goPrev = () => onNavigate((index - 1 + images.length) % images.length);
  const goNext = () => onNavigate((index + 1) % images.length);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const firstFocusable = dialogRef.current?.querySelector<HTMLElement>('button');
    firstFocusable?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      triggerRef.current?.focus({ preventScroll: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      } else if (event.key === 'ArrowRight') {
        goNext();
      } else if (event.key === 'ArrowLeft') {
        goPrev();
      } else if (event.key === 'Tab') {
        const focusables = dialogRef.current?.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (!focusables || focusables.length === 0) return;
        const first = focusables[0]!;
        const last = focusables[focusables.length - 1]!;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, images.length]);

  if (!image) return null;

  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Galería de imágenes en pantalla completa"
      className="fixed inset-0 z-[60] grid place-items-center bg-graphite/92 p-4"
      onPointerDown={(e) => {
        touchStartX.current = e.clientX;
      }}
      onPointerUp={(e) => {
        if (touchStartX.current === null) return;
        const delta = e.clientX - touchStartX.current;
        if (Math.abs(delta) >= SWIPE_THRESHOLD) {
          delta > 0 ? goPrev() : goNext();
        }
        touchStartX.current = null;
      }}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Cerrar galería"
        className="absolute right-4 top-4 grid size-11 place-items-center rounded-full bg-white/10 text-bone hover:bg-white/20 motion-reduce:transition-none"
      >
        <svg viewBox="0 0 20 20" className="size-5" aria-hidden="true">
          <path
            fill="currentColor"
            d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z"
          />
        </svg>
      </button>

      <button
        type="button"
        onClick={goPrev}
        aria-label="Imagen anterior"
        className="absolute left-2 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-bone hover:bg-white/20 md:left-6"
      >
        <svg viewBox="0 0 20 20" className="size-5 rotate-90" aria-hidden="true">
          <path
            fill="currentColor"
            d="M5.22 8.22a.75.75 0 011.06 0L10 11.94l3.72-3.72a.75.75 0 111.06 1.06l-4.25 4.25a.75.75 0 01-1.06 0L5.22 9.28a.75.75 0 010-1.06z"
          />
        </svg>
      </button>

      <div className="relative max-h-[80vh] w-full overflow-hidden rounded-card motion-safe:transition-transform md:max-w-2xl">
        {image.placeholder ? (
          <PlaceholderShot ratio={image.ratio} alt={image.alt} tone="graphite" rounded="rounded-card" />
        ) : image.kind === 'video' ? (
          // Controls appear here but not in the carousel: at full size the
          // viewer chose to look at this, so let them scrub and replay.
          <video
            key={image.id}
            src={image.src}
            poster={image.poster}
            aria-label={image.alt}
            muted
            loop
            playsInline
            autoPlay
            controls
            className="h-full w-full object-contain"
          />
        ) : (
          <img
            src={image.src}
            srcSet={image.srcset}
            width={image.width}
            height={image.height}
            alt={image.alt}
            className="h-full w-full object-cover"
          />
        )}
      </div>

      <button
        type="button"
        onClick={goNext}
        aria-label="Imagen siguiente"
        className="absolute right-2 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-bone hover:bg-white/20 md:right-6"
      >
        <svg viewBox="0 0 20 20" className="size-5 -rotate-90" aria-hidden="true">
          <path
            fill="currentColor"
            d="M5.22 8.22a.75.75 0 011.06 0L10 11.94l3.72-3.72a.75.75 0 111.06 1.06l-4.25 4.25a.75.75 0 01-1.06 0L5.22 9.28a.75.75 0 010-1.06z"
          />
        </svg>
      </button>
    </div>,
    document.body,
  );
}

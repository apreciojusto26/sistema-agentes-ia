import { STAR_PATH, STAR_VIEWBOX } from '@/lib/icons';

interface StarsProps {
  rating: number;
  max?: number;
  className?: string;
  starClassName?: string;
}

export function Stars({ rating, max = 5, className, starClassName }: StarsProps) {
  const stars = Array.from({ length: max }, (_, i) => Math.max(0, Math.min(1, rating - i)));

  return (
    <div
      className={`inline-flex items-center gap-0.5 ${className ?? ''}`}
      role="img"
      aria-label={`${rating} de ${max} estrellas`}
    >
      {stars.map((fill, i) => (
        <svg
          key={i}
          viewBox={STAR_VIEWBOX}
          className={`size-4 shrink-0 ${starClassName ?? ''}`}
          aria-hidden="true"
        >
          <path d={STAR_PATH} fill="currentColor" opacity={fill === 0 ? 0.25 : fill} className="text-gold" />
        </svg>
      ))}
    </div>
  );
}

import { ICONS } from '@/lib/icons';
import {
  PLACEHOLDER_CLASSES,
  hatchBackgroundImage,
  placeholderAriaLabel,
  type PlaceholderTone,
} from '@/lib/placeholder';
import type { AspectRatio } from '@/types/content';

interface PlaceholderShotProps {
  ratio?: AspectRatio;
  label?: string | undefined;
  alt?: string | undefined;
  tone?: PlaceholderTone;
  rounded?: string;
  className?: string | undefined;
}

export function PlaceholderShot({
  ratio = '4/5',
  label,
  alt,
  tone = 'bone',
  rounded = 'rounded-tile',
  className,
}: PlaceholderShotProps) {
  const camera = ICONS.camera;

  return (
    <div
      role="img"
      aria-label={placeholderAriaLabel(label, alt)}
      data-placeholder="true"
      style={{ aspectRatio: ratio.replace('/', ' / ') }}
      className={`${PLACEHOLDER_CLASSES.wrapper} ${PLACEHOLDER_CLASSES.wrapperTone[tone]} ${rounded} ${className ?? ''}`}
    >
      {/* [PLACEHOLDER] swap with real photo */}
      <div
        className={PLACEHOLDER_CLASSES.hatch}
        style={{ backgroundImage: hatchBackgroundImage(tone) }}
      />
      <svg viewBox={camera.viewBox} className={PLACEHOLDER_CLASSES.glyph} aria-hidden="true">
        <path d={camera.path} fill="currentColor" />
      </svg>
      {label && <span className={PLACEHOLDER_CLASSES.label}>{label}</span>}
    </div>
  );
}

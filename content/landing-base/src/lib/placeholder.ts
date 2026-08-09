import type { AspectRatio } from '@/types/content';

export type PlaceholderTone = 'bone' | 'graphite';

/** Shared class strings for the PlaceholderShot .astro/.tsx twins. */
export const PLACEHOLDER_CLASSES = {
  wrapper:
    'relative grid place-items-center overflow-hidden text-steel',
  wrapperTone: {
    bone: 'bg-bone-dim text-steel',
    graphite: 'bg-graphite-soft text-steel-light',
  } satisfies Record<PlaceholderTone, string>,
  hatchTone: {
    bone: 'rgb(30 33 36 / .05)',
    graphite: 'rgb(255 255 255 / .06)',
  } satisfies Record<PlaceholderTone, string>,
  hatch: 'absolute inset-0 opacity-70',
  glyph: 'relative size-8 opacity-40',
  label:
    'relative mt-2 px-3 text-center text-[0.6875rem] font-medium uppercase tracking-wider',
} as const;

export function hatchBackgroundImage(tone: PlaceholderTone): string {
  const color = PLACEHOLDER_CLASSES.hatchTone[tone];
  return `repeating-linear-gradient(135deg,${color} 0 8px,transparent 8px 16px)`;
}

export function placeholderAriaLabel(label?: string, alt?: string): string {
  return `[PLACEHOLDER] ${label ?? alt ?? 'Foto de producto'}`;
}

export function aspectRatioStyle(ratio: AspectRatio): string {
  return `aspect-ratio:${ratio.replace('/', ' / ')}`;
}

import { statSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { product } from '@/data/product';
import type { MediaRef } from '@/types/content';

// `as const` gives each entry its own literal type, so entries without `kind`
// do not carry the property; MediaRef is the shape the contract declares.
const strip: MediaRef[] = [...product.ugcStrip];

/**
 * The marquee renders every item twice (the track is duplicated for the
 * seamless loop), so one oversized file is paid for twice over. This guards
 * the assets the strip actually ships — it used to guard public/img/Galeria,
 * which the strip stopped reading once it moved to astro:assets.
 *
 * The video budget exists because a 87 MB 4K master was dropped into the
 * gallery folder once; a test is cheaper than noticing it in production.
 */
const assetDirectory = resolve(process.cwd(), 'src/assets/product');
const MAX_IMAGE_BYTES = 300_000;
const MAX_VIDEO_BYTES = 1_500_000;
const MAX_LONG_EDGE = 1_600;

const stripImages = strip.flatMap((media) =>
  media.kind !== 'video' && media.asset ? [media.asset] : [],
);
const stripVideos = strip.flatMap((media) =>
  media.kind === 'video' && media.asset ? [media.asset] : [],
);

describe('UGC marquee asset budget', () => {
  it('every strip entry resolves to an asset key', () => {
    expect(stripImages.length + stripVideos.length).toBe(strip.length);
  });

  it.each(stripImages)('%s stays within the image budget', async (key) => {
    const imagePath = resolve(assetDirectory, `${key}.jpg`);
    const metadata = await sharp(imagePath).metadata();

    expect(statSync(imagePath).size).toBeLessThanOrEqual(MAX_IMAGE_BYTES);
    expect(Math.max(metadata.width ?? 0, metadata.height ?? 0)).toBeLessThanOrEqual(MAX_LONG_EDGE);
  });

  it.each(stripVideos)('%s stays within the video budget', (key) => {
    expect(statSync(resolve(assetDirectory, `${key}.mp4`)).size).toBeLessThanOrEqual(MAX_VIDEO_BYTES);
  });

  it.each(stripVideos)('%s ships a poster so the tile is never blank', (key) => {
    const media = strip.find((item) => item.asset === key);
    expect(media?.poster, `${key} needs a poster: preload="none" shows nothing until playback starts`).toBeTruthy();
  });
});

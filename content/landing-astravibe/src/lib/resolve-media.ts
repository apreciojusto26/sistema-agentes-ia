import { getImage } from 'astro:assets';
import { images } from '@/data/images';
import { videos } from '@/data/videos';
import type { MediaRef, ResolvedImage } from '@/types/content';
import type { ProductCommerce } from '@/lib/shopify/types';

/**
 * Build-time resolution of a MediaRef into the plain ResolvedImage shape islands expect.
 * Islands cannot call astro:assets themselves, so sections call this in frontmatter
 * before passing props down to a React island.
 */
export async function resolveMedia(media: MediaRef, id: string): Promise<ResolvedImage> {
  // Videos bypass astro:assets entirely — it optimizes images, not MP4s — and
  // resolve to their hashed static URL plus a poster frame.
  if (media.kind === 'video' && media.asset) {
    const src = videos[media.asset];
    if (src) {
      return {
        id,
        src,
        width: 0,
        height: 0,
        alt: media.alt,
        ratio: media.ratio,
        placeholder: false,
        kind: 'video',
        poster: media.poster ? (images[media.poster]?.src ?? videos[media.poster]) : undefined,
      };
    }
  }

  const asset = media.asset ? images[media.asset] : null;

  if (!asset) {
    return {
      id,
      src: '',
      width: 0,
      height: 0,
      alt: media.alt,
      ratio: media.ratio,
      placeholder: true,
    };
  }

  const optimized = await getImage({ src: asset, width: 640 });

  return {
    id,
    src: optimized.src,
    srcset: optimized.srcSet.attribute,
    width: optimized.attributes.width as number,
    height: optimized.attributes.height as number,
    alt: media.alt,
    ratio: media.ratio,
    placeholder: false,
  };
}

export async function resolveMediaList(mediaList: MediaRef[], idPrefix: string): Promise<ResolvedImage[]> {
  return Promise.all(mediaList.map((media, i) => resolveMedia(media, `${idPrefix}-${i}`)));
}

/**
 * Shopify CDN URLs used directly with `?width=` transform params — the CDN
 * already serves resized WebP/AVIF, no `astro:assets` remote optimization
 * needed. Callers fall back to `resolveMediaList` against the local
 * MediaRef/PlaceholderShot pipeline when a variant/product has no image.
 */
export function resolveShopifyImages(commerceImages: ProductCommerce['images'], idPrefix: string): ResolvedImage[] {
  return commerceImages.map((img, i) => {
    const baseWidth = 640;
    const height = img.width > 0 ? Math.round(baseWidth * (img.height / img.width)) : baseWidth;

    return {
      id: `${idPrefix}-${i}`,
      src: withWidthParam(img.url, baseWidth),
      srcset: `${withWidthParam(img.url, baseWidth)} 1x, ${withWidthParam(img.url, baseWidth * 2)} 2x`,
      width: baseWidth,
      height,
      alt: img.altText ?? '',
      ratio: '4/5',
      placeholder: false,
    };
  });
}

function withWidthParam(url: string, width: number): string {
  const resolved = new URL(url);
  resolved.searchParams.set('width', String(width));
  return resolved.toString();
}

import type { ImageMetadata } from 'astro';
import gallery01 from '@/assets/product/gallery-01.jpg';
import gallery02 from '@/assets/product/gallery-02.jpg';
import gallery03 from '@/assets/product/gallery-03.jpg';
import gallery04 from '@/assets/product/gallery-04.jpg';
import gallery05 from '@/assets/product/gallery-05.jpg';
import gallery06 from '@/assets/product/gallery-06.jpg';
import gallery07 from '@/assets/product/gallery-07.jpg';
import gallery08 from '@/assets/product/gallery-08.jpg';
import gallery09 from '@/assets/product/gallery-09.jpg';
import gallery10 from '@/assets/product/gallery-10.jpg';
import gallery11 from '@/assets/product/gallery-11.jpg';
import gallery12 from '@/assets/product/gallery-12.jpg';
import video04Poster from '@/assets/product/video-04-poster.jpg';
import video05Poster from '@/assets/product/video-05-poster.jpg';
import ugc01 from '@/assets/product/ugc-01.jpg';
import ugc02 from '@/assets/product/ugc-02.jpg';
import ugc03 from '@/assets/product/ugc-03.jpg';
import step01 from '@/assets/product/step-01.jpg';

/** asset key -> imported ImageMetadata. Every other MediaRef in the data layer sets asset: null. */
export const images: Record<string, ImageMetadata> = {
  'gallery-01': gallery01,
  'gallery-02': gallery02,
  'gallery-03': gallery03,
  'gallery-04': gallery04,
  'gallery-05': gallery05,
  'gallery-06': gallery06,
  'gallery-07': gallery07,
  'gallery-08': gallery08,
  'gallery-09': gallery09,
  'gallery-10': gallery10,
  'gallery-11': gallery11,
  'gallery-12': gallery12,
  'video-04-poster': video04Poster,
  'video-05-poster': video05Poster,
  'ugc-01': ugc01,
  'ugc-02': ugc02,
  'ugc-03': ugc03,
  'step-01': step01,
};

import type { ImageMetadata } from 'astro';
import gallery01 from '@/assets/product/gallery-01.jpg';
import gallery02 from '@/assets/product/gallery-02.jpg';
import gallery03 from '@/assets/product/gallery-03.jpg';
import gallery04 from '@/assets/product/gallery-04.jpg';
import gallery05 from '@/assets/product/gallery-05.jpg';
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
  'ugc-01': ugc01,
  'ugc-02': ugc02,
  'ugc-03': ugc03,
  'step-01': step01,
};

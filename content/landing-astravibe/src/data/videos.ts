import video01 from '@/assets/product/video-01.mp4';
import video02 from '@/assets/product/video-02.mp4';
import video03 from '@/assets/product/video-03.mp4';
import video04 from '@/assets/product/video-04.mp4';
import video05 from '@/assets/product/video-05.mp4';
import video01Poster from '@/assets/product/video-01-poster.jpg';

/** asset key -> hashed static URL. MediaRefs with kind: 'video' resolve here. */
export const videos: Record<string, string> = {
  'video-01': video01,
  'video-02': video02,
  'video-03': video03,
  'video-04': video04,
  'video-05': video05,
  'video-01-poster': video01Poster.src,
};

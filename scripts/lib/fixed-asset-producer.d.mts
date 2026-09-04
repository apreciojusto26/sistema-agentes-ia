// Hand-written declarations — see fixed-asset-output.d.mts for why ".d.mts".
import type { FixedAssetOutput } from './fixed-asset-output.mjs';

export interface ProducedAsset {
  key: string;
  file: string;
  sourceRef: string;
  sourceName: string;
  sha256: string;
  bytes: number;
  /** Real intrinsic dimensions, or null for a format the header reader skips. */
  width: number | null;
  height: number | null;
  kind: 'image';
  /** Listing media from the provider. Never 'ugc' — no source supplies that. */
  provenance: 'product/promotional';
}

export interface FixedAssetManifest {
  schema: 1;
  productId: string | null;
  assets: ProducedAsset[];
  rejected: { reason: string; detail: string }[];
  stepAssignments: { slot: string; asset: string }[];
}

export interface ProduceResult {
  assetOutput: FixedAssetOutput;
  plan: { assets: unknown[]; rejected: { reason: string; detail: string }[] };
  manifest: FixedAssetManifest;
  rejected: string[];
}

export declare function produceFixedAssets(opts: {
  canonicalProduct: unknown;
  imagesDir: string;
  destDir?: string | null;
  stepCount?: number;
}): ProduceResult;

export declare function collectUnresolvedRefs(
  assetOutput: unknown,
  resolvableKeys: Set<string> | string[],
): { code: string; message: string }[];

export declare function readImageSize(file: string): { width: number; height: number } | null;
export declare function fileDigest(file: string): string | null;

export declare class FixedAssetError extends Error {
  plan: unknown;
}

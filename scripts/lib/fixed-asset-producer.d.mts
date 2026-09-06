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

/**
 * The facts an operation reports about itself, handed to it as it runs.
 *
 * A SINK, NEVER A RETURN VALUE. The operation's return value is its data; what
 * it measured about the work goes here, so a canonical product that happens to
 * carry a `warnings` key can never be mistaken for an operation's warning.
 */
export interface AssetStepFacts {
  /** A fraction the operation genuinely measured. */
  count(done: number, total: number, label?: string): void;
  /** A short fact it produced — a total, a verdict. Never a guess. */
  note(text: string): void;
  /** A real condition it reported. Never invented for the UI's benefit. */
  warn(message: string): void;
}

/** Watches the producer's real internal boundaries. See FIXED_ASSET_OPERATIONS. */
export interface AssetObserver {
  step<T>(name: string, fn: (facts: AssetStepFacts) => T): T;
}

/**
 * The operations produceFixedAssets performs, in the order it performs them.
 * Exported so the Admin can DECLARE the sequence without keeping a copy of it
 * that would drift the first time a boundary moves.
 */
export declare const FIXED_ASSET_OPERATIONS: readonly string[];

export declare function produceFixedAssets(opts: {
  canonicalProduct: unknown;
  imagesDir: string;
  destDir?: string | null;
  stepCount?: number;
  /** Absent = the producer behaves exactly as it always has. */
  observer?: AssetObserver;
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

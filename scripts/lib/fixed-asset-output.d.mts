// Hand-written declarations, same convention as content-contract.d.mts and
// fixed-template.d.mts (design ADR-2): admin/ gets types with zero build
// coupling. NOTE the ".d.mts" extension — what TypeScript matches for a ".mjs"
// import specifier; a plain ".d.ts" is silently ignored and yields TS7016.

/** A media reference the template can render. */
export interface FixedMediaRef {
  asset: string;
  alt: string;
  ratio: '1/1' | '4/5' | '3/4' | '4/3' | '16/9' | '9/16';
  label?: string;
  kind?: 'image' | 'video';
  poster?: string;
}

export interface FixedGalleryImage extends FixedMediaRef {
  id: string;
  caption?: string;
}

/**
 * The asset pipeline's output.
 *
 * `productMediaStrip` FEEDS THE TEMPLATE'S `ugcStrip`, which is a legacy field
 * name rather than a claim: the region it renders carries no heading, author,
 * rating or attribution. It is a product media marquee.
 */
export interface FixedAssetOutput {
  gallery: FixedGalleryImage[];
  heroExtras: FixedMediaRef[];
  productMediaStrip: FixedMediaRef[];
  /** Keyed by structural slot — `step-0`, `step-1`, … — never by copy. */
  stepMedia: Record<string, FixedMediaRef>;
}

export interface AssetIssue {
  code: string;
  field?: string;
  fields?: string[];
  message: string;
}

export declare const ASSET_RATIOS: readonly string[];
export declare const ASSET_OUTPUT_LISTS: readonly string[];
export declare const ASSET_OUTPUT_FIELDS: readonly string[];
export declare const ASSET_OUTPUT_FORBIDDEN_FIELDS: readonly string[];
export declare function collectAssetOutputIssues(input: unknown): AssetIssue[];
export declare function isAssetOutputComplete(input: unknown): boolean;

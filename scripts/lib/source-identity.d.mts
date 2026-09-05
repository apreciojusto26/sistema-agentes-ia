// Hand-written declarations, same convention as content-contract.d.mts and
// product-normalizer.d.mts (design ADR-2): admin/ gets types with zero build
// coupling. NOTE the ".d.mts" extension — what TypeScript matches for a ".mjs"
// import specifier.

/** Which PRODUCT this is. Never which run, and never the output path. */
export interface SourceProductIdentity {
  /** Stable provider id, e.g. 'aliexpress'. */
  provider: string;
  /** The provider's own id for the product, e.g. '1005007345199501'. */
  externalProductId: string;
  /** The URL with recommendation/tracking parameters removed. */
  canonicalUrl: string;
}

export interface SourceProvider {
  id: string;
  hostPattern: RegExp;
  shortHostPattern: RegExp;
  itemPathPattern: RegExp;
  resolve(url: URL): SourceProductIdentity | null;
}

export declare const PROVIDERS: SourceProvider[];

/** `null` when no provider recognises the URL — a real answer, never "probably the same". */
export declare function resolveSourceIdentity(sourceUrl: unknown): SourceProductIdentity | null;

/** Provably the same product. Two nulls are two unknowns, not a match. */
export declare function sameSourceProduct(
  a: SourceProductIdentity | null,
  b: SourceProductIdentity | null,
): boolean;

/** `aliexpress:1005007345199501`, or `unknown`. */
export declare function formatSourceIdentity(identity: SourceProductIdentity | null): string;

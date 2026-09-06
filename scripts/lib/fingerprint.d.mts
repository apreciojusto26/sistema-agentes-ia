// Hand-written declarations, same convention as fixed-template.d.mts and
// fixed-favicon.d.mts (design ADR-2): admin/ gets types with zero build
// coupling. NOTE the ".d.mts" extension — what TypeScript matches for a ".mjs"
// import specifier.
//
// PARTIAL BY DESIGN, exactly as fixed-favicon.d.mts is. What is declared is
// what a TypeScript consumer calls. The composition steps structuralFingerprint
// runs internally — structuralSkeleton, applyGrammar, applyOptionalSlots and
// the contextual-value rules — are reached only from .mjs and from the suites,
// which run through esbuild and need no types.

export interface StructuralFingerprint {
  /** The normalised skeleton the hash was taken over. */
  skeleton: string;
  /** sha256 of that skeleton — THE seal a generated page is measured against. */
  hash: string;
  /** How many structural lines that skeleton has. */
  elements: number;
}

export declare function structuralFingerprint(
  html: string,
  grammar: unknown,
  slots: unknown,
): StructuralFingerprint;

/** One region on the page that does not fit what the grammar declares for it. */
export interface UncollapsedRegionFinding {
  /** The grammar region's own id, e.g. "reviews/cards". */
  id: string;
  message: string;
}

export declare function collectUncollapsedRegions(
  html: string,
  grammar: unknown,
): UncollapsedRegionFinding[];

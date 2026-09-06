// Hand-written declarations — see fingerprint.d.mts for the convention.

/** Why the projection kept or dropped each canonical review. Reported, never silent. */
export interface FixedSocialProofAudit {
  /** Reviews the scrape actually carried. */
  found: number;
  /** How many of those are renderable as displayed social proof. */
  displayable: number;
  /** One entry per dropped review, with the reason it was not shown. */
  rejected: { reason: string }[];
}

export interface FixedSocialProof {
  capability: boolean;
  testimonials: unknown[];
  featured: unknown | null;
  audit: FixedSocialProofAudit;
}

export declare function projectFixedSocialProof(canonicalProduct: unknown): FixedSocialProof;

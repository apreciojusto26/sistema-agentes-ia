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

/** One rendered testimonial, exactly as written to testimonials.ts. */
export interface FixedTestimonial {
  id: string;
  author: string;
  rating: number;
  date: string;
  /** The provider's own review text, verbatim (trimmed) — the provenance trace. */
  body: string;
  variant: 'quote' | 'reel';
}

export interface FixedSocialProof {
  capability: boolean;
  testimonials: FixedTestimonial[];
  featured: FixedTestimonial | null;
  audit: FixedSocialProofAudit;
}

export declare function projectFixedSocialProof(canonicalProduct: unknown): FixedSocialProof;

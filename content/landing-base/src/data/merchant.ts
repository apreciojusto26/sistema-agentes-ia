// MERCHANT CONFIG for this landing — seller identity and commercial policy.
//
// NOT product content and NEVER agent-written. generate-landing.mjs overwrites
// this file from the JSON passed to `--merchant`; without that flag it stays
// `null` and the landing is in PREVIEW: it builds, it is navigable, and every
// legal page says plainly that the information is pending configuration.
//
// `null` is the honest default. A template shipping a fake legal name would be
// the one failure mode this whole layer exists to prevent — an unfilled
// placeholder does not block a deploy, it publishes.
//
// It now also carries COMMERCIAL POLICY, not just identity: the returns window,
// who pays the return leg, the delivery estimate and an optional commercial
// guarantee. Presentation never reads those fields from here — lib/policy.ts
// turns them into the one set of sentences every surface shares.
import type { Merchant } from '@/types/merchant';

export const merchant: Merchant | null = null;

import { sumup, assertEnv } from '@/lib/sumup/client';
import type { SumUpCheckout } from '@/lib/sumup/types';

/**
 * ref = 22-char base64url of 16 random bytes (design A3) — NOT the cart gid.
 * Used as SumUp's `checkout_reference` (max 90, we use 22) AND as the
 * Shopify order tag suffix `sumup-ref-{ref}` (32 chars, well under the
 * ~40-char tag limit — gate 8.2).
 */
export function newRef(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString('base64url');
}

/**
 * cents (our domain, integer) -> SumUp's "amount" (major units, e.g. 1990 -> 19.9).
 * SumUp's API takes/returns decimal major units, verified against
 * developer.sumup.com/api/checkouts/create (`"amount": 10.1` examples) —
 * this is the ONE place that boundary is crossed.
 */
export function centsToMajorAmount(cents: number): number {
  return cents / 100;
}

/** Inverse of centsToMajorAmount — rounds to avoid float drift (19.9 * 100 !== 1990 exactly). */
export function majorAmountToCents(amount: number): number {
  return Math.round(amount * 100);
}

interface CreateCheckoutInput {
  ref: string;
  amountCents: number;
  webhookUrl: string; // -> SumUp `return_url`: server-to-server notification callback (verified, NOT a browser redirect)
  redirectUrl: string; // -> SumUp `redirect_url`: browser destination required for Apple Pay / Google Pay in the widget
}

/**
 * Builds the fixed, server-owned browser destination used by SumUp after an
 * alternative payment method finishes. Only the opaque checkout ref is
 * variable; callers cannot supply a destination, so this cannot become an
 * open redirect.
 */
export function buildCheckoutRedirectUrl(origin: string, ref: string): string {
  const redirectUrl = new URL('/checkout/gracias', origin);
  redirectUrl.searchParams.set('ref', ref);
  return redirectUrl.toString();
}

/**
 * Creates a SumUp Checkout. `redirect_url` is required for Apple Pay and
 * Google Pay through the Payment Widget. `return_url` remains a separate
 * server-to-server webhook callback and must not be replaced by it.
 */
export async function createCheckout(input: CreateCheckoutInput): Promise<SumUpCheckout> {
  const { merchantCode } = assertEnv();

  return sumup<SumUpCheckout>('/v0.1/checkouts', {
    method: 'POST',
    body: JSON.stringify({
      checkout_reference: input.ref,
      amount: centsToMajorAmount(input.amountCents),
      currency: 'EUR',
      merchant_code: merchantCode,
      // Backend callback SumUp POSTs {event_type, id} to on status change —
      // NOT the field the buyer's browser is redirected to.
      return_url: input.webhookUrl,
      redirect_url: input.redirectUrl,
    }),
  });
}

/** GET /v0.1/checkouts?checkout_reference=... — list endpoint, filtered to our ref. */
export async function getCheckoutByRef(ref: string): Promise<SumUpCheckout | null> {
  const results = await sumup<SumUpCheckout[]>(`/v0.1/checkouts?checkout_reference=${encodeURIComponent(ref)}`);
  return results[0] ?? null;
}

/**
 * GET /v0.1/checkouts/{checkout_id} — retrieve by SumUp's OWN id, not our
 * ref. Needed because the webhook payload (`{event_type, id}`) only ever
 * carries SumUp's id — verified against
 * developer.sumup.com/online-payments/webhooks/. The response includes
 * `checkout_reference` (our ref), which the webhook handler then hands to
 * settleCheckout(ref).
 */
export async function getCheckoutById(id: string): Promise<SumUpCheckout> {
  return sumup<SumUpCheckout>(`/v0.1/checkouts/${encodeURIComponent(id)}`);
}

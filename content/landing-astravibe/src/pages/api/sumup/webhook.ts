/**
 * POST /api/sumup/webhook — the ONLY trigger for order creation besides the
 * status poll, and both funnel through the same idempotent settleCheckout
 * (spec shopify-order-creation: "Webhook creates the order", "Duplicate
 * webhook delivery MUST NOT create duplicate orders").
 *
 * Payload is exactly `{event_type, id}` (verified, no signature mechanism —
 * see apply-progress reconciliation point 3 / tasks gate 8.4). `id` is
 * SumUp's OWN checkout id, not our ref, so it's resolved via
 * getCheckoutById() first. The body is NEVER trusted as proof of payment —
 * settleCheckout re-verifies against SumUp server-side before writing
 * anything (design A1, pull-based settlement).
 *
 * Returns 200 fast on any non-retryable outcome (paid, already paid, or
 * genuinely still pending) and 500 only when settleCheckout itself reports
 * a failure that's worth another attempt — SumUp retries non-2xx responses
 * with its own backoff (1/5/20/120 min), which is a second safety net on
 * top of the status-poll's own retry loop (design A2).
 */
import type { APIRoute } from 'astro';
import { settleCheckout } from '@/lib/sumup/settle';
import { getCheckoutById } from '@/lib/sumup/checkout';

interface WebhookBody {
  event_type?: string;
  id?: string;
}

export const POST: APIRoute = async ({ request }) => {
  let body: WebhookBody;
  try {
    body = (await request.json()) as WebhookBody;
  } catch {
    return new Response(null, { status: 400 });
  }

  if (!body.id) {
    return new Response(null, { status: 400 });
  }

  try {
    const checkout = await getCheckoutById(body.id);
    const result = await settleCheckout(checkout.checkout_reference);

    if (result.status === 'retrying' || result.status === 'failed') {
      return new Response(null, { status: 500 });
    }

    return new Response(null, { status: 200 });
  } catch (err) {
    console.error('POST /api/sumup/webhook failed', err);
    return new Response(null, { status: 500 });
  }
};

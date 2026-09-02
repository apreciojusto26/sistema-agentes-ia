/**
 * GET /api/checkout/status?ref= — read-only from the caller's perspective
 * (spec checkout-api: "Status endpoint is read-only ... no order or payment
 * state is created or modified as a side effect" — referring to the HTTP
 * contract, not settleCheckout's own internal writes: settleCheckout IS the
 * single writer and this endpoint calls it directly, exactly like the
 * webhook does, so a poll can complete a payment the webhook missed
 * (design A2, "poll is the retry engine"). No request body, no mutation of
 * anything the caller supplies — the only input is `ref`.
 */
import type { APIRoute } from 'astro';
import { settleCheckout } from '@/lib/sumup/settle';

export const GET: APIRoute = async ({ url }) => {
  const ref = url.searchParams.get('ref');
  if (!ref) {
    return Response.json({ error: 'bad_request' }, { status: 400 });
  }

  try {
    const result = await settleCheckout(ref);
    return Response.json(result, { status: 200 });
  } catch (err) {
    // settleCheckout's own lock/session/order steps are wrapped, but a
    // failure to even reach Redis (acquireLock, outside its try/catch by
    // design — see settle.ts step 1) throws here. Mirror webhook.ts: log
    // and degrade to 'pending' so the client's poll loop just retries
    // instead of getting an unhandled 500/HTML error page.
    console.error('GET /api/checkout/status failed', err);
    return Response.json({ status: 'pending' }, { status: 503 });
  }
};

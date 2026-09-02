/**
 * POST /api/checkout/session — validates the live cart, persists the
 * ref->session mapping in KV, and creates the SumUp Checkout. The buyer's
 * cart is NEVER trusted from the request body beyond its id: the amount
 * charged is always `cartGet(cartId).totalCents`, the Storefront API's own
 * authoritative total (spec onsite-checkout/checkout-api: "Session endpoint
 * rejects empty cart"). `orderCreate` is NEVER called from this route (spec
 * shopify-order-creation: "Webhook is the sole order writer") — this route
 * only ever talks to SumUp + KV.
 */
import type { APIRoute } from 'astro';
import { validateCheckoutForm, type CheckoutFormData } from '@/lib/checkout/validation';
import { putSession } from '@/lib/kv';
import { cartGet } from '@/lib/shopify/cart';
import { resolveCanonicalOrigin } from '@/lib/site-origin';
import { buildCheckoutRedirectUrl, createCheckout, newRef } from '@/lib/sumup/checkout';

interface SessionRequestBody extends CheckoutFormData {
  cartId: string;
}

function isSessionRequestBody(value: unknown): value is SessionRequestBody {
  if (!value || typeof value !== 'object') return false;
  const body = value as Record<string, unknown>;
  return (
    typeof body.cartId === 'string' &&
    body.cartId.length > 0 &&
    typeof body.email === 'string' &&
    typeof body.phone === 'string' &&
    !!body.address &&
    typeof body.address === 'object'
  );
}

export const POST: APIRoute = async ({ request, url, cookies }) => {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: 'bad_request' }, { status: 400 });
  }

  if (!isSessionRequestBody(raw)) {
    return Response.json({ error: 'bad_request' }, { status: 400 });
  }

  const validation = validateCheckoutForm({ email: raw.email, phone: raw.phone, address: raw.address });
  if (!validation.valid) {
    return Response.json({ error: 'validation', errors: validation.errors }, { status: 400 });
  }

  try {
    // Never derive payment callbacks from the incoming Host header. Resolve
    // this before any external call or persistence so invalid production
    // configuration fails closed without leaving an orphan session behind.
    const canonicalOrigin = resolveCanonicalOrigin(url);

    // Authoritative cart re-fetch — never trust anything the client claims
    // about totals/line items beyond the cart id itself.
    const cart = await cartGet(raw.cartId);
    if (!cart || !cart.line) {
      return Response.json({ error: 'empty_cart' }, { status: 400 });
    }

    const ref = newRef();
    await putSession(ref, {
      cartId: cart.id,
      email: raw.email,
      phone: raw.phone,
      address: raw.address,
      amountCents: cart.totalCents,
    });

    const webhookUrl = new URL('/api/sumup/webhook', canonicalOrigin).toString();
    // Fixed server-owned destination: the request body cannot choose a URL.
    // Keeping the ref here lets the confirmation page poll settlement after
    // SumUp returns from Apple Pay, Google Pay, or a redirected card flow.
    const redirectUrl = buildCheckoutRedirectUrl(canonicalOrigin, ref);
    const checkout = await createCheckout({ ref, amountCents: cart.totalCents, webhookUrl, redirectUrl });

    // Backup ref carrier alongside the query string the client navigates
    // with on widget success — not the primary path (see gracias.astro),
    // just cheap redundancy if the query string is ever lost.
    cookies.set('dop_ref', ref, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 });

    return Response.json({ ref, checkoutId: checkout.id, amountCents: cart.totalCents }, { status: 200 });
  } catch (err) {
    console.error('POST /api/checkout/session failed', err);
    return Response.json({ error: 'server_error' }, { status: 500 });
  }
};

/**
 * settleCheckout(ref) — the SINGLE writer of Shopify orders for this flow
 * (spec: shopify-order-creation, "Webhook is the sole order writer" — in
 * practice both the webhook AND the status poll call THIS function, which
 * is itself idempotent; neither caller ever calls orderCreate directly).
 * Pull-based (design A1): re-reads SumUp server-side rather than trusting
 * any webhook payload — SumUp's own webhook docs explicitly recommend this
 * ("your application must always verify if the event really took place, by
 * calling a relevant SumUp's API" — developer.sumup.com/online-payments/webhooks/).
 *
 * Ports are injected with real defaults wired here, overridable by tests
 * (design: "Keep settleCheckout dependency-injected ... testable without a
 * Shopify sandbox").
 */
import { alertOps } from '@/lib/alerts';
import { acquireLock, getOrderRecord, getSession, putOrderRecord, recordFailure, releaseLock } from '@/lib/kv';
import { admin } from '@/lib/shopify/admin';
import { ORDERS_BY_TAG, ORDER_CREATE } from '@/lib/shopify/admin-queries';
import { cartGet } from '@/lib/shopify/cart';
import type { CartSnapshot } from '@/lib/shopify/types';
import { getCheckoutByRef, majorAmountToCents } from '@/lib/sumup/checkout';
import type { CheckoutSession, SettleResult } from '@/lib/sumup/types';

// Spanish standard VAT, flat rate — resolved gate 8.1 (2026-08-02): no OSS,
// no per-country lookup. Prices are tax-inclusive (proposal's confirmed
// tax/shipping model), so the tax line is EXTRACTED from the gross total,
// not added on top.
const VAT_RATE = 0.21;
const ORDER_TAG_PREFIX = 'sumup-ref-';
// Mirrors the status-poll's own 5-attempt bound (design A2) so 'failed' is
// reached at roughly the same point whichever caller drives the retries.
const MAX_ATTEMPTS_BEFORE_FAILED = 5;

interface OrderRef {
  id: string;
  name: string;
}

interface OrderCreateResponse {
  orderCreate: {
    order: OrderRef | null;
    userErrors: { field: string[] | null; message: string }[];
  };
}

interface OrdersByTagResponse {
  orders: { nodes: OrderRef[] };
}

/**
 * Pure — no network, fully unit-testable (task 7.3). Builds the
 * `OrderCreateOrderInput` variables object. Field names/shapes verified
 * against shopify.dev's Admin GraphQL reference (2026-07); see
 * src/lib/shopify/admin.ts header for what was specifically checked.
 */
export function buildOrderInput(session: CheckoutSession, cart: CartSnapshot, ref: string): Record<string, unknown> {
  if (!cart.line) {
    throw new Error('buildOrderInput: cart has no line — caller must guard before calling this');
  }

  // Tax-inclusive extraction: grossAmount * rate / (1 + rate).
  const taxAmountCents = Math.round((cart.totalCents * VAT_RATE) / (1 + VAT_RATE));

  const order: Record<string, unknown> = {
    email: session.email,
    phone: session.phone,
    currency: 'EUR',
    taxesIncluded: true,
    financialStatus: 'PAID',
    lineItems: [{ variantId: cart.line.variantId, quantity: cart.line.quantity }],
    shippingAddress: {
      firstName: session.address.firstName,
      lastName: session.address.lastName,
      address1: session.address.address1,
      address2: session.address.address2 || undefined,
      city: session.address.city,
      provinceCode: session.address.provinceCode || undefined,
      countryCode: session.address.countryCode,
      zip: session.address.zip,
      phone: session.phone,
    },
    taxLines: [
      {
        title: 'IVA',
        rate: VAT_RATE,
        priceSet: { shopMoney: { amount: taxAmountCents / 100, currencyCode: 'EUR' } },
      },
    ],
    transactions: [
      {
        kind: 'SALE',
        status: 'SUCCESS',
        gateway: 'SumUp',
        amountSet: { shopMoney: { amount: cart.totalCents / 100, currencyCode: 'EUR' } },
      },
    ],
    tags: [`${ORDER_TAG_PREFIX}${ref}`],
  };

  // BXGY discount re-application (design A5) — no priceSet on line items,
  // Shopify recomputes the subtotal from variant price; the cart's
  // discountAllocations are re-applied here as a single fixed discount.
  if (cart.discountCents > 0) {
    order.discountCode = {
      itemFixedDiscountCode: {
        code: 'BUNDLE',
        amountSet: { shopMoney: { amount: cart.discountCents / 100, currencyCode: 'EUR' } },
      },
    };
  }

  return order;
}

async function findOrderByRef(ref: string): Promise<OrderRef | null> {
  const data = await admin<OrdersByTagResponse>(ORDERS_BY_TAG, { query: `tag:${ORDER_TAG_PREFIX}${ref}` });
  return data.orders.nodes[0] ?? null;
}

async function createOrder(order: Record<string, unknown>): Promise<OrderRef> {
  const data = await admin<OrderCreateResponse>(ORDER_CREATE, {
    order,
    // inventoryBehaviour spelling (British) verified against
    // OrderCreateOptionsInput's live schema — see admin.ts header.
    options: { inventoryBehaviour: 'DECREMENT_IGNORING_POLICY', sendReceipt: true },
  });

  if (data.orderCreate.userErrors.length > 0) {
    throw new Error(`orderCreate userErrors: ${data.orderCreate.userErrors.map((e) => e.message).join('; ')}`);
  }
  if (!data.orderCreate.order) {
    throw new Error('orderCreate returned no order and no userErrors');
  }
  return data.orderCreate.order;
}

export interface SettlePorts {
  acquireLock: (ref: string) => Promise<boolean>;
  releaseLock: (ref: string) => Promise<void>;
  getSession: (ref: string) => Promise<CheckoutSession | null>;
  recordFailure: (ref: string, error: string) => Promise<{ attempt: number }>;
  getCheckoutByRef: (ref: string) => ReturnType<typeof getCheckoutByRef>;
  cartGet: (cartId: string) => Promise<CartSnapshot | null>;
  findOrderByRef: (ref: string) => Promise<OrderRef | null>;
  createOrder: (order: Record<string, unknown>) => Promise<OrderRef>;
  alertOps: (payload: { ref: string; error: string; attempt?: number }) => Promise<void>;
  getOrderRecord: (ref: string) => Promise<OrderRef | null>;
  putOrderRecord: (ref: string, order: OrderRef) => Promise<void>;
}

const defaultPorts: SettlePorts = {
  acquireLock,
  releaseLock,
  getSession,
  recordFailure,
  getCheckoutByRef,
  cartGet,
  findOrderByRef,
  createOrder,
  alertOps,
  getOrderRecord,
  putOrderRecord,
};

async function handleFailure(ports: SettlePorts, ref: string, error: string): Promise<SettleResult> {
  const record = await ports.recordFailure(ref, error);
  await ports.alertOps({ ref, error, attempt: record.attempt });
  return record.attempt >= MAX_ATTEMPTS_BEFORE_FAILED
    ? { status: 'failed', ref }
    : { status: 'retrying', attempt: record.attempt };
}

/**
 * The single writer. Idempotent and safe to call repeatedly/concurrently —
 * both the webhook and the status poll call this directly. 7-step sequence
 * per design (design.md "settleCheckout(ref) (single writer, idempotent)").
 */
export async function settleCheckout(ref: string, ports: SettlePorts = defaultPorts): Promise<SettleResult> {
  // Step 1 — concurrency lock. Held by another in-flight settle attempt?
  const locked = await ports.acquireLock(ref);
  if (!locked) {
    return { status: 'pending' };
  }

  try {
    // Step 2 — SumUp is the source of truth for payment status (never trust the webhook body).
    const checkout = await ports.getCheckoutByRef(ref);
    if (!checkout || checkout.status !== 'PAID') {
      return { status: 'pending' };
    }
    const sumupAmountCents = majorAmountToCents(checkout.amount);

    // Step 3 — dedupe BEFORE ever attempting a write. KV is checked first:
    // it's written synchronously right after createOrder (see step 6) with
    // no propagation delay, unlike Shopify's `orders(query:"tag:...")`
    // search index, which is only eventually consistent — a settle call
    // landing moments after another created the order could otherwise get a
    // stale empty result from the tag search alone and write a duplicate.
    // Tag search stays as a fallback for a KV entry that expired or was
    // never written (crash between createOrder and putOrderRecord).
    const knownOrder = (await ports.getOrderRecord(ref)) ?? (await ports.findOrderByRef(ref));
    if (knownOrder) {
      return { status: 'paid', orderName: knownOrder.name };
    }

    // Step 4 — live re-fetch, never a cached snapshot (spec: "no cached snapshot").
    const session = await ports.getSession(ref);
    if (!session) {
      return await handleFailure(ports, ref, 'No session found for ref — cannot build order');
    }
    const cart = await ports.cartGet(session.cartId);
    if (!cart || !cart.line) {
      return await handleFailure(ports, ref, 'Live cart re-fetch returned null/empty — cannot build order');
    }

    // Step 5 — three-way equality guard: what we captured at session
    // creation, what the cart is worth NOW, and what SumUp actually
    // charged all must agree. Any mismatch aborts — no order is written.
    if (session.amountCents !== cart.totalCents || cart.totalCents !== sumupAmountCents) {
      return await handleFailure(
        ports,
        ref,
        `Total mismatch: session=${session.amountCents} cart=${cart.totalCents} sumup=${sumupAmountCents}`,
      );
    }

    // Step 6 — write, then immediately record the strongly-consistent
    // dedupe marker (step 3 above) before releasing the lock.
    const order = await ports.createOrder(buildOrderInput(session, cart, ref));
    await ports.putOrderRecord(ref, order);
    return { status: 'paid', orderName: order.name };
  } catch (err) {
    // Step 7 — dead-letter + alert on any failure, including thrown network/API errors.
    return await handleFailure(ports, ref, err instanceof Error ? err.message : String(err));
  } finally {
    await ports.releaseLock(ref);
  }
}

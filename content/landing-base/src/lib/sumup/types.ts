/**
 * SumUp domain types. `SumUpCheckout`/`SumUpTransaction` mirror the REST
 * Checkout resource verified against developer.sumup.com/api/checkouts —
 * amounts are MAJOR units (e.g. 19.9), never cents, unlike CartSnapshot.
 */
import type { ShippingAddress } from '@/lib/checkout/validation';

export type SumUpCheckoutStatus = 'PENDING' | 'FAILED' | 'PAID' | 'EXPIRED';
export type SumUpTransactionStatus = 'SUCCESSFUL' | 'CANCELLED' | 'FAILED' | 'PENDING' | 'REFUNDED';

export interface SumUpTransaction {
  id: string;
  transaction_code: string;
  amount: number; // major units
  currency: string;
  status: SumUpTransactionStatus;
}

export interface SumUpCheckout {
  id: string; // SumUp's own checkout id — NOT our ref; this is what the webhook body carries
  checkout_reference: string; // == our ref (newRef())
  amount: number; // major units
  currency: string;
  merchant_code: string;
  status: SumUpCheckoutStatus;
  date: string;
  transactions: SumUpTransaction[];
}

/** ref -> buyer/cart mapping persisted in Upstash at session creation (src/lib/kv.ts). */
export interface CheckoutSession {
  cartId: string;
  email: string;
  phone: string;
  address: ShippingAddress;
  amountCents: number; // AUTHORITATIVE at session-creation time; re-verified live by settleCheckout
}

/** Result of settleCheckout(ref) — returned by both the webhook and the status-poll route. */
export type SettleResult =
  | { status: 'pending' } // not paid yet, or another settle attempt currently holds the lock
  | { status: 'paid'; orderName: string } // Shopify order exists (created now or found via dedupe)
  | { status: 'retrying'; attempt: number } // paid at SumUp, order write failed, will retry
  | { status: 'failed'; ref: string }; // exhausted retries — show support copy with ref

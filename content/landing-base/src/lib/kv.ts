/**
 * Upstash Redis (REST) — the one piece of external state this checkout
 * needs: ref->session map, the settleCheckout concurrency lock, and the
 * dead-letter store for "paid but no order" failures (design A4).
 * `@upstash/redis`'s Node client auto-serializes/deserializes JSON values
 * on set()/get(), so callers pass/receive plain objects.
 */
import { Redis } from '@upstash/redis';
import { getSecret } from 'astro:env/server';
import type { CheckoutSession } from '@/lib/sumup/types';

const SESSION_TTL_SECONDS = 60 * 60 * 24; // 24h
const LOCK_TTL_SECONDS = 60;

let client: Redis | null = null;

function getClient(): Redis {
  if (client) return client;

  const url = getSecret('UPSTASH_REDIS_REST_URL');
  const token = getSecret('UPSTASH_REDIS_REST_TOKEN');
  if (!url || !token) {
    throw new Error('Missing UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN — server misconfigured');
  }

  client = new Redis({ url, token });
  return client;
}

export async function putSession(ref: string, session: CheckoutSession): Promise<void> {
  await getClient().set(`sumup:sess:${ref}`, session, { ex: SESSION_TTL_SECONDS });
}

export async function getSession(ref: string): Promise<CheckoutSession | null> {
  const value = await getClient().get<CheckoutSession>(`sumup:sess:${ref}`);
  return value ?? null;
}

/** SET NX EX 60 — true if this call acquired the lock, false if another settle attempt holds it. */
export async function acquireLock(ref: string): Promise<boolean> {
  const result = await getClient().set(`sumup:lock:${ref}`, '1', { nx: true, ex: LOCK_TTL_SECONDS });
  return result === 'OK';
}

export async function releaseLock(ref: string): Promise<void> {
  await getClient().del(`sumup:lock:${ref}`);
}

export interface OrderRecord {
  id: string;
  name: string;
}

/**
 * Strongly-consistent dedupe marker (`sumup:order:{ref}`), written right
 * after a successful orderCreate. Exists because Shopify's `orders(query:
 * "tag:...")` search index is eventually-consistent — a settle call landing
 * moments after another just created the order could get a stale empty
 * result from the tag search alone and write a duplicate. Read FIRST in
 * settleCheckout's dedupe step, tag search kept as a fallback for cases
 * where this KV entry expired or was never written (e.g. crash between
 * createOrder and putOrderRecord).
 */
export async function putOrderRecord(ref: string, order: OrderRecord): Promise<void> {
  await getClient().set(`sumup:order:${ref}`, order, { ex: SESSION_TTL_SECONDS });
}

export async function getOrderRecord(ref: string): Promise<OrderRecord | null> {
  const value = await getClient().get<OrderRecord>(`sumup:order:${ref}`);
  return value ?? null;
}

export interface FailureRecord {
  error: string;
  attempt: number;
  lastAttemptAt: string; // ISO timestamp
}

/**
 * Dead-letter store (`sumup:dl:{ref}`) — read by the manual-order runbook
 * (design "Failure: paid but no order"). Increments `attempt` across calls
 * so the caller (settleCheckout) can decide 'retrying' vs 'failed'.
 */
export async function recordFailure(ref: string, error: string): Promise<FailureRecord> {
  const key = `sumup:dl:${ref}`;
  const existing = await getClient().get<FailureRecord>(key);

  const record: FailureRecord = {
    error,
    attempt: (existing?.attempt ?? 0) + 1,
    lastAttemptAt: new Date().toISOString(),
  };

  await getClient().set(key, record, { ex: SESSION_TTL_SECONDS });
  return record;
}

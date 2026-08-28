/**
 * Thin wrapper around GA4's gtag.
 *
 * `window.gtag` is now published ONLY by lib/analytics-loader.ts, and only
 * after the visitor accepts analytics — Base.astro no longer emits the tag
 * itself. So this function's existing guard became the consent gate for every
 * event call site for free: with no consent there is no `gtag`, and every
 * trackEvent() is a no-op. add_to_cart, begin_checkout and purchase needed no
 * changes at all.
 *
 * It also means consent is NOT retrospective: an event that no-oped before
 * acceptance is gone, not queued. That is deliberate — see analytics-loader.
 */
type GtagFn = (...args: unknown[]) => void;

declare global {
  interface Window {
    gtag?: GtagFn;
    dataLayer?: unknown[];
  }
}

export interface EcommerceItem {
  item_id: string;
  item_name: string;
  price: number;
  quantity: number;
}

export function trackEvent(name: string, params?: Record<string, unknown>): void {
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return;
  window.gtag('event', name, params);
}

export function centsToUnits(cents: number): number {
  return Math.round(cents) / 100;
}

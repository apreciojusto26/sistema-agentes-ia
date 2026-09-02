/**
 * Thin wrapper around GA4's gtag — Base.astro exposes `window.gtag` only
 * when PUBLIC_GA_MEASUREMENT_ID is set (prod-only, see astro:env schema).
 * No-ops everywhere else (dev, preview, GA unset) instead of throwing.
 */
type GtagFn = (...args: unknown[]) => void;

declare global {
  interface Window {
    gtag?: GtagFn;
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

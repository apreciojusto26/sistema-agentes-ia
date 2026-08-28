// THE ONE place that injects an analytics provider. Nothing else may.
//
// Before this file, Base.astro emitted the GA4 tag and the Clarity IIFE
// directly into the server-rendered <head>, gated only by `import.meta.env.PROD
// && <id configured>`. That meant a production landing loaded both, and fired
// `view_item`, on first paint — no interaction, no consent, and Clarity is a
// session recorder.
//
// The strategy is NOT Google Consent Mode. Consent Mode still downloads and
// runs GA before deciding how it should behave; not inserting the script needs
// no trust in anyone. Clarity has no equivalent mode at all — you either inject
// it or you do not.
//
// IDEMPOTENT BY CONSTRUCTION. Each loader is guarded by a module-level flag AND
// by an existence check on what it creates, so a re-render, a second consent
// event and a hot reload cannot produce two GA tags or two Clarity queues.
import { analyticsAllowed } from '@/lib/consent';

let gaLoaded = false;
let clarityLoaded = false;
let viewItemSent = false;

/** Ids come from PUBLIC_ env, inlined into the client bundle at build time. */
function gaId(): string | undefined {
  const v = import.meta.env.PUBLIC_GA_MEASUREMENT_ID as string | undefined;
  return v && v.trim() !== '' ? v.trim() : undefined;
}

function clarityId(): string | undefined {
  const v = import.meta.env.PUBLIC_CLARITY_PROJECT_ID as string | undefined;
  return v && v.trim() !== '' ? v.trim() : undefined;
}

/** Consent is necessary but NOT sufficient — an unconfigured provider loads nothing. */
export function analyticsConfigured(): boolean {
  return gaId() !== undefined || clarityId() !== undefined;
}

function loadGa(id: string): void {
  if (gaLoaded || document.getElementById('ga4-tag')) return;
  gaLoaded = true;

  const tag = document.createElement('script');
  tag.id = 'ga4-tag';
  tag.async = true;
  tag.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  document.head.appendChild(tag);

  // Same shape Base.astro used to emit inline, moved behind the gate. `gtag`
  // is published on `window` because lib/analytics.ts reaches for it there.
  const layer: unknown[] = window.dataLayer ?? [];
  window.dataLayer = layer;
  // GA's own snippet pushes `arguments`, so the array-of-args shape is what
  // gtag.js expects — not a spread.
  const gtag = (...args: unknown[]) => {
    layer.push(args);
  };
  window.gtag = gtag;
  gtag('js', new Date());
  gtag('config', id);
}

function loadClarity(id: string): void {
  if (clarityLoaded || document.getElementById('clarity-tag')) return;
  clarityLoaded = true;

  // Clarity's loader expects a global queue function to exist before its
  // script arrives, so calls made in between are not lost. Typed explicitly
  // rather than cast through `any`.
  type ClarityQueue = ((...args: unknown[]) => void) & { q?: unknown[] };
  const w = window as Window & { clarity?: ClarityQueue };
  if (!w.clarity) {
    const queue: ClarityQueue = (...args: unknown[]) => {
      queue.q = queue.q ?? [];
      queue.q.push(args);
    };
    w.clarity = queue;
  }
  const tag = document.createElement('script');
  tag.id = 'clarity-tag';
  tag.async = true;
  tag.src = `https://www.clarity.ms/tag/${encodeURIComponent(id)}`;
  document.head.appendChild(tag);
}

/**
 * The page-view event. It used to be an inline `window.gtag('event','view_item')`
 * in index.astro that ran on load; it now runs only once analytics is actually
 * loaded, and EXACTLY ONCE per page.
 *
 * The two paths that must not double-fire: already-accepted on arrival, and
 * accepted mid-session. `viewItemSent` is what makes them the same path.
 */
export interface ViewItemPayload {
  currency: string;
  value: number;
  items: Array<{ item_id: string; item_name: string; price: number; quantity: number }>;
}

let pendingViewItem: ViewItemPayload | null = null;

/** Records the payload for this page. Sends it only if analytics is already on. */
export function registerViewItem(payload: ViewItemPayload): void {
  pendingViewItem = payload;
  maybeSendViewItem();
}

function maybeSendViewItem(): void {
  if (viewItemSent || !pendingViewItem) return;
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return;
  viewItemSent = true;
  window.gtag('event', 'view_item', pendingViewItem);
}

/**
 * Loads whatever is both CONSENTED and CONFIGURED. Safe to call repeatedly.
 *
 * NOT retrospective: accepting now does not replay an add_to_cart that happened
 * while consent was unknown. There is deliberately no event queue — a consent
 * decision applies forward, and a buffer that flushed on acceptance would be
 * collecting under exactly the condition the user had not agreed to.
 */
export function syncAnalytics(): void {
  if (typeof window === 'undefined') return;
  if (!analyticsAllowed()) return;

  const ga = gaId();
  if (ga) loadGa(ga);
  const clarity = clarityId();
  if (clarity) loadClarity(clarity);

  maybeSendViewItem();
}

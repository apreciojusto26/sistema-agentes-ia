/**
 * Browser side of the checkout diagnostics. Never throws and never blocks the
 * purchase: if telemetry breaks, the buyer must not notice.
 */
import type { CheckoutEvent, DiagnosticEventInput } from '@/lib/telemetry/events';

const DSID_KEY = 'astravibe:dsid';
const ENDPOINT = '/api/diagnostics/event';

/**
 * Correlation id for one purchase attempt. sessionStorage, not localStorage:
 * it should die with the tab, and it must never become a durable identifier.
 *
 * Storage can be blocked (private mode, partitioned WebView) — in that case
 * we fall back to a per-page-load id. Events then land under separate ids
 * instead of being lost, which is itself a useful signal: a TikTok run that
 * produces a fresh dsid on every page means storage is being partitioned.
 */
export function getDiagnosticSessionId(): string {
  if (typeof window === 'undefined') return '';
  try {
    const existing = window.sessionStorage.getItem(DSID_KEY);
    if (existing) return existing;
    const created = newId();
    window.sessionStorage.setItem(DSID_KEY, created);
    return created;
  } catch {
    return newId();
  }
}

function newId(): string {
  try {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 22);
  } catch {
    return `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  }
}

type ExtraFields = Omit<DiagnosticEventInput, 'event' | 'dsid' | 'pathname' | 'hostname'>;

/**
 * Fire-and-forget. `keepalive` matters: checkout_navigation_started fires
 * immediately before location.assign(), and a normal fetch is cancelled when
 * the document goes away — losing the one event that tells us whether the
 * browser ever reached /checkout at all.
 */
export function trackCheckoutEvent(event: CheckoutEvent, extra: ExtraFields = {}): void {
  if (typeof window === 'undefined') return;

  const payload: DiagnosticEventInput = {
    event,
    dsid: getDiagnosticSessionId(),
    pathname: window.location.pathname,
    hostname: window.location.hostname,
    ...extra,
  };

  try {
    const body = JSON.stringify(payload);

    if (typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([body], { type: 'application/json' });
      if (navigator.sendBeacon(ENDPOINT, blob)) return;
    }

    void fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // Diagnostics must never surface to the buyer.
  }
}

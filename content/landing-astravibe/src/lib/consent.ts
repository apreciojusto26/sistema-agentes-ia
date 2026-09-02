/**
 * Cookie consent state. Analytics must NOT load before the visitor opts in
 * (LSSI-CE art. 22.2 + AEPD guidance: consent is prior and explicit), so the
 * loader lives in an inline bootstrap in Base.astro and this module is only
 * the typed surface the banner island talks to.
 *
 * Loading is deliberately NOT done from React: a returning visitor who
 * already consented should get analytics on first paint, not after
 * hydration. The bootstrap handles that case; the island only handles the
 * undecided one.
 */
export const CONSENT_KEY = 'astravibe:cookie-consent';

export type ConsentValue = 'granted' | 'denied';

declare global {
  interface Window {
    /** Injects GA + Clarity. Defined by Base.astro, idempotent. */
    __loadAnalytics?: () => void;
  }
}

/** null = the visitor has not decided yet, so the banner must be shown. */
export function getConsent(): ConsentValue | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = window.localStorage.getItem(CONSENT_KEY);
    return stored === 'granted' || stored === 'denied' ? stored : null;
  } catch {
    // Private mode / storage blocked — treat as undecided rather than
    // assuming consent. Failing closed is the only safe default here.
    return null;
  }
}

export function setConsent(value: ConsentValue): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CONSENT_KEY, value);
  } catch {
    // Persisting failed; still honour the choice for this page view.
  }
  if (value === 'granted') window.__loadAnalytics?.();
}

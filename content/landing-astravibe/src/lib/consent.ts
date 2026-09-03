/**
 * THE ONE consent state, for the whole landing.
 *
 * Analytics must NOT load before the visitor opts in (LSSI-CE art. 22.2 + AEPD
 * guidance: consent is prior and explicit), so the loader lives in an inline
 * bootstrap in Base.astro and this module is the typed surface the banner
 * island talks to. Loading is deliberately NOT driven from React: a returning
 * visitor who already consented should get analytics on first paint, not after
 * hydration. The bootstrap handles that case; the island handles the undecided
 * one.
 *
 * ─── THREE STATES, NOT TWO ────────────────────────────────────────────────
 *
 * `unknown` (never asked) and `rejected` (asked, said no) are different: the
 * first must show the banner, the second must not. Collapsing them into
 * "analytics is off" re-prompts someone who already declined, which is its own
 * dark pattern.
 *
 * ─── WHY THE STORAGE KEY CHANGED ──────────────────────────────────────────
 *
 * It was `astravibe:cookie-consent`. This template is the canonical source
 * every generated landing is copied from, so that key wrote the star
 * projector's brand into the browser of every buyer of every product this
 * system will ever produce — a coffee grinder's shop storing `astravibe:`
 * something. Storage keys are never rendered, which is the only reason it went
 * unnoticed; it is the same defect class as the hardcoded "Astra Vibe"
 * heading.
 *
 * `consent:v1` is neutral and self-describing, and it leaks neither the
 * template's brand nor the generator's name into a merchant's browser. The
 * VERSION is load-bearing: it makes a future schema change a migration rather
 * than a silent reinterpretation of values written under the old meaning.
 *
 * ─── AND A PRIOR DECISION IS HONOURED, NOT DISCARDED ──────────────────────
 *
 * Renaming the key would otherwise reset every existing visitor to `unknown`
 * and re-prompt people who already answered — including people who said no.
 * `readDecision()` therefore falls back to the legacy key, and the legacy
 * values (`granted`/`denied`) are translated rather than dropped. That
 * fallback is a read, never a write: nothing re-persists under the old name.
 */

/** Neutral, versioned. Carries no brand — see the note above. */
export const CONSENT_KEY = 'consent:v1';

/**
 * The key this template used before. Read-only, and kept ONLY so a visitor who
 * already decided is not asked twice. Delete it once no browser can plausibly
 * still hold it.
 */
export const LEGACY_CONSENT_KEY = 'astravibe:cookie-consent';

export type ConsentDecision = 'unknown' | 'accepted' | 'rejected';

/** What is persisted. `unknown` is the ABSENCE of a value, never a stored one. */
export type ConsentValue = Extract<ConsentDecision, 'accepted' | 'rejected'>;

declare global {
  interface Window {
    /** Injects GA + Clarity. Defined by Base.astro, idempotent. */
    __loadAnalytics?: () => void;
  }
}

/** Legacy values, translated. Anything else is treated as never having decided. */
function fromLegacy(stored: string | null): ConsentDecision {
  if (stored === 'granted') return 'accepted';
  if (stored === 'denied') return 'rejected';
  return 'unknown';
}

/**
 * The visitor's decision, or `unknown` when there is none — including when
 * storage throws. Failing to `unknown` is the only safe default: assuming
 * consent because private mode blocked a read would load analytics for someone
 * who never agreed.
 */
export function readConsent(): ConsentDecision {
  if (typeof window === 'undefined') return 'unknown';
  try {
    const stored = window.localStorage.getItem(CONSENT_KEY);
    if (stored === 'accepted' || stored === 'rejected') return stored;
    // Nothing under the current key — an existing visitor may have answered
    // under the old one. Read it, do not migrate it: a write here would be a
    // storage side effect on a page the visitor has not interacted with.
    return fromLegacy(window.localStorage.getItem(LEGACY_CONSENT_KEY));
  } catch {
    return 'unknown';
  }
}

/** True only for an explicit `accepted`. `unknown` and `rejected` both mean no. */
export function analyticsAllowed(): boolean {
  return readConsent() === 'accepted';
}

export function setConsent(value: ConsentValue): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CONSENT_KEY, value);
    // The legacy entry is cleared on the way past, so the two can never
    // disagree later. Best-effort: a failure here changes nothing, because
    // readConsent() prefers the current key.
    window.localStorage.removeItem(LEGACY_CONSENT_KEY);
  } catch {
    // Persisting failed; still honour the choice for this page view.
  }
  if (value === 'accepted') window.__loadAnalytics?.();
}

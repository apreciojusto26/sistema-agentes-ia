// THE ONE consent state, for the whole landing.
//
// SCOPE, deliberately narrow: this gates the two analytics providers this
// template actually loads — Google Analytics 4 and Microsoft Clarity — and
// nothing else. There is no `marketing` and no `ads` category, because no
// marketing or ads script exists. Designing categories for features that do
// not exist is how a consent model starts lying about what it controls.
//
// WHAT IT DOES NOT GATE: the cart id in localStorage, the Shopify storefront
// calls that only fire on a user action, and the checkout. Those are the
// transaction. Also NOT gated: the countdown's sessionStorage — it is
// first-party UI state, sends nothing to anyone, and folding it into an
// analytics toggle would misdescribe both.
//
// STORAGE KEY. Deliberately NOT `astravibe:consent`. The two keys that already
// exist — `astravibe:cartId` and `astravibe:offerEndsAt` — carry the star
// projector's brand hardcoded in the template, so every landing this system
// generates writes `astravibe:` whatever it actually sells. That is the same
// class of defect as the comparison heading was, just invisible because
// storage keys are never rendered. This one does not inherit it, and it does
// not leak the generator's name into a merchant's browser either: `consent:v1`
// is neutral and self-describing, and the version makes a future schema change
// a migration rather than a silent reinterpretation.
export const CONSENT_STORAGE_KEY = 'consent:v1';

/**
 * THREE states, not two. `unknown` (never asked) and `rejected` (asked, said
 * no) are different: the first must show the banner, the second must not. A
 * model that collapses them into `analytics === false` re-prompts a user who
 * already declined, which is its own dark pattern.
 */
export type ConsentDecision = 'unknown' | 'accepted' | 'rejected';

export interface ConsentState {
  /** Always true. The transaction cannot be opted out of and is not offered as a choice. */
  necessary: true;
  analytics: boolean;
}

const ACCEPTED: ConsentState = { necessary: true, analytics: true };
const REJECTED: ConsentState = { necessary: true, analytics: false };

/** What was stored, or `unknown` when nothing was — including when storage throws. */
export function readConsent(): ConsentDecision {
  if (typeof window === 'undefined') return 'unknown';
  try {
    const raw = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    if (raw === null) return 'unknown';
    const parsed = JSON.parse(raw) as Partial<ConsentState>;
    return parsed.analytics === true ? 'accepted' : 'rejected';
  } catch {
    // Private mode, disabled storage, corrupted value. Treat as never asked —
    // the one safe direction, because it loads nothing.
    return 'unknown';
  }
}

export function consentState(decision: ConsentDecision): ConsentState {
  return decision === 'accepted' ? ACCEPTED : REJECTED;
}

/** Persists a decision. Returns false when storage refused — the caller must not pretend it saved. */
export function writeConsent(decision: Exclude<ConsentDecision, 'unknown'>): boolean {
  if (typeof window === 'undefined') return false;
  try {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(consentState(decision)));
    return true;
  } catch {
    return false;
  }
}

/** True only for an explicit acceptance. `unknown` never loads anything. */
export function analyticsAllowed(): boolean {
  return readConsent() === 'accepted';
}

/**
 * Checkout diagnostics. Answers ONE question: at which phase does a given
 * browser stop making progress?
 *
 * Strictly technical — no card data, no CVV, no name, email, phone or
 * address, no SumUp payloads. The widget runs in SumUp's own iframe, so card
 * details never reach this origin in the first place; the rules below are
 * about never adding anything of our own.
 *
 * This is not analytics and sets no cookies, so it is NOT gated on the cookie
 * banner: a diagnostic that only fires for consenting users cannot answer the
 * question it exists for. The correlation id lives in sessionStorage and dies
 * with the tab.
 */

export const CHECKOUT_EVENTS = [
  'checkout_navigation_started',
  'checkout_page_loaded',
  'checkout_form_submitted',
  'sumup_session_created',
  'sumup_widget_loaded',
  // NOTE: no 'sumup_payment_methods_loaded'. SumUp's onPaymentMethodsLoad
  // callback FILTERS the rendered payment methods by its return value, and it
  // is unverified whether a pass-through return is a true no-op — so it stays
  // unwired. Losing one event beats instrumentation that can change what
  // buyers are able to pay with. See the note in CheckoutForm's mount types.
  'sumup_payment_sent',
  'sumup_auth_screen',
  'sumup_success',
  'sumup_fail',
  'sumup_error',
  'checkout_thankyou_loaded',
  // TikTok bio-link UX layer. Measures how many see the notice versus how
  // many hit the checkout gate, so the layer can be judged on numbers.
  'tiktok_bio_notice_shown',
  'tiktok_bio_notice_dismissed',
  'tiktok_bio_checkout_blocked',
] as const;

export type CheckoutEvent = (typeof CHECKOUT_EVENTS)[number];

export function isCheckoutEvent(value: unknown): value is CheckoutEvent {
  return typeof value === 'string' && (CHECKOUT_EVENTS as readonly string[]).includes(value);
}

/** What the browser sends. Everything is optional except the event itself. */
export interface DiagnosticEventInput {
  event: CheckoutEvent;
  /** Correlation id — groups one purchase attempt across page loads. */
  dsid: string;
  pathname?: string;
  hostname?: string;
  /** Widget phase at emit time ('form' | 'creating-session' | 'widget' | …). */
  phase?: string;
  /** Our SumUp checkout_reference, once it exists. */
  ref?: string;
  /** SumUp's own checkout id, once it exists. */
  checkoutId?: string;
  /** Free-form technical note — never anything buyer-identifying. */
  detail?: string;
}

/** What gets stored. Browser fields are re-derived server-side, not trusted. */
export interface DiagnosticEventRecord extends Omit<DiagnosticEventInput, 'dsid'> {
  timestamp: string;
  detectedBrowser: string;
  isTikTokWebView: boolean;
  userAgentSummary: string;
}

export const DIAGNOSTICS_TTL_SECONDS = 60 * 60 * 48; // 48h
/** Hard cap per correlation id so a loop cannot fill the store. */
export const DIAGNOSTICS_MAX_EVENTS = 60;

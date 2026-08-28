// The consent surface: a first-visit banner, a preferences panel, and the one
// call that loads analytics once it is allowed.
//
// IT IS ALSO THE LOADER'S ONLY CALLER on the landing. Base.astro no longer
// emits any tracker; nothing runs until syncAnalytics() decides it may.
//
// NO DARK PATTERNS, and that is a structural choice rather than a styling one:
// "Aceptar" and "Rechazar" are siblings in the same row, same size, same
// prominence, both reachable by keyboard in reading order. Rejecting is not
// hidden behind "Gestionar preferencias" — that third control is for changing
// a decision, not for escaping the first one.
import { useCallback, useEffect, useRef, useState } from 'react';
import { readConsent, writeConsent, type ConsentDecision } from '@/lib/consent';
import { MANAGE_COOKIES_HREF } from '@/lib/navigation';
import { analyticsConfigured, syncAnalytics } from '@/lib/analytics-loader';

/** Footer link and anything else can open preferences by dispatching this. */
export const OPEN_PREFERENCES_EVENT = 'consent:open-preferences';

export function ConsentGate() {
  // `null` = not yet read. Rendering nothing until the first effect runs keeps
  // the server output and the first client paint identical, so the banner can
  // never flash for someone who already decided.
  const [decision, setDecision] = useState<ConsentDecision | null>(null);
  const [showPreferences, setShowPreferences] = useState(false);
  const [analyticsChecked, setAnalyticsChecked] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const current = readConsent();
    setDecision(current);
    setAnalyticsChecked(current === 'accepted');
    // Returning visitor who already accepted: load without asking again.
    syncAnalytics();
  }, []);

  // The footer's "Gestionar cookies" reaches us through a window event rather
  // than a shared store — this island is mounted once and the footer is static
  // Astro, so an event is the smallest thing that connects them.
  useEffect(() => {
    const open = () => {
      previouslyFocused.current = document.activeElement as HTMLElement | null;
      setAnalyticsChecked(readConsent() === 'accepted');
      setShowPreferences(true);
    };
    window.addEventListener(OPEN_PREFERENCES_EVENT, open);

    // The footer link is static Astro markup, so it is intercepted here rather
    // than wired with an onClick. It stays a real <a> with a real href: that
    // keeps it keyboard- and screen-reader-navigable, and it still leads
    // somewhere useful (the policy page) if this island never mounts.
    const onClick = (e: MouseEvent) => {
      const link = (e.target as HTMLElement | null)?.closest?.('a');
      if (!link) return;
      if (link.getAttribute('href') !== MANAGE_COOKIES_HREF) return;
      e.preventDefault();
      open();
    };
    document.addEventListener('click', onClick);

    return () => {
      window.removeEventListener(OPEN_PREFERENCES_EVENT, open);
      document.removeEventListener('click', onClick);
    };
  }, []);

  // Escape closes PREFERENCES only. The first-visit banner has no Escape:
  // dismissing it without choosing would leave `unknown` forever, and a
  // keyboard user deserves the same two explicit options as everyone else.
  useEffect(() => {
    if (!showPreferences) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closePreferences();
    };
    document.addEventListener('keydown', onKey);
    panelRef.current?.querySelector<HTMLElement>('input,button')?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [showPreferences]);

  const closePreferences = useCallback(() => {
    setShowPreferences(false);
    previouslyFocused.current?.focus();
  }, []);

  const decide = useCallback((next: 'accepted' | 'rejected') => {
    const previous = readConsent();
    writeConsent(next);
    setDecision(next);
    setShowPreferences(false);

    if (next === 'accepted') {
      // Forward-only: this loads analytics from here on. It does not replay
      // anything that happened while consent was unknown.
      syncAnalytics();
      return;
    }
    // REVOCATION. GA and Clarity cannot be reliably unloaded once running —
    // they have registered listeners and timers we do not own — so the honest
    // move is a reload into a page that never injects them. Only needed when
    // something WAS loaded.
    if (previous === 'accepted') window.location.reload();
  }, []);

  // Nothing to ask and nothing to load when neither provider is configured.
  // Consent accepted is not the same as a provider existing.
  if (decision === null || !analyticsConfigured()) return null;

  const showBanner = decision === 'unknown' && !showPreferences;

  return (
    <>
      {showBanner && (
        <div
          role="dialog"
          aria-modal="false"
          aria-labelledby="consent-title"
          className="fixed inset-x-0 bottom-0 z-50 border-t border-graphite/10 bg-surface/98 p-4 shadow-sticky backdrop-blur md:p-5"
        >
          <div className="mx-auto flex max-w-[72rem] flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <p id="consent-title" className="text-sm font-bold text-graphite">
                Cookies y analítica
              </p>
              <p className="mt-1 text-xs text-steel">
                Usamos almacenamiento necesario para el carrito y la compra. Con tu permiso,
                también medimos el uso del sitio con Google Analytics y Microsoft Clarity.
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => decide('rejected')}
                className="h-10 rounded-pill border border-graphite/20 px-4 text-sm font-semibold text-graphite transition hover:bg-bone-dim"
              >
                Rechazar no esenciales
              </button>
              <button
                type="button"
                onClick={() => decide('accepted')}
                className="h-10 rounded-pill bg-rust px-4 text-sm font-bold text-white shadow-lift transition hover:bg-rust-dark"
              >
                Aceptar analítica
              </button>
              <button
                type="button"
                onClick={() => setShowPreferences(true)}
                className="h-10 px-2 text-xs font-semibold text-steel underline transition hover:text-graphite"
              >
                Gestionar preferencias
              </button>
            </div>
          </div>
        </div>
      )}

      {showPreferences && (
        <div className="fixed inset-0 z-50 grid place-items-end bg-graphite/40 p-0 md:place-items-center md:p-6">
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="consent-prefs-title"
            className="w-full max-w-lg rounded-t-card bg-surface p-5 shadow-lift md:rounded-card"
          >
            <h2 id="consent-prefs-title" className="text-lg font-bold text-graphite">
              Preferencias de cookies
            </h2>

            <div className="mt-4 space-y-4">
              <div className="rounded-tile bg-bone p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-bold text-graphite">Necesarias</p>
                  <span className="text-xs font-semibold text-steel">Siempre activas</span>
                </div>
                <p className="mt-1 text-xs text-steel">
                  Guardan tu carrito y permiten completar la compra. Sin ellas la tienda no
                  funciona, por eso no se pueden desactivar.
                </p>
              </div>

              <div className="rounded-tile border border-graphite/15 p-4">
                <label className="flex items-center justify-between gap-3">
                  <span className="text-sm font-bold text-graphite">Analítica</span>
                  <input
                    type="checkbox"
                    checked={analyticsChecked}
                    onChange={(e) => setAnalyticsChecked(e.target.checked)}
                    className="size-5 accent-rust"
                  />
                </label>
                <p className="mt-1 text-xs text-steel">
                  Google Analytics y Microsoft Clarity, para entender cómo se usa el sitio.
                  No se cargan hasta que lo aceptás.
                </p>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={closePreferences}
                className="h-10 rounded-pill border border-graphite/20 px-4 text-sm font-semibold text-graphite transition hover:bg-bone-dim"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => decide(analyticsChecked ? 'accepted' : 'rejected')}
                className="h-10 rounded-pill bg-rust px-4 text-sm font-bold text-white shadow-lift transition hover:bg-rust-dark"
              >
                Guardar preferencias
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

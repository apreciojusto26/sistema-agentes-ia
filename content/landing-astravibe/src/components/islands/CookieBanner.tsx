import { useEffect, useState } from 'react';
import { getConsent, setConsent } from '@/lib/consent';

/**
 * Prior-consent gate for the analytics cookies (LSSI-CE art. 22.2).
 *
 * Renders nothing until mounted, so the server markup and the first client
 * render agree — the stored decision only exists in localStorage, which is
 * unreachable during SSR.
 *
 * "Rechazar" is given the same visual weight as "Aceptar": the AEPD treats a
 * hidden or visually demoted reject option as invalid consent, so making the
 * accept button the prettier one would defeat the whole purpose of this
 * component.
 */
export function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (getConsent() === null) setVisible(true);
  }, []);

  // Lets the cookie policy re-open the choice: <a href="#cookie-preferencias">.
  useEffect(() => {
    function reopen(): void {
      if (window.location.hash === '#cookie-preferencias') setVisible(true);
    }
    reopen();
    window.addEventListener('hashchange', reopen);
    return () => window.removeEventListener('hashchange', reopen);
  }, []);

  if (!visible) return null;

  function decide(value: 'granted' | 'denied'): void {
    setConsent(value);
    setVisible(false);
    if (window.location.hash === '#cookie-preferencias') {
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="cookie-banner-title"
      className="fixed inset-x-0 bottom-0 z-50 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:p-4"
    >
      <div className="mx-auto max-w-3xl rounded-card bg-white p-4 shadow-lift ring-1 ring-graphite/10 sm:p-5">
        <p id="cookie-banner-title" className="font-display text-sm font-bold text-graphite">
          Usamos cookies
        </p>
        <p className="mt-1.5 text-sm leading-snug text-steel">
          Las necesarias para que funcione el carrito y el pago siempre están activas. Las de analítica solo se activan
          si las aceptas, y puedes cambiar de opinión cuando quieras.{' '}
          <a href="/legal/cookies" className="font-semibold text-grape underline">
            Más información
          </a>
          .
        </p>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row-reverse">
          <button
            type="button"
            onClick={() => decide('granted')}
            className="h-11 flex-1 rounded-pill bg-grape px-6 font-display text-sm font-bold tracking-wide text-white transition active:scale-[.99] hover:bg-grape-dark"
          >
            Aceptar
          </button>
          <button
            type="button"
            onClick={() => decide('denied')}
            className="h-11 flex-1 rounded-pill border-2 border-graphite/15 px-6 font-display text-sm font-bold text-graphite transition hover:bg-graphite/5"
          >
            Rechazar
          </button>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { getDiagnosticSessionId } from '@/lib/telemetry/client';

const DIAG_MODE_KEY = 'astravibe:diag';

/**
 * Shows the diagnostic correlation id so a tester on a real phone can read it
 * without DevTools. Opt-in via `?diag=1`; invisible in normal browsing.
 *
 * The mode is latched into sessionStorage rather than carried in the URL, so
 * it survives the hop to /checkout WITHOUT touching the navigation in
 * cart.ts. Instrumentation must not reach into the payment flow.
 *
 * Shows the dsid and nothing else — no token, no checkout id, no events, no
 * buyer data. The dsid alone grants no access: reading a trail additionally
 * requires DIAGNOSTICS_TOKEN, which lives server-side only.
 */
export function DiagnosticBadge() {
  const [dsid, setDsid] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = false;
    try {
      if (new URLSearchParams(window.location.search).get('diag') === '1') {
        window.sessionStorage.setItem(DIAG_MODE_KEY, '1');
        active = true;
      } else {
        active = window.sessionStorage.getItem(DIAG_MODE_KEY) === '1';
      }
    } catch {
      // Storage blocked — honour the current URL only. A WebView that
      // partitions storage is exactly what this run is trying to detect.
      active = new URLSearchParams(window.location.search).get('diag') === '1';
    }

    if (active) setDsid(getDiagnosticSessionId());
  }, []);

  if (!dsid) return null;

  async function copy(): Promise<void> {
    if (!dsid) return;
    try {
      await navigator.clipboard.writeText(dsid);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard needs a secure context and a user gesture, and some
      // in-app browsers deny it outright — the id stays selectable above.
      setCopied(false);
    }
  }

  return (
    <div
      className="fixed inset-x-2 bottom-2 z-[60] rounded-tile bg-graphite/95 px-3 py-2 text-white shadow-lift"
      role="status"
    >
      <p className="text-[0.625rem] font-semibold uppercase tracking-wider text-white/60">Diagnostic ID</p>
      <div className="mt-0.5 flex items-center gap-2">
        {/* select-all so a long-press selects the whole id in one go. */}
        <code className="min-w-0 flex-1 select-all break-all font-mono text-xs">{dsid}</code>
        <button
          type="button"
          onClick={() => void copy()}
          className="shrink-0 rounded-pill bg-white/15 px-3 py-1.5 text-xs font-bold transition active:scale-95"
        >
          {copied ? 'Copiado' : 'Copiar ID'}
        </button>
      </div>
    </div>
  );
}

// Agent dashboard shell: header, then the single generation surface.
//
// Replaces the hero + per-agent timeline + slug form layout. That version had
// THREE ways to start work — a hero URL input, an auto-fired content step and
// a separate generate form — plus two competing pictures of progress. The
// pipeline is now the one flow, and PipelinePanel owns all of its state.
//
// The top bar follows the `/design` canvas: mark, wordmark, mono API readout,
// segmented sun/moon switch. The page itself is deliberately NOT painted here
// so the body's graph-paper wash stays visible behind the panels.
//
// Nothing about the backend changed: the same /api/pipeline, the same SSE, the
// same JobRegistry underneath.
import { useEffect, useState } from 'react';
import PipelinePanel from './components/PipelinePanel';
import { useTheme } from './http/useTheme';
import * as api from './http/client';

function SunIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 13.2A8.5 8.5 0 1 1 10.8 3a6.8 6.8 0 0 0 10.2 10.2Z" />
    </svg>
  );
}

export default function App() {
  const { theme, toggle } = useTheme();
  const [apiOk, setApiOk] = useState<boolean | null>(null);

  // Real health, polled once on load. `null` means "not asked yet" and renders
  // as a neutral dot — never as a green one we have not earned.
  useEffect(() => {
    void api
      .getHealth()
      .then(() => setApiOk(true))
      .catch(() => setApiOk(false));
  }, []);

  const apiTone = apiOk === null ? 'bg-state-idle' : apiOk ? 'bg-state-done' : 'bg-state-failed';
  const apiLabel = apiOk === null ? 'comprobando' : apiOk ? 'conectada' : 'sin conexión';

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 border-b border-hairline-soft bg-panel/85 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[76rem] items-center gap-3 px-5 py-2.5">
          {/* mark */}
          <span
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand text-brand-ink"
            aria-hidden="true"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 17.5 9.5 12 4 6.5M12.5 18h7.5" />
            </svg>
          </span>

          <span className="flex min-w-0 items-baseline gap-2">
            <h1 className="truncate text-[15px] font-semibold tracking-tight text-ink">Generador de landings</h1>
            <span className="cap hidden rounded-full bg-panel-muted px-1.5 py-0.5 text-ink-faint sm:inline-block">MVP</span>
          </span>

          {/* Real API health — the dot is earned, never optimistic. */}
          <span className="ml-auto flex items-center gap-1.5 rounded-full border border-hairline-soft px-2 py-1 font-mono text-[10px] text-ink-soft">
            <span className={`h-1.5 w-1.5 rounded-full ${apiTone}`} aria-hidden="true" />
            api
            <span className="sr-only">{apiLabel}</span>
            <span aria-hidden="true" className="text-ink-faint">
              {apiLabel}
            </span>
          </span>

          {/* Segmented sun/moon switch: both options are visible, the active
              one is filled — the canvas's treatment, and it says what the
              current theme IS rather than only what tapping would do. */}
          <button
            type="button"
            onClick={toggle}
            aria-label={theme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
            className="flex shrink-0 items-center gap-0.5 rounded-full border border-hairline-soft p-0.5"
          >
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full ${
                theme === 'dark' ? 'text-ink-faint' : 'bg-panel-muted text-ink'
              }`}
            >
              <SunIcon />
            </span>
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full ${
                theme === 'dark' ? 'bg-panel-muted text-ink' : 'text-ink-faint'
              }`}
            >
              <MoonIcon />
            </span>
          </button>
        </div>
      </header>

      <main className="flex-1 pt-4">
        <PipelinePanel />
      </main>
    </div>
  );
}

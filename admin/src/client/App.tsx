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
import LandingsLibrary from './components/LandingsLibrary';
import LandingDetail from './components/LandingDetail';
import type { LandingDetail as Detail } from './http/landings';
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

/**
 * TWO VIEWS, ONE COMPONENT — state, not a router.
 *
 * The Admin is a single screen with a single running pipeline; adding a router
 * would bring URL ownership, history and code splitting to a surface with two
 * destinations and no deep links. Tabs match how the app already works: the
 * pipeline panel keeps its own state and its SSE subscription across a tab
 * switch, so leaving to look at the library never interrupts a run.
 */
type View = { tab: 'nueva' } | { tab: 'paginas'; slug: string | null };

export default function App() {
  const { theme, toggle } = useTheme();
  const [apiOk, setApiOk] = useState<boolean | null>(null);
  const [view, setView] = useState<View>({ tab: 'nueva' });
  /** Bumped after a delete or a finished run so both lists re-read outputs/. */
  const [libraryKey, setLibraryKey] = useState(0);
  const [prefill, setPrefill] = useState<
    { url: string; slug: string; siteUrl: string | null; shopifyHandle: string | null } | null
  >(null);

  const openLanding = (slug: string) => setView({ tab: 'paginas', slug });
  const regenerate = (detail: Detail) => {
    // The URL the landing was generated FROM. Without it there is nothing to
    // regenerate from and the form stays empty rather than guessing one.
    setPrefill({
      url: detail.runs[0]?.sourceUrl ?? detail.landing.source?.canonicalUrl ?? '',
      slug: detail.landing.slug,
      siteUrl: detail.landing.siteUrl,
      shopifyHandle: detail.landing.shopifyHandle,
    });
    setView({ tab: 'nueva' });
  };

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

      {/* ── the two destinations ─────────────────────────────────────── */}
      <nav aria-label="Vistas" className="mx-auto w-full max-w-[76rem] px-5 pt-3">
        <div className="inline-flex gap-1 rounded-xl border border-hairline-soft bg-panel p-1">
          {([
            ['nueva', 'Nueva generación'],
            ['paginas', 'Páginas creadas'],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-current={view.tab === id ? 'page' : undefined}
              onClick={() => setView(id === 'nueva' ? { tab: 'nueva' } : { tab: 'paginas', slug: null })}
              className={`rounded-lg px-3.5 py-1.5 text-[13px] transition ${
                view.tab === id ? 'bg-panel-muted font-semibold text-ink' : 'text-ink-soft hover:text-ink'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </nav>

      <main className="flex-1 pt-3">
        {/* The pipeline panel is never UNMOUNTED, only hidden: a run in flight
            keeps its SSE subscription and its state while the operator looks
            at the library. Unmounting would drop the stream and re-open it on
            return, losing everything the run had reported so far. */}
        <div hidden={view.tab !== 'nueva'}>
          <PipelinePanel
            onOpenLanding={openLanding}
            onSeeAllLandings={() => setView({ tab: 'paginas', slug: null })}
            libraryKey={libraryKey}
            prefill={prefill}
          />
        </div>

        {view.tab === 'paginas' && (
          <div className="mx-auto w-full max-w-[76rem] px-5 pb-10">
            {view.slug ? (
              <LandingDetail
                slug={view.slug}
                onBack={() => setView({ tab: 'paginas', slug: null })}
                onDeleted={() => {
                  setLibraryKey((k) => k + 1);
                  setView({ tab: 'paginas', slug: null });
                }}
                onRegenerate={regenerate}
              />
            ) : (
              <LandingsLibrary
                refreshKey={libraryKey}
                onOpen={openLanding}
                onCreateFirst={() => setView({ tab: 'nueva' })}
              />
            )}
          </div>
        )}
      </main>
    </div>
  );
}

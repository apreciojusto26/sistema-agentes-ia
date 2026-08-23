// Top-of-page hero (mockup-driven addition): icon + title + subtitle, and
// the SINGLE url input that starts a new scrape. Replaces the form that
// used to live inline inside ScrapeAgentPanel's formSlot — there is now only
// one place in the app to start a run, so the sidebar's "scrape" panel and
// this hero can never disagree about whether a run is in flight.
import { useState } from 'react';

export type GeneratorHeroProps = {
  onRun: (url: string) => void;
  running: boolean;
  submitError: string | null;
};

export default function GeneratorHero({ onRun, running, submitError }: GeneratorHeroProps) {
  const [url, setUrl] = useState('');

  return (
    <div className="flex flex-col items-center gap-4 px-4 pt-8 pb-6 text-center">
      <span
        className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-tint text-xl"
        aria-hidden="true"
      >
        ✨
      </span>
      <div>
        <h1 className="text-2xl font-bold text-ink">Generador de landings</h1>
        <p className="mt-1 text-sm text-ink-soft">Pega el enlace de un producto y nuestros agentes harán el resto.</p>
      </div>

      <form
        className="flex w-full max-w-3xl gap-2 rounded-xl border border-hairline bg-panel p-2 shadow-sm"
        onSubmit={(e) => {
          e.preventDefault();
          onRun(url.trim());
        }}
      >
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Pega el enlace del producto (ej: https://es.aliexpress.com/...)"
          className="flex-1 rounded-lg border border-transparent px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-soft focus:border-hairline"
        />
        <button
          type="submit"
          disabled={running || url.trim().length === 0}
          className="shrink-0 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-40 cursor-pointer"
        >
          Buscar producto
        </button>
      </form>

      {submitError && <p className="text-xs text-state-failed">No se pudo arrancar: {submitError}</p>}
    </div>
  );
}

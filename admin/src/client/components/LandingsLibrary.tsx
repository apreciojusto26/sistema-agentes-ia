// PÁGINAS CREADAS — the landings that exist, not the jobs that ran.
//
// The right-hand column used to list JOBS and an operator read it as their
// pages. They are different things: one landing generated four times is four
// jobs and one page, a failed job produced no page at all, and a landing made
// before this Admin existed has no job. This table is derived from outputs/,
// which is the only thing that actually IS the set of landings.
//
// A ROW IS AN OUTPUT. Regenerating a page does not add a row.
import { useEffect, useMemo, useState } from 'react';
import type { LandingSummary } from '../http/landings';
import { listLandings } from '../http/landings';

/** "Hoy 18:42", "Ayer 09:03", "4 sept 18:42" — a date an operator reads at a glance. */
export function relativeDate(iso: string | null): string {
  if (!iso) return '—';
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return '—';
  const time = when.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((midnight(new Date()) - midnight(when)) / 86_400_000);
  if (days === 0) return `Hoy ${time}`;
  if (days === 1) return `Ayer ${time}`;
  return `${when.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} ${time}`;
}

/** The provider, in the operator's language. Unknown providers show as themselves. */
const PROVIDER_LABEL: Record<string, string> = { aliexpress: 'AliExpress' };
export const providerLabel = (l: LandingSummary): string =>
  l.source ? (PROVIDER_LABEL[l.source.provider] ?? l.source.provider) : 'Origen desconocido';

/**
 * Whether the artefact is usable.
 *
 * TWO STATES, BOTH TRUE. `built` comes from dist/ existing; a landing that was
 * generated but never built is real and must not be shown as ready. Full
 * readiness is the readiness script's verdict and is not re-derived here —
 * claiming "Lista" from a directory listing would be exactly the kind of
 * unearned green this system keeps removing.
 */
export const stateLabel = (l: LandingSummary): { text: string; tone: string } =>
  l.built
    ? { text: 'Construida', tone: 'text-state-done' }
    : { text: 'Sin construir', tone: 'text-ink-faint' };

/** Free-text match over the three things an operator would actually type. */
export function matches(l: LandingSummary, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [l.displayName, l.sourceTitle ?? '', l.slug, l.source?.externalProductId ?? '', l.source?.provider ?? '']
    .join(' ')
    .toLowerCase()
    .includes(q);
}

export type LandingsLibraryProps = {
  onOpen: (slug: string) => void;
  /** Takes the operator to the generation form — the empty state's whole job. */
  onCreateFirst: () => void;
  /** Bumped by the parent after a delete or a run, to re-read the directory. */
  refreshKey?: number;
};

export default function LandingsLibrary({ onOpen, onCreateFirst, refreshKey = 0 }: LandingsLibraryProps) {
  const [landings, setLandings] = useState<LandingSummary[] | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let alive = true;
    void listLandings().then((l) => alive && setLandings(l));
    return () => {
      alive = false;
    };
  }, [refreshKey]);

  const shown = useMemo(() => (landings ?? []).filter((l) => matches(l, query)), [landings, query]);

  if (landings === null) {
    return <p className="px-1 py-8 text-center text-[13px] text-ink-soft">Leyendo las landings…</p>;
  }

  // EMPTY STATE — an instruction, not an apology.
  if (landings.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-hairline-soft px-6 py-14 text-center">
        <span aria-hidden="true" className="text-2xl">📄</span>
        <p className="text-[14px] text-ink">Todavía no has creado ninguna landing.</p>
        <p className="max-w-sm text-[12.5px] text-ink-soft">
          Pegá el enlace de un producto y el equipo se encarga del resto.
        </p>
        <button
          type="button"
          onClick={onCreateFirst}
          className="mt-1 rounded-xl bg-brand px-4 py-2 text-[13px] font-semibold text-brand-ink transition hover:bg-brand-hover"
        >
          Crear primera landing
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="min-w-[14rem] flex-1">
          <span className="sr-only">Buscar landing</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nombre, producto o identificador…"
            className="w-full rounded-xl border border-hairline bg-panel-soft px-3.5 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-brand focus:outline-none"
          />
        </label>
        <span className="font-mono text-[11px] text-ink-faint">
          {shown.length === landings.length
            ? `${landings.length} landing${landings.length === 1 ? '' : 's'}`
            : `${shown.length} de ${landings.length}`}
        </span>
      </div>

      {shown.length === 0 ? (
        <p className="rounded-xl border border-dashed border-hairline-soft px-4 py-8 text-center text-[13px] text-ink-soft">
          Ninguna landing coincide con “{query.trim()}”.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-hairline-soft">
          <table className="w-full min-w-[44rem] border-collapse text-left">
            <thead>
              <tr className="border-b border-hairline-soft">
                {['Producto', 'Fuente', 'Modo', 'Estado', 'Última generación', ''].map((h) => (
                  <th key={h} scope="col" className="cap px-3 py-2 font-normal text-ink-faint">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((l) => {
                const state = stateLabel(l);
                return (
                  <tr key={l.slug} className="border-b border-hairline-soft last:border-0 hover:bg-panel-soft">
                    <td className="px-3 py-2.5">
                      <button
                        type="button"
                        onClick={() => onOpen(l.slug)}
                        className="max-w-[22rem] truncate text-left text-[13px] font-medium text-ink underline-offset-2 hover:underline"
                      >
                        {l.displayName}
                      </button>
                      {/* The slug is an ADDRESS. It is here because an operator
                          needs it to find the folder, in mono and secondary —
                          never as the row's identity, and prd_* never at all. */}
                      <span className="block truncate font-mono text-[10px] text-ink-faint">/{l.slug}</span>
                    </td>
                    <td className="px-3 py-2.5 text-[12.5px] text-ink-soft">{providerLabel(l)}</td>
                    <td className="px-3 py-2.5 text-[12.5px] text-ink-soft">
                      {l.mode === 'commerce' ? 'Commerce' : 'Preview'}
                    </td>
                    <td className={`px-3 py-2.5 text-[12.5px] ${state.tone}`}>{state.text}</td>
                    <td className="px-3 py-2.5 text-[12.5px] text-ink-soft">{relativeDate(l.generatedAt)}</td>
                    <td className="px-3 py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => onOpen(l.slug)}
                        className="rounded-lg border border-hairline px-2.5 py-1 text-[12px] text-ink transition hover:border-brand"
                      >
                        Ver
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

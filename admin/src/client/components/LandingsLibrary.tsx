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
import { listLandings, deleteLanding } from '../http/landings';

/** Feather-style trash icon, matching this app's stroke-based SVG convention
 *  (see StageMark.tsx) rather than pulling in an icon library for one glyph. */
function TrashIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 7h16" />
      <path d="M9 7V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V7" />
      <path d="M6 7l1 13.5A1.5 1.5 0 0 0 8.5 22h7a1.5 1.5 0 0 0 1.5-1.5L18 7" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

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
  /** The slug asking to be deleted, or null. One at a time — deleting is
   *  destructive enough that two rows confirming at once would be confusing
   *  about which "Eliminar" belongs to which product. */
  const [confirmingSlug, setConfirmingSlug] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void listLandings().then((l) => alive && setLandings(l));
    return () => {
      alive = false;
    };
  }, [refreshKey]);

  const handleDelete = (slug: string) => {
    setDeleteError(null);
    void deleteLanding(slug).then((r) => {
      if (r.ok) {
        setConfirmingSlug(null);
        // RE-READ outputs/, the same source of truth the initial load used —
        // this component owns its own list, so a local filter would drift the
        // moment two tabs or refreshKey disagree about what still exists.
        void listLandings().then(setLandings);
      } else {
        setDeleteError(r.message);
      }
    });
  };

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

                // CONFIRMING REPLACES THE ROW, spanning every column. A row is
                // too narrow to hold the same warning LandingDetail gives
                // before deleting — that Shopify's product is NOT touched — so
                // rather than shrink the wording until it fits, the row widens
                // to fit the wording. Same copy in both places on purpose: one
                // warning, not a second version that could drift from it.
                if (confirmingSlug === l.slug) {
                  return (
                    <tr key={l.slug} className="border-b border-hairline-soft last:border-0">
                      <td colSpan={6} className="bg-state-failed-tint px-3 py-3">
                        <div role="alertdialog" aria-label="Confirmar eliminación" className="flex flex-wrap items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-[13px] font-semibold text-ink">¿Eliminar “{l.displayName}”?</p>
                            <p className="mt-0.5 text-[12px] text-ink-soft">
                              Se eliminarán los archivos generados. El producto vinculado en Shopify{' '}
                              <strong className="font-semibold text-ink">NO</strong> será eliminado, ni la tienda ni su configuración.
                            </p>
                            {deleteError && <p className="mt-1 text-[12px] text-state-failed">{deleteError}</p>}
                          </div>
                          <div className="flex shrink-0 gap-2">
                            <button
                              type="button"
                              onClick={() => handleDelete(l.slug)}
                              className="rounded-lg bg-state-failed px-3 py-1.5 text-[12.5px] font-semibold text-white"
                            >
                              Eliminar landing
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setConfirmingSlug(null);
                                setDeleteError(null);
                              }}
                              className="rounded-lg border border-hairline px-3 py-1.5 text-[12.5px] text-ink"
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                }

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
                      <div className="flex justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => onOpen(l.slug)}
                          className="rounded-lg border border-hairline px-2.5 py-1 text-[12px] text-ink transition hover:border-brand"
                        >
                          Ver
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDeleteError(null);
                            setConfirmingSlug(l.slug);
                          }}
                          aria-label={`Eliminar “${l.displayName}”`}
                          title="Eliminar landing"
                          className="rounded-lg border border-hairline p-1.5 text-ink-faint transition hover:border-state-failed hover:text-state-failed"
                        >
                          <TrashIcon />
                        </button>
                      </div>
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

// The right-hand column: the last few PAGES, not the last few jobs.
//
// It listed jobs, and an operator read it as their pages — so a landing
// generated four times filled the column while three other landings fell off
// the bottom, and a failed job sat there looking like a page that existed.
//
// Four rows and a way out. The full library is one click away and the raw job
// list is still reachable from there; what the generation screen needs beside
// it is "what have I made lately", answered in the smallest space that can
// answer it honestly.
import { useEffect, useState } from 'react';
import { listLandings, type LandingSummary } from '../http/landings';
import { relativeDate, stateLabel } from './LandingsLibrary';

const MAX = 4;

export type RecentLandingsProps = {
  onOpen: (slug: string) => void;
  onSeeAll: () => void;
  refreshKey?: number;
  /** Only to say how many runs exist — never to build the list from. */
  jobCount?: number;
};

export default function RecentLandings({ onOpen, onSeeAll, refreshKey = 0, jobCount = 0 }: RecentLandingsProps) {
  const [landings, setLandings] = useState<LandingSummary[] | null>(null);

  useEffect(() => {
    let alive = true;
    void listLandings().then((l) => alive && setLandings(l));
    return () => {
      alive = false;
    };
  }, [refreshKey]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2 pl-1">
        <span className="cap text-ink-faint">Últimas páginas</span>
        {landings && landings.length > MAX && (
          <button
            type="button"
            onClick={onSeeAll}
            className="text-[11px] text-ink-soft underline-offset-2 hover:underline"
          >
            Ver todas
          </button>
        )}
      </div>

      {landings === null ? (
        <p className="px-1 text-[12px] text-ink-faint">Leyendo…</p>
      ) : landings.length === 0 ? (
        <p className="rounded-xl border border-dashed border-hairline-soft px-3 py-4 text-[12px] text-ink-faint">
          Todavía no has creado ninguna landing.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {landings.slice(0, MAX).map((l) => {
            const state = stateLabel(l);
            return (
              <li key={l.slug}>
                <button
                  type="button"
                  onClick={() => onOpen(l.slug)}
                  className="flex w-full flex-col gap-0.5 rounded-xl border border-hairline-soft px-3 py-2 text-left transition hover:border-hairline"
                >
                  <span className="truncate text-[12.5px] font-medium text-ink">{l.displayName}</span>
                  <span className="flex items-baseline justify-between gap-2">
                    <span className={`text-[11px] ${state.tone}`}>{state.text}</span>
                    <span className="font-mono text-[10px] text-ink-faint">{relativeDate(l.generatedAt)}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {landings !== null && landings.length > 0 && landings.length <= MAX && (
        <button
          type="button"
          onClick={onSeeAll}
          className="self-start pl-1 text-[11px] text-ink-soft underline-offset-2 hover:underline"
        >
          Ver todas
        </button>
      )}

      {jobCount > 0 && (
        <p className="pl-1 font-mono text-[10px] text-ink-faint">
          {jobCount} ejecución{jobCount === 1 ? '' : 'es'} registrada{jobCount === 1 ? '' : 's'}
        </p>
      )}
    </div>
  );
}

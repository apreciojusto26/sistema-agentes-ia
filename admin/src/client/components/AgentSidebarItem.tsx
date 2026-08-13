// Sidebar row (design §6 "The sidebar gets the same treatment"). The
// `manual` variant renders ONLY a static "manual" chip + the state label —
// never a live italic status line or LiveActivity — because the Content/
// Design stage is never a running child process (spec R7's "No simulated
// agent activity" scenario).
import type { JobRecord } from '../../shared/jobs';
import type { ContentStageState } from '../../shared/content-stage';
import { runningEvidence } from '../../shared/running-evidence';
import LiveActivity from './LiveActivity';
import { contentStageLabel } from './content-stage-label';

// `id` is the selection key (there are TWO 'agent' items — Scraping Agent
// and Code Agent — so `kind` alone cannot disambiguate which is selected;
// `kind` still drives rendering, `id` drives selection).
export type SidebarItem =
  | { id: string; kind: 'agent'; label: string; job: JobRecord | null }
  | { id: string; kind: 'manual'; label: string; state: ContentStageState };

export type AgentSidebarItemProps = {
  item: SidebarItem;
  selected: boolean;
  onSelect: () => void;
};

function agentStatusLabel(job: JobRecord | null): string {
  if (!job) return 'never run';
  switch (job.status) {
    case 'queued':
      return 'queued';
    case 'running':
      return 'running';
    case 'succeeded':
      return 'done';
    case 'failed':
      return 'failed';
    case 'cancelled':
      return 'cancelled';
    case 'timed-out':
      return 'timed out';
    case 'interrupted':
      return 'interrupted (server restarted)';
    /* istanbul ignore next -- JobStatus is exhaustively typed */
    default:
      return job.status;
  }
}

export default function AgentSidebarItem({ item, selected, onSelect }: AgentSidebarItemProps) {
  const evidence = item.kind === 'agent' && item.job ? runningEvidence(item.job) : null;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`flex w-full flex-col gap-1 rounded-md px-3 py-2 text-left ${
        selected ? 'bg-slate-800 text-white' : 'hover:bg-slate-100'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">{item.label}</span>
        {item.kind === 'manual' && (
          <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-slate-600">
            manual
          </span>
        )}
      </div>
      {item.kind === 'agent' ? (
        evidence ? (
          <LiveActivity evidence={evidence} />
        ) : (
          <span className="text-xs text-slate-500">{agentStatusLabel(item.job)}</span>
        )
      ) : (
        <span className="text-xs text-slate-500">{contentStageLabel(item.state)}</span>
      )}
    </button>
  );
}

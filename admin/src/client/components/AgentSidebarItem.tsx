// Sidebar row (design §6.2, restyled to the dark "Tu equipo IA" panel per
// user reference mock). The `assisted` variant (content-agent change —
// renamed from `manual`, which is now genuinely false: content generation
// CAN run as a real job) renders either real LiveActivity (when a content
// job is actually running, mirroring the `agent` branch) or an
// `assistedSummary()`-derived fallback line — never fake/simulated activity.
//
// `identity` drives the avatar/accent/name via AGENT_IDENTITY (design §6.1)
// so the sidebar and the panel header can never disagree — `label` is no
// longer accepted from the caller.
import type { JobRecord } from '../../shared/jobs';
import type { ContentStageState } from '../../shared/content-stage';
import { runningEvidence } from '../../shared/running-evidence';
import { jobStatusLabel, jobStatusTone } from '../../shared/status-label';
import LiveActivity from './LiveActivity';
import { assistedSummary } from './assisted-summary';
import { AGENT_IDENTITY, type AgentIdentityId } from './agent-identity';

// `id` is the selection key (there are TWO 'agent' items — scrape and
// generate — so `kind` alone cannot disambiguate which is selected; `kind`
// still drives rendering, `id` drives selection).
export type SidebarItem =
  | { id: string; kind: 'agent'; identity: AgentIdentityId; job: JobRecord | null }
  | { id: string; kind: 'assisted'; identity: AgentIdentityId; job: JobRecord | null; state: ContentStageState };

export type AgentSidebarItemProps = {
  item: SidebarItem;
  selected: boolean;
  onSelect: () => void;
};

// Sidebar always renders on the dark navy surface, so status text/dot pairs
// use the on-dark status tokens (or sidebar-ink-soft for idle, which has no
// on-dark status token — design §11 pt 5 reasoning: idle isn't a reported
// stage, it's "nothing happened yet"). Literal class strings only — never
// interpolate `text-state-${tone}-on-dark` (Oxide scans source text
// statically).
function toneTextClass(tone: 'running' | 'done' | 'failed' | 'idle'): string {
  switch (tone) {
    case 'running':
      return 'text-state-running-on-dark';
    case 'done':
      return 'text-state-done-on-dark';
    case 'failed':
      return 'text-state-failed-on-dark';
    case 'idle':
      return 'text-sidebar-ink-soft';
  }
}

function toneDotClass(tone: 'running' | 'done' | 'failed' | 'idle'): string {
  switch (tone) {
    case 'running':
      return 'bg-state-running-on-dark';
    case 'done':
      return 'bg-state-done-on-dark';
    case 'failed':
      return 'bg-state-failed-on-dark';
    case 'idle':
      return 'bg-sidebar-ink-soft';
  }
}

export default function AgentSidebarItem({ item, selected, onSelect }: AgentSidebarItemProps) {
  const identity = AGENT_IDENTITY[item.identity];
  const evidence = item.job ? runningEvidence(item.job) : null;
  const tone = item.kind === 'agent' ? jobStatusTone(item.job?.status ?? null) : 'idle';
  const summary = item.kind === 'assisted' ? assistedSummary(item.job, item.state) : null;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`flex w-full items-start gap-3 rounded-xl px-2.5 py-2.5 text-left ${
        selected ? 'bg-sidebar-surface-selected' : 'hover:bg-sidebar-surface-selected/60'
      }`}
    >
      <img src={identity.avatarSrc} alt="" className="h-11 w-11 shrink-0 rounded-xl object-cover" />
      <span className="flex min-w-0 flex-col gap-0.5 pt-0.5">
        <span className="text-sm leading-snug font-semibold text-sidebar-ink">{identity.name}</span>
        {item.kind === 'agent' ? (
          evidence ? (
            <LiveActivity evidence={evidence} onDark />
          ) : (
            <span className={`flex items-center gap-1.5 text-xs italic ${toneTextClass(tone)}`}>
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${toneDotClass(tone)}`} aria-hidden="true" />
              {jobStatusLabel(item.job?.status ?? null)}
            </span>
          )
        ) : evidence ? (
          <LiveActivity evidence={evidence} onDark />
        ) : (
          <span className={`flex items-center gap-1.5 text-xs italic ${toneTextClass(summary!.tone)}`}>
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${toneDotClass(summary!.tone)}`} aria-hidden="true" />
            {summary!.text}
          </span>
        )}
      </span>
      {item.kind === 'assisted' && summary!.showTurnChip && (
        <span className="mt-0.5 shrink-0 rounded bg-agent-content-tint px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-agent-content">
          tu turno
        </span>
      )}
    </button>
  );
}

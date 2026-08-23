// Unified "team of AI agents" overview (mockup-driven addition). Shows the
// 3 REAL pipeline stages (scrape -> content -> generate) as a single
// timeline. Deliberately 3 steps, not 4 like the reference mock: there is no
// backend concept splitting "buscando" from "extrayendo" inside the scrape
// job, and this app's honest-UI rule (spec R8, LiveActivity's own header
// comment) is to never paint a step that doesn't correspond to a real job.
// Reuses the same primitives the sidebar already relies on
// (jobStatusTone + runningEvidence/LiveActivity) so this is a different
// LAYOUT of the same real state, never a second source of truth.
import type { ReactNode } from 'react';
import type { JobRecord } from '../../shared/jobs';
import { runningEvidence } from '../../shared/running-evidence';
import { jobStatusTone } from '../../shared/status-label';
import { AGENT_IDENTITY, type AgentIdentityId } from './agent-identity';
import LiveActivity from './LiveActivity';
import StatusPill, { type StatusPillTone } from './StatusPill';

export type AgentTimelineStep = {
  identity: AgentIdentityId;
  job: JobRecord | null;
  /** Extra content rendered below the tagline/live-status line — e.g. the
   * one inline form (GenerateSlugForm) that needs a place to live now that
   * there's no separate detail panel per agent. Optional and generic on
   * purpose: nothing about AgentTimeline itself should know about "generate"
   * specifically. */
  extra?: ReactNode;
};

const PILL_LABEL: Record<StatusPillTone, string> = {
  running: 'En progreso',
  done: 'Listo',
  failed: 'Falló',
  idle: 'Pendiente',
};

// Literal class strings only (Oxide gotcha — see agent-identity.ts).
function ringClass(tone: StatusPillTone): string {
  switch (tone) {
    case 'running':
      return 'ring-state-running';
    case 'done':
      return 'ring-state-done';
    case 'failed':
      return 'ring-state-failed';
    case 'idle':
      return 'ring-hairline';
  }
}

export default function AgentTimeline({ steps }: { steps: AgentTimelineStep[] }) {
  return (
    <section className="mx-auto w-full max-w-3xl px-4 pb-8">
      <h3 className="mb-3 text-sm font-semibold text-ink-soft">Así trabaja nuestro equipo de IA</h3>
      <div className="rounded-2xl border border-hairline bg-panel p-2">
        <ol>
          {steps.map((step, i) => {
            const identity = AGENT_IDENTITY[step.identity];
            const tone = jobStatusTone(step.job?.status ?? null);
            const evidence = step.job ? runningEvidence(step.job) : null;
            const isLast = i === steps.length - 1;

            return (
              <li key={step.identity} className="relative flex gap-4 px-3 py-3">
                {!isLast && (
                  <span
                    className="absolute top-11 bottom-[-12px] left-[21px] border-l-2 border-dashed border-hairline"
                    aria-hidden="true"
                  />
                )}
                <img
                  src={identity.avatarSrc}
                  alt=""
                  className={`h-11 w-11 shrink-0 rounded-full object-cover ring-2 ${ringClass(tone)}`}
                />
                <div className="flex min-w-0 flex-1 items-start justify-between gap-3 pt-0.5">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink">{identity.name}</p>
                    {evidence ? (
                      <LiveActivity evidence={evidence} />
                    ) : (
                      <p className="text-xs text-ink-soft">{identity.tagline}</p>
                    )}
                    {step.extra}
                  </div>
                  <StatusPill tone={tone} label={PILL_LABEL[tone]} />
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

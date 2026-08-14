// Real-Stage Checklist (spec "Real-Stage Checklist", design §4/§7). Prop
// surface is deliberately minimal — {stages}-only, no JobRecord/JobStatus/
// pid/RunningEvidence — this IS the D1a/D6 enforcement: the component
// cannot know whether the process is alive, so it structurally cannot claim
// it is. REPLACES the raw <ol> in AgentRunPanel.tsx (Batch G); the raw
// per-stage table moves into that panel's <details> so nothing is deleted
// (design §11 judgment call #4).
import type { StageProgress } from '../../shared/jobs';
import { stageLabel } from '../../shared/stage-label';

export type StageChecklistProps = {
  stages: StageProgress[];
};

function humanizeMs(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1).replace('.', ',')} s`;
}

export default function StageChecklist({ stages }: StageChecklistProps) {
  if (stages.length === 0) return null;

  return (
    <section className="rounded-xl bg-checklist-surface p-4 text-checklist-ink">
      <h3 className="text-sm font-semibold">Paso a paso</h3>
      <ol className="mt-2 flex flex-col gap-1.5 text-sm">
        {stages.map((s) => (
          <li key={s.stage} className="flex flex-col gap-0.5">
            <div className="flex items-center gap-2">
              {s.status === 'done' && (
                <span className="text-state-done-on-dark" aria-hidden="true">
                  ✓
                </span>
              )}
              {s.status === 'failed' && (
                <span className="text-state-failed-on-dark" aria-hidden="true">
                  ✗
                </span>
              )}
              {s.status === 'running' && (
                <span className="text-state-running-on-dark" aria-hidden="true">
                  ○
                </span>
              )}
              <span className={s.status === 'failed' ? 'text-state-failed-on-dark' : 'text-checklist-ink'}>
                {stageLabel(s.stage)}
                {s.status === 'failed' ? ' — no se pudo completar' : ''}
              </span>
              {s.ms !== null && <span className="text-xs text-checklist-ink-soft">{humanizeMs(s.ms)}</span>}
            </div>
            {s.progress && (
              <p className="ml-6 text-xs text-checklist-ink-soft">
                {s.progress.done} de {s.progress.total}
                {s.progress.label ? ` — ${s.progress.label}` : ''}
              </p>
            )}
            {s.warnings.length > 0 && (
              <ul className="ml-6 list-inside list-disc text-xs text-checklist-ink-soft">
                {s.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

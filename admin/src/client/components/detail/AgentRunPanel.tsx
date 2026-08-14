// Shared shell for the two REAL agent stages (Extractor de productos,
// Constructor de la landing): identity header + checklist + technical
// details + result, per design §5/§6.3/§7. ScrapeAgentPanel / CodeAgentPanel
// wrap this with their own result rendering + run form.
import type { ReactNode } from 'react';
import type { JobRecord } from '../../../shared/jobs';
import type { SseFrame } from '../../../shared/api';
import { runningEvidence } from '../../../shared/running-evidence';
import { jobStatusLabel, jobStatusTone } from '../../../shared/status-label';
import { AGENT_IDENTITY, type AgentIdentityId } from '../agent-identity';
import LiveActivity from '../LiveActivity';
import LogConsole from '../LogConsole';
import StageChecklist from '../StageChecklist';

export type AgentRunPanelProps = {
  identity: AgentIdentityId;
  job: JobRecord | null;
  logs: Extract<SseFrame, { type: 'log' }>[];
  /** Agent-specific result rendering (image counts, todos, etc.) — kept out of this shared shell. */
  resultSlot?: ReactNode;
  /** The "start a new run" form (URL input / slug input) — rendered above the timeline. */
  formSlot?: ReactNode;
  /** Extra technical content rendered INSIDE the shared "Detalles técnicos" <details>, after the built-in pid/exitCode/stage table/LogConsole block (content-agent change: pinned model, endpoint, quota ceiling). */
  detailsExtraSlot?: ReactNode;
  /** Cancels the current job. Only ever rendered while job.status is 'running'/'queued' — a finished job has nothing left to cancel. */
  onCancel?: () => void;
};

function toneClass(tone: 'running' | 'done' | 'failed' | 'idle'): string {
  switch (tone) {
    case 'running':
      return 'text-state-running';
    case 'done':
      return 'text-state-done';
    case 'failed':
      return 'text-state-failed';
    case 'idle':
      return 'text-state-idle';
  }
}

export default function AgentRunPanel({
  identity,
  job,
  logs,
  resultSlot,
  formSlot,
  detailsExtraSlot,
  onCancel,
}: AgentRunPanelProps) {
  const id = AGENT_IDENTITY[identity];
  const evidence = job ? runningEvidence(job) : null;
  const cancellable = !!onCancel && (job?.status === 'running' || job?.status === 'queued');

  return (
    <section className="flex flex-col gap-3">
      <header className={`flex items-center gap-3 border-b-2 pb-3 ${id.accentBorder}`}>
        <img src={id.avatarSrc} alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover" />
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-ink">{id.name}</h2>
          <p className="text-xs text-ink-soft">{id.tagline}</p>
        </div>
        <div className="ml-auto">{evidence && <LiveActivity evidence={evidence} />}</div>
      </header>

      {formSlot}

      {job ? (
        <>
          <p className="flex items-center gap-2 text-xs">
            <span className={`font-medium ${toneClass(jobStatusTone(job.status))}`}>
              Estado: {jobStatusLabel(job.status)}
            </span>
            {job.error ? <span className="text-state-failed">Error: {job.error.message}</span> : null}
            {cancellable && (
              <button
                type="button"
                onClick={onCancel}
                className="rounded border border-red-300 px-2 py-0.5 text-xs font-medium text-red-700 hover:bg-red-50"
              >
                Cancelar
              </button>
            )}
          </p>

          <StageChecklist stages={job.stages} />

          {job.eventSchemaVersion === null && (
            <p className="text-xs text-amber-600">
              Este paso no informó su progreso. Abajo, en "Detalles técnicos", está el registro completo.
            </p>
          )}

          {resultSlot}

          <details className="rounded-lg border border-hairline bg-panel-soft px-3 py-2">
            <summary className="cursor-pointer text-xs font-medium text-ink-soft">Detalles técnicos</summary>
            <div className="mt-2 flex flex-col gap-2">
              <p className="text-xs text-ink-soft">
                job <span className="font-mono">{job.jobId}</span> — status{' '}
                <b className="font-medium">{job.status}</b>
              </p>

              {job.malformedEventCount > 0 && (
                <p className="text-xs text-amber-600">
                  {job.malformedEventCount} unparseable event line(s) — the event contract may have drifted.
                </p>
              )}

              <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-ink-soft">
                <dt className="font-medium">pid</dt>
                <dd className="font-mono">{job.pid ?? 'n/a'}</dd>
                <dt className="font-medium">exitCode</dt>
                <dd className="font-mono">{job.exitCode ?? 'n/a'}</dd>
                <dt className="font-medium">signal</dt>
                <dd className="font-mono">{job.signal ?? 'n/a'}</dd>
                <dt className="font-medium">eventSchemaVersion</dt>
                <dd className="font-mono">{job.eventSchemaVersion ?? 'n/a'}</dd>
                <dt className="font-medium">eventGaps</dt>
                <dd className="font-mono">{job.eventGaps.length}</dd>
              </dl>

              {job.stages.length > 0 && (
                <table className="w-full text-left text-xs text-ink-soft">
                  <thead>
                    <tr>
                      <th className="pr-2 font-medium">stage</th>
                      <th className="pr-2 font-medium">status</th>
                      <th className="pr-2 font-medium">ms</th>
                      <th className="pr-2 font-medium">progress</th>
                      <th className="pr-2 font-medium">startedAt</th>
                      <th className="font-medium">endedAt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {job.stages.map((s) => (
                      <tr key={s.stage}>
                        <td className="pr-2 font-mono">{s.stage}</td>
                        <td className="pr-2 font-mono">{s.status}</td>
                        <td className="pr-2 font-mono">{s.ms ?? ''}</td>
                        <td className="pr-2 font-mono">
                          {s.progress ? `${s.progress.done}/${s.progress.total}` : ''}
                        </td>
                        <td className="pr-2 font-mono">{s.startedAt}</td>
                        <td className="font-mono">{s.endedAt ?? ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              <LogConsole lines={logs} />

              {detailsExtraSlot}
            </div>
          </details>
        </>
      ) : (
        <p className="text-sm text-ink-soft">Todavía no le pediste nada a este agente.</p>
      )}
    </section>
  );
}

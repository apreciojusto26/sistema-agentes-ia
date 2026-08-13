// Shared shell for the two REAL agent stages (Scraping Agent, Code Agent):
// stage timeline + log console + result, per design §1's tree comment
// ("shared: stage timeline + log console + result"). ScrapeAgentPanel /
// CodeAgentPanel wrap this with their own result rendering + run form.
import type { ReactNode } from 'react';
import type { JobRecord } from '../../../shared/jobs';
import type { SseFrame } from '../../../shared/api';
import { runningEvidence } from '../../../shared/running-evidence';
import LiveActivity from '../LiveActivity';
import LogConsole from '../LogConsole';

export type AgentRunPanelProps = {
  title: string;
  job: JobRecord | null;
  logs: Extract<SseFrame, { type: 'log' }>[];
  /** Agent-specific result rendering (image counts, todos, etc.) — kept out of this shared shell. */
  resultSlot?: ReactNode;
  /** The "start a new run" form (URL input / slug input) — rendered above the timeline. */
  formSlot?: ReactNode;
  /** Cancels the current job. Only ever rendered while job.status is 'running'/'queued' — a finished job has nothing left to cancel. */
  onCancel?: () => void;
};

function stageStatusIcon(status: 'running' | 'done' | 'failed'): string {
  if (status === 'done') return '✓';
  if (status === 'failed') return '✗';
  return '…';
}

export default function AgentRunPanel({ title, job, logs, resultSlot, formSlot, onCancel }: AgentRunPanelProps) {
  const evidence = job ? runningEvidence(job) : null;
  const cancellable = !!onCancel && (job?.status === 'running' || job?.status === 'queued');

  return (
    <section className="flex flex-col gap-3">
      <header className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{title}</h2>
        {evidence && <LiveActivity evidence={evidence} />}
      </header>

      {formSlot}

      {job ? (
        <>
          <p className="flex items-center gap-2 text-xs text-slate-500">
            job <span className="font-mono">{job.jobId}</span> — status{' '}
            <span className="font-medium">{job.status}</span>
            {job.error ? ` — ${job.error.message}` : ''}
            {cancellable && (
              <button
                type="button"
                onClick={onCancel}
                className="rounded border border-red-300 px-2 py-0.5 text-xs font-medium text-red-700 hover:bg-red-50"
              >
                Cancel
              </button>
            )}
          </p>

          {job.stages.length > 0 && (
            <ol className="flex flex-col gap-1 text-sm">
              {job.stages.map((s) => (
                <li key={s.stage} className="flex items-center gap-2">
                  <span
                    className={
                      s.status === 'done'
                        ? 'text-emerald-600'
                        : s.status === 'failed'
                          ? 'text-red-600'
                          : 'text-slate-500'
                    }
                  >
                    {stageStatusIcon(s.status)}
                  </span>
                  <span>{s.stage}</span>
                  {s.progress && (
                    <span className="text-xs text-slate-400">
                      ({s.progress.done}/{s.progress.total}
                      {s.progress.label ? ` — ${s.progress.label}` : ''})
                    </span>
                  )}
                  {s.ms !== null && <span className="text-xs text-slate-400">{s.ms}ms</span>}
                </li>
              ))}
            </ol>
          )}

          {job.eventSchemaVersion === null && (
            <p className="text-xs text-amber-600">
              This child emitted no structured events — showing raw logs and exit code only (degraded, honest).
            </p>
          )}
          {job.malformedEventCount > 0 && (
            <p className="text-xs text-amber-600">{job.malformedEventCount} unparseable event line(s) — the event contract may have drifted.</p>
          )}

          {resultSlot}

          <LogConsole lines={logs} />
        </>
      ) : (
        <p className="text-sm text-slate-500">No job started for this agent yet.</p>
      )}
    </section>
  );
}

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

/**
 * Display-only productId lookup (design "product-identity-generation-isolation"
 * §6.2). Prefers the RESULT's productId (what actually ran/was confirmed)
 * over the REQUESTED params.productId (what was asked for) — they only
 * differ when a job is still running or failed before producing a result.
 * All three ScrapeParams/GenerateParams/ContentParams and all three
 * ScrapeResult/GenerateResult/ContentResult variants declare an optional
 * `productId`, so this is a plain property read, not a per-kind branch.
 */
function jobProductId(job: JobRecord): string | null {
  return job.result?.productId ?? job.params.productId ?? null;
}

/**
 * True only for the FAIL-CLOSED archive ownership gate (design D3 Layer 2,
 * registry.ts `#onExit`): the scraped bytes were archived under a DIFFERENT
 * productId than this job's own lineage. This is a terminal, intentional
 * block — there is no `--reset`/retry/force path in this phase, the operator
 * MUST re-scrape. Kept as its own predicate so the UI can give it a distinct,
 * unambiguous treatment instead of reading like a generic transient error.
 */
function isArchiveOwnershipDeadEnd(job: JobRecord): boolean {
  return job.status === 'failed' && job.error?.stage === 'archive' && job.error?.code === 'archive-ownership-mismatch';
}

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
  const productId = job ? jobProductId(job) : null;
  const archiveDeadEnd = job ? isArchiveOwnershipDeadEnd(job) : false;

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
            {productId && (
              <span className="text-ink-soft">
                producto <span className="font-mono">{productId}</span>
              </span>
            )}
            {job.error && !archiveDeadEnd ? <span className="text-state-failed">Error: {job.error.message}</span> : null}
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

          {archiveDeadEnd && (
            <div className="rounded-lg border-2 border-red-300 bg-red-50 p-3 text-sm text-red-800">
              <p className="font-semibold">
                Este scrape quedó bloqueado: lo que se guardó pertenece a OTRO producto, no al de este job.
              </p>
              <p className="mt-1 text-xs">
                Esto NO es un bug ni un error transitorio — es un bloqueo intencional para no mezclar productos.
                Este job no se puede reintentar ni forzar, y en esta fase no existe una acción para
                "resetearlo" o recuperarlo. La única salida es volver a correr el Extractor de productos con
                la URL para arrancar un scrape nuevo.
              </p>
              {job.error?.message && <p className="mt-1 font-mono text-xs text-red-700">{job.error.message}</p>}
            </div>
          )}

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
                <dt className="font-medium">productId</dt>
                <dd className="font-mono">{productId ?? 'n/a'}</dd>
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

// Content Agent detail panel (spec "ContentAgentPanel as Sibling to
// ManualArtifactPanel"; design addendum §2). Wraps the shared AgentRunPanel
// shell (identity header, StageChecklist, real LiveActivity, Cancel,
// Detalles técnicos) exactly like ScrapeAgentPanel/CodeAgentPanel, and
// renders ManualArtifactPanel — UNMODIFIED in structure — inside a collapsed
// fallback section, per Q1.
import { useEffect, useState } from 'react';
import type { JobRecord, ContentResult } from '../../../shared/jobs';
import type { SseFrame } from '../../../shared/api';
import type { ContentStageState } from '../../../shared/content-stage';
import { getLastContentAttempt } from '../../http/client';
import AgentRunPanel from './AgentRunPanel';
import ManualArtifactPanel from './ManualArtifactPanel';

export type ContentAgentPanelProps = {
  job: JobRecord | null;
  logs: Extract<SseFrame, { type: 'log' }>[];
  /** null when no scrape has ever been archived — disables Run with an honest reason. */
  scrapeJobId: string | null;
  onRun: (scrapeJobId: string, instructions: string) => void;
  onCancel: () => void;
  running: boolean;
  submitError: string | null;
  /** Manual-path props, forwarded verbatim into the nested ManualArtifactPanel. */
  contentState: ContentStageState;
  onSubmitRaw: (raw: string) => void;
  onDeleteStaged: () => void;
  /** Loads the last failed attempt's raw text into the paste form. */
  onCopyLastAttempt: () => void;
};

function isContentResult(result: JobRecord['result']): result is ContentResult {
  return !!result && 'turns' in result;
}

function isFailureStatus(status: JobRecord['status'] | undefined): boolean {
  return status === 'failed' || status === 'timed-out' || status === 'cancelled' || status === 'interrupted';
}

export default function ContentAgentPanel({
  job,
  logs,
  scrapeJobId,
  onRun,
  onCancel,
  running,
  submitError,
  contentState,
  onSubmitRaw,
  onDeleteStaged,
  onCopyLastAttempt,
}: ContentAgentPanelProps) {
  const [instructions, setInstructions] = useState('');
  const [lastAttemptPresent, setLastAttemptPresent] = useState(false);

  const result = job && isContentResult(job.result) ? job.result : null;
  const failed = !!job && isFailureStatus(job.status);

  useEffect(() => {
    if (!job || !failed) {
      setLastAttemptPresent(false);
      return;
    }
    let cancelled = false;
    void getLastContentAttempt(job.jobId).then((res) => {
      if (!cancelled) setLastAttemptPresent(res.present);
    });
    return () => {
      cancelled = true;
    };
  }, [job, failed]);

  const fallbackOpen = !job || failed || (contentState.kind === 'validated' && !job);

  return (
    <AgentRunPanel
      identity="content"
      job={job}
      logs={logs}
      onCancel={onCancel}
      formSlot={
        <div className="flex flex-col gap-1">
          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (scrapeJobId) onRun(scrapeJobId, instructions.trim());
            }}
          >
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows={3}
              placeholder="Opcional: tono, estilo, cosas para destacar o evitar."
              className="rounded border border-slate-300 p-2 text-sm"
            />
            <button
              type="submit"
              disabled={running || !scrapeJobId}
              className="w-fit rounded bg-slate-800 px-3 py-1 text-sm font-medium text-white disabled:opacity-40"
            >
              Generar textos
            </button>
          </form>

          {!scrapeJobId && (
            <p className="text-xs text-amber-600">
              Todavía no hay un producto buscado. Corré primero el Extractor.
            </p>
          )}

          <p className="text-xs text-ink-soft">
            Usa la capa gratuita de Gemini: lo que mandás (los datos del producto y tus instrucciones) puede ser
            usado por Google para entrenar sus modelos.
          </p>
        </div>
      }
      resultSlot={
        <>
          {submitError && <p className="text-xs text-state-failed">No se pudo arrancar: {submitError}</p>}

          {result && (
            <div className="rounded border border-hairline p-3 text-sm">
              <p className="font-medium text-ink">
                Listo — {result.productFields} campos del producto, {result.faqCount} preguntas frecuentes,{' '}
                {result.testimonialCount} testimonios
                {result.hasDesign ? ', incluye colores y tipografías' : ''}
              </p>
              <p className="text-xs text-ink-soft">
                {result.turns} de 3 intentos · {result.totalTokenCount} tokens ({result.promptTokenCount} de
                entrada, {result.candidatesTokenCount} de salida
                {result.thoughtsTokenCount !== null ? `, ${result.thoughtsTokenCount} pensando` : ''})
              </p>
            </div>
          )}

          {failed && job?.error && (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-state-failed">{job.error.message}</p>
              {lastAttemptPresent && (
                <button
                  type="button"
                  onClick={onCopyLastAttempt}
                  className="w-fit rounded border border-slate-300 px-3 py-1 text-xs text-slate-700 hover:bg-slate-50"
                >
                  Copiar el último intento
                </button>
              )}
            </div>
          )}

          <details className="rounded-lg border border-hairline bg-panel-soft px-3 py-2" open={fallbackOpen}>
            <summary className="cursor-pointer text-xs font-medium text-ink-soft">Pegar a mano</summary>
            <div className="mt-2">
              <ManualArtifactPanel state={contentState} onSubmitRaw={onSubmitRaw} onDelete={onDeleteStaged} />
            </div>
          </details>
        </>
      }
      detailsExtraSlot={
        <p className="text-xs text-ink-soft">
          modelo <span className="font-mono">{result?.model ?? 'gemini-2.5-flash'}</span> · endpoint{' '}
          <span className="font-mono">generativelanguage.googleapis.com</span> · tope 250 solicitudes/día en la
          capa gratuita. Con una API key paga esto se desactiva y el código es exactamente el mismo.
        </p>
      }
    />
  );
}

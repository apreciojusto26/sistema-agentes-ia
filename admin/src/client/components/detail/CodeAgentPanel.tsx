// Code Agent detail panel (spec R6/R9/R10/R12; design §7 "kind: 'generate'
// flow"). Slug validation, content-artifact presence, and content-contract
// validation are ALL enforced server-side (routes/jobs.ts) — this form
// surfaces whatever 400/409/422 comes back rather than re-implementing any
// of those checks.
import { useState } from 'react';
import type { JobRecord, GenerateResult } from '../../../shared/jobs';
import type { SseFrame } from '../../../shared/api';
import AgentRunPanel from './AgentRunPanel';
import TodoList from '../TodoList';

export type CodeAgentPanelProps = {
  job: JobRecord | null;
  logs: Extract<SseFrame, { type: 'log' }>[];
  onRun: (slug: string) => void;
  onCancel: () => void;
  running: boolean;
  /** Whether the Content/Design manual stage is `validated` — Run is still allowed without it (the server itself returns 409 no-content-artifact), this only sets the hint text. */
  contentReady: boolean;
  submitError: string | null;
};

function isGenerateResult(result: JobRecord['result']): result is GenerateResult {
  return !!result && 'outDir' in result;
}

export default function CodeAgentPanel({ job, logs, onRun, onCancel, running, contentReady, submitError }: CodeAgentPanelProps) {
  const [slug, setSlug] = useState('');

  const result = job && isGenerateResult(job.result) ? job.result : null;

  return (
    <AgentRunPanel
      identity="generate"
      job={job}
      logs={logs}
      onCancel={onCancel}
      formSlot={
        <div className="flex flex-col gap-1">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              onRun(slug.trim());
            }}
          >
            <input
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="nombre-de-tu-landing"
              className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm"
            />
            <button
              type="submit"
              disabled={running || slug.trim().length === 0}
              className="rounded bg-slate-800 px-3 py-1 text-sm font-medium text-white disabled:opacity-40"
            >
              Crear landing
            </button>
          </form>
          {!contentReady && (
            <p className="text-xs text-amber-600">
              Todavía no hay textos validados. Completá el paso "Textos y diseño" antes de crear la landing.
            </p>
          )}
        </div>
      }
      resultSlot={
        <>
          {submitError && <p className="text-xs text-state-failed">{submitError}</p>}
          {result && (
            <div className="rounded border border-hairline p-3 text-sm">
              <p className="font-medium text-ink">Se creó en outputs/{result.slug}</p>
              <p className="text-xs text-ink-soft">
                {result.imagesMatched} imágenes ubicadas
                {result.force ? ' — se reemplazó una carpeta que ya existía' : ''}
              </p>
              {result.imagesUnmatched.length > 0 && (
                <p className="text-xs text-amber-600">No se pudieron ubicar: {result.imagesUnmatched.join(', ')}</p>
              )}
              <div className="mt-2">
                <TodoList todos={result.todos} />
              </div>
            </div>
          )}
        </>
      }
    />
  );
}

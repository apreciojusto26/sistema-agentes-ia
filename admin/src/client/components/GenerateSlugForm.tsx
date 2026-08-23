// Minimal inline trigger for the 'generate' job (design note: this replaces
// CodeAgentPanel's form as the only reachable UI for it after the sidebar +
// detail-panel layout was removed in favor of the AgentTimeline). Keeps only
// the essentials — start a build, see the "Todavía no hay textos" hint, and
// open the preview once it exists. The richer result view (image counts,
// TodoList) intentionally stays out of this compact row; CodeAgentPanel
// itself is untouched and still exists if a fuller view is ever wired back.
import { useEffect, useRef, useState } from 'react';
import type { JobRecord, GenerateResult } from '../../shared/jobs';
import * as api from '../http/client';

export type GenerateSlugFormProps = {
  job: JobRecord | null;
  onRun: (slug: string) => void;
  running: boolean;
  /** Run is still allowed without it (the server itself returns 409 no-content-artifact) — this only sets the hint text. */
  contentReady: boolean;
  submitError: string | null;
};

function isGenerateResult(result: JobRecord['result']): result is GenerateResult {
  return !!result && 'outDir' in result;
}

export default function GenerateSlugForm({ job, onRun, running, contentReady, submitError }: GenerateSlugFormProps) {
  const [slug, setSlug] = useState('');
  const [previewStarting, setPreviewStarting] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  // Tracks the open preview tab so we can stop its astro dev server the
  // moment the user closes it — no `noopener` here on purpose, we need this
  // reference to poll `.closed` (see viewResult below).
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current !== null) window.clearInterval(pollRef.current);
    };
  }, []);

  const result = job && isGenerateResult(job.result) ? job.result : null;

  async function viewResult() {
    if (!result) return;
    setPreviewStarting(true);
    setPreviewError(null);
    const res = await api.startPreview(result.slug);
    setPreviewStarting(false);
    if (!res.ok) {
      setPreviewError(res.message);
      return;
    }

    const win = window.open(res.url, '_blank');
    if (pollRef.current !== null) window.clearInterval(pollRef.current);
    if (!win) return; // popup bloqueado por el navegador — el server queda vivo hasta la próxima acción

    pollRef.current = window.setInterval(() => {
      if (!win.closed) return;
      window.clearInterval(pollRef.current!);
      pollRef.current = null;
      void api.stopPreview();
    }, 1000);
  }

  return (
    <div className="mt-2 flex flex-col gap-1">
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
          className="flex-1 rounded border border-hairline px-2 py-1 text-xs"
        />
        <button
          type="submit"
          disabled={running || slug.trim().length === 0}
          className="shrink-0 rounded bg-brand px-2.5 py-1 text-xs font-medium text-white disabled:opacity-40"
        >
          Construir
        </button>
      </form>

      {!contentReady && <p className="text-[11px] text-amber-600">Todavía no hay textos validados.</p>}
      {submitError && <p className="text-[11px] text-state-failed">{submitError}</p>}

      {result && (
        <button
          type="button"
          onClick={() => void viewResult()}
          disabled={previewStarting}
          className="mt-1 w-fit text-[11px] font-medium text-brand underline disabled:opacity-40"
        >
          {previewStarting ? 'Levantando el preview…' : 'Ver el resultado'}
        </button>
      )}
      {previewError && <p className="text-[11px] text-state-failed">{previewError}</p>}
    </div>
  );
}

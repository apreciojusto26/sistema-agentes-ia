// The whole Admin MVP surface: form -> run -> timeline -> result -> preview.
//
// A THIN surface on purpose. It sends three fields, renders whatever the
// server says, and starts a preview. It decides nothing: stage order, stage
// status, commerce mode and error text all arrive from the PipelineRecord, so
// the UI can never disagree with what actually ran.
//
// Reuses StatusPill and the existing preview endpoint rather than introducing
// any new visual dependency.
import { useState } from 'react';
import StatusPill, { type StatusPillTone } from './StatusPill';
import { startPipeline, usePipelineStream } from '../http/pipeline';
import * as api from '../http/client';
import type { PipelineRecord, PipelineStageStatus } from '../../server/pipeline';

const STAGE_LABEL: Record<string, string> = {
  scrape: 'Buscando el producto',
  normalize: 'Ordenando los datos',
  content: 'Escribiendo los textos',
  design: 'Decidiendo el diseño',
  assets: 'Preparando las fotos',
  generate: 'Armando la landing',
  build: 'Compilando',
  validate: 'Revisión final',
};

/** Maps the pipeline's 5 states onto StatusPill's 4 tones. `skipped` has no
 * tone of its own — it is rendered as its own muted row instead, because
 * painting it like `idle` would suggest it is still going to run. */
function toneFor(status: PipelineStageStatus): StatusPillTone | null {
  switch (status) {
    case 'running':
      return 'running';
    case 'pass':
      return 'done';
    case 'failed':
      return 'failed';
    case 'pending':
      return 'idle';
    case 'skipped':
      return null;
  }
}

const STATUS_TEXT: Record<PipelineStageStatus, string> = {
  pending: 'Pendiente',
  running: 'En progreso',
  pass: 'Listo',
  failed: 'Falló',
  skipped: 'No se ejecutó',
};

const COMMERCE_LABEL: Record<PipelineRecord['commerceMode'], string> = {
  'preview-only': 'Preview only — sin comercio',
  'commerce-configured': 'Commerce configured — handle puesto, todavía sin verificar contra Shopify',
  'shopify-live-verified': 'Shopify live verified',
};

export default function PipelinePanel() {
  const [url, setUrl] = useState('');
  const [scrapeJobId, setScrapeJobId] = useState('');
  const [slug, setSlug] = useState('');
  const [handle, setHandle] = useState('');
  const [starting, setStarting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [pipelineId, setPipelineId] = useState<string | null>(null);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewStarting, setPreviewStarting] = useState(false);

  const record = usePipelineStream(pipelineId);
  const running = record?.status === 'running' || starting;

  async function submit() {
    setFormError(null);
    setPreviewUrl(null);
    setPreviewError(null);
    setStarting(true);
    const result = await startPipeline({
      url: url.trim() || undefined,
      scrapeJobId: scrapeJobId.trim() || undefined,
      slug: slug.trim(),
      shopifyHandle: handle.trim() || null,
      // A re-run after a failure must be able to overwrite the half-written
      // output of the previous attempt.
      force: true,
    });
    setStarting(false);

    if (!result.ok) {
      setFormError(result.message);
      return;
    }
    setPipelineId(result.pipeline.pipelineId);
  }

  async function openPreview() {
    if (!record?.slug) return;
    setPreviewStarting(true);
    setPreviewError(null);
    const res = await api.startPreview(record.slug);
    setPreviewStarting(false);
    // Preview is an action ON a valid artefact. If it fails, the pipeline's
    // own verdict is untouched — the landing was still generated correctly.
    if (res.ok) {
      setPreviewUrl(res.url);
      window.open(res.url, '_blank', 'noopener');
    } else {
      setPreviewError(res.message ?? 'No se pudo levantar el preview');
    }
  }

  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-6">
      <h2 className="mb-3 text-sm font-semibold text-ink">Generar una landing</h2>

      <div className="grid gap-2 rounded-2xl border border-hairline bg-panel p-4">
        <label className="text-xs text-ink-soft">
          URL del producto
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…"
            disabled={running}
            className="mt-1 w-full rounded-lg border border-hairline px-2 py-1.5 text-sm text-ink"
          />
        </label>

        <label className="text-xs text-ink-soft">
          …o reusar un scrape existente (jobId)
          <input
            value={scrapeJobId}
            onChange={(e) => setScrapeJobId(e.target.value)}
            placeholder="msyyd9nm-e48bcce7"
            disabled={running}
            className="mt-1 w-full rounded-lg border border-hairline px-2 py-1.5 text-sm text-ink"
          />
        </label>

        <label className="text-xs text-ink-soft">
          Slug de la landing
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="mi-producto"
            disabled={running}
            className="mt-1 w-full rounded-lg border border-hairline px-2 py-1.5 text-sm text-ink"
          />
        </label>

        <label className="text-xs text-ink-soft">
          Handle de Shopify <span className="text-ink-soft">(opcional — vacío = preview mode)</span>
          <input
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            placeholder="mi-producto-en-shopify"
            disabled={running}
            className="mt-1 w-full rounded-lg border border-hairline px-2 py-1.5 text-sm text-ink"
          />
        </label>

        <p className="text-[11px] text-ink-soft">
          {handle.trim() ? COMMERCE_LABEL['commerce-configured'] : COMMERCE_LABEL['preview-only']}
        </p>

        <button
          type="button"
          onClick={() => void submit()}
          disabled={running || !slug.trim()}
          className="mt-1 rounded-lg bg-graphite px-3 py-2 text-sm font-medium text-bone disabled:opacity-40"
        >
          {running ? 'Generando…' : record ? 'Generar de nuevo' : 'Generar landing'}
        </button>

        {formError && <p className="text-[11px] text-state-failed">{formError}</p>}
      </div>

      {record && (
        <div className="mt-4 rounded-2xl border border-hairline bg-panel p-2">
          <ol>
            {record.stages.map((stage) => {
              const tone = toneFor(stage.status);
              return (
                <li key={stage.name} className="flex items-start justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <p className={`text-sm ${stage.status === 'skipped' ? 'text-ink-soft' : 'text-ink'}`}>
                      {STAGE_LABEL[stage.name] ?? stage.name}
                    </p>
                    {stage.detail && <p className="text-[11px] text-ink-soft">{stage.detail}</p>}
                    {stage.error && <p className="text-[11px] text-state-failed">{stage.error}</p>}
                  </div>
                  {tone ? (
                    <StatusPill tone={tone} label={STATUS_TEXT[stage.status]} />
                  ) : (
                    <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs text-ink-soft">
                      {STATUS_TEXT.skipped}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {record?.status === 'succeeded' && (
        <div className="mt-4 rounded-2xl border border-hairline bg-panel p-4 text-sm">
          <p className="font-semibold text-ink">Landing lista</p>
          <dl className="mt-2 grid grid-cols-[9rem_1fr] gap-y-1 text-xs">
            <dt className="text-ink-soft">Slug</dt>
            <dd className="text-ink">{record.slug}</dd>
            <dt className="text-ink-soft">Carpeta</dt>
            <dd className="break-all text-ink">{record.outputPath}</dd>
            <dt className="text-ink-soft">Comercio</dt>
            <dd className="text-ink">{COMMERCE_LABEL[record.commerceMode]}</dd>
            <dt className="text-ink-soft">Build</dt>
            <dd className="text-ink">{record.stages.find((s) => s.name === 'build')?.status === 'pass' ? 'compiló y prerenderizó' : '—'}</dd>
            <dt className="text-ink-soft">Repo propio</dt>
            <dd className="text-ink">
              {record.stages.find((s) => s.name === 'validate')?.status === 'pass'
                ? 'sí — la landing tiene su propio .git'
                : '—'}
            </dd>
          </dl>

          <button
            type="button"
            onClick={() => void openPreview()}
            disabled={previewStarting}
            className="mt-3 rounded-lg border border-hairline px-3 py-1.5 text-sm text-ink disabled:opacity-40"
          >
            {previewStarting ? 'Levantando el preview…' : 'Ver el resultado'}
          </button>
          {previewUrl && (
            <p className="mt-1 text-[11px] text-ink-soft">
              Preview en <span className="text-ink">{previewUrl}</span>
            </p>
          )}
          {previewError && <p className="mt-1 text-[11px] text-state-failed">{previewError}</p>}
        </div>
      )}

      {record?.status === 'failed' && (
        <p className="mt-3 text-xs text-state-failed">
          Falló en <strong>{STAGE_LABEL[record.currentStage ?? ''] ?? record.currentStage}</strong>: {record.error}
        </p>
      )}
    </section>
  );
}

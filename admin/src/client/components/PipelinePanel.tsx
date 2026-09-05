// The Admin's single generation surface: URL in, pipeline visible, landing out.
//
// ONE form and ONE pipeline, deliberately. The dashboard used to carry a hero
// input, a per-agent timeline and a separate slug form alongside this panel —
// three ways to start overlapping work, and two competing pictures of what was
// happening. Everything now flows through /api/pipeline.
//
// STATE LIVES HERE AND NOWHERE ELSE. This component owns the start call and
// the SSE subscription; PipelineColumn, ActiveStagePanel and the result bar are
// presentational and receive what the server said. They cannot disagree with
// the run because they hold nothing of their own.
import { useState } from 'react';
import PipelineColumn from './PipelineColumn';
import ActiveStagePanel from './ActiveStagePanel';
import JobHistory from './JobHistory';
import ShopifySection from './ShopifySection';
import { buildBlocks, activeBlock, emptyBlocks } from './pipeline-blocks';
import { startPipeline, usePipelineStream } from '../http/pipeline';
import * as api from '../http/client';
import { useJobs } from '../http/useJobs';
import type { PipelineRecord } from '../../server/pipeline';

const COMMERCE_LABEL: Record<PipelineRecord['commerceMode'], string> = {
  'preview-only': 'Preview only',
  'commerce-configured': 'Commerce configured',
  'shopify-live-verified': 'Shopify live verified',
};

/** `mi-producto-genial` from a messy product URL. Keeps the common path free
 *  of a field nobody wants to fill in; Opciones avanzadas still overrides it. */
export function slugFromUrl(url: string): string {
  try {
    const last = new URL(url).pathname.split('/').filter(Boolean).pop() ?? '';
    const base = last
      .replace(/\.[a-z0-9]+$/i, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60)
      .replace(/-+$/g, '');
    return /^[a-z0-9]/.test(base) ? base : '';
  } catch {
    return '';
  }
}

export default function PipelinePanel() {
  const [url, setUrl] = useState('');
  const [scrapeJobId, setScrapeJobId] = useState('');
  const [slug, setSlug] = useState('');
  /**
   * The linked Shopify product, as a handle — CHOSEN in ShopifySection, not
   * typed. `null` is Preview, which is a normal outcome and not a missing
   * value. The handle is still what the generator takes, so it stays the
   * representation; what changed is that an operator no longer has to know one.
   */
  const [handle, setHandle] = useState<string | null>(null);
  /**
   * THIS LANDING'S PUBLIC ORIGIN, when the operator has one.
   *
   * Optional and it stays optional: a preview has no domain and must not be
   * made to invent one. When it IS given, the generator persists it into the
   * landing's own .env — so a later build or deploy uses the same origin
   * without anyone remembering to export a variable.
   */
  const [siteUrl, setSiteUrl] = useState('');
  const [advanced, setAdvanced] = useState(false);
  const [starting, setStarting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [pipelineId, setPipelineId] = useState<string | null>(null);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewStarting, setPreviewStarting] = useState(false);

  const record = usePipelineStream(pipelineId);
  const { jobs } = useJobs();

  const running = record?.status === 'running' || starting;
  // Before a run exists the six blocks still render, all pending, so the flow
  // reads on arrival instead of being an empty column.
  const blocks = record ? buildBlocks(record.stages) : emptyBlocks();
  const active = record ? activeBlock(blocks) : null;
  const activeIndex = active ? blocks.findIndex((b) => b.meta.id === active.meta.id) : 0;

  const effectiveSlug = slug.trim() || slugFromUrl(url);
  const canStart = !running && !!effectiveSlug && (!!url.trim() || !!scrapeJobId.trim());

  async function submit() {
    setFormError(null);
    setPreviewUrl(null);
    setPreviewError(null);
    setStarting(true);

    const result = await startPipeline({
      url: url.trim() || undefined,
      scrapeJobId: scrapeJobId.trim() || undefined,
      slug: effectiveSlug,
      shopifyHandle: handle,
      siteUrl: siteUrl.trim() || null,
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
    // Preview acts ON a finished artefact. A failure here says nothing about
    // whether the landing was generated correctly, so the pipeline verdict is
    // never rewritten.
    if (res.ok) {
      setPreviewUrl(res.url);
      window.open(res.url, '_blank', 'noopener');
    } else {
      setPreviewError(res.message ?? 'No se pudo levantar el preview');
    }
  }

  const commerceNow = handle ? COMMERCE_LABEL['commerce-configured'] : COMMERCE_LABEL['preview-only'];

  return (
    <div className="mx-auto w-full max-w-[76rem] px-5 pb-10">
      {/* ── Nueva generación ─────────────────────────────────────────── */}
      <section className="rounded-2xl border border-hairline-soft bg-panel p-4">
        <span className="cap text-ink-faint">Nueva generación</span>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <label className="min-w-[18rem] flex-1">
            <span className="sr-only">URL del producto</span>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Pegá la URL del producto…"
              disabled={running}
              className="w-full rounded-xl border border-hairline bg-panel-soft px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:border-brand focus:outline-none disabled:opacity-50"
            />
          </label>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!canStart}
            className="rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-brand-ink transition hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            {running ? 'Generando…' : record ? 'Generar de nuevo' : 'Generar landing'}
          </button>
        </div>

        <p className="mt-2 flex flex-wrap items-center gap-1.5 font-mono text-[10px] text-ink-faint">
          <span className="rounded-full bg-panel-muted px-1.5 py-0.5 text-ink-soft">{commerceNow}</span>
          {effectiveSlug && <span className="rounded-full bg-panel-muted px-1.5 py-0.5 text-ink-soft">/{effectiveSlug}</span>}
        </p>

        <ShopifySection handle={handle} onChange={setHandle} siteUrl={siteUrl} disabled={running} />

        <button
          type="button"
          onClick={() => setAdvanced((v) => !v)}
          aria-expanded={advanced}
          className="mt-2 text-[11px] text-ink-soft underline-offset-2 hover:underline"
        >
          {advanced ? 'Ocultar opciones avanzadas' : 'Opciones avanzadas'}
        </button>

        {/* ── ADVANCED: TOOLS, NOT SETTINGS ────────────────────────────────
            Both of these were unlabelled boxes an operator could only use by
            already knowing what they did. Neither participates in product
            identity — the scrape is an input and the slug is an output PATH —
            and saying so is the point of the help text.

            "Handle de Shopify" LEFT this panel entirely. Linking a product is
            a commercial decision, not a debugging switch, and it now happens
            above where it is visible and where the product is chosen from the
            shop instead of spelled from memory. */}
        {advanced && (
          <div className="mt-2 grid gap-3 border-t border-hairline-soft pt-2 sm:grid-cols-3">
            <label className="text-xs text-ink-soft">
              Reusar scrape (jobId)
              <input
                value={scrapeJobId}
                onChange={(e) => setScrapeJobId(e.target.value)}
                placeholder="opcional"
                disabled={running}
                aria-describedby="help-scrape-job"
                className="mt-1 w-full rounded-lg border border-hairline bg-panel-soft px-2 py-1.5 text-sm text-ink placeholder:text-ink-faint disabled:opacity-50"
              />
              <span id="help-scrape-job" className="mt-1 block text-[11px] text-ink-faint">
                Reutiliza la extracción de una ejecución anterior sin volver a consultar al proveedor.
              </span>
            </label>
            <label className="text-xs text-ink-soft">
              Dominio de publicación
              <input
                value={siteUrl}
                onChange={(e) => setSiteUrl(e.target.value)}
                placeholder="https://producto.tudominio.com"
                disabled={running}
                aria-describedby="help-site-url"
                className="mt-1 w-full rounded-lg border border-hairline bg-panel-soft px-2 py-1.5 text-sm text-ink placeholder:text-ink-faint disabled:opacity-50"
              />
              <span id="help-site-url" className="mt-1 block text-[11px] text-ink-faint">
                El origen público de esta landing. Se guarda con ella, así un build posterior lo usa sin volver a
                configurarlo. Vacío = preview, sin dominio y sin tarjeta social.
              </span>
            </label>
            <label className="text-xs text-ink-soft">
              Slug manual
              <input
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder={slugFromUrl(url) || 'se deriva de la URL'}
                disabled={running}
                aria-describedby="help-slug"
                className="mt-1 w-full rounded-lg border border-hairline bg-panel-soft px-2 py-1.5 text-sm text-ink placeholder:text-ink-faint disabled:opacity-50"
              />
              <span id="help-slug" className="mt-1 block text-[11px] text-ink-faint">
                Sobrescribe la URL/ruta de salida. Si lo dejás vacío se genera automáticamente. No identifica al
                producto.
              </span>
            </label>
          </div>
        )}

        {formError && <p className="mt-2 text-[11px] text-state-failed">{formError}</p>}
      </section>

      {/* ── pipeline | stage activo | historial ──────────────────────── */}
      {/* `items-start` so a long history never stretches the other two columns
          into tall empty boxes; the history scrolls inside its own panel. */}
      {/* Column widths follow the canvas: a ~19rem agent rail, a fluid centre,
          a ~17rem history. Wider than the previous 13rem rail because the
          cards carry an avatar and a pill, not a single row of text. */}
      <div className="mt-3 grid items-start gap-3 lg:grid-cols-[19rem_minmax(0,1fr)_17rem]">
        <PipelineColumn blocks={blocks} activeId={active?.meta.id ?? null} />

        <ActiveStagePanel block={active} index={activeIndex} total={blocks.length || 6} />

        <div className="flex flex-col gap-2">
          <span className="cap pl-1 text-ink-faint">Historial</span>
          <div className="max-h-[28rem] overflow-y-auto pr-0.5">
            <JobHistory jobs={jobs} />
          </div>
        </div>
      </div>

      {/* ── Resultado ────────────────────────────────────────────────── */}
      {record?.status === 'succeeded' && (
        <section className="mt-3 rounded-2xl border border-hairline-soft border-t-2 border-t-state-done bg-panel p-4" aria-live="polite">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-state-done">Landing lista</span>
            <span className="rounded-full bg-panel-muted px-2 py-0.5 font-mono text-[10px] text-ink-soft">/{record.slug}</span>
            <span className="rounded-full bg-brand-tint px-2 py-0.5 font-mono text-[10px] text-ink">
              {COMMERCE_LABEL[record.commerceMode]}
            </span>
            <button
              type="button"
              onClick={() => void openPreview()}
              disabled={previewStarting}
              className="ml-auto rounded-xl border border-hairline px-3.5 py-1.5 text-sm font-medium text-ink transition hover:bg-panel-muted disabled:opacity-40"
            >
              {previewStarting ? 'Levantando…' : 'Abrir preview'}
            </button>
          </div>

          <dl className="mt-3 grid gap-x-4 gap-y-1 text-xs sm:grid-cols-[8rem_minmax(0,1fr)]">
            <dt className="text-ink-faint">Carpeta</dt>
            <dd className="break-all text-ink-soft">{record.outputPath}</dd>
            <dt className="text-ink-faint">Build</dt>
            <dd className="text-ink-soft">
              {record.stages.find((s) => s.name === 'build')?.status === 'pass' ? 'compiló y prerenderizó' : '—'}
            </dd>
            <dt className="text-ink-faint">Repo propio</dt>
            <dd className="text-ink-soft">
              {record.stages.find((s) => s.name === 'validate')?.status === 'pass'
                ? 'sí — la landing tiene su propio .git'
                : '—'}
            </dd>
          </dl>

          {previewUrl && <p className="mt-2 text-[11px] text-ink-faint">Preview en {previewUrl}</p>}
          {previewError && <p className="mt-2 text-[11px] text-state-failed">{previewError}</p>}
        </section>
      )}

      {record?.status === 'failed' && (
        <p className="mt-3 text-xs text-state-failed" aria-live="polite">
          Falló en <strong>{active?.meta.label ?? record.currentStage}</strong>: {record.error}
        </p>
      )}
    </div>
  );
}

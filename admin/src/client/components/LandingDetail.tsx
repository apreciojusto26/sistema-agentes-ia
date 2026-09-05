// One landing: what it is, what it looks like, and what the agents did to make it.
//
// The preview is an IFRAME OVER THE REAL BUILD, served by the Admin from
// outputs/<slug>/dist/client. Not a React reconstruction of the page: a
// faithful-looking re-implementation is the one thing guaranteed never to
// reveal a generation bug, which is the only reason to look at a preview.
//
// The run reports come from the pipeline store, which persists them — so this
// view answers "what happened the last time this was built" after a restart,
// with the same five agents clickable as during the run.
import { useEffect, useState } from 'react';
import AgentSteps from './AgentSteps';
import StageMark from './StageMark';
import { buildBlocks, type PipelineBlock } from './pipeline-blocks';
import { relativeDate, providerLabel, stateLabel } from './LandingsLibrary';
import { formatMs } from './step-labels';
import { getLanding, deleteLanding, previewUrl, type LandingDetail as Detail } from '../http/landings';

export type LandingDetailProps = {
  slug: string;
  onBack: () => void;
  onDeleted: () => void;
  /** Sends the operator to the generation form, prefilled with this landing. */
  onRegenerate: (detail: Detail) => void;
};

export default function LandingDetail({ slug, onBack, onDeleted, onRegenerate }: LandingDetailProps) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [missing, setMissing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void getLanding(slug).then((d) => {
      if (!alive) return;
      if (!d) setMissing(true);
      else setDetail(d);
    });
    return () => {
      alive = false;
    };
  }, [slug]);

  if (missing) {
    return (
      <div className="rounded-2xl border border-dashed border-hairline-soft px-6 py-10 text-center">
        <p className="text-[13px] text-ink-soft">Esa landing ya no existe.</p>
        <button type="button" onClick={onBack} className="mt-2 text-[12px] text-ink underline-offset-2 hover:underline">
          Volver a Páginas creadas
        </button>
      </div>
    );
  }
  if (!detail) return <p className="px-1 py-8 text-center text-[13px] text-ink-soft">Abriendo la landing…</p>;

  const { landing, runs } = detail;
  const state = stateLabel(landing);
  // THE LAST RUN, and only if one was recorded. A landing generated before
  // reports were persisted has none, and that is shown as absence rather than
  // as an empty report.
  const lastRun = runs[0] ?? null;
  const blocks: PipelineBlock[] = lastRun ? buildBlocks(lastRun.stages) : [];
  const active = blocks.find((b) => b.meta.id === selected) ?? blocks[0] ?? null;

  return (
    <div className="flex flex-col gap-4">
      <button type="button" onClick={onBack} className="self-start text-[12px] text-ink-soft underline-offset-2 hover:underline">
        ← Páginas creadas
      </button>

      {/* ── header ─────────────────────────────────────────────────────── */}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-xl font-semibold tracking-tight text-ink">{landing.displayName}</h2>
          <p className="mt-0.5 text-[12.5px] text-ink-soft">
            {providerLabel(landing)} · {landing.mode === 'commerce' ? 'Commerce' : 'Preview'} ·{' '}
            <span className={state.tone}>{state.text}</span>
          </p>
          <p className="mt-1 font-mono text-[10px] text-ink-faint">
            /{landing.slug} · {landing.assetCount} imágenes · {relativeDate(landing.generatedAt)}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {/* Only offered when there IS a build. A "Ver landing" that opened
              nothing would be a broken promise. */}
          <a
            href={landing.built ? previewUrl(landing.slug) : undefined}
            target="_blank"
            rel="noreferrer noopener"
            aria-disabled={!landing.built}
            className={`rounded-xl px-3.5 py-2 text-[13px] font-semibold ${
              landing.built
                ? 'bg-brand text-brand-ink transition hover:bg-brand-hover'
                : 'cursor-not-allowed border border-hairline text-ink-faint'
            }`}
          >
            Ver landing
          </a>
          <button
            type="button"
            onClick={() => onRegenerate(detail)}
            className="rounded-xl border border-hairline px-3.5 py-2 text-[13px] text-ink transition hover:border-brand"
          >
            Regenerar
          </button>
          <button
            type="button"
            onClick={() => {
              setConfirming(true);
              setDeleteError(null);
            }}
            className="rounded-xl border border-hairline px-3.5 py-2 text-[13px] text-state-failed transition hover:border-state-failed"
          >
            Eliminar
          </button>
        </div>
      </header>

      {/* ── delete confirmation ─────────────────────────────────────────── */}
      {confirming && (
        <div role="alertdialog" aria-label="Confirmar eliminación" className="rounded-2xl border border-state-failed/40 bg-state-failed-tint p-4">
          <p className="text-[13px] font-semibold text-ink">¿Eliminar “{landing.displayName}”?</p>
          <p className="mt-1 text-[12.5px] text-ink-soft">
            Se eliminarán los archivos generados de esta landing. El producto vinculado en Shopify{' '}
            <strong className="font-semibold text-ink">NO</strong> será eliminado, ni la tienda ni su configuración.
          </p>
          {deleteError && <p className="mt-1.5 text-[12px] text-state-failed">{deleteError}</p>}
          <div className="mt-2.5 flex gap-2">
            <button
              type="button"
              onClick={() => {
                void deleteLanding(landing.slug).then((r) => {
                  if (r.ok) onDeleted();
                  else setDeleteError(r.message);
                });
              }}
              className="rounded-lg bg-state-failed px-3 py-1.5 text-[12.5px] font-semibold text-white"
            >
              Eliminar landing
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded-lg border border-hairline px-3 py-1.5 text-[12.5px] text-ink"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* ── the real artefact ───────────────────────────────────────────── */}
      <section className="flex flex-col gap-2">
        <span className="cap text-ink-faint">Preview</span>
        {landing.built ? (
          <iframe
            title={`Preview de ${landing.displayName}`}
            src={previewUrl(landing.slug)}
            // SANDBOXED. The page is built from a scraped listing and a model's
            // copy; it is shown here to be looked at, not to run with the
            // Admin's authority. Scripts are allowed so the real page renders,
            // but `allow-same-origin` is NOT — without it the frame gets an
            // opaque origin and cannot reach the Admin's storage or cookies.
            sandbox="allow-scripts"
            loading="lazy"
            className="h-[34rem] w-full rounded-2xl border border-hairline-soft bg-white"
          />
        ) : (
          <p className="rounded-2xl border border-dashed border-hairline-soft px-4 py-10 text-center text-[13px] text-ink-soft">
            Esta landing todavía no se ha construido, así que no hay nada que previsualizar.
          </p>
        )}
      </section>

      {/* ── the last run, agent by agent ────────────────────────────────── */}
      <section className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="cap text-ink-faint">Última ejecución</span>
          {lastRun && (
            <span className="font-mono text-[10px] text-ink-faint">
              {relativeDate(lastRun.createdAt)} ·{' '}
              {lastRun.status === 'succeeded' ? 'completada' : lastRun.status === 'failed' ? 'falló' : 'en curso'}
              {runs.length > 1 && ` · ${runs.length} ejecuciones`}
            </span>
          )}
        </div>

        {!lastRun ? (
          <p className="rounded-2xl border border-dashed border-hairline-soft px-4 py-8 text-center text-[13px] text-ink-soft">
            No hay ningún informe guardado para esta landing. Regenerala para obtener uno.
          </p>
        ) : (
          <div className="grid gap-3 lg:grid-cols-[15rem_minmax(0,1fr)]">
            <nav aria-label="Agentes de la ejecución" className="flex gap-2 overflow-x-auto lg:flex-col lg:overflow-visible">
              {blocks.map((b) => (
                <button
                  key={b.meta.id}
                  type="button"
                  onClick={() => setSelected(b.meta.id)}
                  aria-current={active?.meta.id === b.meta.id ? 'true' : undefined}
                  className={`flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-left text-[12.5px] transition ${
                    active?.meta.id === b.meta.id
                      ? 'border-hairline bg-panel-muted text-ink'
                      : 'border-hairline-soft text-ink-soft hover:border-hairline'
                  }`}
                >
                  <StageMark status={b.status} compact />
                  <span className="truncate">{b.meta.label}</span>
                </button>
              ))}
            </nav>

            {active && (
              <article className={`console flex flex-col gap-3 rounded-2xl border border-hairline-soft border-t-2 p-4 ${active.meta.accentBorder}`}>
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-[13px] font-semibold text-ink">{active.meta.label}</h3>
                  <StageMark status={active.status} compact />
                </div>

                {active.stages.map((stage) => (
                  <div key={stage.name} className="flex flex-col gap-1.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-mono text-[10px] uppercase tracking-wide text-ink-faint">{stage.name}</span>
                      {stage.startedAt && stage.endedAt && (
                        <span className="font-mono text-[10px] text-ink-faint">
                          {formatMs(Date.parse(stage.endedAt) - Date.parse(stage.startedAt))}
                        </span>
                      )}
                    </div>
                    {stage.detail && <p className="text-[12.5px] text-ink-soft">{stage.detail}</p>}
                    {stage.error && (
                      <p className="text-[12px] text-state-failed">{stage.errorDetail?.headline ?? stage.error}</p>
                    )}
                    <AgentSteps
                      steps={stage.steps}
                      emptyHint={
                        stage.status === 'pass' || stage.status === 'failed'
                          ? 'Esta etapa la ejecuta el propio Admin y no lanza un proceso con pasos propios.'
                          : undefined
                      }
                    />
                  </div>
                ))}

                <details className="mt-1">
                  <summary className="cursor-pointer font-mono text-[10px] text-ink-faint">Detalles técnicos</summary>
                  <dl className="mt-1.5 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 font-mono text-[10px] text-ink-faint">
                    <dt>run</dt>
                    <dd className="break-all">{lastRun.pipelineId}</dd>
                    <dt>productId</dt>
                    <dd className="break-all">{lastRun.productId ?? '—'}</dd>
                    <dt>identidad</dt>
                    <dd className="break-all">
                      {landing.source ? `${landing.source.provider}:${landing.source.externalProductId}` : '—'}
                    </dd>
                    <dt>salida</dt>
                    <dd className="break-all">{lastRun.outputPath ?? '—'}</dd>
                    {landing.siteUrl && (
                      <>
                        <dt>dominio</dt>
                        <dd className="break-all">{landing.siteUrl}</dd>
                      </>
                    )}
                  </dl>
                </details>
              </article>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

// Centre column, in the `/design` canvas's composition: a large ringed avatar,
// the step caption in the agent's accent, its name at display size, and a live
// line saying what it is working on — then the dense "paso a paso" card.
//
// Everything is READ from the record. `detail` is the string the server itself
// produced ("family=tech · density=balanced · 10 sections"), so this panel
// cannot show a metric the backend never reported. There is no progress bar,
// because no stage reports progress — the canvas had none either.
import AgentAvatar from './AgentAvatar';
import StageMark, { STATUS_TEXT } from './StageMark';
import { STAGE_LABEL, type PipelineBlock } from './pipeline-blocks';

export type ActiveStagePanelProps = {
  block: PipelineBlock | null;
  index: number;
  total: number;
  idleHint?: string;
};

export default function ActiveStagePanel({ block, index, total, idleHint }: ActiveStagePanelProps) {
  if (!block) {
    return (
      <div className="flex min-h-[13rem] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-hairline-soft px-6 py-10">
        <span className="cap text-ink-faint">En espera</span>
        <p className="max-w-xs text-center text-[13px] text-ink-soft">
          {idleHint ?? 'Pegá la URL de un producto y el equipo arranca.'}
        </p>
      </div>
    );
  }

  const running = block.stages.find((s) => s.status === 'running');
  const failed = block.stages.find((s) => s.status === 'failed');
  const reported = block.stages.filter((s) => s.status !== 'pending').length;

  return (
    <section className="flex flex-col gap-4" aria-live="polite">
      {/* header */}
      <div className="flex items-start gap-3.5">
        <AgentAvatar block={block} size={52} />

        <div className="flex min-w-0 flex-col gap-1.5">
          <span className={`cap ${block.meta.accentText}`}>
            Paso {String(index + 1).padStart(2, '0')} de {total}
          </span>
          <h2 className="text-xl font-semibold leading-none tracking-tight text-ink">{block.meta.label}</h2>
          <span className="flex items-center gap-2 text-[13px] text-ink-soft">
            <StageMark status={block.status} compact />
            {block.status === 'running' ? (
              <>
                trabajando en:{' '}
                <span className="font-semibold text-ink">{running ? (STAGE_LABEL[running.name] ?? running.name) : block.meta.doing}</span>
              </>
            ) : (
              <span className="font-mono text-[11px] text-ink-faint">{block.meta.agent}</span>
            )}
          </span>
        </div>
      </div>

      {/* paso a paso */}
      {/* `console` re-skins this subtree to the canvas's dark readout card —
          see styles.css. Children keep using the ordinary tokens. */}
      <div
        className={`console flex flex-col gap-3 rounded-2xl border border-hairline-soft border-t-2 p-5 ${block.meta.accentBorder}`}
      >
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[13px] font-semibold text-ink">Paso a paso</span>
          <span className="font-mono text-[11px] text-ink-soft">
            {reported} de {block.stages.length || 1} reportados
          </span>
        </div>

        <p className="max-w-prose text-[13px] leading-relaxed text-ink-soft">{block.meta.description}</p>

        <ul className="flex flex-col gap-2.5">
          {block.stages.map((s) => (
            <li key={s.name} className="flex items-start gap-3">
              <StageMark status={s.status} compact />
              <span className={`min-w-0 flex-1 text-[13px] ${s.status === 'skipped' ? 'text-ink-faint' : 'text-ink'}`}>
                {STAGE_LABEL[s.name] ?? s.name}
                {s.detail && <span className="block font-mono text-[11px] text-ink-soft">{s.detail}</span>}
                {/* The per-stage line stays terse: when the failure has a
                    human form, the headline is the sentence and the identifiers
                    live in the disclosure below. */}
                {s.error && (
                  <span className="block text-[11px] text-state-failed">
                    {s.errorDetail?.headline ?? s.error}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>

        {/* ── THE FAILURE, IN THE OPERATOR'S LANGUAGE ────────────────────
            A product-lineage conflict used to arrive here as a paragraph of
            prd_ identifiers — technically complete and unreadable, and the
            first thing an operator saw was a pair of ids that mean nothing to
            anyone. The headline says what happened; the identifiers are still
            there, one click away, because a support conversation needs them. */}
        {failed?.errorDetail ? (
          <div className="rounded-lg bg-state-failed-tint px-3 py-2 text-[12px] text-state-failed">
            <p className="font-semibold">Conflicto de producto</p>
            <p className="mt-0.5">{failed.errorDetail.headline}</p>
            <details className="mt-1.5">
              <summary className="cursor-pointer text-[11px] opacity-80">Detalles técnicos</summary>
              <dl className="mt-1 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 font-mono text-[10px]">
                {failed.errorDetail.facts.map((f) => (
                  <div key={f.label} className="contents">
                    <dt className="opacity-70">{f.label}</dt>
                    <dd className="break-all">{f.value}</dd>
                  </div>
                ))}
              </dl>
            </details>
          </div>
        ) : (
          failed?.error && (
            <p className="rounded-lg bg-state-failed-tint px-3 py-2 text-[12px] text-state-failed">{failed.error}</p>
          )
        )}
      </div>
    </section>
  );
}

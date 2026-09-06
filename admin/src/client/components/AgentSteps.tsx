// THE OPERATIONS AN AGENT ACTUALLY PERFORMED, one line each.
//
// An agent used to go pending → working → done, which told an operator that
// something was happening for forty seconds and nothing about what. These are
// the child script's own `withStage` blocks, mirrored onto the pipeline record
// as they are reported.
//
// NOTHING HERE IS PREDICTED. A step appears when the child announces it, with
// the status the child gave it and the duration the child measured. There is
// no expected-step list to tick off and no timer standing in for progress: a
// green check means the work happened.
//
// The glyphs stay inside the existing vocabulary — ○ pending, ✓ passed,
// × failed, ! warning, — skipped — so a step reads the same way as a stage.
import type { PipelineStep } from '../../server/pipeline';
import { stepLabel, formatMs } from './step-labels';

/** A step's mark, matching StageMark's language without importing its statuses. */
function StepMark({ status }: { status: PipelineStep['status'] }) {
  // `—` IS NOT A DASH FOR DECORATION. A skipped operation was declared and
  // never reached, and it is drawn in the faintest tone precisely so it cannot
  // be misread as a quiet success: a stage that died at step three must show
  // four and five as unreached, or a partial run looks like a complete one.
  const glyph =
    status === 'passed'
      ? '✓'
      : status === 'failed'
        ? '×'
        : status === 'warning'
          ? '!'
          : status === 'skipped'
            ? '—'
            : '';
  const tone =
    status === 'passed'
      ? 'text-state-done'
      : status === 'failed'
        ? 'text-state-failed'
        : status === 'warning'
          ? 'text-state-warn'
          : 'text-ink-faint';

  // NO ANIMATION, deliberately. no-fake-spinner.test.ts allows `animate-`
  // in exactly one component across the whole client, and the rule is right:
  // motion reads as progress, and a step that is genuinely waiting on a
  // network call would look like it was advancing. `●` says "this one is
  // happening" without claiming how far along it is — and the list updates
  // for real as the child reports, which is the honest kind of liveness.
  return (
    <span
      aria-hidden="true"
      className={`mt-[1px] w-2.5 shrink-0 text-center text-[12px] leading-none ${
        status === 'running' ? 'text-brand' : tone
      }`}
    >
      {status === 'running' ? '●' : glyph}
    </span>
  );
}

const STATUS_WORD: Record<PipelineStep['status'], string> = {
  running: 'en curso',
  passed: 'completado',
  failed: 'falló',
  warning: 'completado con avisos',
  skipped: 'no se ejecutó',
};

export type AgentStepsProps = {
  steps: PipelineStep[];
  /** Rendered when a stage genuinely delegates to no child process. */
  emptyHint?: string;
};

export default function AgentSteps({ steps, emptyHint }: AgentStepsProps) {
  if (steps.length === 0) {
    return emptyHint ? <p className="text-[12px] text-ink-faint">{emptyHint}</p> : null;
  }

  // Summed from what was measured. A step the child could not time is left out
  // of the total rather than counted as zero.
  const timed = steps.filter((s) => typeof s.ms === 'number');
  // NEITHER RUNNING NOR SKIPPED COUNTS AS DONE. A skipped operation never
  // happened, and counting it would make "5 de 5 operaciones" the summary of a
  // stage that failed at two.
  const done = steps.filter((s) => s.status !== 'running' && s.status !== 'skipped').length;
  const total = timed.reduce((sum, s) => sum + (s.ms ?? 0), 0);

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-1.5">
        {steps.map((step) => (
          <li key={`${step.name}-${step.startedAt}`} className="flex items-start gap-2.5">
            <StepMark status={step.status} />
            <span
              className={`min-w-0 flex-1 text-[12.5px] leading-snug ${
                step.status === 'failed'
                  ? 'text-state-failed'
                  : step.status === 'running'
                    ? 'text-ink'
                    : 'text-ink-soft'
              }`}
            >
              {stepLabel(step.name)}
              <span className="sr-only"> — {STATUS_WORD[step.status]}</span>

              {/* Real counters only: the scraper reports images and reviews as
                  done/total because it genuinely knows both. */}
              {step.progress && (
                <span className="ml-1.5 font-mono text-[10px] text-ink-faint">
                  {step.progress.done}/{step.progress.total}
                  {step.progress.label ? ` ${step.progress.label}` : ''}
                </span>
              )}

              {/* One short fact the operation reported that is not a fraction:
                  a grammar hash, "0 sin resolver", "READY". Printed as the
                  backend wrote it — a second version computed here would be
                  this component having an opinion about the run. */}
              {step.note && (
                <span className="ml-1.5 font-mono text-[10px] text-ink-faint">{step.note}</span>
              )}

              {step.warnings.map((w) => (
                <span key={w} className="mt-0.5 block text-[11px] text-state-warn">
                  {w}
                </span>
              ))}
            </span>

            {typeof step.ms === 'number' && (
              <span className="shrink-0 font-mono text-[10px] text-ink-faint">{formatMs(step.ms)}</span>
            )}
          </li>
        ))}
      </ul>

      {timed.length > 0 && (
        <p className="font-mono text-[10px] text-ink-faint">
          {done} de {steps.length} operaciones · {formatMs(total)}
        </p>
      )}
    </div>
  );
}

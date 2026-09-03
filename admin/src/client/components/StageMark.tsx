// Status pill, in the `/design` canvas's treatment: a rounded chip with a dot
// (or a tick for `pass`), tinted with the status colour.
//
// Carries a shape as well as a hue — dot vs tick vs cross vs dash — so the five
// states stay distinguishable without relying on colour alone.
//
// No animation, deliberately: `no-fake-spinner.test.ts` makes LiveActivity the
// only animating component in the app, because motion is reserved for
// something genuinely, observably happening.
import type { PipelineStageStatus } from '../../server/pipeline';

export const STATUS_TEXT: Record<PipelineStageStatus, string> = {
  pending: 'Pendiente',
  running: 'En progreso',
  pass: 'Listo',
  failed: 'Falló',
  skipped: 'Omitido',
};

// Literal class strings only (Tailwind v4 scans source text).
const PILL: Record<PipelineStageStatus, string> = {
  pending: 'bg-state-idle-tint text-ink-faint',
  running: 'bg-state-running-tint text-state-running',
  pass: 'bg-state-done-tint text-state-done',
  failed: 'bg-state-failed-tint text-state-failed',
  skipped: 'bg-state-idle-tint text-state-skipped',
};

const DOT: Record<PipelineStageStatus, string> = {
  pending: 'bg-state-skipped',
  running: 'bg-state-running',
  pass: 'bg-state-done',
  failed: 'bg-state-failed',
  skipped: 'bg-state-skipped',
};

export default function StageMark({ status, compact = false }: { status: PipelineStageStatus; compact?: boolean }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full font-semibold ${PILL[status]} ${
        compact ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-[11px]'
      }`}
    >
      {status === 'pass' ? (
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 12.5 9.5 18 20 6.5" />
        </svg>
      ) : status === 'failed' ? (
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6 6 18" />
        </svg>
      ) : status === 'skipped' ? (
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" aria-hidden="true">
          <path d="M5 12h14" />
        </svg>
      ) : (
        <span className={`h-1.5 w-1.5 rounded-full ${DOT[status]}`} aria-hidden="true" />
      )}
      {STATUS_TEXT[status]}
    </span>
  );
}

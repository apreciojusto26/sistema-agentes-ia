// Exhaustive Job-Status Labels (spec "Exhaustive Job-Status Labels", design
// §3.2, D3a). Extracted from AgentSidebarItem.tsx's local `agentStatusLabel`
// — the `default: return job.status` fallback is replaced with `assertNever`
// over the 7-value JobStatus union, mirroring content-stage-label.ts's
// existing pattern. Its own exhaustiveness is compiler-enforced (no
// dedicated coverage test — see tasks.md judgment call log); correctness is
// exercised indirectly once AgentSidebarItem.tsx wires it in.
import type { JobKind, JobStatus } from './jobs';
import { assertNever } from './assert-never';

/** Spanish, non-technical. `null` = this agent has no job record at all. */
export function jobStatusLabel(status: JobStatus | null): string {
  if (status === null) return 'todavía no se ejecutó';
  switch (status) {
    case 'queued':
      return 'en espera';
    case 'running':
      return 'trabajando';
    case 'succeeded':
      return 'listo';
    case 'failed':
      return 'falló';
    case 'cancelled':
      return 'cancelado';
    case 'timed-out':
      return 'tardó demasiado';
    case 'interrupted':
      return 'interrumpido (se reinició el servidor)';
    default:
      return assertNever(status);
  }
}

/** Which of the 4 status tokens paints this status. */
export function jobStatusTone(status: JobStatus | null): 'running' | 'done' | 'failed' | 'idle' {
  if (status === null) return 'idle';
  switch (status) {
    case 'running':
      return 'running';
    case 'queued':
      return 'idle';
    case 'succeeded':
      return 'done';
    case 'failed':
    case 'timed-out':
      return 'failed';
    case 'cancelled':
    case 'interrupted':
      return 'idle';
    default:
      return assertNever(status);
  }
}

/**
 * Typed as Record<JobKind, string> so the compiler enforces coverage: adding a
 * member to the JobKind union without labelling it here fails `pnpm typecheck`
 * instead of rendering `undefined` in the operator's job history.
 */
export const JOB_KIND_LABEL: Record<JobKind, string> = {
  scrape: 'búsqueda',
  content: 'redacción',
  design: 'diseño',
  generate: 'construcción',
};

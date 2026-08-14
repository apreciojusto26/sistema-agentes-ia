// Pure precedence rules for the sidebar's `assisted` (content) row (design
// addendum §3). Reused by AgentSidebarItem so the sidebar chip and the panel
// never drift apart without one importing the other.
import type { JobRecord } from '../../shared/jobs';
import type { ContentStageState } from '../../shared/content-stage';
import { jobStatusLabel, jobStatusTone } from '../../shared/status-label';
import { contentStageLabelShort } from './content-stage-label';

export type AssistedSummary = {
  text: string;
  tone: 'running' | 'done' | 'failed' | 'idle';
  /** The "tu turno" chip. NEVER true while a job is live — it would be a lie. */
  showTurnChip: boolean;
};

export function assistedSummary(job: JobRecord | null, state: ContentStageState): AssistedSummary {
  if (job && (job.status === 'running' || job.status === 'queued')) {
    return { text: jobStatusLabel(job.status), tone: jobStatusTone(job.status), showTurnChip: false };
  }

  if (job && (job.status === 'failed' || job.status === 'timed-out')) {
    if (state.kind === 'validated') {
      return { text: 'falló · hay textos guardados', tone: 'failed', showTurnChip: false };
    }
    return { text: 'falló', tone: 'failed', showTurnChip: true };
  }

  return {
    text: contentStageLabelShort(state),
    tone: state.kind === 'validated' ? 'done' : 'idle',
    showTurnChip: state.kind !== 'validated',
  };
}

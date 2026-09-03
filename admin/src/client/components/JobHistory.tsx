// Read-only, append-only job history (spec R9 "Re-run Creates New Immutable
// Job Record": "History is append-only" — every run gets its own jobId,
// re-running never mutates or replaces a prior record). This component only
// ever renders whatever list it's given; it has no delete/edit affordance
// by construction, matching the immutability requirement at the UI layer.
//
// Presented as the `/design` canvas's compact history cards: a 2px status bar
// inset on the left, the kind in ink, the jobId in mono underneath. Tighter
// than the previous rows, and the status reads at a glance from the bar.
import type { JobRecord } from '../../shared/jobs';
import { jobStatusLabel, jobStatusTone, JOB_KIND_LABEL } from '../../shared/status-label';

export type JobHistoryProps = {
  jobs: JobRecord[];
  onSelect?: (jobId: string) => void;
};

type Tone = 'running' | 'done' | 'failed' | 'idle';

// Literal class strings only (Tailwind v4 scans source text).
const TEXT: Record<Tone, string> = {
  running: 'text-state-running',
  done: 'text-state-done',
  failed: 'text-state-failed',
  idle: 'text-state-idle',
};

const BAR: Record<Tone, string> = {
  running: 'bg-state-running',
  done: 'bg-state-done',
  failed: 'bg-state-failed',
  idle: 'bg-state-idle',
};

export default function JobHistory({ jobs, onSelect }: JobHistoryProps) {
  if (jobs.length === 0) {
    return <p className="px-1 text-xs text-ink-soft">Todavía no ejecutaste nada.</p>;
  }

  return (
    <ul className="flex flex-col gap-1.5">
      {jobs.map((job) => {
        const tone = jobStatusTone(job.status);
        return (
          <li key={job.jobId}>
            <button
              type="button"
              onClick={() => onSelect?.(job.jobId)}
              className="relative flex w-full items-start gap-2 overflow-hidden rounded-lg border border-hairline-soft bg-panel-soft py-1.5 pl-3 pr-2 text-left transition hover:border-hairline"
            >
              <span className={`absolute inset-y-0 left-0 w-[2px] ${BAR[tone]}`} aria-hidden="true" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-xs font-semibold text-ink">{JOB_KIND_LABEL[job.kind]}</span>
                <span className="truncate font-mono text-[10px] text-ink-faint">{job.jobId}</span>
              </span>
              <span className={`cap shrink-0 pt-0.5 ${TEXT[tone]}`}>{jobStatusLabel(job.status)}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

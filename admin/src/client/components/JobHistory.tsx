// Read-only, append-only job history (spec R9 "Re-run Creates New Immutable
// Job Record": "History is append-only" — every run gets its own jobId,
// re-running never mutates or replaces a prior record). This component only
// ever renders whatever list it's given; it has no delete/edit affordance
// by construction, matching the immutability requirement at the UI layer.
import type { JobRecord } from '../../shared/jobs';
import { jobStatusLabel, jobStatusTone, JOB_KIND_LABEL } from '../../shared/status-label';

export type JobHistoryProps = {
  jobs: JobRecord[];
  onSelect?: (jobId: string) => void;
};

function toneClass(tone: 'running' | 'done' | 'failed' | 'idle'): string {
  switch (tone) {
    case 'running':
      return 'text-state-running';
    case 'done':
      return 'text-state-done';
    case 'failed':
      return 'text-state-failed';
    case 'idle':
      return 'text-state-idle';
  }
}

export default function JobHistory({ jobs, onSelect }: JobHistoryProps) {
  if (jobs.length === 0) {
    return <p className="text-xs text-ink-soft">Todavía no ejecutaste nada.</p>;
  }

  return (
    <ul className="divide-y divide-hairline text-sm">
      {jobs.map((job) => (
        <li key={job.jobId}>
          <button
            type="button"
            onClick={() => onSelect?.(job.jobId)}
            className="flex w-full items-center justify-between py-1.5 text-left hover:bg-panel-soft"
          >
            <span>
              <span className="font-mono text-xs text-ink-soft">{job.jobId}</span>{' '}
              <span className="text-ink">{JOB_KIND_LABEL[job.kind]}</span>
            </span>
            <span className={`text-xs font-medium ${toneClass(jobStatusTone(job.status))}`}>
              {jobStatusLabel(job.status)}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

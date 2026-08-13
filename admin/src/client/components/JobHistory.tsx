// Read-only, append-only job history (spec R9 "Re-run Creates New Immutable
// Job Record": "History is append-only" — every run gets its own jobId,
// re-running never mutates or replaces a prior record). This component only
// ever renders whatever list it's given; it has no delete/edit affordance
// by construction, matching the immutability requirement at the UI layer.
import type { JobRecord } from '../../shared/jobs';

export type JobHistoryProps = {
  jobs: JobRecord[];
  onSelect?: (jobId: string) => void;
};

function statusClass(status: JobRecord['status']): string {
  switch (status) {
    case 'succeeded':
      return 'text-emerald-700';
    case 'failed':
    case 'timed-out':
      return 'text-red-700';
    case 'cancelled':
    case 'interrupted':
      return 'text-amber-700';
    default:
      return 'text-slate-600';
  }
}

export default function JobHistory({ jobs, onSelect }: JobHistoryProps) {
  if (jobs.length === 0) {
    return <p className="text-xs text-slate-400">No jobs run yet.</p>;
  }

  return (
    <ul className="divide-y divide-slate-100 text-sm">
      {jobs.map((job) => (
        <li key={job.jobId}>
          <button
            type="button"
            onClick={() => onSelect?.(job.jobId)}
            className="flex w-full items-center justify-between py-1.5 text-left hover:bg-slate-50"
          >
            <span>
              <span className="font-mono text-xs text-slate-500">{job.jobId}</span>{' '}
              <span className="text-slate-700">{job.kind}</span>
            </span>
            <span className={`text-xs font-medium ${statusClass(job.status)}`}>{job.status}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

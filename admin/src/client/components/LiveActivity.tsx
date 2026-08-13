// THE ONLY animating component in the app (design §6, spec R8 "Honest UI").
// `evidence` is a REQUIRED `RunningEvidence` — the only way to construct one
// is `runningEvidence(job)` (admin/src/shared/running-evidence.ts), which
// returns non-null ONLY for a job with status 'running' AND a real pid AND
// a stage genuinely marked 'running'. There is no path to render this
// component "optimistically" — callers must have already proven a live
// child process exists.
import type { RunningEvidence } from '../../shared/running-evidence';

export type LiveActivityProps = {
  evidence: RunningEvidence;
};

export default function LiveActivity({ evidence }: LiveActivityProps) {
  return (
    <div className="flex items-center gap-2 text-sm text-emerald-700" role="status">
      <span className="relative flex h-2.5 w-2.5" aria-hidden="true">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
      </span>
      <span>
        running: <span className="font-medium">{evidence.stage}</span>{' '}
        <span className="text-xs text-emerald-600">(pid {evidence.pid}, job {evidence.jobId})</span>
      </span>
    </div>
  );
}

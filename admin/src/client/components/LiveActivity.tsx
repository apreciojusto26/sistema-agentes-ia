// THE ONLY animating component in the app (design §6, spec R8 "Honest UI").
// `evidence` is a REQUIRED `RunningEvidence` — the only way to construct one
// is `runningEvidence(job)` (admin/src/shared/running-evidence.ts), which
// returns non-null ONLY for a job with status 'running' AND a real pid AND
// a stage genuinely marked 'running'. There is no path to render this
// component "optimistically" — callers must have already proven a live
// child process exists.
import type { RunningEvidence } from '../../shared/running-evidence';
import { stageLabel } from '../../shared/stage-label';

export type LiveActivityProps = {
  evidence: RunningEvidence;
  /** Renders against the dark sidebar surface instead of the default light panel. Literal class pairs only — never interpolate `text-state-running${suffix}` (Oxide scans source text statically). */
  onDark?: boolean;
};

// pid/jobId are intentionally NOT rendered here (remediation C1/W1): they are
// technical details and belong only inside a `<details>Detalles
// técnicos</details>` block. AgentRunPanel already surfaces both (job.jobId
// in the status line above its <details>, job.pid in the <dl> inside it) —
// this component's job is only the honest live-status line, in Spanish.
export default function LiveActivity({ evidence, onDark = false }: LiveActivityProps) {
  const dotClass = onDark ? 'bg-state-running-on-dark' : 'bg-state-running';
  const textClass = onDark ? 'text-state-running-on-dark' : 'text-state-running';

  return (
    <div className={`flex items-center gap-2 text-sm ${textClass} ${onDark ? 'italic' : ''}`} role="status">
      <span className="relative flex h-2.5 w-2.5" aria-hidden="true">
        <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${dotClass}`} />
        <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${dotClass}`} />
      </span>
      <span>
        trabajando en: <span className="font-medium">{stageLabel(evidence.stage)}</span>
      </span>
    </div>
  );
}

// The anti-fake-spinner primitive (spec R8 "Honest UI"; design §6). The
// ONLY animating component in the app (`LiveActivity`, Batch F) takes a
// REQUIRED `evidence: RunningEvidence` prop, and `runningEvidence()` is the
// SOLE constructor of that type anywhere in the codebase — no other module
// may build a `RunningEvidence` object literal. So an animation cannot be
// rendered without an object that provably originated from a live child
// process with a real pid and a real currently-running stage.
import type { JobRecord } from './jobs';

export type RunningEvidence = {
  jobId: string;
  pid: number;
  stage: string;
  startedAt: string;
};

export function runningEvidence(job: JobRecord): RunningEvidence | null {
  if (job.status !== 'running' || job.pid === null) return null;

  const stage = job.stages.find((s) => s.status === 'running');
  if (!stage) return null;

  return { jobId: job.jobId, pid: job.pid, stage: stage.stage, startedAt: stage.startedAt };
}

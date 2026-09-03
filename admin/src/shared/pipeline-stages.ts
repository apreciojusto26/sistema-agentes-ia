// The stage sequence, in the ONE place both sides may import it.
//
// WHY IT IS NOT IN server/pipeline.ts ANY MORE. The client needs this list as a
// VALUE, not a type: the agent rail derives its idle state from it so the empty
// dashboard cannot advertise a step no run produces. Importing it from
// server/pipeline.ts to get that made Vite pull the orchestrator — and with it
// node:fs and node:child_process — into the browser bundle, which fails the
// build outright. A shared constant is the honest fix; re-exporting it from a
// module full of server runtime is not.
//
// src/shared/ is exactly this repo's existing seam for client/server contracts
// (see jobs.ts, api.ts, content-stage.ts). This belongs with them.
//
// `design` IS DELIBERATELY ABSENT — see the note on PIPELINE_STAGES's re-export
// in server/pipeline.ts for why the Design Agent stage was removed rather than
// defaulted, and admin/test/contract.design-bypass.test.ts for the proof.
export const PIPELINE_STAGES = [
  'scrape',
  'normalize',
  'content',
  'assets',
  'generate',
  'build',
  'validate',
] as const;

export type PipelineStageName = (typeof PIPELINE_STAGES)[number];

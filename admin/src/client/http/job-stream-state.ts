// Pure, DOM-free frame-parsing/reducer core for useJobStream (F3/F4; design
// §3). Kept separate from the hook itself so the "SSE hook's
// reconnection/event-parsing logic" is testable with plain objects — no
// EventSource, no React, no DOM (see job-stream-state.test.ts).
//
// Load-bearing gotcha this module exists to fix: registry.ts (#createJob /
// #start / #onChildExit, verified against the real Batch E source) only
// re-publishes a full `job` snapshot on job-status/result/error changes, NOT
// on every stage transition. A `stage` frame's `job.stages` therefore only
// ever reflects the LAST snapshot's shape unless the client folds live
// `stage` frames in itself — otherwise `runningEvidence(job)` would find no
// entry with status 'running' for almost the entire life of a job, and
// LiveActivity (the one animating component, spec R8) would never render
// despite a real child process genuinely running. `applyStageFrame` closes
// that gap using only data the real child process emitted.
import type { JobRecord, StageProgress } from '../../shared/jobs';
import type { SseFrame, SseStageFrame } from '../../shared/api';

export type ConnectionState = 'connecting' | 'open' | 'closed';

export type JobStreamState = {
  job: JobRecord | null;
  logs: Extract<SseFrame, { type: 'log' }>[];
  connection: ConnectionState;
  /** Set once an `end` or `overflow` frame is received — the stream is over for this connection. */
  ended: boolean;
  overflowDropped: number | null;
};

export const initialJobStreamState: JobStreamState = {
  job: null,
  logs: [],
  connection: 'connecting',
  ended: false,
  overflowDropped: null,
};

export type JobStreamEvent =
  | { kind: 'connecting' }
  | { kind: 'open' }
  | { kind: 'frame'; frame: SseFrame }
  | { kind: 'closed' };

/**
 * Merges a live `stage` SSE frame into a JobRecord's `stages` array, mirroring
 * (not re-implementing) the shape registry.ts's `applyEventToJob` builds
 * server-side. Never fabricates `ms`/`warnings` beyond carrying forward
 * whatever was already known for that stage.
 */
export function applyStageFrame(job: JobRecord, frame: SseStageFrame): JobRecord {
  const idx = job.stages.findIndex((s) => s.stage === frame.stage);
  const prev = idx >= 0 ? job.stages[idx] : null;

  const next: StageProgress = {
    stage: frame.stage,
    status: frame.status,
    startedAt: prev?.startedAt ?? frame.ts,
    endedAt: frame.status === 'running' ? null : frame.ts,
    ms: prev?.ms ?? null,
    progress: frame.progress,
    warnings: prev?.warnings ?? [],
  };

  const stages = prev ? job.stages.map((s, i) => (i === idx ? next : s)) : [...job.stages, next];
  return { ...job, stages };
}

function applyFrame(state: JobStreamState, frame: SseFrame): JobStreamState {
  switch (frame.type) {
    case 'job':
      return { ...state, job: frame.job };
    case 'log': {
      // Reconnect replay (design §3, judgment call #3) resends from the
      // start of log.ndjson whenever this connection never saw an
      // `id:` line to carry as Last-Event-ID — including the common case
      // where the previous connection was torn down (dev StrictMode's
      // synthetic double-invoke of the mount effect, or a genuine early
      // network drop) after already having dispatched some frames into
      // this same reducer's state. `seq` is a gapless per-job monotonic
      // counter, so a replayed frame's seq is always <= the last one
      // already recorded; skip it instead of duplicating the log line.
      const lastSeq = state.logs.at(-1)?.seq ?? -1;
      if (frame.seq <= lastSeq) return state;
      return { ...state, logs: [...state.logs, frame] };
    }
    case 'stage':
      return state.job ? { ...state, job: applyStageFrame(state.job, frame) } : state;
    case 'end':
      return {
        ...state,
        ended: true,
        connection: 'closed',
        job: state.job ? { ...state.job, status: frame.status, exitCode: frame.exitCode } : state.job,
      };
    case 'overflow':
      return { ...state, overflowDropped: frame.dropped, ended: true, connection: 'closed' };
    /* istanbul ignore next -- SseFrame is exhaustively typed; kept for runtime safety against wire drift */
    default:
      return state;
  }
}

export function jobStreamReducer(state: JobStreamState, event: JobStreamEvent): JobStreamState {
  switch (event.kind) {
    case 'connecting':
      // A stream that has already ended (terminal `end`/`overflow`) must not
      // be flipped back to 'connecting' by a stray native 'error' event
      // firing after we've already closed our side.
      return state.ended ? state : { ...state, connection: 'connecting' };
    case 'open':
      return state.ended ? state : { ...state, connection: 'open' };
    case 'closed':
      return { ...state, connection: 'closed' };
    case 'frame':
      return applyFrame(state, event.frame);
    default:
      return state;
  }
}

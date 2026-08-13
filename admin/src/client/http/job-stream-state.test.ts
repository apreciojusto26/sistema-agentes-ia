// RED-before-GREEN for the pure half of the SSE client (design §3; task F3).
// No DOM, no EventSource, no React — exercises jobStreamReducer/applyStageFrame
// directly with plain SseFrame objects shaped exactly like the real wire
// format routes/events.ts (Batch E) produces.
import { describe, it, expect } from 'vitest';
import {
  applyStageFrame,
  initialJobStreamState,
  jobStreamReducer,
  type JobStreamState,
} from './job-stream-state';
import type { JobRecord } from '../../shared/jobs';
import type { SseEndFrame, SseJobFrame, SseLogFrame, SseOverflowFrame, SseStageFrame } from '../../shared/api';

function makeJob(overrides: Partial<JobRecord> = {}): JobRecord {
  return {
    schema: 1,
    jobId: 'job-1',
    kind: 'scrape',
    status: 'running',
    params: { url: 'https://es.aliexpress.com/item/1005007502111078.html', itemId: '1005007502111078', normalizedUrl: 'https://es.aliexpress.com/item/1005007502111078.html' },
    argv: ['node', 'scrape.js'],
    cwd: '/repo/scraper',
    pid: 4242,
    createdAt: '2026-08-13T00:00:00.000Z',
    startedAt: '2026-08-13T00:00:00.000Z',
    finishedAt: null,
    exitCode: null,
    signal: null,
    stages: [],
    result: null,
    error: null,
    eventSchemaVersion: 1,
    malformedEventCount: 0,
    eventGaps: [],
    lastSeq: 0,
    logPath: '.jobs/job-1/log.ndjson',
    archivePath: null,
    archiveError: null,
    ...overrides,
  };
}

describe('applyStageFrame', () => {
  it('appends a new StageProgress entry for a stage never seen before', () => {
    const job = makeJob();
    const frame: SseStageFrame = { type: 'stage', seq: 2, ts: '2026-08-13T00:00:01.000Z', stage: 'gallery', status: 'running', progress: null };

    const next = applyStageFrame(job, frame);

    expect(next.stages).toHaveLength(1);
    expect(next.stages[0]).toMatchObject({ stage: 'gallery', status: 'running', startedAt: frame.ts, endedAt: null });
    // Original job object must not be mutated (React state must see a new reference).
    expect(job.stages).toHaveLength(0);
  });

  it('updates the existing entry in place (by stage name) on a done/failed transition, preserving startedAt', () => {
    const job = makeJob({
      stages: [{ stage: 'gallery', status: 'running', startedAt: '2026-08-13T00:00:01.000Z', endedAt: null, ms: null, progress: null, warnings: [] }],
    });
    const frame: SseStageFrame = { type: 'stage', seq: 3, ts: '2026-08-13T00:00:02.000Z', stage: 'gallery', status: 'done', progress: null };

    const next = applyStageFrame(job, frame);

    expect(next.stages).toHaveLength(1);
    expect(next.stages[0]).toMatchObject({ stage: 'gallery', status: 'done', startedAt: '2026-08-13T00:00:01.000Z', endedAt: frame.ts });
  });

  it('carries progress data through onto the merged StageProgress entry', () => {
    const job = makeJob();
    const frame: SseStageFrame = { type: 'stage', seq: 2, ts: '2026-08-13T00:00:01.000Z', stage: 'images', status: 'running', progress: { done: 3, total: 8 } };

    const next = applyStageFrame(job, frame);

    expect(next.stages[0].progress).toEqual({ done: 3, total: 8 });
  });
});

describe('jobStreamReducer — connection lifecycle', () => {
  it('transitions connecting -> open on an "open" event', () => {
    const s1 = jobStreamReducer(initialJobStreamState, { kind: 'connecting' });
    const s2 = jobStreamReducer(s1, { kind: 'open' });
    expect(s2.connection).toBe('open');
  });

  it('a native reconnect ("connecting" event) does not reopen a stream that already ended', () => {
    const ended: JobStreamState = { ...initialJobStreamState, ended: true, connection: 'closed' };
    const next = jobStreamReducer(ended, { kind: 'connecting' });
    expect(next.connection).toBe('closed');
    expect(next.ended).toBe(true);
  });
});

describe('jobStreamReducer — frame handling', () => {
  it('a "job" frame replaces the job snapshot wholesale', () => {
    const job = makeJob();
    const frame: SseJobFrame = { type: 'job', job };
    const next = jobStreamReducer(initialJobStreamState, { kind: 'frame', frame });
    expect(next.job).toEqual(job);
  });

  it('a "log" frame appends to logs, preserving arrival order', () => {
    const l1: SseLogFrame = { type: 'log', seq: 1, ts: 't1', ch: 'stdout', line: 'a' };
    const l2: SseLogFrame = { type: 'log', seq: 2, ts: 't2', ch: 'stdout', line: 'b' };
    let state = jobStreamReducer(initialJobStreamState, { kind: 'frame', frame: l1 });
    state = jobStreamReducer(state, { kind: 'frame', frame: l2 });
    expect(state.logs.map((l) => l.line)).toEqual(['a', 'b']);
  });

  it('a "log" frame with a seq already present in state is dropped, not re-appended (replay-after-reconnect must not duplicate)', () => {
    const l1: SseLogFrame = { type: 'log', seq: 1, ts: 't1', ch: 'stdout', line: 'a' };
    const l2: SseLogFrame = { type: 'log', seq: 2, ts: 't2', ch: 'stdout', line: 'b' };
    let state = jobStreamReducer(initialJobStreamState, { kind: 'frame', frame: l1 });
    state = jobStreamReducer(state, { kind: 'frame', frame: l2 });

    // A reconnect replays from the start of log.ndjson (no Last-Event-ID yet
    // seen by this connection) — l1 and l2 arrive again, verbatim.
    state = jobStreamReducer(state, { kind: 'frame', frame: l1 });
    state = jobStreamReducer(state, { kind: 'frame', frame: l2 });

    expect(state.logs.map((l) => l.seq)).toEqual([1, 2]);
  });

  it('a "stage" frame before any "job" frame is a safe no-op (no job to merge into)', () => {
    const frame: SseStageFrame = { type: 'stage', seq: 1, ts: 't1', stage: 'open', status: 'running', progress: null };
    const next = jobStreamReducer(initialJobStreamState, { kind: 'frame', frame });
    expect(next.job).toBeNull();
  });

  it('a "stage" frame after a "job" frame merges into that job\'s stages', () => {
    const job = makeJob();
    let state = jobStreamReducer(initialJobStreamState, { kind: 'frame', frame: { type: 'job', job } });
    const stageFrame: SseStageFrame = { type: 'stage', seq: 5, ts: 't5', stage: 'gallery', status: 'running', progress: null };
    state = jobStreamReducer(state, { kind: 'frame', frame: stageFrame });
    expect(state.job?.stages).toHaveLength(1);
    expect(state.job?.stages[0].stage).toBe('gallery');
  });

  it('an "end" frame marks the stream ended, closes the connection, and updates job status/exitCode', () => {
    const job = makeJob();
    let state = jobStreamReducer(initialJobStreamState, { kind: 'frame', frame: { type: 'job', job } });
    const endFrame: SseEndFrame = { type: 'end', status: 'succeeded', exitCode: 0 };
    state = jobStreamReducer(state, { kind: 'frame', frame: endFrame });
    expect(state.ended).toBe(true);
    expect(state.connection).toBe('closed');
    expect(state.job?.status).toBe('succeeded');
    expect(state.job?.exitCode).toBe(0);
  });

  it('an "overflow" frame records the drop count and ends the stream honestly (never silent truncation)', () => {
    const overflowFrame: SseOverflowFrame = { type: 'overflow', dropped: 1001 };
    const state = jobStreamReducer(initialJobStreamState, { kind: 'frame', frame: overflowFrame });
    expect(state.overflowDropped).toBe(1001);
    expect(state.ended).toBe(true);
    expect(state.connection).toBe('closed');
  });
});

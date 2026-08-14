// assistedSummary() precedence matrix (design addendum §3/§6).
import { describe, it, expect } from 'vitest';
import { assistedSummary } from '../src/client/components/assisted-summary';
import type { JobRecord } from '../src/shared/jobs';
import type { ContentStageState } from '../src/shared/content-stage';

function fakeJob(overrides: Partial<JobRecord> = {}): JobRecord {
  return {
    schema: 1,
    jobId: 'zz-fake-content-job',
    kind: 'content',
    status: 'running',
    params: { scrapeJobId: 'x', scrapeProductPath: '/x', instructionsPath: null, model: 'gemini-2.5-flash' },
    argv: [],
    cwd: '/repo',
    pid: 123,
    createdAt: 't0',
    startedAt: 't0',
    finishedAt: null,
    exitCode: null,
    signal: null,
    stages: [],
    result: null,
    error: null,
    eventSchemaVersion: null,
    malformedEventCount: 0,
    eventGaps: [],
    lastSeq: 0,
    logPath: '.jobs/zz-fake-content-job/log.ndjson',
    archivePath: null,
    archiveError: null,
    ...overrides,
  };
}

const IDLE: ContentStageState = { kind: 'idle' };
const VALIDATED: ContentStageState = {
  kind: 'validated',
  path: '/x',
  sha256: 'abc',
  bytes: 10,
  savedAt: 't0',
  summary: { productFields: 5, faqCount: 2, testimonialCount: 2, hasDesign: false },
};
const INVALID: ContentStageState = { kind: 'invalid', raw: '{}', issues: [{ code: 'x', path: 'product', message: 'x' }] };

describe('assistedSummary (rule precedence, design addendum §3)', () => {
  it('rule 1: a running job always wins, tone=running, showTurnChip=false, even if state is idle', () => {
    const summary = assistedSummary(fakeJob({ status: 'running' }), IDLE);
    expect(summary.tone).toBe('running');
    expect(summary.showTurnChip).toBe(false);
  });

  it('rule 1: a queued job -> tone=idle, showTurnChip=false, even if state is validated', () => {
    const summary = assistedSummary(fakeJob({ status: 'queued' }), VALIDATED);
    expect(summary.tone).toBe('idle');
    expect(summary.showTurnChip).toBe(false);
  });

  it('rule 2: failed job + validated state -> "falló · hay textos guardados", tone=failed, showTurnChip=false', () => {
    const summary = assistedSummary(fakeJob({ status: 'failed' }), VALIDATED);
    expect(summary.text).toBe('falló · hay textos guardados');
    expect(summary.tone).toBe('failed');
    expect(summary.showTurnChip).toBe(false);
  });

  it('rule 2: timed-out job + validated state also produces the combined message', () => {
    const summary = assistedSummary(fakeJob({ status: 'timed-out' }), VALIDATED);
    expect(summary.text).toBe('falló · hay textos guardados');
  });

  it('rule 3: failed job + nothing validated -> "falló", tone=failed, showTurnChip=true', () => {
    const summary = assistedSummary(fakeJob({ status: 'failed' }), IDLE);
    expect(summary.text).toBe('falló');
    expect(summary.tone).toBe('failed');
    expect(summary.showTurnChip).toBe(true);
  });

  it('rule 4: no job at all -> falls back to contentStageLabelShort(state), tone=idle for non-validated', () => {
    const summary = assistedSummary(null, IDLE);
    expect(summary.text).toBe('te toca a vos');
    expect(summary.tone).toBe('idle');
    expect(summary.showTurnChip).toBe(true);
  });

  it('rule 4: no job, state validated -> tone=done, showTurnChip=false', () => {
    const summary = assistedSummary(null, VALIDATED);
    expect(summary.tone).toBe('done');
    expect(summary.showTurnChip).toBe(false);
  });

  it('rule 4: a succeeded job falls through to state-derived text (not a running/failed special case)', () => {
    const summary = assistedSummary(fakeJob({ status: 'succeeded' }), INVALID);
    expect(summary.tone).toBe('idle');
    expect(summary.showTurnChip).toBe(true);
    expect(summary.text).toBe('1 error');
  });
});

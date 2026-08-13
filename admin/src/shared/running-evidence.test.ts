// RED-before-GREEN for runningEvidence() (spec R8 "Honest UI"; design §6
// layer 2: "the only animating component in the app requires proof of a
// live process"). Written before running-evidence.ts exists.
//
// This is Group G referenced in tasks/design: runningEvidence() must return
// null for every JobStatus except 'running' with a non-null pid AND an open
// (status 'running') stage.
import { describe, test, expect } from 'vitest';
import { runningEvidence } from './running-evidence';
import type { JobRecord, JobStatus, StageProgress } from './jobs';

const ALL_STATUSES: JobStatus[] = [
  'queued',
  'running',
  'succeeded',
  'failed',
  'cancelled',
  'timed-out',
  'interrupted',
];

function baseJob(overrides: Partial<JobRecord> = {}): JobRecord {
  return {
    schema: 1,
    jobId: 'job-1',
    kind: 'scrape',
    status: 'running',
    params: { url: 'https://es.aliexpress.com/item/1005007502111078.html', itemId: '1005007502111078', normalizedUrl: 'https://es.aliexpress.com/item/1005007502111078.html' },
    argv: ['scrape.js', 'https://es.aliexpress.com/item/1005007502111078.html'],
    cwd: '/repo/scraper',
    pid: 4242,
    createdAt: '2026-08-13T00:00:00.000Z',
    startedAt: '2026-08-13T00:00:00.100Z',
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

const runningStage: StageProgress = {
  stage: 'gallery',
  status: 'running',
  startedAt: '2026-08-13T00:00:01.000Z',
  endedAt: null,
  ms: null,
  progress: null,
  warnings: [],
};

const doneStage: StageProgress = {
  stage: 'open',
  status: 'done',
  startedAt: '2026-08-13T00:00:00.500Z',
  endedAt: '2026-08-13T00:00:00.900Z',
  ms: 400,
  progress: null,
  warnings: [],
};

describe('runningEvidence', () => {
  test('returns null for every JobStatus other than "running"', () => {
    for (const status of ALL_STATUSES) {
      if (status === 'running') continue;
      const job = baseJob({ status, stages: [runningStage] });
      expect(runningEvidence(job)).toBeNull();
    }
  });

  test('returns null when status is "running" but pid is null (never reattached, per restart recovery)', () => {
    const job = baseJob({ status: 'running', pid: null, stages: [runningStage] });
    expect(runningEvidence(job)).toBeNull();
  });

  test('returns null when status is "running" but no stage is currently "running"', () => {
    const job = baseJob({ status: 'running', stages: [doneStage] });
    expect(runningEvidence(job)).toBeNull();
  });

  test('returns null when status is "running" and stages is empty', () => {
    const job = baseJob({ status: 'running', stages: [] });
    expect(runningEvidence(job)).toBeNull();
  });

  test('returns real evidence when status is "running", pid is set, and a stage is "running"', () => {
    const job = baseJob({ status: 'running', pid: 4242, stages: [doneStage, runningStage] });
    const evidence = runningEvidence(job);
    expect(evidence).toEqual({
      jobId: 'job-1',
      pid: 4242,
      stage: 'gallery',
      startedAt: '2026-08-13T00:00:01.000Z',
    });
  });
});

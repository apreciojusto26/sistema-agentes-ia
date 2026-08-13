// RED-before-GREEN for store.ts (design §2 "On-disk mirror"). Written before
// store.ts exists.
//
// Uses the REAL admin/.jobs/ dir (gitignored, per A2) with reserved `zz-`
// test job ids, self-cleaning in beforeEach/afterEach — same pattern design
// §10 judgment call #1 established for the generate-landing contract test:
// JOBS_DIR has no env-override story of its own yet (config.ts hardcodes
// it), so a temp-dir injection would need machinery this module doesn't
// otherwise need.
import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { rmSync, existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { JOBS_DIR } from '../config';
import type { JobRecord } from '../../shared/jobs';

const TEST_JOB_ID = 'zz-test-store-job';
const TEST_JOB_DIR = path.join(JOBS_DIR, TEST_JOB_ID);

function cleanup() {
  rmSync(TEST_JOB_DIR, { recursive: true, force: true });
}

beforeEach(cleanup);
afterEach(cleanup);

function fixtureJob(overrides: Partial<JobRecord> = {}): JobRecord {
  return {
    schema: 1,
    jobId: TEST_JOB_ID,
    kind: 'generate',
    status: 'running',
    params: { slug: 'x', contentPath: '/a/b.json', imagesDir: null, force: false },
    argv: ['scripts/generate-landing.mjs', '--slug', 'x'],
    cwd: '/repo',
    pid: 1234,
    createdAt: '2026-08-13T00:00:00.000Z',
    startedAt: '2026-08-13T00:00:00.100Z',
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
    logPath: `.jobs/${TEST_JOB_ID}/log.ndjson`,
    archivePath: null,
    archiveError: null,
    ...overrides,
  };
}

describe('store', () => {
  test('jobDir/jobJsonPath/logNdjsonPath resolve under JOBS_DIR', async () => {
    const { jobDir, jobJsonPath, logNdjsonPath } = await import('./store');
    expect(jobDir(TEST_JOB_ID)).toBe(TEST_JOB_DIR);
    expect(jobJsonPath(TEST_JOB_ID)).toBe(path.join(TEST_JOB_DIR, 'job.json'));
    expect(logNdjsonPath(TEST_JOB_ID)).toBe(path.join(TEST_JOB_DIR, 'log.ndjson'));
  });

  test('writeJobRecord writes job.json atomically (no .tmp left behind) and it is readable JSON', async () => {
    const { writeJobRecord, jobJsonPath } = await import('./store');
    writeJobRecord(fixtureJob());
    const target = jobJsonPath(TEST_JOB_ID);
    expect(existsSync(target)).toBe(true);
    expect(existsSync(`${target}.tmp`)).toBe(false);
    const parsed = JSON.parse(readFileSync(target, 'utf8'));
    expect(parsed.jobId).toBe(TEST_JOB_ID);
    expect(parsed.status).toBe('running');
  });

  test('writeJobRecord can be called repeatedly, always leaving valid JSON (simulates the 250ms debounce rewrite)', async () => {
    const { writeJobRecord, jobJsonPath } = await import('./store');
    writeJobRecord(fixtureJob({ status: 'running' }));
    writeJobRecord(fixtureJob({ status: 'succeeded', finishedAt: '2026-08-13T00:01:00.000Z' }));
    const parsed = JSON.parse(readFileSync(jobJsonPath(TEST_JOB_ID), 'utf8'));
    expect(parsed.status).toBe('succeeded');
  });

  test('readJobRecord returns ok:true with the parsed record for a well-formed job.json', async () => {
    const { writeJobRecord, readJobRecord } = await import('./store');
    writeJobRecord(fixtureJob());
    const result = readJobRecord(TEST_JOB_ID);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.job.jobId).toBe(TEST_JOB_ID);
  });

  test('readJobRecord returns ok:false (never throws) for a missing job.json', async () => {
    const { readJobRecord } = await import('./store');
    const result = readJobRecord('zz-test-store-job-does-not-exist');
    expect(result.ok).toBe(false);
  });

  test('readJobRecord returns ok:false (never throws) for a corrupt job.json', async () => {
    const { readJobRecord, jobDir, jobJsonPath } = await import('./store');
    mkdirSync(jobDir(TEST_JOB_ID), { recursive: true });
    writeFileSync(jobJsonPath(TEST_JOB_ID), '{ this is not valid json');
    const result = readJobRecord(TEST_JOB_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBeTruthy();
  });

  test('listJobIds includes a freshly written job id', async () => {
    const { writeJobRecord, listJobIds } = await import('./store');
    writeJobRecord(fixtureJob());
    expect(listJobIds()).toContain(TEST_JOB_ID);
  });

  test('appendLogLine appends NDJSON lines in order', async () => {
    const { appendLogLine, logNdjsonPath } = await import('./store');
    appendLogLine(TEST_JOB_ID, { seq: 1, ch: 'meta', kind: 'created' });
    appendLogLine(TEST_JOB_ID, { seq: 2, ch: 'stdout', line: 'hello' });
    const raw = readFileSync(logNdjsonPath(TEST_JOB_ID), 'utf8');
    const lines = raw.trim().split('\n').map((l) => JSON.parse(l));
    expect(lines).toHaveLength(2);
    expect(lines[0].seq).toBe(1);
    expect(lines[1].seq).toBe(2);
  });

  test('openLogStream returns a writable append-mode stream that coexists with appendLogLine', async () => {
    const { openLogStream, logNdjsonPath, appendLogLine } = await import('./store');
    appendLogLine(TEST_JOB_ID, { seq: 1, ch: 'meta', kind: 'created' });
    const stream = openLogStream(TEST_JOB_ID);
    await new Promise<void>((resolve, reject) => {
      stream.write(JSON.stringify({ seq: 2, ch: 'stdout', line: 'x' }) + '\n', (err) =>
        err ? reject(err) : resolve(),
      );
    });
    await new Promise<void>((resolve) => stream.end(resolve));
    const raw = readFileSync(logNdjsonPath(TEST_JOB_ID), 'utf8');
    expect(raw.trim().split('\n')).toHaveLength(2);
  });
});

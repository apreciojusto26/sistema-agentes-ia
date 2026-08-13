// Regression coverage for a real bug found during Batch H manual browser QA:
// requestJson() unconditionally sent `Content-Type: application/json`, even
// on bodyless requests (cancelJob's POST, deleteStagedContent's DELETE).
// Fastify's default JSON body parser rejects an empty body sent with that
// content-type (FST_ERR_CTP_EMPTY_JSON_BODY) — a real browser fetch() hits
// this; the route-level tests in routes/jobs.test.ts never caught it because
// Fastify's `app.inject()` doesn't set a Content-Type header unless told to,
// so it never replicated what a real client actually sends.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cancelJob, validateContent, deleteStagedContent } from './client';

function stubFetch(responseBody: unknown, status = 200) {
  const fetchMock = vi.fn(async (_input: string, _init: RequestInit) => ({
    ok: status >= 200 && status < 300,
    status,
    statusText: 'OK',
    text: async () => JSON.stringify(responseBody),
  }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('requestJson header behavior', () => {
  it('a bodyless POST (cancelJob) sends no Content-Type header', async () => {
    const fetchMock = stubFetch({ ok: true, status: 'cancelled' });

    await cancelJob('job-1');

    const [, init] = fetchMock.mock.calls[0] ;
    expect(init.headers).toBeUndefined();
  });

  it('a bodyless DELETE (deleteStagedContent) sends no Content-Type header', async () => {
    const fetchMock = stubFetch({ ok: true });

    await deleteStagedContent();

    const [, init] = fetchMock.mock.calls[0] ;
    expect(init.headers).toBeUndefined();
  });

  it('a POST with a real JSON body (validateContent) still sends Content-Type: application/json', async () => {
    const fetchMock = stubFetch({ ok: true, summary: {} });

    await validateContent({ raw: '{}' });

    const [, init] = fetchMock.mock.calls[0] ;
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
  });
});

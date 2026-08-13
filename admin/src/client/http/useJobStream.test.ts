// RED-before-GREEN for the React-facing half of the SSE client (design §3;
// task F3/F4). Uses a minimal hand-rolled EventSource mock — NOT a full
// polyfill, only the surface useJobStream.ts actually touches — driven
// through React via `act` + `createRoot` (no @testing-library/react: design
// §8 lists no such devDependency, and this repo's own precedent
// (content/landing-base) has no component-rendering harness either; the
// task list itself only calls for hook-logic tests here, not visual
// component tests, which Batch H's manual QA covers instead).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createElement } from 'react';
import { useJobStream } from './useJobStream';
import type { JobStreamState } from './job-stream-state';

type Listener = (evt: { data?: string }) => void;

/**
 * Deliberately minimal: constructor + addEventListener/removeEventListener +
 * close() + readyState + the three ready-state constants. This mock does NOT
 * attempt to reimplement native `Last-Event-ID` propagation — that is a
 * genuinely browser-internal mechanism (the browser tracks the last `id:` it
 * saw per live connection and resends it automatically on ITS OWN internal
 * reconnect; JS has no header-setting API on EventSource at all). What we DO
 * assert here is the load-bearing client-side half of that contract: on a
 * bare native 'error' (the browser retrying the SAME connection), the hook
 * must NOT construct a second EventSource — doing so would start a fresh
 * connection with no Last-Event-ID and defeat replay-on-reconnect (design
 * §3's whole reason for choosing Last-Event-ID replay over "resume from
 * current state").
 */
class MockEventSource {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;
  static instances: MockEventSource[] = [];

  readyState = MockEventSource.CONNECTING;
  closed = false;
  url: string;
  #listeners = new Map<string, Set<Listener>>();

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  addEventListener(name: string, cb: Listener): void {
    if (!this.#listeners.has(name)) this.#listeners.set(name, new Set());
    this.#listeners.get(name)!.add(cb);
  }

  removeEventListener(name: string, cb: Listener): void {
    this.#listeners.get(name)?.delete(cb);
  }

  close(): void {
    this.closed = true;
    this.readyState = MockEventSource.CLOSED;
  }

  // ---- test-only helpers, mirroring what a real server/browser would fire ----
  emitOpen(): void {
    this.readyState = MockEventSource.OPEN;
    this.#dispatch('open', {});
  }

  emitFrame(eventName: string, data: unknown): void {
    this.#dispatch(eventName, { data: JSON.stringify(data) });
  }

  /** Simulates the browser's OWN internal reconnect attempt on the SAME instance (no new EventSource is ever constructed for this). */
  emitNativeReconnectError(): void {
    this.readyState = MockEventSource.CONNECTING;
    this.#dispatch('error', {});
  }

  #dispatch(name: string, evt: { data?: string }): void {
    for (const cb of this.#listeners.get(name) ?? []) cb(evt);
  }
}

function renderHook<T>(fn: () => T): { result: { current: T }; unmount: () => void; rerender: () => void } {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  const result = { current: undefined as unknown as T };

  function Harness(): null {
    result.current = fn();
    return null;
  }

  act(() => {
    root.render(createElement(Harness));
  });

  return {
    result,
    rerender: () => {
      act(() => {
        root.render(createElement(Harness));
      });
    },
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe('useJobStream', () => {
  beforeEach(() => {
    MockEventSource.instances = [];
    vi.stubGlobal('EventSource', MockEventSource);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('opens exactly one EventSource against /api/jobs/:id/events for the given jobId', () => {
    const { unmount } = renderHook(() => useJobStream('job-1'));
    expect(MockEventSource.instances).toHaveLength(1);
    expect(MockEventSource.instances[0].url).toBe('/api/jobs/job-1/events');
    unmount();
  });

  it('parses job/log/stage/end frames into state, in arrival order', () => {
    const { result, unmount } = renderHook(() => useJobStream('job-1'));
    const es = MockEventSource.instances[0];

    act(() => {
      es.emitOpen();
      es.emitFrame('job', {
        type: 'job',
        job: {
          schema: 1, jobId: 'job-1', kind: 'scrape', status: 'running',
          params: { url: 'https://es.aliexpress.com/item/1.html', itemId: '1', normalizedUrl: 'https://es.aliexpress.com/item/1.html' },
          argv: [], cwd: '/x', pid: 99, createdAt: 't0', startedAt: 't0', finishedAt: null,
          exitCode: null, signal: null, stages: [], result: null, error: null,
          eventSchemaVersion: 1, malformedEventCount: 0, eventGaps: [], lastSeq: 1,
          logPath: '.jobs/job-1/log.ndjson', archivePath: null, archiveError: null,
        },
      });
      es.emitFrame('stage', { type: 'stage', seq: 2, ts: 't1', stage: 'open', status: 'running', progress: null });
      es.emitFrame('log', { type: 'log', seq: 3, ts: 't2', ch: 'stdout', line: 'hello' });
    });

    const state: JobStreamState = result.current;
    expect(state.connection).toBe('open');
    expect(state.job?.pid).toBe(99);
    expect(state.job?.stages[0]).toMatchObject({ stage: 'open', status: 'running' });
    expect(state.logs.map((l) => l.line)).toEqual(['hello']);
    unmount();
  });

  it('ignores unrecognized/ping-style events with no registered frame handler (no crash, no state change)', () => {
    const { result, unmount } = renderHook(() => useJobStream('job-1'));
    const es = MockEventSource.instances[0];
    const before = result.current;

    act(() => {
      // 'ping' has no addEventListener registered by the hook at all — the
      // native EventSource contract is that unhandled named events are
      // silently dropped, never delivered as generic 'message'. We simulate
      // that exact absence here by dispatching directly through the mock's
      // internal map rather than a public emit* helper for 'ping'.
      es.emitFrame('ping', {});
    });

    expect(result.current).toEqual(before);
    unmount();
  });

  it('on "end", closes the EventSource and marks the state ended/closed (server already ended its side)', () => {
    const { result, unmount } = renderHook(() => useJobStream('job-1'));
    const es = MockEventSource.instances[0];

    act(() => {
      es.emitFrame('end', { type: 'end', status: 'succeeded', exitCode: 0 });
    });

    expect(es.closed).toBe(true);
    expect(result.current.ended).toBe(true);
    expect(result.current.connection).toBe('closed');
    unmount();
  });

  it('on "overflow", closes the EventSource honestly rather than leaving a silently-truncated stream open', () => {
    const { result, unmount } = renderHook(() => useJobStream('job-1'));
    const es = MockEventSource.instances[0];

    act(() => {
      es.emitFrame('overflow', { type: 'overflow', dropped: 1001 });
    });

    expect(es.closed).toBe(true);
    expect(result.current.overflowDropped).toBe(1001);
    unmount();
  });

  it('a native reconnect error does NOT construct a second EventSource (preserves the browser\'s own Last-Event-ID tracking)', () => {
    const { result, unmount } = renderHook(() => useJobStream('job-1'));
    const es = MockEventSource.instances[0];

    act(() => {
      es.emitOpen();
      es.emitNativeReconnectError();
    });

    expect(MockEventSource.instances).toHaveLength(1); // still just the one instance
    expect(result.current.connection).toBe('connecting');
    unmount();
  });

  it('changing jobId closes the old EventSource and opens a fresh one for the new job', () => {
    let jobId = 'job-1';
    const { rerender, unmount } = renderHook(() => useJobStream(jobId));
    const first = MockEventSource.instances[0];

    jobId = 'job-2';
    act(() => rerender());

    expect(first.closed).toBe(true);
    expect(MockEventSource.instances).toHaveLength(2);
    expect(MockEventSource.instances[1].url).toBe('/api/jobs/job-2/events');
    unmount();
  });

  it('unmounting closes the EventSource exactly once', () => {
    const { unmount } = renderHook(() => useJobStream('job-1'));
    const es = MockEventSource.instances[0];
    unmount();
    expect(es.closed).toBe(true);
  });

  it('a null jobId opens no connection at all', () => {
    const { unmount } = renderHook(() => useJobStream(null));
    expect(MockEventSource.instances).toHaveLength(0);
    unmount();
  });
});

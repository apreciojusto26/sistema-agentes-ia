// Unit tests for scripts/lib/events.cjs (design §4, judgment call #5/#6).
//
// Written BEFORE scripts/lib/events.cjs exists — this is the RED step of
// Batch C's TDD sequence for the shared emitter. Import is static (not
// dynamic like Group D in contract.generate-landing.test.ts) because this
// file tests NOTHING ELSE — there's no sibling suite that needs to keep
// running independently if the module is missing.
//
// Covers: envelope shape (lg/v/seq/ts/agent/type/stage/data, design §4's
// table), monotonic per-emitter seq, `stage ?? null` / `data ?? null`
// defaulting, and — the load-bearing part — that writes go through
// `fs.writeSync(2, …)`, never `console.error`. Both real scripts do an async
// stderr write immediately followed by a synchronous `process.exit(1)`;
// async pipe writes can be truncated in that window, a synchronous fd-2
// write cannot be.

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import { createEmitter, EVENT_SCHEMA_VERSION } from '../../scripts/lib/events.cjs';

describe('scripts/lib/events.cjs', () => {
  let writeSyncSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    writeSyncSpy = vi.spyOn(fs, 'writeSync').mockImplementation(() => 0);
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    writeSyncSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  test('EVENT_SCHEMA_VERSION is 1', () => {
    expect(EVENT_SCHEMA_VERSION).toBe(1);
  });

  test('writes to fd 2 via fs.writeSync, never console.error', () => {
    const emit = createEmitter('scrape');
    emit('stage.start', 'open', null);

    expect(writeSyncSpy).toHaveBeenCalledTimes(1);
    expect(writeSyncSpy.mock.calls[0][0]).toBe(2);
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  test('envelope has the exact shape from design §4, lg key first', () => {
    const emit = createEmitter('scrape');
    emit('stage.start', 'open', null);

    const line = writeSyncSpy.mock.calls[0][1] as string;
    expect(line.endsWith('\n')).toBe(true);
    expect(line.startsWith('{"lg":1,')).toBe(true);

    const event = JSON.parse(line);
    expect(event).toMatchObject({
      lg: 1,
      v: 1,
      seq: 1,
      agent: 'scrape',
      type: 'stage.start',
      stage: 'open',
      data: null,
    });
    expect(typeof event.ts).toBe('string');
    expect(() => new Date(event.ts).toISOString()).not.toThrow();
    expect(new Date(event.ts).toISOString()).toBe(event.ts);
    expect(Object.keys(event)[0]).toBe('lg');
  });

  test('seq is monotonic per emitter instance, starting at 1', () => {
    const emit = createEmitter('generate');
    emit('stage.start', 'args', null);
    emit('stage.end', 'args', { ms: 5 });
    emit('stage.start', 'validate', null);

    const seqs = writeSyncSpy.mock.calls.map((call) => JSON.parse(call[1] as string).seq);
    expect(seqs).toEqual([1, 2, 3]);
  });

  test('two independent emitters each start their own seq at 1', () => {
    const emitA = createEmitter('scrape');
    const emitB = createEmitter('generate');
    emitA('stage.start', 'open', null);
    emitB('stage.start', 'args', null);
    emitA('stage.start', 'defer-load', null);

    const events = writeSyncSpy.mock.calls.map((call) => JSON.parse(call[1] as string));
    expect(events[0]).toMatchObject({ agent: 'scrape', seq: 1 });
    expect(events[1]).toMatchObject({ agent: 'generate', seq: 1 });
    expect(events[2]).toMatchObject({ agent: 'scrape', seq: 2 });
  });

  test('stage defaults to null when omitted/undefined', () => {
    const emit = createEmitter('generate');
    emit('result', undefined, { outDir: 'x', slug: 'x', force: false, imagesMatched: 0, imagesUnmatched: [], todos: [] });

    const event = JSON.parse(writeSyncSpy.mock.calls[0][1] as string);
    expect(event.stage).toBeNull();
  });

  test('data defaults to null when omitted/undefined', () => {
    const emit = createEmitter('scrape');
    emit('stage.start', 'open');

    const event = JSON.parse(writeSyncSpy.mock.calls[0][1] as string);
    expect(event.data).toBeNull();
  });

  test('data of null is preserved (not coerced away)', () => {
    const emit = createEmitter('scrape');
    emit('stage.end', 'open', null);

    const event = JSON.parse(writeSyncSpy.mock.calls[0][1] as string);
    expect(event.data).toBeNull();
  });

  test('error event carries message and optional code through untouched', () => {
    const emit = createEmitter('generate');
    emit('error', 'validate', { message: 'boom', code: 'product-unknown-fields' });

    const event = JSON.parse(writeSyncSpy.mock.calls[0][1] as string);
    expect(event.data).toEqual({ message: 'boom', code: 'product-unknown-fields' });
  });
});

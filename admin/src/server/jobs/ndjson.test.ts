// Unit tests for admin/src/server/jobs/ndjson.ts (design §4 "Parser").
//
// Written BEFORE ndjson.ts exists — RED step of Batch C's TDD sequence for
// the parser. Covers design §4's numbered rules: multi-byte emoji split
// across chunk boundaries, \r\n endings, malformed-line handling, the
// >256KB line guard, trailing-partial flush on 'end', the cheap sentinel
// prefilter (no JSON.parse attempt on non-event lines), and shallow shape
// validation (v: number, type: string, seq: number).

import { describe, test, expect } from 'vitest';
import { LineBuffer, parseLine } from './ndjson';

describe('LineBuffer', () => {
  test('push() returns complete lines and retains a partial tail', () => {
    const buf = new LineBuffer();
    expect(buf.push('hello wor')).toEqual([]);
    expect(buf.push('ld\nsecond line\nthird-partial')).toEqual(['hello world', 'second line']);
  });

  test('reconstructs a line whose text is split across two push() calls, including multi-byte emoji', () => {
    // With child.stderr.setEncoding('utf8') upstream, a multi-byte character
    // itself is never split mid-codepoint (StringDecoder buffers incomplete
    // byte sequences) — only the LINE can be split at an arbitrary string
    // boundary. This simulates that: the emoji-bearing line arrives in two
    // string chunks.
    const buf = new LineBuffer();
    const first = '🚀 Abriendo pro';
    const second = 'ducto...\n';
    expect(buf.push(first)).toEqual([]);
    expect(buf.push(second)).toEqual(['🚀 Abriendo producto...']);
  });

  test('handles \\r\\n line endings', () => {
    const buf = new LineBuffer();
    const lines = buf.push('line one\r\nline two\r\n');
    expect(lines).toEqual(['line one', 'line two']);
  });

  test('handles mixed \\n and \\r\\n endings in the same buffer', () => {
    const buf = new LineBuffer();
    const lines = buf.push('unix\nwindows\r\nunix again\n');
    expect(lines).toEqual(['unix', 'windows', 'unix again']);
  });

  test('flush() emits a non-empty trailing partial on stream end', () => {
    const buf = new LineBuffer();
    buf.push('no newline yet');
    expect(buf.flush()).toEqual(['no newline yet']);
  });

  test('flush() returns [] when the buffer is empty (stream ended cleanly on a newline)', () => {
    const buf = new LineBuffer();
    buf.push('complete line\n');
    expect(buf.flush()).toEqual([]);
  });

  test('flush() is idempotent — a second call returns [] after the first flush', () => {
    const buf = new LineBuffer();
    buf.push('partial');
    expect(buf.flush()).toEqual(['partial']);
    expect(buf.flush()).toEqual([]);
  });

  test('a single line exceeding 256KB with no newline is force-emitted and the buffer is reset', () => {
    const buf = new LineBuffer();
    const huge = 'x'.repeat(256 * 1024 + 1);
    const lines = buf.push(huge);
    expect(lines).toEqual([huge]);
    // Buffer was reset — the next push starts fresh, not appended to `huge`.
    expect(buf.push('next\n')).toEqual(['next']);
  });

  test('a line under the 256KB guard is NOT force-emitted', () => {
    const buf = new LineBuffer();
    const big = 'x'.repeat(1024);
    expect(buf.push(big)).toEqual([]);
    expect(buf.push('\n')).toEqual([big]);
  });
});

describe('parseLine', () => {
  test('non-sentinel line is classified as text, without attempting JSON.parse', () => {
    // A line that is NOT valid JSON but also does not start with the
    // sentinel must not throw — proving the sentinel prefilter runs first.
    const result = parseLine('🚀 Abriendo producto...');
    expect(result).toEqual({ kind: 'text', line: '🚀 Abriendo producto...' });
  });

  test('a line that merely looks JSON-ish but lacks the sentinel is still text', () => {
    const result = parseLine('{"not":"an event"}');
    expect(result).toEqual({ kind: 'text', line: '{"not":"an event"}' });
  });

  test('a well-formed event line parses to kind: event with the full envelope', () => {
    const line = JSON.stringify({
      lg: 1,
      v: 1,
      seq: 3,
      ts: '2026-08-13T12:00:00.000Z',
      agent: 'scrape',
      type: 'stage.start',
      stage: 'gallery',
      data: null,
    });
    const result = parseLine(line);
    expect(result.kind).toBe('event');
    if (result.kind === 'event') {
      expect(result.event).toMatchObject({ seq: 3, type: 'stage.start', stage: 'gallery' });
    }
  });

  test('a sentinel-prefixed line with invalid JSON is malformed, not a throw', () => {
    const result = parseLine('{"lg":1, this is not valid json');
    expect(result.kind).toBe('malformed');
    if (result.kind === 'malformed') {
      expect(result.line).toBe('{"lg":1, this is not valid json');
      expect(typeof result.reason).toBe('string');
      expect(result.reason.length).toBeGreaterThan(0);
    }
  });

  test('a sentinel-prefixed line with valid JSON but missing required fields is malformed', () => {
    const result = parseLine(JSON.stringify({ lg: 1, v: 1 })); // missing type, seq
    expect(result.kind).toBe('malformed');
  });

  test('a sentinel-prefixed line where v is not a number is malformed', () => {
    const result = parseLine(JSON.stringify({ lg: 1, v: '1', type: 'stage.start', seq: 1 }));
    expect(result.kind).toBe('malformed');
  });

  test('a sentinel-prefixed line where seq is not a number is malformed', () => {
    const result = parseLine(JSON.stringify({ lg: 1, v: 1, type: 'stage.start', seq: 'one' }));
    expect(result.kind).toBe('malformed');
  });

  test('a sentinel-prefixed line where type is not a string is malformed', () => {
    const result = parseLine(JSON.stringify({ lg: 1, v: 1, type: 7, seq: 1 }));
    expect(result.kind).toBe('malformed');
  });

  test('empty line is classified as text', () => {
    expect(parseLine('')).toEqual({ kind: 'text', line: '' });
  });
});

// Pure NDJSON stream parser for the structured progress protocol (spec R4,
// R5; design §4 "Parser"). Applied to stderr ONLY — stdout is never parsed
// for events. scrape.js pretty-prints a multi-line JSON.stringify(..., null,
// 2) block to stdout (L404-416), which would otherwise produce a burst of
// `malformed` hits; this is the operative reason design §4's D2 put events
// on stderr instead.
//
// `child.stdout`/`child.stderr` MUST be attached with `.setEncoding('utf8')`
// upstream (in runner.ts, Batch D) — both scripts are emoji-heavy and a
// naive `chunk.toString()` can corrupt a multi-byte character split across a
// chunk boundary. `setEncoding('utf8')` uses Node's StringDecoder
// internally, which buffers incomplete byte sequences until a full
// codepoint is available, so by the time strings reach LineBuffer.push()
// only LINES can be split across calls, never a codepoint mid-character.

import type { LgEvent } from '../../shared/events';

const SENTINEL = '{"lg":1,';

// A single line with no newline exceeding this size is force-emitted and
// the internal buffer is reset, so a pathological child cannot grow admin
// memory without bound (design §4, rule 6). Measured in JS string length as
// a practical approximation of bytes — event/log lines here are
// overwhelmingly ASCII plus a handful of emoji.
const MAX_LINE_LENGTH = 256 * 1024;

/**
 * Buffers raw chunks from a child process stream and yields complete lines.
 * Split on `\n` or `\r\n`; the trailing (possibly empty) fragment after the
 * last separator is retained until either more data completes it or
 * `flush()` is called on stream end.
 */
export class LineBuffer {
  #buffer = '';

  /** Feed a chunk (already `setEncoding('utf8')`-decoded). Returns complete lines. */
  push(chunk: string): string[] {
    this.#buffer += chunk;
    const parts = this.#buffer.split(/\r?\n/);
    this.#buffer = parts.pop() ?? '';

    if (this.#buffer.length > MAX_LINE_LENGTH) {
      parts.push(this.#buffer);
      this.#buffer = '';
    }

    return parts;
  }

  /** Call on stream 'end'. Emits a non-empty trailing partial exactly once. */
  flush(): string[] {
    if (this.#buffer.length === 0) return [];
    const line = this.#buffer;
    this.#buffer = '';
    return [line];
  }
}

export type ParsedLine =
  | { kind: 'event'; event: LgEvent }
  | { kind: 'text'; line: string }
  | { kind: 'malformed'; line: string; reason: string };

/**
 * Classifies a single line. Cheap sentinel prefilter first (`startsWith`,
 * no `JSON.parse` attempt) — text lines (the vast majority: scrape.js's
 * human console.log output, generate-landing.mjs's pretty-printed stdout)
 * never pay the parse cost and can never throw here.
 */
export function parseLine(line: string): ParsedLine {
  if (!line.startsWith(SENTINEL)) {
    return { kind: 'text', line };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch (err) {
    return {
      kind: 'malformed',
      line,
      reason: err instanceof Error ? err.message : 'JSON.parse failed',
    };
  }

  if (!isShallowValidEvent(parsed)) {
    return { kind: 'malformed', line, reason: 'missing or invalid v, type, or seq' };
  }

  return { kind: 'event', event: parsed as LgEvent };
}

function isShallowValidEvent(value: unknown): value is LgEvent {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return typeof obj.v === 'number' && typeof obj.type === 'string' && typeof obj.seq === 'number';
}

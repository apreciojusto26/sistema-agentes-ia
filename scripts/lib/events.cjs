// Structured progress protocol (spec R5, design §4). `.cjs`, not `.mjs`
// (design §10, judgment call #5): a shared module consumed by scrape.js
// (CommonJS) must be require-able from CJS AND import-able from ESM — CJS
// satisfies both, the reverse is not synchronously possible. This is why
// content-contract stays `.mjs` (ESM-only consumers) and this one is `.cjs`.
//
// Writes go through fs.writeSync(2, …), NEVER console.error (design §10,
// judgment call #6). Both scrape.js (L429-432) and generate-landing.mjs
// (fail(), L41-44) do an async stderr write immediately followed by a
// synchronous process.exit(1). Async pipe writes can be truncated in that
// window; a synchronous fd-2 write cannot be, and deliberately lands BEFORE
// the human ✗ / 💥 line — the order the admin wants anyway. The ndjson
// parser (admin/src/server/jobs/ndjson.ts) is per-line and order-agnostic,
// so this is safe.

const fs = require('node:fs');

const EVENT_SCHEMA_VERSION = 1;

/**
 * @param {'scrape'|'generate'|'content'} agent
 * @returns {(type: string, stage?: string|null, data?: object|null) => void}
 */
function createEmitter(agent) {
  let seq = 0;
  return function emit(type, stage, data) {
    seq += 1;
    const envelope = {
      lg: 1,
      v: EVENT_SCHEMA_VERSION,
      seq,
      ts: new Date().toISOString(),
      agent,
      type,
      stage: stage ?? null,
      data: data ?? null,
    };
    const line = JSON.stringify(envelope) + '\n';
    fs.writeSync(2, line);
  };
}

module.exports = { createEmitter, EVENT_SCHEMA_VERSION };

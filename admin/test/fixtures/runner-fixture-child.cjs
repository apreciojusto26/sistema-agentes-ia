#!/usr/bin/env node
// Test-only fixture child process for runner.test.ts. NOT part of the
// production spawn surface (that's scrape.js / generate-landing.mjs) — this
// exists purely to exercise runner.ts's own mechanics (chunked utf8 writes,
// NDJSON events on stderr interleaved with plain stdout text, the
// timeout/cancel -> SIGTERM -> SIGKILL ladder, and exit code capture)
// against a REAL spawned process, independent of Playwright/network.
'use strict';

const mode = process.argv[2];

function writeEvent(seq, type, stage, data) {
  const line =
    JSON.stringify({
      lg: 1,
      v: 1,
      seq,
      ts: new Date().toISOString(),
      agent: 'scrape',
      type,
      stage: stage ?? null,
      data: data ?? null,
    }) + '\n';
  process.stderr.write(line);
}

if (mode === 'utf8-split') {
  // Write an emoji-bearing line split across two process.stdout.write()
  // calls with a delay between them, so the two chunks are near-guaranteed
  // to arrive as separate 'data' events on the pipe. runner.ts's
  // setEncoding('utf8') must still hand LineBuffer a clean, unmangled line.
  process.stdout.write('🚀 Abriendo pro');
  setTimeout(() => {
    process.stdout.write('ducto...\n');
    process.exit(0);
  }, 30);
} else if (mode === 'events') {
  // Small delay before emitting so a test that subscribes to the registry
  // immediately after createGenerateJob() returns (a synchronous call) has
  // a real window to register before any frames fire — mirrors the fact
  // that a genuinely slow agent (Playwright) gives SSE subscribers time to
  // connect before the first real event.
  setTimeout(() => {
    writeEvent(1, 'stage.start', 'open', null);
    process.stdout.write('normal human log line\n');
    writeEvent(2, 'stage.end', 'open', { ms: 5 });
    writeEvent(3, 'result', null, { ok: true });
    process.exit(0);
  }, 60);
} else if (mode === 'hang') {
  // Ignore SIGTERM to force the runner's kill ladder to escalate to SIGKILL.
  process.on('SIGTERM', () => {});
  setInterval(() => {}, 1000);
} else if (mode === 'exit-code') {
  process.exitCode = Number(process.argv[3] ?? 1);
} else if (mode === 'scrape-success') {
  // Emits a realistic scrape-shaped stage sequence + terminal `result` event,
  // for registry.test.ts to prove the full create -> ingest -> archive
  // pipeline without depending on real Playwright/network.
  writeEvent(1, 'stage.start', 'open', null);
  writeEvent(2, 'stage.end', 'open', { ms: 3 });
  writeEvent(3, 'stage.start', 'write', null);
  writeEvent(4, 'stage.end', 'write', { ms: 2 });
  writeEvent(5, 'result', null, {
    outputPath: './output/product.json',
    title: 'Fixture Product',
    imageCount: 2,
    localImageCount: 2,
    reviewCount: 0,
    variantCount: 0,
    sourceUrl: 'https://es.aliexpress.com/item/1005007502111078.html',
    scrapedAt: new Date().toISOString(),
  });
  process.exit(0);
} else if (mode === 'clean-term') {
  // Responds to SIGTERM by exiting promptly (no SIGKILL needed). Writes a
  // 'ready' line once the SIGTERM handler is actually registered, so a
  // caller that wants to cancel() a responsive child deterministically
  // (rather than racing a fixed delay against process startup time under
  // load) can wait for this line first.
  process.on('SIGTERM', () => process.exit(0));
  process.stdout.write('ready\n');
  setInterval(() => {}, 1000);
} else {
  process.stdout.write('unknown mode\n');
  process.exitCode = 2;
}

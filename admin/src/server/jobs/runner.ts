// Spawn wrapper: real child_process.spawn, never in-process import (spec R2
// "Child Process Execution"; design §1/§4/§7). The single highest-risk
// module in Batch D — it is the one place `.setEncoding('utf8')` MUST be
// applied before feeding Batch C's `LineBuffer` (design §4 rule 1, and
// Batch C's own handoff note): both scrape.js and generate-landing.mjs are
// emoji-heavy, and a naive `chunk.toString()` on a raw Buffer can corrupt a
// multi-byte character split across a chunk boundary. `setEncoding('utf8')`
// uses Node's StringDecoder internally, which buffers incomplete byte
// sequences until a full codepoint is available — by the time strings reach
// LineBuffer.push() here, only LINES can be split across calls, never a
// codepoint mid-character.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { LineBuffer, parseLine, type ParsedLine } from './ndjson';
import { KILL_GRACE_MS, ADMIN_ROOT, STAGED_CONTENT_PATH } from '../config';
import type { GenerateParams, ScrapeParams, ContentParams, DesignParams } from '../../shared/jobs';

export type RunSpec = {
  command: string;
  args: string[];
  cwd: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs: number;
  /** Grace period between SIGTERM and SIGKILL, both for the timeout ladder and manual cancel(). Defaults to KILL_GRACE_MS. */
  killGraceMs?: number;
};

export type RunExitInfo = {
  code: number | null;
  signal: NodeJS.Signals | null;
  /** true iff the exit was triggered by this module's timeout ladder rather than the child exiting on its own or a manual cancel(). */
  timedOut: boolean;
};

export type RunnerCallbacks = {
  onStdoutLine?: (line: string) => void;
  /** stderr is the ONLY stream fed through the NDJSON parser (design §4 rule 7 — stdout is never parsed for events). */
  onStderrLine?: (line: string, parsed: ParsedLine) => void;
  onExit?: (info: RunExitInfo) => void;
};

export type RunHandle = {
  pid: number;
  /** Begins the same SIGTERM -> (killGraceMs) -> SIGKILL ladder the timeout uses. Safe to call multiple times. */
  cancel(): void;
};

/**
 * Spawns `spec.command spec.args` with `spec.cwd`/`spec.env`, applies
 * `.setEncoding('utf8')` to both stdout and stderr BEFORE any line buffering
 * (mandatory — see module doc), buffers each stream through its own
 * `LineBuffer`, and enforces `spec.timeoutMs` via a SIGTERM -> SIGKILL
 * ladder (`spec.killGraceMs`, default `KILL_GRACE_MS`).
 */
export function run(spec: RunSpec, callbacks: RunnerCallbacks): RunHandle {
  const child = spawn(spec.command, spec.args, {
    cwd: spec.cwd,
    env: spec.env ?? process.env,
  });

  if (child.pid === undefined) {
    throw new Error(`spawn() did not allocate a pid for: ${spec.command} ${spec.args.join(' ')}`);
  }
  if (!child.stdout || !child.stderr) {
    throw new Error('spawned child has no stdout/stderr streams to attach');
  }

  // Mandatory (design §4 rule 1) — see module doc.
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');

  const stdoutBuf = new LineBuffer();
  const stderrBuf = new LineBuffer();

  child.stdout.on('data', (chunk: string) => {
    for (const line of stdoutBuf.push(chunk)) callbacks.onStdoutLine?.(line);
  });
  child.stderr.on('data', (chunk: string) => {
    for (const line of stderrBuf.push(chunk)) callbacks.onStderrLine?.(line, parseLine(line));
  });

  const killGraceMs = spec.killGraceMs ?? KILL_GRACE_MS;
  let timedOut = false;
  let killLadderStarted = false;
  let killGraceTimer: NodeJS.Timeout | undefined;

  function beginKillLadder(): void {
    if (killLadderStarted) return;
    killLadderStarted = true;
    child.kill('SIGTERM');
    killGraceTimer = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL');
      }
    }, killGraceMs);
  }

  const timeoutTimer = setTimeout(() => {
    timedOut = true;
    beginKillLadder();
  }, spec.timeoutMs);

  // Deliberately 'close', not 'exit': Node's 'exit' event can fire BEFORE
  // the stdio pipes finish flushing, meaning a trailing 'data' event can
  // still arrive on stdout/stderr AFTER an 'exit' handler has already run
  // (https://nodejs.org/api/child_process.html#event-exit) — the exact
  // caller-visible symptom would be a line callback firing after the caller
  // already treated the job as finished and torn down its own state for it.
  // 'close' is guaranteed to fire only once both the process has exited AND
  // both stdio streams have ended, so by the time onExit() runs here, no
  // further onStdoutLine/onStderrLine call can ever happen for this run.
  child.on('close', (code, signal) => {
    clearTimeout(timeoutTimer);
    if (killGraceTimer) clearTimeout(killGraceTimer);

    for (const line of stdoutBuf.flush()) callbacks.onStdoutLine?.(line);
    for (const line of stderrBuf.flush()) callbacks.onStderrLine?.(line, parseLine(line));

    callbacks.onExit?.({ code, signal, timedOut });
  });

  return {
    pid: child.pid,
    cancel: beginKillLadder,
  };
}

// ---------------------------------------------------------------------------
// argv builders (design §7) — exact spawn shape for each agent script.
// ---------------------------------------------------------------------------

export type SpecOpts = { repoRoot: string; timeoutMs: number };

/**
 * `cwd` is load-bearing: scrape.js writes to `./output` relative to cwd
 * (CONFIG.outputDir, design §7 step 3), so cwd MUST be `{repoRoot}/scraper`.
 */
export function buildScrapeSpec(params: ScrapeParams, opts: SpecOpts): RunSpec {
  return {
    command: process.execPath,
    args: ['scrape.js', params.url],
    cwd: path.join(opts.repoRoot, 'scraper'),
    // LG_PRODUCT_ID, not argv (design D2): scrape.js has no arg parser and
    // resolves productId arg>env>self-mint — env costs zero parsing and
    // keeps args byte-identical to before this change. Same transport
    // pattern as the existing LG_EVENTS var.
    env: { ...process.env, LG_EVENTS: '1', LG_PRODUCT_ID: params.productId ?? '' },
    timeoutMs: opts.timeoutMs,
  };
}

/**
 * `generate-landing.mjs` resolves its own ROOT from `import.meta.url`
 * (design §7 step 6 note), so cwd does not affect the script itself — but
 * `--content`/`--images` resolve against cwd, so both cwd=REPO_ROOT AND
 * absolute paths are required together as double safety.
 */
export function buildGenerateSpec(params: GenerateParams, opts: SpecOpts): RunSpec {
  const args = ['scripts/generate-landing.mjs', '--slug', params.slug, '--content', params.contentPath];
  if (params.imagesDir) args.push('--images', params.imagesDir);
  if (params.force) args.push('--force');
  // Conditional (design D5/5.1): only pushed when params.productId is
  // present, so argv stays byte-identical to before this change for every
  // call site that doesn't pass one yet. NO --reset — not part of this phase.
  if (params.productId) args.push('--product-id', params.productId);
  // Fase 2/4/5 flags, each additive and each only pushed when the caller
  // actually supplied it — a pipeline run passes all three, a legacy call
  // passes none and its argv stays byte-identical to before.
  if (params.designPath) args.push('--design', params.designPath);
  if (params.productJsonPath) args.push('--product', params.productJsonPath);
  if (params.shopifyHandle) args.push('--shopify-handle', params.shopifyHandle);

  return {
    command: process.execPath,
    args,
    cwd: opts.repoRoot,
    env: { ...process.env, LG_EVENTS: '1' },
    timeoutMs: opts.timeoutMs,
  };
}

/**
 * Design & Layout Agent. cwd = repoRoot so `scripts/generate-design.mjs`
 * resolves; every other path is absolute. GEMINI_API_KEY rides the env spread
 * exactly like the Content Agent's — never argv, which is persisted verbatim
 * into job.json.
 *
 * The admin ORCHESTRATES this script. It does not reimplement the agent:
 * prompt, registry-derived vocabulary, Impeccable criteria and the retry loop
 * all stay inside generate-design.mjs, and a contract test asserts the server
 * carries no second copy.
 */
export function buildDesignSpec(params: DesignParams, opts: SpecOpts): RunSpec {
  const args = [
    'scripts/generate-design.mjs',
    '--product',
    params.scrapeProductPath,
    '--content',
    params.contentPath,
    '--out',
    params.outPath,
    '--model',
    params.model,
  ];
  if (params.productId) args.push('--product-id', params.productId);

  return {
    command: process.execPath,
    args,
    cwd: opts.repoRoot,
    env: { ...process.env, LG_EVENTS: '1' },
    timeoutMs: opts.timeoutMs,
  };
}

export type ContentSpecOpts = SpecOpts & { jobId: string };

/**
 * cwd = repoRoot so `scripts/generate-content.mjs` resolves; every other
 * path is passed absolute. GEMINI_API_KEY is NOT an argument — it rides the
 * `...process.env` spread, exactly like LG_EVENTS' sibling vars (spec "API
 * Key Transport Hygiene": argv is persisted verbatim into job.json).
 */
export function buildContentSpec(params: ContentParams, opts: ContentSpecOpts): RunSpec {
  const args = [
    'scripts/generate-content.mjs',
    '--product',
    params.scrapeProductPath,
    '--attempts-dir',
    path.join(ADMIN_ROOT, '.jobs', opts.jobId, 'content'),
    '--staged',
    STAGED_CONTENT_PATH,
    '--model',
    params.model,
  ];
  if (params.instructionsPath) args.push('--instructions', params.instructionsPath);

  return {
    command: process.execPath,
    args,
    cwd: opts.repoRoot,
    env: { ...process.env, LG_EVENTS: '1' },
    timeoutMs: opts.timeoutMs,
  };
}

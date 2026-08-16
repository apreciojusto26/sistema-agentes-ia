// "Ver el resultado" — spawns a real `astro dev` server for a generated
// outputs/{slug} landing so it can be opened in a browser exactly as it
// would render. Deliberately NOT a JobRecord/JobRegistry entry: every other
// job here runs to a terminal status (succeeded/failed/...), but a preview
// server is a long-lived process with no "done" state — it keeps serving
// until replaced or the admin process itself exits. Shoehorning that into
// JobKind would strain a model built around eventual termination.
//
// GOTCHA found by a real live smoke test, not guessed from docs: this
// project's astro (v7) `dev` command ALWAYS daemonizes when its stdout isn't
// a real TTY (i.e. whenever something spawns it, like this module does) —
// it prints one "Dev server running at http://host:PORT (pid PID)" line and
// then the launcher process exits with code 0. That exit is the SUCCESS
// signal here, not a failure — the real server is the detached daemon at
// the printed pid, tracked and killed via that pid directly (astro's own
// `astro dev stop` subcommand would need the right cwd re-established later,
// which is more moving parts for no benefit over a plain SIGTERM).
//
// Also load-bearing: `--port`/`--background` MUST reach astro WITHOUT a `--`
// separator in the pnpm invocation. `pnpm run dev -- --port 4322` forwards a
// literal `--` into astro's own argv, which astro does NOT strip — the flag
// after it is then ignored and the port silently falls back to Astro's
// default (4321). `pnpm run dev --port 4322 --background` (no `--`) is the
// form that actually works, confirmed by curling the resulting URL for a
// real 200.
//
// At most one preview runs at a time (this is a dev convenience, not a
// hosting platform) — starting a new one kills whatever was running before,
// and the process-exit handlers below make sure the admin server itself
// never leaves an orphaned astro daemon running after it stops.
import { spawn } from 'node:child_process';
import { existsSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import { OUTPUTS_DIR, TEMPLATE_DIR, PREVIEW_PORT, PREVIEW_START_TIMEOUT_MS } from './config';

// generate-landing.mjs deliberately excludes node_modules from the copy
// (EXCLUDE_DIRS) — correct for a generator, but it means EVERY freshly
// created outputs/{slug} is missing `astro` on first "Ver el resultado"
// (found for real: "sh: astro: command not found"). outputs/{slug} is a
// byte-for-byte copy of TEMPLATE_DIR's package.json, so its dependencies
// are identical — reusing TEMPLATE_DIR's already-installed node_modules via
// a symlink is instant and correct, versus a real `pnpm install` per
// landing (slow, and duplicates ~276MB per landing for no benefit here).
function ensureNodeModules(outDir: string): void {
  if (existsSync(path.join(outDir, 'node_modules'))) return;

  const templateBin = path.join(TEMPLATE_DIR, 'node_modules', '.bin', 'astro');
  if (!existsSync(templateBin)) {
    throw new Error(
      `content/landing-base tampoco tiene node_modules instalado — corré "pnpm install" ahí primero (una vez alcanza, todas las landings lo reusan).`,
    );
  }

  symlinkSync(path.join(TEMPLATE_DIR, 'node_modules'), path.join(outDir, 'node_modules'), 'dir');
}

type PreviewState = { slug: string; port: number; pid: number } | null;

let current: PreviewState = null;

const READY_RE = /Dev server running at https?:\/\/[^\s/:]+:(\d+)\s*\(pid\s+(\d+)/;

export function stopPreview(): void {
  if (!current) return;
  try {
    process.kill(current.pid, 'SIGTERM');
  } catch {
    // Already dead — that was the goal anyway, nothing to report.
  }
  current = null;
}

/** `process.kill(pid, 0)` sends no signal — it only probes whether the pid is a live process
 * (throws ESRCH if not). Found needed for real: the daemon can die (or get killed) outside
 * this module's knowledge (e.g. a crash, or `.env` changing — astro dev doesn't hot-reload
 * env vars, so picking up a new .env genuinely requires a fresh process), and without this
 * check the idempotent same-slug reuse below would keep confidently returning a dead port. */
function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function startPreview(slug: string): Promise<{ port: number }> {
  if (current?.slug === slug && isAlive(current.pid)) return { port: current.port }; // idempotent — same landing, same live server

  const outDir = path.join(OUTPUTS_DIR, slug);
  if (!existsSync(path.join(outDir, 'package.json'))) {
    throw new Error(`outputs/${slug} no existe o no tiene package.json — corré "Crear landing" primero`);
  }

  ensureNodeModules(outDir);

  stopPreview(); // only one preview server at a time

  // NOT --ignore-lock: astro rejects that combined with --background
  // outright ("cannot be used together") — confirmed by the real CLI, not
  // guessed. A stale lock from a previous, since-restarted admin process
  // (this module's in-memory `current` doesn't survive a restart) surfaces
  // as an honest failure below instead — same "fail honestly" shape as
  // every other diagnosis in this file, not a silent workaround.
  const child = spawn('pnpm', ['run', 'dev', '--port', String(PREVIEW_PORT), '--background'], {
    cwd: outDir,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const { port, pid } = await new Promise<{ port: number; pid: number }>((resolve, reject) => {
    let out = '';
    let err = '';

    const timer = setTimeout(() => {
      cleanup();
      child.kill('SIGTERM');
      reject(new Error(`el servidor de preview no confirmó arranque en ${PREVIEW_START_TIMEOUT_MS / 1000}s`));
    }, PREVIEW_START_TIMEOUT_MS);

    function cleanup() {
      clearTimeout(timer);
      child.stdout?.off('data', onStdout);
      child.stderr?.off('data', onStderr);
      child.off('exit', onExit);
    }

    function onStdout(chunk: Buffer) {
      out += chunk.toString('utf8');
      const match = READY_RE.exec(out);
      if (match) {
        cleanup();
        resolve({ port: Number(match[1]), pid: Number(match[2]) });
      }
    }

    function onStderr(chunk: Buffer) {
      err += chunk.toString('utf8');
    }

    // The launcher is EXPECTED to exit right after printing the ready line
    // (--background daemonizes and hands control back) — reaching this
    // WITHOUT having already resolved via onStdout means it exited before
    // ever confirming, which is the real failure case.
    function onExit(code: number | null) {
      cleanup();
      reject(new Error(`astro dev --background salió sin confirmar arranque (code ${code}): ${err.trim() || out.trim() || '(sin salida)'}`));
    }

    child.stdout?.on('data', onStdout);
    child.stderr?.on('data', onStderr);
    child.once('error', (spawnErr) => {
      cleanup();
      reject(spawnErr);
    });
    child.once('exit', onExit);
  });

  current = { slug, port, pid };
  return { port };
}

process.on('exit', stopPreview);
process.on('SIGTERM', stopPreview);
process.on('SIGINT', stopPreview);

// Structural enforcement layer 1 of the "no fake spinner" contract (design
// §6, task F9/F10): a static source-scan proving ManualArtifactPanel.tsx
// does NOT import LiveActivity.tsx — the ONLY animating component in the
// app (spec R8 "Honest UI"). This is deliberately a text-level check, not a
// rendering test: the point is that even ADDING the import is caught before
// any code inside it could run.
//
// Only actual `import` statements are scanned (comment lines are stripped
// first) — the file's own doc comments are allowed to mention these names
// in prose to explain WHY they're absent, without tripping this check.
//
// EXTENDED (design §9.4, D4a/D5, agents-dashboard-visual-polish, appended
// only — the 3 `it` blocks above are byte-identical to the pre-visual-polish
// version): strengthens the `animate-` scan to the whole `src/client` tree
// (not just ManualArtifactPanel), verifies StageChecklist's prop-surface
// purity, and asserts no `<details>` disclosure state is ever persisted.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PANEL_PATH = path.resolve(__dirname, '../src/client/components/detail/ManualArtifactPanel.tsx');
const LIVE_ACTIVITY_PATH = path.resolve(__dirname, '../src/client/components/LiveActivity.tsx');
const CLIENT_SRC = path.resolve(__dirname, '../src/client');
const STAGE_CHECKLIST_PATH = path.resolve(__dirname, '../src/client/components/StageChecklist.tsx');

// Avatars are now real image assets (public/*.png) — not source files that
// could carry a Tailwind `animate-` class, so there is no longer a
// "three avatar files contain no animate- class" check to run.

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    // Vite's publicDir (design/agents-dashboard-visual-polish follow-up):
    // static binary assets, not source — never source-scanned.
    if (entry === 'public') continue;
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function stripLineComments(source: string): string {
  return source
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
}

function importStatements(source: string): string[] {
  const code = stripLineComments(source);
  return [...code.matchAll(/^\s*import\s+.+$/gm), ...code.matchAll(/import\(\s*['"][^'"]+['"]\s*\)/g)].map((m) => m[0]);
}

describe('no-fake-spinner (structural enforcement layer 1)', () => {
  it('ManualArtifactPanel.tsx does not import LiveActivity.tsx, statically or dynamically', () => {
    const source = readFileSync(PANEL_PATH, 'utf8');
    const imports = importStatements(source);

    const offending = imports.filter((line) => /LiveActivity/.test(line));
    expect(offending).toEqual([]);
  });

  it('ManualArtifactPanel.tsx does not import JobRecord/JobStatus/runningEvidence — no process-shaped data in its prop surface', () => {
    const source = readFileSync(PANEL_PATH, 'utf8');
    const imports = importStatements(source);

    const offending = imports.filter((line) => /JobRecord|JobStatus|runningEvidence|RunningEvidence/.test(line));
    expect(offending).toEqual([]);
  });

  it('sanity check: LiveActivity.tsx genuinely exists and is the animating component this test is guarding against', () => {
    const liveActivitySource = readFileSync(LIVE_ACTIVITY_PATH, 'utf8');
    expect(liveActivitySource).toMatch(/animate-ping/);
  });
});

describe('no-fake-spinner (EXTENDED — design §9.4, D4a: agents-dashboard-visual-polish)', () => {
  it('ManualArtifactPanel.tsx contains no Tailwind `animate-` class', () => {
    const code = stripLineComments(readFileSync(PANEL_PATH, 'utf8'));
    expect(code).not.toMatch(/animate-/);
  });

  it('StageChecklist.tsx contains no Tailwind `animate-` class', () => {
    const code = stripLineComments(readFileSync(STAGE_CHECKLIST_PATH, 'utf8'));
    expect(code).not.toMatch(/animate-/);
  });

  it('LiveActivity.tsx is the ONLY file under admin/src/client containing `animate-` (whole-tree hardening)', () => {
    const files = walk(CLIENT_SRC);
    const offenders = files
      .filter((f) => /animate-/.test(stripLineComments(readFileSync(f, 'utf8'))))
      .map((f) => path.relative(CLIENT_SRC, f));
    expect(offenders).toEqual(['components/LiveActivity.tsx']);
  });

  it('StageChecklist.tsx imports no job/liveness-shaped module (design §4 prop-surface claim)', () => {
    const source = readFileSync(STAGE_CHECKLIST_PATH, 'utf8');
    const imports = importStatements(source);
    const offending = imports.filter((line) =>
      /JobRecord|JobStatus|runningEvidence|RunningEvidence|LiveActivity/.test(line),
    );
    expect(offending).toEqual([]);
  });

  it('no file under admin/src/client persists state (localStorage/sessionStorage/cookie/indexedDB) — <details> disclosure state is genuinely ephemeral (design §5, D5)', () => {
    const files = walk(CLIENT_SRC);
    const persistencePattern = /localStorage|sessionStorage|document\.cookie|indexedDB/;
    const offenders = files
      .filter((f) => persistencePattern.test(readFileSync(f, 'utf8')))
      .map((f) => path.relative(CLIENT_SRC, f));
    expect(offenders).toEqual([]);
  });
});

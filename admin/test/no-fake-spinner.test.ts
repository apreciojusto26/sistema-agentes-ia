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
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PANEL_PATH = path.resolve(__dirname, '../src/client/components/detail/ManualArtifactPanel.tsx');
const LIVE_ACTIVITY_PATH = path.resolve(__dirname, '../src/client/components/LiveActivity.tsx');

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

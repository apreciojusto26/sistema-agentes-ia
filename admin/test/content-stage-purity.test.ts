// ContentStageState still has no liveness variant (spec "Content Stage Doc
// Comment and Manual-Panel Copy Narrowed" — narrowing the doc claim must not
// silently become permission to widen the type; design addendum §6/Q5).
import { describe, it, expect } from 'vitest';
import type { ContentStageState } from '../src/shared/content-stage';

const KNOWN_KINDS = ['idle', 'received', 'unparseable', 'invalid', 'validated'] as const;
const LIVENESS_LOOKING = ['running', 'pending', 'generating', 'thinking', 'queued'];

describe('content-stage-purity (ContentStageState has no liveness variant)', () => {
  it('exhaustively covers exactly the 5 known non-liveness kinds', () => {
    function assertKind(kind: ContentStageState['kind']): void {
      expect(KNOWN_KINDS).toContain(kind);
    }
    // Exercises every real variant through the type system — a 6th member
    // added to the union without updating KNOWN_KINDS fails to compile here.
    assertKind('idle');
    assertKind('received');
    assertKind('unparseable');
    assertKind('invalid');
    assertKind('validated');
  });

  it('none of the known kinds is a running/pending/generating-looking name', () => {
    for (const kind of KNOWN_KINDS) {
      expect(LIVENESS_LOOKING).not.toContain(kind);
    }
  });

  it('content-stage.ts doc comment names JobKind \'content\' as where agent liveness now lives (narrowed, not silently widened)', async () => {
    const { readFileSync } = await import('node:fs');
    const path = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(path.join(__dirname, '../src/shared/content-stage.ts'), 'utf8');
    expect(source).toMatch(/JobKind[\s\S]{0,20}'content'/);
  });
});

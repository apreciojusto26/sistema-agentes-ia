// Content/Design manual stage state machine (spec R7 "Content/Design Manual
// Stage", R8 "Honest UI"; design §6). Type-only — no runtime logic.
//
// There is deliberately NO 'running' | 'pending' | 'thinking' | 'generating'
// variant. This stage is a manual artifact upload + validation flow, never a
// running child process — a variant implying liveness here would let a UI
// component render fake activity for it. `ManualArtifactPanel` (Batch F)
// accepts ONLY this type (no JobRecord in scope), so it is structurally
// incapable of rendering a spinner for a stage that has no such state to
// render one for.
import type { ContentIssue } from '../server/validation/content';

export type ContentStageState =
  | { kind: 'idle' }
  | { kind: 'received'; raw: string }
  /** A JSON syntax error — NOT a contract violation. Reporting it as "n contract errors" would itself be a small lie (design §10, judgment call #10). */
  | { kind: 'unparseable'; raw: string; parseError: string }
  | { kind: 'invalid'; raw: string; issues: ContentIssue[] }
  | {
      kind: 'validated';
      path: string;
      sha256: string;
      bytes: number;
      savedAt: string;
      summary: {
        productFields: number;
        faqCount: number;
        testimonialCount: number;
        hasDesign: boolean;
      };
    };

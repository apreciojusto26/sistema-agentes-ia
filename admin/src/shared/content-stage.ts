// Content/Design manual stage state machine (spec R7 "Content/Design Manual
// Stage", R8 "Honest UI"; design §6). Type-only — no runtime logic.
//
// There is deliberately NO 'running' | 'pending' | 'thinking' | 'generating'
// variant — but this claim is now SCOPED (content-agent change, spec "Content
// Stage Doc Comment... Narrowed", Q5), not a system-wide claim: it describes
// only `ContentStageState`/the manual staged-artifact path, never a running
// child process for THAT flow. `ManualArtifactPanel` accepts ONLY this type
// (no JobRecord in scope), so it is structurally incapable of rendering a
// spinner for a stage that has no such state to render one for.
//
// Agent liveness for content generation now lives elsewhere: `JobKind
// 'content'` (shared/jobs.ts), modelled by `JobRecord` + `runningEvidence`
// exactly like the scrape/generate agents — rendered by the sibling
// `ContentAgentPanel`, which legitimately imports `LiveActivity`/`JobRecord`
// and is NOT bound by this file's no-liveness guarantee.
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

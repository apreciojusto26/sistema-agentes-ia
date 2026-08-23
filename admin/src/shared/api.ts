// Request/response DTOs for every HTTP + SSE surface (design §3, §6, §7,
// design-addendum §9 tail). Type-only — the actual route handlers are Batch
// E; this file exists now so registry.ts (D15) and the validation modules
// can shape their return values against the real wire contract instead of
// improvising one that Batch E would then have to bend around.
import type { ContentIssue } from '../server/validation/content';
import type { JobRecord } from './jobs';

// ---------------------------------------------------------------------------
// GET /api/health (design-addendum §9 tail)
// ---------------------------------------------------------------------------

export type HealthResponse = {
  node: string;
  repoRoot: string;
  checks: {
    scraperNodeModules: boolean;
    playwrightBrowsers: boolean;
    templateDir: boolean;
    outputsDir: boolean;
    generateScript: boolean;
    contentContract: boolean;
    /** Presence-only: process.env.GEMINI_API_KEY is set and non-empty. Never a live probe (would burn irreplaceable daily quota). Cannot distinguish a valid key from a revoked/over-quota/region-blocked one. */
    geminiApiKey: boolean;
  };
};

// ---------------------------------------------------------------------------
// POST /api/content/validate, PUT/GET/DELETE /api/content/staged (design §6)
// ---------------------------------------------------------------------------

export type ValidateContentRequest = { raw: string } | { content: unknown };

export type ValidateResponse =
  | {
      ok: true;
      summary: {
        productFields: number;
        faqCount: number;
        testimonialCount: number;
        hasDesign: boolean;
      };
    }
  | { ok: false; parseError: string }
  | { ok: false; issues: ContentIssue[] };

export type PutStagedContentRequest = { raw: string };

export type PutStagedContentResponse = {
  ok: true;
  path: string;
  sha256: string;
  bytes: number;
  savedAt: string;
};

export type GetStagedContentResponse =
  | { present: false }
  | {
      present: true;
      path: string;
      sha256: string;
      bytes: number;
      savedAt: string;
      validation: ValidateResponse;
    };

// ---------------------------------------------------------------------------
// POST /api/jobs (design §7)
// ---------------------------------------------------------------------------

export type CreateJobRequest =
  | { kind: 'scrape'; url: string }
  | {
      kind: 'generate';
      slug: string;
      contentPath?: string;
      imagesDir?: string;
      confirmOverwrite?: { token: string };
    }
  | { kind: 'content'; scrapeJobId: string; instructions?: string };

/** 409 response when outputs/{slug} already exists and no (or an expired/mismatched) confirmToken was supplied. */
export type OverwriteConfirmationRequired = {
  code: 'overwrite-confirmation-required';
  slug: string;
  existingDir: string;
  existingMtime: string;
  priorJob: { jobId: string; finishedAt: string | null; exitCode: number | null } | null;
  /** UUID, 5-minute TTL, bound to this slug. Must be echoed back in CreateJobRequest.confirmOverwrite.token. */
  confirmToken: string;
  /** Verbatim gotcha text (design §7) — renderers must NOT paraphrase (spec R10). */
  warnings: string[];
};

export type NoContentArtifact = { code: 'no-content-artifact' };

/** 409 for kind:'content' when scrapeJobId doesn't resolve, or has no archived product.json. */
export type NoScrapeArtifact = { code: 'no-scrape-artifact' };

/**
 * 409 for kind:'generate' when outputs/{slug}/.generation.json's productId
 * differs from the staged content's productId (design D5 defense-in-depth
 * barrier — the primary D5 gate lives in generate-landing.mjs's own
 * preflight). This is a correctness violation, NOT an "are you sure?"
 * prompt: `confirmOverwrite`/`confirmToken` is NEVER consulted for this
 * check, and there is no flag that bypasses it.
 */
export type GenerationOwnerMismatch = {
  code: 'generation-owner-mismatch';
  slug: string;
  expected: string;
  found: string;
};

export type ContentInvalid = { code: 'content-invalid'; issues: ContentIssue[] };

export type SlugInvalid = { code: 'slug-invalid'; message: string };

export type UrlInvalid = { code: string; message: string };

export type QueueBusy = { code: 'queue-busy'; heldBy: string | null };

// ---------------------------------------------------------------------------
// GET /api/jobs, GET /api/jobs/:id, POST /api/jobs/:id/cancel
// ---------------------------------------------------------------------------

export type JobListResponse = { jobs: JobRecord[] };
export type JobDetailResponse = { job: JobRecord };
export type CancelJobResponse = { ok: true; status: JobRecord['status'] };

// ---------------------------------------------------------------------------
// GET /api/jobs/:id/events — SSE frame payloads (design §3)
// ---------------------------------------------------------------------------

export type SseJobFrame = { type: 'job'; job: JobRecord };

export type SseLogFrame = {
  type: 'log';
  seq: number;
  ts: string;
  ch: 'stdout' | 'stderr' | 'meta';
  line: string;
};

export type SseStageFrame = {
  type: 'stage';
  seq: number;
  ts: string;
  stage: string;
  status: 'running' | 'done' | 'failed';
  progress: { done: number; total: number; label?: string } | null;
};

export type SseEndFrame = { type: 'end'; status: JobRecord['status']; exitCode: number | null };

export type SseOverflowFrame = { type: 'overflow'; dropped: number };

export type SseFrame = SseJobFrame | SseLogFrame | SseStageFrame | SseEndFrame | SseOverflowFrame;

// ---------------------------------------------------------------------------
// GET /api/jobs/:id/content/last-attempt (design §8)
// ---------------------------------------------------------------------------

export type LastAttemptResponse = { present: false } | { present: true; attempt: number; text: string };

// ---------------------------------------------------------------------------
// POST /api/preview — "Ver el resultado" (live astro dev server for outputs/{slug})
// ---------------------------------------------------------------------------

export type StartPreviewRequest = { slug: string };

export type StartPreviewResponse = { ok: true; url: string } | { ok: false; message: string };

// ---------------------------------------------------------------------------
// DELETE /api/preview — stop whatever preview server is currently running
// ---------------------------------------------------------------------------

export type StopPreviewResponse = { ok: true };

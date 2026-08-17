// POST/GET /api/jobs, GET /api/jobs/:id, POST /api/jobs/:id/cancel (spec
// R1,R3,R9,R10,R12; design §7; task E5/E6).
//
// Batch D's registry.createScrapeJob/createGenerateJob ALREADY implement the
// full locking/queueing/spawning lifecycle. These routes stay THIN: validate
// (slug regex, content-artifact presence, collectContentErrors, the
// existing-outputs-dir 409-with-confirmToken flow) then delegate to
// registry.create*Job() — never re-implement locking/spawning here.
import { existsSync, readFileSync, readdirSync, statSync, mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { JobRegistry } from '../jobs/registry';
import { validateAliExpressUrl } from '../validation/aliexpress-url';
import { collectContentErrors } from '../validation/content';
import { OUTPUTS_DIR, STAGED_CONTENT_PATH, STAGED_DIR, GEMINI_MODEL } from '../config';
import type {
  CreateJobRequest,
  JobListResponse,
  JobDetailResponse,
  CancelJobResponse,
  OverwriteConfirmationRequired,
  NoContentArtifact,
  NoScrapeArtifact,
  GenerationOwnerMismatch,
  ContentInvalid,
  SlugInvalid,
  UrlInvalid,
} from '../../shared/api';

/** Structural subset actually used by this route module — lets tests pass a fake double instead of a real (spawning) JobRegistry. */
export type RegistryLike = Pick<
  JobRegistry,
  'createScrapeJob' | 'createGenerateJob' | 'createContentJob' | 'list' | 'get' | 'cancel'
>;

const CONTENT_INSTRUCTIONS_DIR = path.join(STAGED_DIR, 'content-instructions');
const INSTRUCTIONS_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** Opportunistic prune on each create (design judgment call J4) — keeps the
 * uuid-named instructions dir bounded without new infrastructure. */
function pruneOldInstructions(): void {
  if (!existsSync(CONTENT_INSTRUCTIONS_DIR)) return;
  const now = Date.now();
  for (const file of readdirSync(CONTENT_INSTRUCTIONS_DIR)) {
    const filePath = path.join(CONTENT_INSTRUCTIONS_DIR, file);
    try {
      const stat = statSync(filePath);
      if (now - stat.mtimeMs > INSTRUCTIONS_MAX_AGE_MS) unlinkSync(filePath);
    } catch {
      // best-effort cleanup only
    }
  }
}

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const CONFIRM_TOKEN_TTL_MS = 5 * 60 * 1000;

// In-memory, single-developer-tool store for the confirmOverwrite round-trip
// (design §7, design-addendum judgment call #4): a client MUST have seen the
// 409's two verbatim warnings to obtain a token, and that token is bound to
// the specific slug it was issued for and expires after 5 minutes. Single-use
// (deleted on successful redemption) to prevent replay.
const confirmTokens = new Map<string, { slug: string; expiresAt: number }>();

function issueConfirmToken(slug: string): string {
  const token = randomUUID();
  confirmTokens.set(token, { slug, expiresAt: Date.now() + CONFIRM_TOKEN_TTL_MS });
  return token;
}

function redeemConfirmToken(token: string, slug: string): boolean {
  const entry = confirmTokens.get(token);
  if (!entry) return false;
  confirmTokens.delete(token); // single-use regardless of outcome
  if (entry.slug !== slug) return false;
  if (Date.now() > entry.expiresAt) return false;
  return true;
}

/** Extends with a third, productId-aware line when the existing outputs/{slug} dir carries a known lineage (design D5). */
function overwriteWarnings(slug: string, productId?: string | null): string[] {
  const warnings = [
    `--force does NOT delete outputs/${slug}. generate-landing.mjs does mkdirSync(recursive) then copies over the existing tree in place (lines 320-321), so files from a previous generation that no longer exist in the template SURVIVE.`,
    `outputs/${slug}/node_modules and outputs/${slug}/.env also survive — usually what you want.`,
  ];
  if (productId) {
    warnings.push(
      `This regeneration reuses productId ${productId} — the existing outputs/${slug}/.generation.json lineage is being extended, not replaced.`,
    );
  }
  return warnings;
}

type GenerationManifest = { productId?: string | null };

/**
 * Reads outputs/{slug}/.generation.json when present (design D5's second
 * barrier; the file is written by generate-landing.mjs's write-manifest
 * stage, which is out of scope for this batch — it may simply not exist yet
 * for any given slug, and that MUST be tolerated silently, never thrown).
 */
function readGenerationManifest(outDir: string): GenerationManifest | null {
  const manifestPath = path.join(outDir, '.generation.json');
  if (!existsSync(manifestPath)) return null;
  try {
    const parsed = JSON.parse(readFileSync(manifestPath, 'utf8')) as GenerationManifest;
    return typeof parsed === 'object' && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}

/** Extracts the optional top-level `productId` from a parsed content.json (design D2 — field is optional, absence is never an error). */
function extractContentProductId(parsedContent: unknown): string | undefined {
  if (typeof parsedContent !== 'object' || parsedContent === null) return undefined;
  const value = (parsedContent as Record<string, unknown>).productId;
  return typeof value === 'string' ? value : undefined;
}

function findPriorGenerateJob(registry: RegistryLike, slug: string): OverwriteConfirmationRequired['priorJob'] {
  const prior = registry
    .list()
    .find((j) => j.kind === 'generate' && (j.params as { slug: string }).slug === slug);
  if (!prior) return null;
  return { jobId: prior.jobId, finishedAt: prior.finishedAt, exitCode: prior.exitCode };
}

export function registerJobsRoutes(app: FastifyInstance, registry: RegistryLike): void {
  app.post('/api/jobs', async (request, reply) => {
    const body = request.body as CreateJobRequest;

    if (body.kind === 'scrape') {
      const check = validateAliExpressUrl(body.url ?? '');
      if (!check.ok) {
        reply.code(400);
        return { code: check.code, message: check.message } satisfies UrlInvalid;
      }

      const job = registry.createScrapeJob({ url: check.url, itemId: check.itemId, normalizedUrl: check.normalized });
      reply.code(201);
      return { job } satisfies JobDetailResponse;
    }

    if (body.kind === 'generate') {
      const { slug } = body;

      if (!SLUG_RE.test(slug)) {
        reply.code(400);
        return {
          code: 'slug-invalid',
          message: `--slug "${slug}" must be kebab-case (e.g. "star-projector")`,
        } satisfies SlugInvalid;
      }

      const contentPath = body.contentPath ?? STAGED_CONTENT_PATH;
      if (!existsSync(contentPath)) {
        reply.code(409);
        return { code: 'no-content-artifact' } satisfies NoContentArtifact;
      }

      let parsedContent: unknown;
      try {
        parsedContent = JSON.parse(readFileSync(contentPath, 'utf8'));
      } catch {
        // A staged artifact that fails to parse is, from this route's
        // perspective, the same "nothing usable is staged" situation as it
        // being absent — /api/content/staged already surfaces parse errors
        // during staging itself.
        reply.code(409);
        return { code: 'no-content-artifact' } satisfies NoContentArtifact;
      }

      const issues = collectContentErrors(parsedContent);
      if (issues.length > 0) {
        reply.code(422);
        return { code: 'content-invalid', issues } satisfies ContentInvalid;
      }

      const contentProductId = extractContentProductId(parsedContent);
      const outDir = path.join(OUTPUTS_DIR, slug);
      let force = false;

      if (existsSync(outDir)) {
        const manifest = readGenerationManifest(outDir);

        // FAIL-CLOSED, no bypass (design D5 defense-in-depth barrier):
        // checked BEFORE any confirmOverwrite/confirmToken handling, and
        // confirmOverwrite is NEVER consulted for this branch — an
        // ownership mismatch is a correctness violation, not a "do you want
        // to overwrite?" question. A missing manifest, or either side
        // lacking a productId, is legacy/untagged, not a mismatch.
        if (manifest?.productId && contentProductId && manifest.productId !== contentProductId) {
          reply.code(409);
          return {
            code: 'generation-owner-mismatch',
            slug,
            expected: manifest.productId,
            found: contentProductId,
          } satisfies GenerationOwnerMismatch;
        }

        const confirmed = body.confirmOverwrite && redeemConfirmToken(body.confirmOverwrite.token, slug);
        if (!confirmed) {
          const stat = statSync(outDir);
          reply.code(409);
          return {
            code: 'overwrite-confirmation-required',
            slug,
            existingDir: `outputs/${slug}`,
            existingMtime: stat.mtime.toISOString(),
            priorJob: findPriorGenerateJob(registry, slug),
            confirmToken: issueConfirmToken(slug),
            warnings: overwriteWarnings(slug, manifest?.productId ?? null),
          } satisfies OverwriteConfirmationRequired;
        }
        force = true;
      }

      const job = registry.createGenerateJob({
        slug,
        contentPath,
        imagesDir: body.imagesDir ?? null,
        force,
        productId: contentProductId,
      });
      reply.code(201);
      return { job } satisfies JobDetailResponse;
    }

    if (body.kind === 'content') {
      const { scrapeJobId } = body;
      const scrapeJob = registry.get(scrapeJobId);
      const productPath = scrapeJob?.archivePath ? path.join(scrapeJob.archivePath, 'product.json') : null;

      // Explicit status guard (design D3 — states the intent already
      // enforced structurally by archivePath being null on any fatal
      // archive; a fatally-archived scrape's job.status is 'failed', never
      // 'succeeded', so this is additive-but-not-yet-load-bearing today).
      if (!scrapeJob || scrapeJob.kind !== 'scrape' || scrapeJob.status !== 'succeeded' || !productPath || !existsSync(productPath)) {
        reply.code(409);
        return { code: 'no-scrape-artifact' } satisfies NoScrapeArtifact;
      }

      let instructionsPath: string | null = null;
      if (body.instructions && body.instructions.trim().length > 0) {
        pruneOldInstructions();
        mkdirSync(CONTENT_INSTRUCTIONS_DIR, { recursive: true });
        instructionsPath = path.join(CONTENT_INSTRUCTIONS_DIR, `${randomUUID()}.txt`);
        writeFileSync(instructionsPath, body.instructions);
      }

      const job = registry.createContentJob({
        scrapeJobId,
        scrapeProductPath: productPath,
        instructionsPath,
        // Always the server-pinned model — any client-supplied model field is
        // ignored (D1's pinning must not become client-settable).
        model: GEMINI_MODEL,
        // Forward the scrape job's lineage id (design D2 propagation) — may
        // be undefined for a job created before this change landed. Every
        // JobRecord['params'] variant carries an optional `productId` since
        // task 3.1, so this is accessible without a cast.
        productId: scrapeJob.params.productId,
      });
      reply.code(201);
      return { job } satisfies JobDetailResponse;
    }

    reply.code(400);
    return { code: 'unknown-kind', message: 'CreateJobRequest.kind must be "scrape", "generate", or "content".' };
  });

  app.get('/api/jobs', async () => {
    return { jobs: registry.list() } satisfies JobListResponse;
  });

  app.get('/api/jobs/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const job = registry.get(id);
    if (!job) {
      reply.code(404);
      return { error: 'job not found' };
    }
    return { job } satisfies JobDetailResponse;
  });

  app.post('/api/jobs/:id/cancel', async (request, reply) => {
    const { id } = request.params as { id: string };
    const ok = registry.cancel(id);
    if (!ok) {
      reply.code(404);
      return { error: 'job not found, or not in a cancellable state' };
    }
    const job = registry.get(id);
    return { ok: true, status: job?.status ?? 'cancelled' } satisfies CancelJobResponse;
  });
}

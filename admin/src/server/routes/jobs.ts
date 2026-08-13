// POST/GET /api/jobs, GET /api/jobs/:id, POST /api/jobs/:id/cancel (spec
// R1,R3,R9,R10,R12; design §7; task E5/E6).
//
// Batch D's registry.createScrapeJob/createGenerateJob ALREADY implement the
// full locking/queueing/spawning lifecycle. These routes stay THIN: validate
// (slug regex, content-artifact presence, collectContentErrors, the
// existing-outputs-dir 409-with-confirmToken flow) then delegate to
// registry.create*Job() — never re-implement locking/spawning here.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { JobRegistry } from '../jobs/registry';
import { validateAliExpressUrl } from '../validation/aliexpress-url';
import { collectContentErrors } from '../validation/content';
import { OUTPUTS_DIR, STAGED_CONTENT_PATH } from '../config';
import type {
  CreateJobRequest,
  JobListResponse,
  JobDetailResponse,
  CancelJobResponse,
  OverwriteConfirmationRequired,
  NoContentArtifact,
  ContentInvalid,
  SlugInvalid,
  UrlInvalid,
} from '../../shared/api';

/** Structural subset actually used by this route module — lets tests pass a fake double instead of a real (spawning) JobRegistry. */
export type RegistryLike = Pick<JobRegistry, 'createScrapeJob' | 'createGenerateJob' | 'list' | 'get' | 'cancel'>;

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

function overwriteWarnings(slug: string): [string, string] {
  return [
    `--force does NOT delete outputs/${slug}. generate-landing.mjs does mkdirSync(recursive) then copies over the existing tree in place (lines 320-321), so files from a previous generation that no longer exist in the template SURVIVE.`,
    `outputs/${slug}/node_modules and outputs/${slug}/.env also survive — usually what you want.`,
  ];
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

      const outDir = path.join(OUTPUTS_DIR, slug);
      let force = false;

      if (existsSync(outDir)) {
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
            warnings: overwriteWarnings(slug),
          } satisfies OverwriteConfirmationRequired;
        }
        force = true;
      }

      const job = registry.createGenerateJob({
        slug,
        contentPath,
        imagesDir: body.imagesDir ?? null,
        force,
      });
      reply.code(201);
      return { job } satisfies JobDetailResponse;
    }

    reply.code(400);
    return { code: 'unknown-kind', message: 'CreateJobRequest.kind must be "scrape" or "generate".' };
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

// Read-only archived-scrape artifact routes (spec R11 "Scrape Artifact
// Archiving"; design §7; task E9/E10). `job.archivePath` already points at
// the archived dir (set by archive.ts via D13/D15) — these routes just serve
// files out of it, guarded against path traversal by an allowlist derived
// from scrape.js's real naming (`img_${index}`, EXTENSION_BY_MIME).
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { JobRegistry } from '../jobs/registry';
import { ADMIN_ROOT } from '../config';
import type { LastAttemptResponse } from '../../shared/api';

export type RegistryLike = Pick<JobRegistry, 'get'>;

const ATTEMPT_FILE_RE = /^attempt-(\d+)\.json$/;

const IMAGE_FILE_RE = /^img_\d+\.(jpg|png|webp|avif)$/;

const MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  avif: 'image/avif',
};

export function registerArtifactsRoutes(app: FastifyInstance, registry: RegistryLike): void {
  app.get('/api/jobs/:id/scrape/product.json', async (request, reply) => {
    const { id } = request.params as { id: string };
    const job = registry.get(id);
    if (!job || !job.archivePath) {
      reply.code(404);
      return { error: 'no archived scrape artifacts for this job' };
    }

    const filePath = path.join(job.archivePath, 'product.json');
    if (!existsSync(filePath)) {
      reply.code(404);
      return { error: 'product.json not found' };
    }

    reply.type('application/json');
    return readFileSync(filePath, 'utf8');
  });

  app.get('/api/jobs/:id/scrape/images/:file', async (request, reply) => {
    const { id, file } = request.params as { id: string; file: string };

    if (!IMAGE_FILE_RE.test(file)) {
      reply.code(400);
      return { error: `invalid image filename "${file}"` };
    }

    const job = registry.get(id);
    if (!job || !job.archivePath) {
      reply.code(404);
      return { error: 'no archived scrape artifacts for this job' };
    }

    const filePath = path.join(job.archivePath, 'images', file);
    if (!existsSync(filePath)) {
      reply.code(404);
      return { error: 'image not found' };
    }

    const ext = path.extname(file).slice(1);
    reply.type(MIME_BY_EXT[ext] ?? 'application/octet-stream');
    return readFileSync(filePath);
  });

  app.get('/api/jobs/:id/content/last-attempt', async (request) => {
    const { id } = request.params as { id: string };
    const attemptsDir = path.join(ADMIN_ROOT, '.jobs', id, 'content');

    if (!existsSync(attemptsDir)) {
      return { present: false } satisfies LastAttemptResponse;
    }

    // No client-supplied filename — n is derived server-side by scanning for
    // attempt-N.json and taking the max, so unlike the image route's
    // allowlist there is no path-traversal surface to guard here at all.
    let max = 0;
    for (const entry of readdirSync(attemptsDir)) {
      const match = ATTEMPT_FILE_RE.exec(entry);
      if (match) max = Math.max(max, Number(match[1]));
    }

    if (max === 0) {
      return { present: false } satisfies LastAttemptResponse;
    }

    const filePath = path.join(attemptsDir, `attempt-${max}.json`);
    const record = JSON.parse(readFileSync(filePath, 'utf8')) as { text?: string | null };
    return { present: true, attempt: max, text: record.text ?? '' } satisfies LastAttemptResponse;
  });
}

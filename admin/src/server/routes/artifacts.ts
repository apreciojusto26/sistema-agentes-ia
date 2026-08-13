// Read-only archived-scrape artifact routes (spec R11 "Scrape Artifact
// Archiving"; design §7; task E9/E10). `job.archivePath` already points at
// the archived dir (set by archive.ts via D13/D15) — these routes just serve
// files out of it, guarded against path traversal by an allowlist derived
// from scrape.js's real naming (`img_${index}`, EXTENSION_BY_MIME).
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { JobRegistry } from '../jobs/registry';

export type RegistryLike = Pick<JobRegistry, 'get'>;

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
}

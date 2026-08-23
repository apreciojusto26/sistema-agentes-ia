// POST /api/preview — "Ver el resultado". Same slug-format guard as
// routes/jobs.ts's generate validation (SLUG_RE) — slug becomes a real
// filesystem path + spawn cwd here too, so it gets the identical check.
import type { FastifyInstance } from 'fastify';
import { startPreview, stopPreview } from '../preview';
import type { StartPreviewRequest, StartPreviewResponse, StopPreviewResponse } from '../../shared/api';

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function registerPreviewRoutes(app: FastifyInstance): void {
  app.post('/api/preview', async (request, reply): Promise<StartPreviewResponse> => {
    const { slug } = (request.body ?? {}) as Partial<StartPreviewRequest>;

    if (!slug || !SLUG_RE.test(slug)) {
      reply.code(400);
      return { ok: false, message: `"${slug}" no es un slug válido` };
    }

    try {
      const { port } = await startPreview(slug);
      return { ok: true, url: `http://localhost:${port}` };
    } catch (err) {
      reply.code(500);
      return { ok: false, message: err instanceof Error ? err.message : String(err) };
    }
  });

  // Client-driven: fired when the tab showing the preview closes (see
  // GenerateSlugForm's window.closed polling). Idempotent — stopPreview()
  // already no-ops when nothing is running.
  app.delete('/api/preview', async (): Promise<StopPreviewResponse> => {
    stopPreview();
    return { ok: true };
  });
}

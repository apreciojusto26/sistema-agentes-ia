// HTTP surface over runPipeline(). Validation and transport only — every
// decision about WHAT to run lives in pipeline.ts, and every agent lives in
// scripts/. A route that reached for an agent would be the second
// implementation this whole design avoids.
import type { FastifyInstance } from 'fastify';
import { runPipeline, type PipelineRecord } from '../pipeline';
import * as store from '../pipeline-store';
import type { JobRegistry } from '../jobs/registry';

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const HANDLE_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type StartPipelineBody = {
  url?: string;
  scrapeJobId?: string;
  slug?: string;
  shopifyHandle?: string | null;
  force?: boolean;
};

/** Pure so the validation can be unit-tested without a server. */
export function validateStart(body: StartPipelineBody): { ok: true } | { ok: false; message: string } {
  if (!body.slug || !SLUG_RE.test(body.slug)) {
    return { ok: false, message: 'slug must be kebab-case (e.g. "star-projector")' };
  }
  if (!body.url && !body.scrapeJobId) {
    return { ok: false, message: 'provide either a product url or an existing scrapeJobId' };
  }
  if (body.url && body.scrapeJobId) {
    return { ok: false, message: 'provide a url OR a scrapeJobId, not both' };
  }
  if (body.url && !/^https?:\/\//i.test(body.url)) {
    return { ok: false, message: 'url must start with http:// or https://' };
  }
  // Empty string means "no handle" — preview mode — and must not be treated
  // as an invalid handle. Only a NON-empty malformed value is an error.
  if (body.shopifyHandle && !HANDLE_RE.test(body.shopifyHandle)) {
    return {
      ok: false,
      message: 'shopifyHandle must be lowercase alphanumerics separated by single hyphens',
    };
  }
  return { ok: true };
}

export function registerPipelineRoutes(app: FastifyInstance, registry: JobRegistry): void {
  app.post('/api/pipeline', async (request, reply) => {
    const body = (request.body ?? {}) as StartPipelineBody;

    const check = validateStart(body);
    if (!check.ok) {
      reply.code(400);
      return { error: check.message };
    }

    // Started ONCE. Without this a double-clicked button would launch two
    // runs against the same slug, racing each other over the same output dir.
    const running = store.active();
    if (running) {
      reply.code(409);
      return { error: `a pipeline is already running (${running.pipelineId}, stage ${running.currentStage})`, pipeline: running };
    }

    // Fire and forget: the response returns the initial record immediately and
    // progress arrives over SSE. Awaiting here would hold the request open for
    // the entire generation.
    const started = await new Promise<PipelineRecord>((resolve) => {
      let first = true;
      void runPipeline(
        {
          url: body.url,
          scrapeJobId: body.scrapeJobId,
          slug: body.slug!,
          shopifyHandle: body.shopifyHandle?.trim() ? body.shopifyHandle.trim() : null,
          force: body.force ?? false,
        },
        {
          registry,
          onUpdate: (record) => {
            store.put(record);
            if (first) {
              first = false;
              resolve(record);
            }
          },
        },
      ).then(
        (final) => store.put(final),
        (err) => {
          // A throw escaping runPipeline is a bug, not a stage failure — it is
          // still surfaced rather than leaving the run stuck as `running`.
          const record = store.active();
          if (record) {
            store.put({
              ...record,
              status: 'failed',
              error: err instanceof Error ? err.message : String(err),
              finishedAt: new Date().toISOString(),
            });
          }
        },
      );
    });

    reply.code(201);
    return { pipeline: started };
  });

  app.get('/api/pipeline/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const record = store.get(id);
    if (!record) {
      reply.code(404);
      return { error: 'pipeline not found' };
    }
    return { pipeline: record };
  });

  app.get('/api/pipeline', async () => ({ pipelines: store.list() }));

  // SSE, same transport shape as /api/jobs/:id/events. The payload is the
  // whole PipelineRecord: it is small, and sending it entire means a client
  // that connects mid-run is immediately correct instead of having to
  // reconstruct state from a partial event history.
  app.get('/api/pipeline/:id/events', async (request, reply) => {
    const { id } = request.params as { id: string };
    const initial = store.get(id);
    if (!initial) {
      reply.code(404);
      return { error: 'pipeline not found' };
    }

    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    let ended = false;
    const send = (record: PipelineRecord) => {
      if (ended) return;
      reply.raw.write(`event: pipeline\ndata: ${JSON.stringify(record)}\n\n`);
      if (record.status !== 'running') end();
    };

    const unsubscribe = store.subscribe(id, send);
    const ping = setInterval(() => {
      if (!ended) reply.raw.write(': ping\n\n');
    }, 15_000);

    function end() {
      if (ended) return;
      ended = true;
      clearInterval(ping);
      unsubscribe();
      reply.raw.end();
    }

    request.raw.on('close', end);
    send(initial);
  });
}

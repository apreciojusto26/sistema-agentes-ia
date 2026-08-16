// Real Fastify bootstrap (design §1 "Serving the built frontend"; task
// E11/E12) — REPLACES Batch A's health-stub placeholder.
//
// registry.recover() (design §2) runs synchronously inside buildApp(),
// strictly before it returns, which is strictly before main() ever calls
// .listen() — so a restart never accepts a connection while a job's
// pre-restart 'running'/'queued' status could still be observed unrecovered.
//
// The server runs under tsx with no compile step (design §1, judgment call
// 2) — see admin/src/server/validation/content.ts's note on why a tsc emit
// would break the relative import to scripts/lib/content-contract.mjs.
import './load-env';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import { JobRegistry } from './jobs/registry';
import { registerHealthRoutes } from './routes/health';
import { registerContentRoutes } from './routes/content';
import { registerJobsRoutes } from './routes/jobs';
import { registerEventsRoutes } from './routes/events';
import { registerArtifactsRoutes } from './routes/artifacts';
import { registerPreviewRoutes } from './routes/preview';
import { ADMIN_ROOT, PORT } from './config';

export type BuildAppOptions = {
  registry?: JobRegistry;
  /** Overridable for tests; defaults to {ADMIN_ROOT}/dist/client (the real vite build output, design §1). */
  distClientDir?: string;
  /** Overridable for tests so "frontend not built" degradation is assertable without capturing real stdout. */
  logger?: { warn: (msg: string) => void };
};

export async function buildApp(opts: BuildAppOptions = {}): Promise<FastifyInstance> {
  const registry = opts.registry ?? new JobRegistry();

  // Restart recovery MUST complete before the server accepts connections
  // (design §2) — recover() is synchronous, and this call happens before
  // buildApp() returns, which is before main() below ever calls .listen().
  registry.recover();

  const app = Fastify({ logger: !opts.logger });
  const log = opts.logger ?? { warn: (msg: string) => app.log.warn(msg) };

  registerHealthRoutes(app);
  registerContentRoutes(app);
  registerJobsRoutes(app, registry);
  registerEventsRoutes(app, registry);
  registerArtifactsRoutes(app, registry);
  registerPreviewRoutes(app);

  const distClientDir = opts.distClientDir ?? path.join(ADMIN_ROOT, 'dist', 'client');
  const indexHtmlPath = path.join(distClientDir, 'index.html');

  if (existsSync(indexHtmlPath)) {
    await app.register(fastifyStatic, { root: distClientDir, prefix: '/' });

    app.setNotFoundHandler((request, reply) => {
      // /api/* 404s must stay JSON — the SPA fallback is only for client
      // routes the built React app itself will handle.
      if (request.raw.url?.startsWith('/api')) {
        reply.code(404).send({ error: 'not found' });
        return;
      }
      reply.code(200).type('text/html').send(readFileSync(indexHtmlPath, 'utf8'));
    });
  } else {
    // Honest degradation (spec R8 "Honest UI") — never a blank page with no
    // explanation. API-only mode: every /api/* route above still works.
    log.warn('frontend not built — run "pnpm dev:web" (:5173) or "pnpm build"; serving API only');
  }

  return app;
}

export async function main(): Promise<void> {
  const app = await buildApp();
  app.listen({ port: PORT, host: '127.0.0.1' }).catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
}

// Only auto-run when this file is executed directly (tsx src/server/main.ts
// / tsx watch ...), never when imported by tests.
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

// HTTP surface over the landing library.
//
// Transport and containment only: every decision about what a landing IS lives
// in ../landings.ts, and every path is resolved there, on the server, from a
// slug. The client never sends a path and no string it sends is ever
// concatenated into one.
import { createReadStream, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import type { FastifyInstance, FastifyReply } from 'fastify';
import * as landings from '../landings';
import * as store from '../pipeline-store';

/** Content types for what a built Astro landing actually contains. */
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
};

export function registerLandingsRoutes(app: FastifyInstance): void {
  /** The library. Derived from outputs/, never from job history. */
  app.get('/api/landings', async () => ({ landings: landings.list() }));

  /**
   * One landing, with its generation runs.
   *
   * The runs come from the pipeline store, which now persists them — so this
   * answers "what happened the last time this page was built" after a restart,
   * which is the entire reason the store gained a disk mirror.
   */
  app.get('/api/landings/:slug', async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const landing = landings.describe(slug);
    if (!landing) {
      reply.code(404);
      return { error: 'No existe una landing con ese identificador.' };
    }
    return { landing, runs: store.forSlug(slug) };
  });

  /**
   * Deletes a landing's generated files.
   *
   * NOTHING IN SHOPIFY IS TOUCHED — the product, the storefront and the shop
   * configuration live in the merchant's account and this server has no client
   * that could reach them. The response says so, because an operator about to
   * delete something deserves to know exactly how far it goes.
   */
  app.delete('/api/landings/:slug', async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const runs = store.forSlug(slug);
    const outcome = landings.remove(slug);
    if (!outcome.ok) {
      reply.code(outcome.code === 'not-found' ? 404 : 409);
      return { error: outcome.message };
    }
    // The reports go with it. Keeping a run report for a landing that no
    // longer exists would put an unreachable row in every history.
    for (const run of runs) store.forget(run.pipelineId);
    return { deleted: outcome.slug, shopifyProductDeleted: false };
  });

  /**
   * Serves the landing's OWN build, for the preview iframe.
   *
   * THE REAL ARTEFACT, not a React reconstruction of it. What an operator
   * needs to look at is the page the system produced — a faithful-looking
   * re-implementation would be the one thing guaranteed not to reveal a
   * generation bug.
   *
   * Wildcard, because a built Astro page pulls its own CSS, JS and images by
   * relative path; serving only index.html would render an unstyled skeleton.
   * Every one of those requests is resolved through the same containment.
   */
  app.get('/api/landings/:slug/preview', async (request, reply) => {
    const { slug } = request.params as { slug: string };
    return serve(slug, '', reply);
  });
  app.get('/api/landings/:slug/preview/*', async (request, reply) => {
    const { slug, '*': rest } = request.params as { slug: string; '*': string };
    return serve(slug, rest ?? '', reply);
  });

  /**
   * Rewrites the site's ROOT-ABSOLUTE references onto the preview prefix.
   *
   * A built Astro page asks for `/_astro/app.css` and `/og-cover.webp`. Served
   * under `/api/landings/<slug>/preview/`, those resolve against the ADMIN's
   * root — so the first render came back as real content with no stylesheet at
   * all. `<base>` does not help: an absolute path ignores it by definition.
   *
   * NARROW ON PURPOSE. Only `href`, `src`, `srcset` and `url(...)` are touched,
   * and only when they start with a single `/` — never `//host`, never a full
   * URL, never arbitrary text that happens to look like a path. A broader
   * substitution would eventually rewrite a product description.
   */
  function mount(body: string, slug: string): string {
    const prefix = `/api/landings/${encodeURIComponent(slug)}/preview`;
    return body
      .replace(/\b(href|src)="\/(?!\/)/g, `$1="${prefix}/`)
      .replace(/\bsrcset="([^"]*)"/g, (_all, value: string) =>
        `srcset="${value.replace(/(^|,\s*)\/(?!\/)/g, `$1${prefix}/`)}"`,
      )
      .replace(/url\(\/(?!\/)/g, `url(${prefix}/`);
  }

  function serve(slug: string, relative: string, res: FastifyReply) {
    const file = landings.resolvePreviewFile(slug, relative);
    if (!file) {
      res.code(404);
      return res.send({ error: 'not found' });
    }
    // A GENERATED LANDING IS NOT TRUSTED CONTENT. It is built from a scraped
    // page and a model's copy; it is served here so an operator can look at
    // it, and it must not be able to act as the Admin. No same-origin script
    // reach, no framing beyond this Admin, and no MIME sniffing.
    res.header('Content-Security-Policy', "frame-ancestors 'self'");
    res.header('X-Content-Type-Options', 'nosniff');
    res.header('Cache-Control', 'no-store');
    const extension = path.extname(file).toLowerCase();
    res.type(MIME[extension] ?? 'application/octet-stream');

    // HTML and CSS are the only two that carry site-absolute references.
    // Everything else — images, fonts, JS chunks — streams untouched.
    if (extension === '.html' || extension === '.css') {
      const body = mount(readFileSync(file, 'utf-8'), slug);
      res.header('Content-Length', String(Buffer.byteLength(body)));
      return res.send(body);
    }

    res.header('Content-Length', String(statSync(file).size));
    return res.send(createReadStream(file));
  }
}

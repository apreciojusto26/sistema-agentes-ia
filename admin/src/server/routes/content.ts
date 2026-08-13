// Content/Design manual stage routes (spec R7 "Content/Design Manual Stage";
// design §6; task E3/E4). Validation calls the SAME shared content-contract
// validators the CLI uses (scripts/lib/content-contract.mjs via the thin
// ../validation/content adapter) — no duplicated whitelist anywhere here
// (guarded repo-wide by admin/test/no-duplicated-contract.test.ts).
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { collectContentErrors } from '../validation/content';
import { STAGED_DIR, STAGED_CONTENT_PATH } from '../config';
import type {
  ValidateContentRequest,
  ValidateResponse,
  PutStagedContentRequest,
  PutStagedContentResponse,
  GetStagedContentResponse,
} from '../../shared/api';

type ParsedContentShape = {
  product?: Record<string, unknown>;
  faq?: unknown[];
  testimonials?: unknown[];
  design?: unknown;
};

function summarize(content: ParsedContentShape): ValidateResponse & { ok: true } {
  return {
    ok: true,
    summary: {
      productFields: content.product ? Object.keys(content.product).length : 0,
      faqCount: Array.isArray(content.faq) ? content.faq.length : 0,
      testimonialCount: Array.isArray(content.testimonials) ? content.testimonials.length : 0,
      hasDesign: !!content.design,
    },
  };
}

/**
 * `raw` (JSON text, may fail to parse — an `unparseable` state per design §6
 * judgment call #10) or an already-parsed `content` object. Never throws.
 */
function validate(input: ValidateContentRequest | { content: unknown }): ValidateResponse {
  let content: unknown;

  if ('raw' in input) {
    try {
      content = JSON.parse(input.raw);
    } catch (err) {
      return { ok: false, parseError: err instanceof Error ? err.message : 'JSON.parse failed' };
    }
  } else {
    content = input.content;
  }

  const issues = collectContentErrors(content);
  if (issues.length > 0) return { ok: false, issues };

  return summarize(content as ParsedContentShape);
}

export function registerContentRoutes(app: FastifyInstance): void {
  app.post('/api/content/validate', async (request) => {
    const body = request.body as ValidateContentRequest;
    return validate(body);
  });

  app.put('/api/content/staged', async (request, reply) => {
    const { raw } = request.body as PutStagedContentRequest;
    const result = validate({ raw });

    if (!result.ok) {
      reply.code(422);
      return result;
    }

    mkdirSync(STAGED_DIR, { recursive: true });
    // 2-space pretty-print (design §6) of the PARSED content, not the raw
    // input verbatim — canonicalizes whitespace so re-reads are stable.
    const pretty = JSON.stringify(JSON.parse(raw), null, 2);
    writeFileSync(STAGED_CONTENT_PATH, pretty);

    const response: PutStagedContentResponse = {
      ok: true,
      path: STAGED_CONTENT_PATH,
      sha256: createHash('sha256').update(pretty).digest('hex'),
      bytes: Buffer.byteLength(pretty),
      savedAt: new Date().toISOString(),
    };
    return response;
  });

  app.get('/api/content/staged', async () => {
    if (!existsSync(STAGED_CONTENT_PATH)) {
      const response: GetStagedContentResponse = { present: false };
      return response;
    }

    const raw = readFileSync(STAGED_CONTENT_PATH, 'utf8');
    const stat = statSync(STAGED_CONTENT_PATH);

    const response: GetStagedContentResponse = {
      present: true,
      path: STAGED_CONTENT_PATH,
      sha256: createHash('sha256').update(raw).digest('hex'),
      bytes: Buffer.byteLength(raw),
      savedAt: stat.mtime.toISOString(),
      // Re-validate on read (design §6) — the file may have been hand-edited
      // on disk since it was staged.
      validation: validate({ raw }),
    };
    return response;
  });

  app.delete('/api/content/staged', async () => {
    rmSync(STAGED_CONTENT_PATH, { force: true });
    return { ok: true };
  });
}

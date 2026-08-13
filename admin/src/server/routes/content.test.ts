// RED-before-GREEN for the Content/Design manual stage routes (spec R7;
// design §6; task E3/E4). Validation MUST call the shared content-contract
// validators (scripts/lib/content-contract.mjs) — no duplicated whitelist.
import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import Fastify from 'fastify';
import { STAGED_DIR, STAGED_CONTENT_PATH } from '../config';

const MINIMAL_CONTENT = JSON.parse(
  readFileSync(new URL('../../../test/fixtures/minimal-content.json', import.meta.url), 'utf8'),
);
const INVALID_CONTENT = JSON.parse(
  readFileSync(new URL('../../../test/fixtures/invalid-content.json', import.meta.url), 'utf8'),
);

async function buildApp() {
  const { registerContentRoutes } = await import('./content');
  const app = Fastify();
  registerContentRoutes(app);
  return app;
}

describe('POST /api/content/validate', () => {
  test('ok:true for a well-formed content object (design §6)', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/api/content/validate', payload: { content: MINIMAL_CONTENT } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.summary.faqCount).toBe(MINIMAL_CONTENT.faq.length);
    expect(body.summary.testimonialCount).toBe(MINIMAL_CONTENT.testimonials.length);
    expect(body.summary.hasDesign).toBe(true);
  });

  test('parseError for malformed JSON raw string — a syntax error, not a contract violation', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/api/content/validate', payload: { raw: '{ not valid json' } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(false);
    expect(typeof body.parseError).toBe('string');
  });

  test('issues[] for content with unknown/missing fields, using the SAME shared validator as the CLI', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/api/content/validate', payload: { content: INVALID_CONTENT } });
    const body = res.json();
    expect(body.ok).toBe(false);
    expect(Array.isArray(body.issues)).toBe(true);
    expect(body.issues.some((i: { code: string }) => i.code === 'product-unknown-fields')).toBe(true);
  });
});

describe('PUT/GET/DELETE /api/content/staged', () => {
  beforeEach(() => rmSync(STAGED_DIR, { recursive: true, force: true }));
  afterEach(() => rmSync(STAGED_DIR, { recursive: true, force: true }));

  test('GET returns present:false when nothing staged yet', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/content/staged' });
    expect(res.json()).toEqual({ present: false });
  });

  test('PUT writes admin/.staged/content.json 2-space pretty, returns sha256/bytes/savedAt', async () => {
    const app = await buildApp();
    const raw = JSON.stringify(MINIMAL_CONTENT);
    const res = await app.inject({ method: 'PUT', url: '/api/content/staged', payload: { raw } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(typeof body.sha256).toBe('string');
    expect(body.sha256).toHaveLength(64);
    expect(body.bytes).toBeGreaterThan(0);
    expect(existsSync(STAGED_CONTENT_PATH)).toBe(true);
    const onDisk = readFileSync(STAGED_CONTENT_PATH, 'utf8');
    expect(onDisk).toBe(JSON.stringify(MINIMAL_CONTENT, null, 2));
  });

  test('PUT with invalid content does NOT write to disk and reports issues (422)', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'PUT', url: '/api/content/staged', payload: { raw: JSON.stringify(INVALID_CONTENT) } });
    expect(res.statusCode).toBe(422);
    expect(existsSync(STAGED_CONTENT_PATH)).toBe(false);
  });

  test('GET re-validates on read (staged file may have been hand-edited since staging)', async () => {
    mkdirSync(STAGED_DIR, { recursive: true });
    writeFileSync(STAGED_CONTENT_PATH, JSON.stringify(MINIMAL_CONTENT, null, 2));

    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/content/staged' });
    const body = res.json();
    expect(body.present).toBe(true);
    expect(body.validation.ok).toBe(true);
  });

  test('DELETE removes the staged artifact', async () => {
    mkdirSync(STAGED_DIR, { recursive: true });
    writeFileSync(STAGED_CONTENT_PATH, JSON.stringify(MINIMAL_CONTENT, null, 2));

    const app = await buildApp();
    const res = await app.inject({ method: 'DELETE', url: '/api/content/staged' });
    expect(res.statusCode).toBe(200);
    expect(existsSync(STAGED_CONTENT_PATH)).toBe(false);
  });
});

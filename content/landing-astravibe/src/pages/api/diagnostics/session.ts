/**
 * GET /api/diagnostics/session?dsid=…&token=… — reads back one correlation
 * id's event trail.
 *
 * Protected by DIAGNOSTICS_TOKEN. Without it configured the route is DISABLED
 * rather than open: a misconfigured deploy must fail closed, and an unset
 * secret is exactly the case where failing open would expose the trail.
 */
import type { APIRoute } from 'astro';
import { getSecret } from 'astro:env/server';
import { getDiagnosticEvents } from '@/lib/kv';

/**
 * Length-independent comparison. The values are short and low-value, but a
 * token check that leaks its own answer through timing is not worth shipping.
 */
function tokensMatch(provided: string, expected: string): boolean {
  if (provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < provided.length; i += 1) {
    diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

export const GET: APIRoute = async ({ url, request }) => {
  const expected = getSecret('DIAGNOSTICS_TOKEN');
  if (!expected) {
    return Response.json({ error: 'diagnostics_disabled' }, { status: 404 });
  }

  // Header preferred — a query string lands in logs and browser history.
  const provided = request.headers.get('x-diagnostics-token') ?? url.searchParams.get('token') ?? '';
  if (!tokensMatch(provided, expected)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const dsid = url.searchParams.get('dsid');
  if (!dsid) {
    return Response.json({ error: 'missing_dsid' }, { status: 400 });
  }

  try {
    const events = await getDiagnosticEvents(dsid);
    return Response.json(
      { dsid, count: events.length, events },
      { status: 200, headers: { 'cache-control': 'no-store' } },
    );
  } catch (err) {
    console.error('GET /api/diagnostics/session failed', err);
    return Response.json({ error: 'server_error' }, { status: 500 });
  }
};

/**
 * POST /api/diagnostics/event — records one checkout diagnostic event.
 *
 * Public by necessity (the browser calls it, including before it has a ref),
 * so it is written to be uninteresting to abuse: it accepts only a fixed set
 * of event names, stores nothing free-form beyond a truncated note, writes to
 * a keyspace that expires in 48h, and caps entries per correlation id.
 *
 * ALWAYS answers 204. A diagnostics endpoint that surfaces errors to the
 * buyer would be worse than no diagnostics at all.
 */
import type { APIRoute } from 'astro';
import { appendDiagnosticEvent } from '@/lib/kv';
import { isCheckoutEvent, type DiagnosticEventRecord } from '@/lib/telemetry/events';
import { detectBrowser, isTikTokWebView, summarizeUserAgent } from '@/lib/telemetry/webview';

const NO_CONTENT = new Response(null, { status: 204 });

/** Bounds every client-supplied string; `undefined` when absent so the stored record stays sparse. */
function clip(value: unknown, max: number): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value.slice(0, max) : undefined;
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const raw: unknown = await request.json();
    if (!raw || typeof raw !== 'object') return NO_CONTENT;

    const body = raw as Record<string, unknown>;
    if (!isCheckoutEvent(body.event)) return NO_CONTENT;

    const dsid = clip(body.dsid, 40);
    if (!dsid) return NO_CONTENT;

    // Browser identity is re-derived from the request header, never taken
    // from the payload: the client tags its own events for its own use, but
    // the stored answer has to come from something it did not author.
    const userAgent = request.headers.get('user-agent');

    // Bound each field once. exactOptionalPropertyTypes is on, so an optional
    // key must be omitted entirely rather than assigned `undefined`.
    const pathname = clip(body.pathname, 120);
    const hostname = clip(body.hostname, 120);
    const phase = clip(body.phase, 40);
    const ref = clip(body.ref, 40);
    const checkoutId = clip(body.checkoutId, 60);
    const detail = clip(body.detail, 200);

    const record: DiagnosticEventRecord = {
      event: body.event,
      timestamp: new Date().toISOString(),
      detectedBrowser: detectBrowser(userAgent),
      isTikTokWebView: isTikTokWebView(userAgent),
      userAgentSummary: summarizeUserAgent(userAgent),
      ...(pathname ? { pathname } : {}),
      ...(hostname ? { hostname } : {}),
      ...(phase ? { phase } : {}),
      ...(ref ? { ref } : {}),
      ...(checkoutId ? { checkoutId } : {}),
      ...(detail ? { detail } : {}),
    };

    await appendDiagnosticEvent(dsid, record);
  } catch {
    // Swallow: a broken diagnostic must not become a broken checkout.
  }

  return NO_CONTENT;
};

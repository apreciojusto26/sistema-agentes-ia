// Client transport for the pipeline. Mirrors http/client.ts's shape and reuses
// its `requestJson` conventions; the SSE hook mirrors useJobStream's — a
// pipeline stream is the same transport with a different payload, not a new
// mechanism.
import { useEffect, useRef, useState } from 'react';
import type { PipelineRecord } from '../../server/pipeline';

export type StartPipelineBody = {
  url?: string;
  scrapeJobId?: string;
  slug: string;
  shopifyHandle?: string | null;
  force?: boolean;
};

export type StartPipelineResult =
  | { ok: true; pipeline: PipelineRecord }
  | { ok: false; message: string; pipeline?: PipelineRecord };

export async function startPipeline(body: StartPipelineBody): Promise<StartPipelineResult> {
  const res = await fetch('/api/pipeline', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);

  if (res.ok) return { ok: true, pipeline: (json as { pipeline: PipelineRecord }).pipeline };
  return {
    ok: false,
    message: (json as { error?: string } | null)?.error ?? `HTTP ${res.status}`,
    pipeline: (json as { pipeline?: PipelineRecord } | null)?.pipeline,
  };
}

/**
 * Subscribes to a pipeline's SSE stream.
 *
 * Each frame carries the WHOLE record, so a client connecting mid-run is
 * immediately correct instead of reconstructing state from partial history —
 * and there is no polling, which the existing SSE plumbing already made
 * unnecessary.
 */
export function usePipelineStream(pipelineId: string | null): PipelineRecord | null {
  const [record, setRecord] = useState<PipelineRecord | null>(null);
  const idRef = useRef<string | null>(null);

  useEffect(() => {
    if (!pipelineId) return;
    // A new id means a new run — drop the previous record so the timeline
    // never shows a stale run's stages next to a fresh one's.
    if (idRef.current !== pipelineId) {
      idRef.current = pipelineId;
      setRecord(null);
    }

    const source = new EventSource(`/api/pipeline/${pipelineId}/events`);
    source.addEventListener('pipeline', (event) => {
      try {
        setRecord(JSON.parse((event as MessageEvent).data) as PipelineRecord);
      } catch {
        // A malformed frame is dropped, never allowed to blank the UI.
      }
    });
    source.onerror = () => source.close();

    return () => source.close();
  }, [pipelineId]);

  return record;
}

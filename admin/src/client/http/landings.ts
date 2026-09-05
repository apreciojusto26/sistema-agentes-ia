// Client for the landing library.
//
// EVERY PATH IS THE SERVER'S. The browser holds a slug and asks for URLs by
// slug; it never builds a filesystem path and never receives one it is meant to
// interpret. The preview URL below is a route, not a location on disk.
import type { LandingSummary } from '../../server/landings';
import type { PipelineRecord } from '../../server/pipeline';

export type { LandingSummary };

export type LandingDetail = { landing: LandingSummary; runs: PipelineRecord[] };

export async function listLandings(): Promise<LandingSummary[]> {
  const res = await fetch('/api/landings');
  if (!res.ok) return [];
  const body = (await res.json()) as { landings?: LandingSummary[] };
  return body.landings ?? [];
}

export async function getLanding(slug: string): Promise<LandingDetail | null> {
  const res = await fetch(`/api/landings/${encodeURIComponent(slug)}`);
  if (!res.ok) return null;
  return (await res.json()) as LandingDetail;
}

export async function deleteLanding(
  slug: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const res = await fetch(`/api/landings/${encodeURIComponent(slug)}`, { method: 'DELETE' });
  if (res.ok) return { ok: true };
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  return { ok: false, message: body.error ?? 'No se pudo eliminar la landing.' };
}

/** Where the Admin serves this landing's OWN build. A route, resolved server-side. */
export const previewUrl = (slug: string): string =>
  `/api/landings/${encodeURIComponent(slug)}/preview/`;

// Typed fetch wrapper over the DTOs in shared/api.ts (design §1's
// client/api/client.ts; task F2). Every function maps 1:1 onto a real Batch
// E route and returns the same ok/error shape the route actually produces —
// verified against the real route source (routes/{health,content,jobs}.ts),
// not re-derived from the design doc alone, since Batch E is a fixed,
// already-tested contract.
import type {
  HealthResponse,
  ValidateContentRequest,
  ValidateResponse,
  PutStagedContentRequest,
  PutStagedContentResponse,
  GetStagedContentResponse,
  CreateJobRequest,
  OverwriteConfirmationRequired,
  NoContentArtifact,
  ContentInvalid,
  SlugInvalid,
  UrlInvalid,
  JobListResponse,
  JobDetailResponse,
  CancelJobResponse,
  LastAttemptResponse,
} from '../../shared/api';

/** Thrown for a network-level failure (fetch itself rejected) or a response body that failed to parse as JSON. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      // Only declare a JSON content-type when there's actually a body to
      // parse as one — Fastify's default JSON body parser rejects an empty
      // body sent with `Content-Type: application/json`
      // (FST_ERR_CTP_EMPTY_JSON_BODY), which every bodyless call here
      // (cancelJob's POST, deleteStagedContent's DELETE) would otherwise hit.
      headers: init?.body ? { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } : init?.headers,
    });
  } catch (err) {
    throw new ApiError(err instanceof Error ? err.message : 'network error', null);
  }

  const text = await res.text();
  if (!text) {
    if (!res.ok) throw new ApiError(`${res.status} ${res.statusText}`, res.status);
    return null as T;
  }

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new ApiError(`non-JSON response (status ${res.status})`, res.status);
  }
  return body as T;
}

// ---------------------------------------------------------------------------
// GET /api/health
// ---------------------------------------------------------------------------

export function getHealth(): Promise<HealthResponse> {
  return requestJson('/api/health');
}

// ---------------------------------------------------------------------------
// POST /api/content/validate, PUT/GET/DELETE /api/content/staged
// ---------------------------------------------------------------------------

export function validateContent(body: ValidateContentRequest): Promise<ValidateResponse> {
  return requestJson('/api/content/validate', { method: 'POST', body: JSON.stringify(body) });
}

export function getStagedContent(): Promise<GetStagedContentResponse> {
  return requestJson('/api/content/staged');
}

/** 200 on success. On 422 the route returns ValidateResponse's `ok:false` shape (no dedicated failure DTO — see api.ts). */
export function putStagedContent(
  body: PutStagedContentRequest,
): Promise<PutStagedContentResponse | Extract<ValidateResponse, { ok: false }>> {
  return requestJson('/api/content/staged', { method: 'PUT', body: JSON.stringify(body) });
}

export function deleteStagedContent(): Promise<{ ok: true }> {
  return requestJson('/api/content/staged', { method: 'DELETE' });
}

// ---------------------------------------------------------------------------
// POST /api/jobs, GET /api/jobs, GET /api/jobs/:id, POST /api/jobs/:id/cancel
// ---------------------------------------------------------------------------

export type CreateJobResult =
  | { ok: true; status: 201; job: JobDetailResponse['job'] }
  | { ok: false; status: 400; error: SlugInvalid | UrlInvalid | { code: string; message: string } }
  | { ok: false; status: 409; error: OverwriteConfirmationRequired | NoContentArtifact }
  | { ok: false; status: 422; error: ContentInvalid };

/**
 * Deliberately NOT `requestJson` — every branch (201/400/409/422) is a
 * legitimate, expected outcome the caller must distinguish (e.g. 409
 * overwrite-confirmation-required drives OverwriteConfirmDialog), not an
 * error to throw away. See routes/jobs.ts for the exact status/body pairing
 * this mirrors.
 */
export async function createJob(body: CreateJobRequest): Promise<CreateJobResult> {
  let res: Response;
  try {
    res = await fetch('/api/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new ApiError(err instanceof Error ? err.message : 'network error', null);
  }

  const parsed = (await res.json()) as unknown;

  if (res.status === 201) {
    return { ok: true, status: 201, job: (parsed as JobDetailResponse).job };
  }
  return { ok: false, status: res.status as 400 | 409 | 422, error: parsed as never };
}

export function listJobs(): Promise<JobListResponse> {
  return requestJson('/api/jobs');
}

export function getJob(id: string): Promise<JobDetailResponse> {
  return requestJson(`/api/jobs/${id}`);
}

export function cancelJob(id: string): Promise<CancelJobResponse> {
  return requestJson(`/api/jobs/${id}/cancel`, { method: 'POST' });
}

// ---------------------------------------------------------------------------
// GET /api/jobs/:id/scrape/* — archived artifact URLs (no fetch wrapper
// needed, these are rendered directly as <img src> / download links).
// ---------------------------------------------------------------------------

export function scrapeProductJsonUrl(jobId: string): string {
  return `/api/jobs/${jobId}/scrape/product.json`;
}

export function scrapeImageUrl(jobId: string, file: string): string {
  return `/api/jobs/${jobId}/scrape/images/${file}`;
}

// ---------------------------------------------------------------------------
// GET /api/jobs/:id/content/last-attempt
// ---------------------------------------------------------------------------

export function getLastContentAttempt(jobId: string): Promise<LastAttemptResponse> {
  return requestJson(`/api/jobs/${jobId}/content/last-attempt`);
}

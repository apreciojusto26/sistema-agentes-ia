/**
 * Raw-fetch SumUp REST client. SERVER-ONLY — imported exclusively from
 * src/lib/sumup/checkout.ts, src/lib/sumup/settle.ts, and API routes; never
 * from an island. Mirrors src/lib/shopify/client.ts's `Error` subclass +
 * `assertEnv()` conventions (zero deps).
 *
 * Secrets are read via `astro:env/server`'s `getSecret()` escape hatch
 * (not the typed schema exports) so this module works identically whether
 * or not `astro sync` has regenerated `.astro/env.d.ts` — verified against
 * the installed astro@7.1.3 `astro:env/server` module, which always exports
 * `getSecret(key: string): string | undefined` regardless of schema state.
 * Per design A6: `import.meta.env` is unreliable at runtime for non-PUBLIC_
 * vars once the Vercel adapter is in play.
 */
import { getSecret } from 'astro:env/server';

export class SumUpError extends Error {
  constructor(
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'SumUpError';
  }
}

interface SumUpEnv {
  apiKey: string;
  merchantCode: string;
}

export function assertEnv(): SumUpEnv {
  const apiKey = getSecret('SUMUP_API_KEY');
  const merchantCode = getSecret('SUMUP_MERCHANT_CODE');

  if (!apiKey || !merchantCode) {
    throw new SumUpError('Missing SUMUP_API_KEY / SUMUP_MERCHANT_CODE — server misconfigured');
  }

  return { apiKey, merchantCode };
}

const BASE_URL = 'https://api.sumup.com';

interface SumUpProblem {
  message?: string;
  detail?: string;
  error_code?: string;
}

/** Raw REST call against the SumUp API. Throws SumUpError on any non-2xx or network failure. */
export async function sumup<T>(path: string, init?: RequestInit): Promise<T> {
  const { apiKey } = assertEnv();
  const url = `${BASE_URL}${path}`;

  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        ...(init?.headers ?? {}),
      },
    });
  } catch (cause) {
    throw new SumUpError(`SumUp API request failed (network): ${url}`, cause);
  }

  if (!response.ok) {
    let detail = '';
    try {
      const problem = (await response.json()) as SumUpProblem;
      detail = problem.message ?? problem.detail ?? problem.error_code ?? '';
    } catch {
      // Response wasn't JSON — proceed with just the status code.
    }
    throw new SumUpError(`SumUp API HTTP ${response.status} — ${url}${detail ? `: ${detail}` : ''}`);
  }

  const text = await response.text();
  return (text.length > 0 ? JSON.parse(text) : undefined) as T;
}

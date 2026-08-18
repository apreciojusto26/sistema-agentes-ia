// Product Normalizer wiring (spec "product-normalizer-wiring"; design
// ADR-1). Runs only after a successful archive step (`archiveScrape` returns
// `ok:true`) — see registry.ts `#onChildExit`. Converts the archived, raw
// `product.json` into a fixed-shape CanonicalProduct via `normalizeProduct`
// (scripts/lib/product-normalizer.mjs, reached through the ADR-2 adapter)
// and persists it as `canonical-product.json` alongside the archived
// `product.json` (never mutated).
//
// Guiding principle (design, user-set): never manufacture a successful
// downstream state from a missing or failed upstream artifact. This governs
// both non-success branches below:
//
//   1. ADR-5 (OQ-1) — no readable input. `product.json` is either absent or
//      unparseable. This is NOT a job failure: the scrape/archive genuinely
//      succeeded. The step returns `{ skipped:true, reason }` and the caller
//      MUST treat it as a pure no-op — no `job.error`, no meta event, no
//      artifact. The pre-existing downstream 409 `no-scrape-artifact` gate
//      (routes/jobs.ts) is the unchanged observable result.
//
//   2. Ownership mismatch / ADR-6 write failure — correctness violations or
//      an undeliverable artifact. Both are FATAL: the caller MUST demote
//      `job.status` to 'failed' before publish. No artifact is left behind
//      (a mismatched canonical is never written; a partial write is removed
//      best-effort).
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { normalizeProduct } from '../validation/product-normalizer';

export type NormalizeResult =
  // success — artifact is on disk
  | { ok: true; canonicalPath: string; productId: string | null }
  // ADR-5 / OQ-1 — no readable input. Pure no-op for the caller: the job is
  // NOT failed, NO artifact is written, NO meta event is emitted. The
  // pre-existing 409 `no-scrape-artifact` downstream is the observable result.
  | {
      ok: false;
      skipped: true;
      reason: 'product-json-absent' | 'product-json-unparseable';
      error: string;
    }
  // correctness violation — fails the job (guard, no artifact written)
  | {
      ok: false;
      fatal: true;
      code: 'canonical-product-ownership-mismatch';
      error: string;
      expected: string;
      found: string | null;
    }
  // ADR-6 / OQ-2 — the step's only deliverable failed to land. FATAL.
  // `error` is the RAW fs message (errno + path), never wrapped.
  | {
      ok: false;
      fatal: true;
      code: 'canonical-product-write-failed';
      error: string;
      canonicalPath: string;
    };

/**
 * Normalizes the `product.json` archived at `archiveDir` into
 * `canonical-product.json`, written alongside it. `jobId` is accepted for
 * signature symmetry with `archiveScrape` and caller-side traceability; the
 * module itself never re-derives paths from it — `archiveDir` is always the
 * caller's already-resolved archive destination.
 */
export function normalizeArchivedProduct(
  jobId: string,
  archiveDir: string,
  expectedProductId?: string | null,
): NormalizeResult {
  void jobId;

  const productJsonPath = path.join(archiveDir, 'product.json');

  // ADR-5 step 1: absent input. Detected by existsSync only — never by
  // treating archiveScrape's `productJson: boolean` as authority here, so
  // this module stays correct when called directly (e.g. unit tests) with
  // no ArchiveResult in hand.
  if (!existsSync(productJsonPath)) {
    return {
      ok: false,
      skipped: true,
      reason: 'product-json-absent',
      error: `archived product.json not found: ${productJsonPath}`,
    };
  }

  // ADR-5 step 2: unparseable input. A FRESH try/catch — deliberately NOT
  // `readProductId` from archive.ts, whose catch returns `null` for BOTH a
  // corrupt file AND a perfectly valid legacy product.json with no
  // `productId` field. Those two states must be distinguished here: the
  // legacy case must proceed to normalizeProduct() and succeed (spec
  // scenario "Legacy/near-empty product.json still normalizes
  // successfully"); the corrupt case must skip.
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(productJsonPath, 'utf8'));
  } catch (err) {
    return {
      ok: false,
      skipped: true,
      reason: 'product-json-unparseable',
      error: err instanceof Error ? err.message : 'product.json parse failed',
    };
  }

  const canonicalProduct = normalizeProduct(raw);
  const found = canonicalProduct.identity.productId;

  // The 4th fail-closed guard (design "The 4th fail-closed guard" table).
  // Both-present-and-different only — either side absent/null is legacy,
  // not a mismatch (spec scenario "Either side absent is not a mismatch").
  if (expectedProductId && found && found !== expectedProductId) {
    return {
      ok: false,
      fatal: true,
      code: 'canonical-product-ownership-mismatch',
      error: `canonical product belongs to productId "${found}", expected "${expectedProductId}"`,
      expected: expectedProductId,
      found,
    };
  }

  const canonicalPath = path.join(archiveDir, 'canonical-product.json');

  try {
    writeFileSync(canonicalPath, JSON.stringify(canonicalProduct, null, 2));
  } catch (err) {
    // ADR-6: best-effort cleanup of a partial write so a truncated file can
    // never satisfy the downstream existsSync gate. Cleanup failure itself
    // is swallowed — it must not mask the real fs error.
    try {
      rmSync(canonicalPath, { force: true });
    } catch {
      // swallowed on purpose (ADR-6)
    }
    return {
      ok: false,
      fatal: true,
      code: 'canonical-product-write-failed',
      error: err instanceof Error ? err.message : 'canonical product write failed',
      canonicalPath,
    };
  }

  return { ok: true, canonicalPath, productId: found };
}

// Scraping Agent detail panel (spec R2/R11/R12; design §7 "kind: 'scrape'
// flow"). The "start a run" input used to live here (formSlot) but now lives
// in GeneratorHero — the hero is the single place that calls onRun, so this
// panel is display-only: current job's progress + result. URL preflight
// (empty/non-AliExpress) is still enforced server-side
// (validation/aliexpress-url.ts) — nothing in this panel duplicates it.
import type { JobRecord, ScrapeResult } from '../../../shared/jobs';
import type { SseFrame } from '../../../shared/api';
import { scrapeProductJsonUrl } from '../../http/client';
import AgentRunPanel from './AgentRunPanel';

export type ScrapeAgentPanelProps = {
  job: JobRecord | null;
  logs: Extract<SseFrame, { type: 'log' }>[];
  onCancel: () => void;
};

function isScrapeResult(result: JobRecord['result']): result is ScrapeResult {
  return !!result && 'imageCount' in result;
}

/** Same predicate as AgentRunPanel's — kept local since this panel only needs
 * it to suppress the generic "Aviso" (amber, non-fatal) archiveError notice
 * below when the shared panel already renders the unambiguous red dead-end
 * banner for the exact same message (design "product-identity-generation-
 * isolation" §6.2: an amber "notice" tone would understate a fail-closed,
 * unrecoverable block and could read as a bug). */
function isArchiveOwnershipDeadEnd(job: JobRecord | null): boolean {
  return !!job && job.status === 'failed' && job.error?.stage === 'archive' && job.error?.code === 'archive-ownership-mismatch';
}

export default function ScrapeAgentPanel({ job, logs, onCancel }: ScrapeAgentPanelProps) {
  const result = job && isScrapeResult(job.result) ? job.result : null;

  return (
    <AgentRunPanel
      identity="scrape"
      job={job}
      logs={logs}
      onCancel={onCancel}
      resultSlot={
        <>
          {result && (
            <div className="rounded border border-hairline p-3 text-sm">
              <p className="font-medium text-ink">{result.title ?? '(no se pudo leer el título)'}</p>
              <p className="text-xs text-ink-soft">
                {result.imageCount} fotos encontradas · {result.localImageCount} descargadas · {result.variantCount}{' '}
                variantes · {result.reviewCount} reseñas
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <a href={scrapeProductJsonUrl(job!.jobId)} target="_blank" rel="noreferrer" className="text-xs text-sky-700 underline">
                  ver los datos crudos (product.json)
                </a>
                {/* ScrapeResult carries counts, not filenames — individual image
                    links are deliberately NOT fabricated here (would require
                    guessing an extension the archive route's allowlist may
                    reject). product.json itself lists each local image path. */}
              </div>
              {job?.archiveError && !isArchiveOwnershipDeadEnd(job) && (
                <p className="mt-1 text-xs text-amber-600">Aviso al guardar los archivos: {job.archiveError}</p>
              )}
            </div>
          )}
        </>
      }
    />
  );
}

// Scraping Agent detail panel (spec R2/R11/R12; design §7 "kind: 'scrape'
// flow"). URL preflight (empty/non-AliExpress) is enforced server-side
// (validation/aliexpress-url.ts) — this form just surfaces whatever 400 the
// server returns, it never duplicates that regex client-side.
import { useState } from 'react';
import type { JobRecord, ScrapeResult } from '../../../shared/jobs';
import type { SseFrame } from '../../../shared/api';
import { scrapeProductJsonUrl } from '../../http/client';
import AgentRunPanel from './AgentRunPanel';

export type ScrapeAgentPanelProps = {
  job: JobRecord | null;
  logs: Extract<SseFrame, { type: 'log' }>[];
  onRun: (url: string) => void;
  onCancel: () => void;
  running: boolean;
  submitError: string | null;
};

function isScrapeResult(result: JobRecord['result']): result is ScrapeResult {
  return !!result && 'imageCount' in result;
}

export default function ScrapeAgentPanel({ job, logs, onRun, onCancel, running, submitError }: ScrapeAgentPanelProps) {
  const [url, setUrl] = useState('');

  const result = job && isScrapeResult(job.result) ? job.result : null;

  return (
    <AgentRunPanel
      title="Scraping Agent"
      job={job}
      logs={logs}
      onCancel={onCancel}
      formSlot={
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            onRun(url.trim());
          }}
        >
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://es.aliexpress.com/item/....html"
            className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm"
          />
          <button
            type="submit"
            disabled={running || url.trim().length === 0}
            className="rounded bg-slate-800 px-3 py-1 text-sm font-medium text-white disabled:opacity-40"
          >
            Scrape
          </button>
        </form>
      }
      resultSlot={
        <>
          {submitError && <p className="text-xs text-red-600">{submitError}</p>}
          {result && (
            <div className="rounded border border-slate-200 p-3 text-sm">
              <p className="font-medium">{result.title ?? '(no title captured)'}</p>
              <p className="text-xs text-slate-500">
                {result.imageCount} image(s), {result.localImageCount} downloaded, {result.variantCount} variant(s),{' '}
                {result.reviewCount} review(s)
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <a href={scrapeProductJsonUrl(job!.jobId)} target="_blank" rel="noreferrer" className="text-xs text-sky-700 underline">
                  product.json
                </a>
                {/* ScrapeResult carries counts, not filenames — individual image
                    links are deliberately NOT fabricated here (would require
                    guessing an extension the archive route's allowlist may
                    reject). product.json itself lists each local image path. */}
              </div>
              {job?.archiveError && <p className="mt-1 text-xs text-amber-600">Archiving warning: {job.archiveError}</p>}
            </div>
          )}
        </>
      }
    />
  );
}

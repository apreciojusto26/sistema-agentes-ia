// Hero + AgentTimeline layout (mockup-driven redesign — replaces the earlier
// sidebar + per-agent detail-panel shell from Batch F). Consumes the same
// useJobs/useJobStream real API surface as before; nothing about the data
// flow changed, only which components render it. ScrapeAgentPanel/
// CodeAgentPanel/ContentAgentPanel/AgentSidebar/JobHistory still exist as
// files but are no longer wired in here — "cancelar" and the manual
// content.json paste flow (ContentAgentPanel's onSubmitRaw/onDeleteStaged/
// onCopyLastAttempt) have no reachable UI after this change; only the
// 'generate' trigger got a minimal replacement (GenerateSlugForm), since
// without it there was no way to finish a run at all.
import { useEffect, useState } from 'react';
import AgentTimeline from './components/AgentTimeline';
import PipelinePanel from './components/PipelinePanel';
import GeneratorHero from './components/GeneratorHero';
import GenerateSlugForm from './components/GenerateSlugForm';
import { useJobs } from './http/useJobs';
import { useJobStream } from './http/useJobStream';
import * as api from './http/client';
import type { ContentStageState } from '../shared/content-stage';
import type { OverwriteConfirmationRequired } from '../shared/api';
import type { JobRecord } from '../shared/jobs';
import OverwriteConfirmDialog from './components/OverwriteConfirmDialog';

function latestJobOfKind(jobs: JobRecord[], kind: JobRecord['kind']): JobRecord | null {
  // registry.list() is already sorted newest-first (per Batch E's
  // apply-progress notes) — the first match is the latest.
  return jobs.find((j) => j.kind === kind) ?? null;
}

export default function App() {
  const { jobs, refresh: refreshJobs } = useJobs();

  const [scrapeJobId, setScrapeJobId] = useState<string | null>(null);
  const [generateJobId, setGenerateJobId] = useState<string | null>(null);
  const [contentJobId, setContentJobId] = useState<string | null>(null);
  const [scrapeError, setScrapeError] = useState<string | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [pendingOverwrite, setPendingOverwrite] = useState<{
    slug: string;
    details: OverwriteConfirmationRequired;
  } | null>(null);

  const [contentState, setContentState] = useState<ContentStageState>({ kind: 'idle' });
  const [contentDrift, setContentDrift] = useState<string | null>(null);
  // Set only right after a user-initiated runScrape() call (never on a
  // page-load pickup of an old scrape from job history — see the effect
  // below), so content generation auto-fires exactly once per fresh scrape
  // and never retroactively for jobs that finished in a previous session.
  const [pendingContentForScrapeJobId, setPendingContentForScrapeJobId] = useState<string | null>(null);

  // Pick up the latest run of each kind once the job list has loaded, so a
  // page refresh re-attaches to whatever was already in flight or finished
  // rather than starting from a blank slate.
  useEffect(() => {
    if (jobs.length === 0) return;
    setScrapeJobId((cur) => cur ?? latestJobOfKind(jobs, 'scrape')?.jobId ?? null);
    setGenerateJobId((cur) => cur ?? latestJobOfKind(jobs, 'generate')?.jobId ?? null);
    setContentJobId((cur) => cur ?? latestJobOfKind(jobs, 'content')?.jobId ?? null);
  }, [jobs]);

  useEffect(() => {
    void api
      .getStagedContent()
      .then((res) => {
        if (!res.present) {
          setContentState({ kind: 'idle' });
          return;
        }
        if (res.validation.ok) {
          setContentState({
            kind: 'validated',
            path: res.path,
            sha256: res.sha256,
            bytes: res.bytes,
            savedAt: res.savedAt,
            summary: res.validation.summary,
          });
          setContentDrift(null);
        } else {
          // The staged file exists but has drifted invalid since it was
          // staged (design §6 — GET re-validates on read) and GET does not
          // return the raw text needed to populate ContentStageState's
          // 'invalid'/'unparseable' variants without fabricating it. Rather
          // than inventing a `raw` value, fall back to 'idle' plus an
          // honest banner — the user re-pastes to see full detail.
          setContentState({ kind: 'idle' });
          setContentDrift(
            'present' in res && res.present
              ? `Hay un content.json guardado, pero ya no es válido. Volvé a pegarlo para ver qué le falta.`
              : null,
          );
        }
      })
      .catch(() => {
        // No content staged, or the request failed — 'idle' is the honest default either way.
        setContentState({ kind: 'idle' });
      });
  }, []);

  const scrapeStream = useJobStream(scrapeJobId);
  const generateStream = useJobStream(generateJobId);
  const contentStream = useJobStream(contentJobId);

  // Job history (useJobs' plain GET /api/jobs snapshot) has no SSE of its
  // own — refresh it once each stream reaches a real terminal state, not
  // just after a user-initiated create/cancel action. A cancel's HTTP
  // response returns as soon as SIGTERM is sent, before the child has
  // actually exited and the registry has recorded the terminal status; the
  // list would otherwise keep showing that job as "running" until some
  // unrelated action happened to trigger another refresh.
  useEffect(() => {
    if (scrapeStream.ended) void refreshJobs();
  }, [scrapeStream.ended, refreshJobs]);
  useEffect(() => {
    if (generateStream.ended) void refreshJobs();
  }, [generateStream.ended, refreshJobs]);
  useEffect(() => {
    if (contentStream.ended) void refreshJobs();
  }, [contentStream.ended, refreshJobs]);

  const scrapeJob = scrapeStream.job ?? latestJobOfKind(jobs, 'scrape');
  const generateJob = generateStream.job ?? latestJobOfKind(jobs, 'generate');
  const contentJob = contentStream.job ?? latestJobOfKind(jobs, 'content');

  // Auto-generate content the moment the scrape it depends on succeeds — no
  // "Generar textos" button. Scoped to pendingContentForScrapeJobId so this
  // only fires for a scrape started via the Run button in this session, not
  // for an already-finished scrape picked up from job history on page load.
  useEffect(() => {
    if (!pendingContentForScrapeJobId || scrapeJob?.jobId !== pendingContentForScrapeJobId) return;
    if (scrapeJob.status === 'succeeded') {
      setPendingContentForScrapeJobId(null);
      void runContent(scrapeJob.jobId, '');
    } else if (scrapeJob.status !== 'running' && scrapeJob.status !== 'queued') {
      // Scrape itself failed/timed-out/cancelled/interrupted — nothing to feed the content agent.
      setPendingContentForScrapeJobId(null);
    }
  }, [scrapeJob, pendingContentForScrapeJobId]);

  const scrapeRunning = scrapeJob?.status === 'running' || scrapeJob?.status === 'queued';
  const generateRunning = generateJob?.status === 'running' || generateJob?.status === 'queued';

  async function runScrape(url: string) {
    setScrapeError(null);
    const res = await api.createJob({ kind: 'scrape', url });
    if (res.ok) {
      setScrapeJobId(res.job.jobId);
      setPendingContentForScrapeJobId(res.job.jobId);
      void refreshJobs();
    } else {
      setScrapeError('message' in res.error ? res.error.message : JSON.stringify(res.error));
    }
  }

  async function runGenerate(slug: string, confirmToken?: string) {
    setGenerateError(null);
    const res = await api.createJob({
      kind: 'generate',
      slug,
      ...(confirmToken ? { confirmOverwrite: { token: confirmToken } } : {}),
    });

    if (res.ok) {
      setGenerateJobId(res.job.jobId);
      setPendingOverwrite(null);
      void refreshJobs();
      return;
    }

    if (res.status === 409 && 'confirmToken' in res.error) {
      setPendingOverwrite({ slug, details: res.error });
      return;
    }

    if (res.status === 422 && 'issues' in res.error) {
      setGenerateError(`Faltan datos en el contenido: ${res.error.issues.map((i) => i.message).join('; ')}`);
      return;
    }

    setGenerateError('message' in res.error ? res.error.message : JSON.stringify(res.error));
  }

  async function runContent(scrapeJobIdArg: string, instructions: string) {
    const res = await api.createJob({
      kind: 'content',
      scrapeJobId: scrapeJobIdArg,
      ...(instructions ? { instructions } : {}),
    });
    if (res.ok) {
      setContentJobId(res.job.jobId);
      void refreshJobs();
    }
    // A failure here (the createJob call itself, not the job later failing)
    // has no reachable display since ContentAgentPanel was removed — content
    // generation is now fully automatic, with no manual retry UI. Rare in
    // practice (would mean a network/500 at the moment of auto-chaining
    // right after a scrape succeeds), left as a known gap rather than adding
    // a new error surface beyond what this batch's scope asked for.
  }

  return (
    <div className="flex min-h-screen flex-col">
      <GeneratorHero onRun={(url) => void runScrape(url)} running={scrapeRunning} submitError={scrapeError} />

      {/* One-shot pipeline: form -> 8 real stages -> result -> preview. The
          per-agent flow below stays for step-by-step operation. */}
      <PipelinePanel />

      {contentDrift && (
        <p className="mx-auto mb-2 max-w-3xl px-4 text-center text-xs text-amber-600">{contentDrift}</p>
      )}

      <AgentTimeline
        steps={[
          { identity: 'scrape', job: scrapeJob ?? null },
          { identity: 'content', job: contentJob ?? null },
          {
            identity: 'generate',
            job: generateJob ?? null,
            extra: (
              <GenerateSlugForm
                job={generateJob ?? null}
                onRun={(slug) => void runGenerate(slug)}
                running={!!generateRunning}
                contentReady={contentState.kind === 'validated'}
                submitError={generateError}
              />
            ),
          },
        ]}
      />

      {pendingOverwrite && (
        <div className="mx-auto mb-8 w-full max-w-3xl px-4">
          <OverwriteConfirmDialog
            details={pendingOverwrite.details}
            onCancel={() => setPendingOverwrite(null)}
            onConfirm={(token) => void runGenerate(pendingOverwrite.slug, token)}
          />
        </div>
      )}
    </div>
  );
}

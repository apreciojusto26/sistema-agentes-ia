// Batch F wiring (design §1 tree: App.tsx assembles sidebar + detail panels
// + OverwriteConfirmDialog). Consumes useJobs/useJobStream against Batch E's
// real API surface — no mocked backend. REPLACES Batch A's scaffolding
// placeholder.
import { useEffect, useMemo, useState } from 'react';
import AgentSidebar from './components/AgentSidebar';
import type { SidebarItem } from './components/AgentSidebarItem';
import ScrapeAgentPanel from './components/detail/ScrapeAgentPanel';
import CodeAgentPanel from './components/detail/CodeAgentPanel';
import ContentAgentPanel from './components/detail/ContentAgentPanel';
import OverwriteConfirmDialog from './components/OverwriteConfirmDialog';
import JobHistory from './components/JobHistory';
import { useJobs } from './http/useJobs';
import { useJobStream } from './http/useJobStream';
import * as api from './http/client';
import type { ContentStageState } from '../shared/content-stage';
import type { OverwriteConfirmationRequired } from '../shared/api';
import type { JobRecord } from '../shared/jobs';
import { assertNever } from '../shared/assert-never';

type PanelId = 'scrape' | 'content' | 'generate';

function latestJobOfKind(jobs: JobRecord[], kind: JobRecord['kind']): JobRecord | null {
  // registry.list() is already sorted newest-first (per Batch E's
  // apply-progress notes) — the first match is the latest.
  return jobs.find((j) => j.kind === kind) ?? null;
}

export default function App() {
  const { jobs, refresh: refreshJobs } = useJobs();
  const [selected, setSelected] = useState<PanelId>('scrape');

  const [scrapeJobId, setScrapeJobId] = useState<string | null>(null);
  const [generateJobId, setGenerateJobId] = useState<string | null>(null);
  const [contentJobId, setContentJobId] = useState<string | null>(null);
  const [scrapeError, setScrapeError] = useState<string | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [contentError, setContentError] = useState<string | null>(null);
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
  const contentRunning = contentJob?.status === 'running' || contentJob?.status === 'queued';

  const sidebarItems: SidebarItem[] = useMemo(
    () => [
      { id: 'scrape', kind: 'agent', identity: 'scrape', job: scrapeJob ?? null },
      { id: 'content', kind: 'assisted', identity: 'content', job: contentJob ?? null, state: contentState },
      { id: 'generate', kind: 'agent', identity: 'generate', job: generateJob ?? null },
    ],
    [scrapeJob, generateJob, contentJob, contentState],
  );

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
    setContentError(null);
    const res = await api.createJob({
      kind: 'content',
      scrapeJobId: scrapeJobIdArg,
      ...(instructions ? { instructions } : {}),
    });
    if (res.ok) {
      setContentJobId(res.job.jobId);
      void refreshJobs();
      return;
    }
    setContentError('message' in res.error ? res.error.message : JSON.stringify(res.error));
  }

  async function copyLastContentAttempt() {
    if (!contentJob) return;
    const res = await api.getLastContentAttempt(contentJob.jobId);
    if (res.present) void submitContentRaw(res.text);
  }

  async function submitContentRaw(raw: string) {
    setContentState({ kind: 'received', raw });
    const validation = await api.validateContent({ raw });

    if (!validation.ok) {
      if ('parseError' in validation) {
        setContentState({ kind: 'unparseable', raw, parseError: validation.parseError });
      } else {
        setContentState({ kind: 'invalid', raw, issues: validation.issues });
      }
      return;
    }

    const staged = await api.putStagedContent({ raw });
    if ('ok' in staged && staged.ok) {
      setContentState({
        kind: 'validated',
        path: staged.path,
        sha256: staged.sha256,
        bytes: staged.bytes,
        savedAt: staged.savedAt,
        summary: validation.summary,
      });
      setContentDrift(null);
    } else if ('parseError' in staged) {
      setContentState({ kind: 'unparseable', raw, parseError: staged.parseError });
    } else if ('issues' in staged) {
      setContentState({ kind: 'invalid', raw, issues: staged.issues });
    }
  }

  async function cancelRun(jobId: string) {
    await api.cancelJob(jobId);
    void refreshJobs();
  }

  async function deleteContent() {
    await api.deleteStagedContent();
    setContentState({ kind: 'idle' });
    setContentDrift(null);
  }

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b border-hairline px-4 py-2">
        <h1 className="text-lg font-semibold text-ink">Generador de landings</h1>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <AgentSidebar items={sidebarItems} selectedId={selected} onSelect={(id) => setSelected(id as PanelId)} />

        <main className="flex-1 overflow-y-auto p-4">
          {contentDrift && <p className="mb-3 text-xs text-amber-600">{contentDrift}</p>}

          {pendingOverwrite && (
            <div className="mb-4">
              <OverwriteConfirmDialog
                details={pendingOverwrite.details}
                onCancel={() => setPendingOverwrite(null)}
                onConfirm={(token) => void runGenerate(pendingOverwrite.slug, token)}
              />
            </div>
          )}

          {selected === 'content' && (
            <ContentAgentPanel
              job={contentJob ?? null}
              logs={contentStream.logs}
              scrapeJobId={scrapeJob?.status === 'succeeded' ? scrapeJob.jobId : null}
              onRun={(scrapeJobIdArg, instructions) => void runContent(scrapeJobIdArg, instructions)}
              onCancel={() => contentJob && void cancelRun(contentJob.jobId)}
              running={!!contentRunning}
              submitError={contentError}
              contentState={contentState}
              onSubmitRaw={(raw) => void submitContentRaw(raw)}
              onDeleteStaged={() => void deleteContent()}
              onCopyLastAttempt={() => void copyLastContentAttempt()}
            />
          )}

          {selected === 'scrape' && (
            <ScrapeAgentPanel
              job={scrapeJob ?? null}
              logs={scrapeStream.logs}
              onRun={(url) => void runScrape(url)}
              onCancel={() => scrapeJob && void cancelRun(scrapeJob.jobId)}
              running={!!scrapeRunning}
              submitError={scrapeError}
            />
          )}

          {selected === 'generate' && (
            <CodeAgentPanel
              job={generateJob ?? null}
              logs={generateStream.logs}
              onRun={(slug) => void runGenerate(slug)}
              onCancel={() => generateJob && void cancelRun(generateJob.jobId)}
              running={!!generateRunning}
              contentReady={contentState.kind === 'validated'}
              submitError={generateError}
            />
          )}

          <div className="mt-8">
            <h3 className="mb-2 text-sm font-semibold text-ink-soft">Historial de ejecuciones</h3>
            <JobHistory
              jobs={jobs}
              onSelect={(jobId) => {
                const job = jobs.find((j) => j.jobId === jobId);
                if (!job) return;
                switch (job.kind) {
                  case 'scrape':
                    setScrapeJobId(jobId);
                    setSelected('scrape');
                    break;
                  case 'generate':
                    setGenerateJobId(jobId);
                    setSelected('generate');
                    break;
                  case 'content':
                    setContentJobId(jobId);
                    setSelected('content');
                    break;
                  default:
                    assertNever(job.kind);
                }
              }}
            />
          </div>
        </main>
      </div>
    </div>
  );
}

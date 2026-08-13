// Content/Design manual stage (spec R7 "Content/Design Manual Stage", R8
// "Honest UI"; design §6). Accepts ONLY `state: ContentStageState` — no
// `JobRecord`, no `status`, nothing process-shaped is in this component's
// props at all, so it is structurally incapable of rendering a spinner "while
// running": there is no running-shaped data it could even read. The
// exhaustive `switch (state.kind)` is closed by `assertNever`, so adding a
// hypothetical 'running' variant to ContentStageState without also updating
// this switch is a compile error, not a silent gap.
//
// MUST NOT import LiveActivity.tsx — enforced by
// admin/test/no-fake-spinner.test.ts (F9/F10), which statically scans this
// file's source text for that import.
import { useState } from 'react';
import type { ContentStageState } from '../../../shared/content-stage';
import { assertNever } from '../../../shared/assert-never';

export type ManualArtifactPanelProps = {
  state: ContentStageState;
  onSubmitRaw: (raw: string) => void;
  onDelete: () => void;
};

export default function ManualArtifactPanel({ state, onSubmitRaw, onDelete }: ManualArtifactPanelProps) {
  const [draft, setDraft] = useState('');

  return (
    <section className="flex flex-col gap-3">
      <header>
        <h2 className="text-lg font-semibold">Content / Design</h2>
        <p className="text-xs text-slate-500">
          Manual artifact stage — paste or upload the generated <code>content.json</code>. This stage never runs a
          child process, so it never shows a spinner or elapsed timer (spec R8).
        </p>
      </header>

      {renderState(state, draft, setDraft, onSubmitRaw, onDelete)}
    </section>
  );
}

function renderState(
  state: ContentStageState,
  draft: string,
  setDraft: (v: string) => void,
  onSubmitRaw: (raw: string) => void,
  onDelete: () => void,
) {
  switch (state.kind) {
    case 'idle':
      return (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-slate-500">waiting for content.json</p>
          <PasteForm draft={draft} setDraft={setDraft} onSubmitRaw={onSubmitRaw} />
        </div>
      );

    case 'received':
      // Transient: the client immediately follows a paste/upload with a
      // validate call. Rendered defensively in case a caller pauses here.
      return <p className="text-sm text-slate-500">artifact received — validating…</p>;

    case 'unparseable':
      return (
        <div className="flex flex-col gap-2">
          <p className="rounded border border-red-300 bg-red-50 p-2 text-sm text-red-700">
            Not valid JSON: {state.parseError}
          </p>
          <PasteForm draft={draft} setDraft={setDraft} onSubmitRaw={onSubmitRaw} initialValue={state.raw} />
        </div>
      );

    case 'invalid':
      return (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-red-700">invalid ({state.issues.length} error{state.issues.length === 1 ? '' : 's'})</p>
          <ul className="list-inside list-disc text-xs text-red-700">
            {state.issues.map((issue) => (
              <li key={`${issue.code}-${issue.path}`}>
                <span className="font-mono">{issue.path}</span>: {issue.message}
              </li>
            ))}
          </ul>
          <PasteForm draft={draft} setDraft={setDraft} onSubmitRaw={onSubmitRaw} initialValue={state.raw} />
        </div>
      );

    case 'validated':
      return (
        <div className="flex flex-col gap-2">
          <p className="rounded border border-emerald-300 bg-emerald-50 p-2 text-sm text-emerald-700">
            validated — {state.summary.productFields} product field(s), {state.summary.faqCount} FAQ(s),{' '}
            {state.summary.testimonialCount} testimonial(s){state.summary.hasDesign ? ', includes design tokens' : ''}
          </p>
          <p className="text-xs text-slate-500">
            saved to <span className="font-mono">{state.path}</span> ({state.bytes} bytes, sha256{' '}
            <span className="font-mono">{state.sha256.slice(0, 12)}…</span>)
          </p>
          <button
            type="button"
            onClick={onDelete}
            className="w-fit rounded border border-slate-300 px-3 py-1 text-xs text-slate-700 hover:bg-slate-50"
          >
            Clear staged artifact
          </button>
        </div>
      );

    default:
      return assertNever(state);
  }
}

function PasteForm({
  draft,
  setDraft,
  onSubmitRaw,
  initialValue,
}: {
  draft: string;
  setDraft: (v: string) => void;
  onSubmitRaw: (raw: string) => void;
  initialValue?: string;
}) {
  const value = draft || initialValue || '';
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmitRaw(value);
      }}
    >
      <textarea
        value={value}
        onChange={(e) => setDraft(e.target.value)}
        rows={10}
        placeholder="Paste content.json here"
        className="rounded border border-slate-300 p-2 font-mono text-xs"
      />
      <button
        type="submit"
        disabled={value.trim().length === 0}
        className="w-fit rounded bg-slate-800 px-3 py-1 text-sm font-medium text-white disabled:opacity-40"
      >
        Validate &amp; stage
      </button>
    </form>
  );
}

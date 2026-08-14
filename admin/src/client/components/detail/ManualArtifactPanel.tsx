// Content/Design manual stage (spec R7 "Content/Design Manual Stage", R8
// "Honest UI"; design §6, §8.7). Accepts ONLY `state: ContentStageState` — no
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
import { contentStageLabelLong } from '../content-stage-label';

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
        <h2 className="text-lg font-semibold text-ink">Textos y diseño</h2>
        <p className="text-xs text-ink-soft">
          Esta es la vía manual: pegá acá el <code>content.json</code> con los textos y el diseño. Acá nunca vas a
          ver algo "cargando" — si preferís que la IA lo escriba por vos, usá el botón "Generar textos" más arriba.
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
          <p className="text-sm text-ink-soft">{contentStageLabelLong(state)}</p>
          <PasteForm draft={draft} setDraft={setDraft} onSubmitRaw={onSubmitRaw} />
        </div>
      );

    case 'received':
      // Transient: the client immediately follows a paste/upload with a
      // validate call. Rendered defensively in case a caller pauses here.
      return <p className="text-sm text-ink-soft">{contentStageLabelLong(state)}</p>;

    case 'unparseable':
      return (
        <div className="flex flex-col gap-2">
          <p className="rounded border border-red-300 bg-red-50 p-2 text-sm text-state-failed">
            {contentStageLabelLong(state)}
          </p>
          <PasteForm draft={draft} setDraft={setDraft} onSubmitRaw={onSubmitRaw} initialValue={state.raw} />
        </div>
      );

    case 'invalid':
      return (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-state-failed">{contentStageLabelLong(state)}</p>
          <ul className="list-inside list-disc text-xs text-state-failed">
            {state.issues.map((issue) => (
              <li key={`${issue.code}-${issue.path}`}>
                {/* issue.message comes verbatim from the server (design §8, R-b) — not translated here. */}
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
          <p className="rounded border border-emerald-300 bg-emerald-50 p-2 text-sm text-state-done">
            {contentStageLabelLong(state)}
          </p>

          <details className="rounded-lg border border-hairline bg-panel-soft px-3 py-2">
            <summary className="cursor-pointer text-xs font-medium text-ink-soft">Detalles técnicos</summary>
            <p className="mt-2 text-xs text-ink-soft">
              saved to <span className="font-mono">{state.path}</span> ({state.bytes} bytes, sha256{' '}
              <span className="font-mono">{state.sha256.slice(0, 12)}…</span>)
            </p>
          </details>

          <button
            type="button"
            onClick={onDelete}
            className="w-fit rounded border border-slate-300 px-3 py-1 text-xs text-slate-700 hover:bg-slate-50"
          >
            Borrar lo que pegué
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
        placeholder="Pegá acá el content.json"
        className="rounded border border-slate-300 p-2 font-mono text-xs"
      />
      <button
        type="submit"
        disabled={value.trim().length === 0}
        className="w-fit rounded bg-slate-800 px-3 py-1 text-sm font-medium text-white disabled:opacity-40"
      >
        Revisar y guardar
      </button>
    </form>
  );
}

// Renders the 409 overwrite-confirmation-required response (spec R10 "No
// Silent --force"; design §7). `warnings` come from the server ALREADY
// interpolated with the real slug (routes/jobs.ts's overwriteWarnings()) —
// this component renders them VERBATIM, no paraphrasing, no re-templating.
import type { OverwriteConfirmationRequired } from '../../shared/api';

export type OverwriteConfirmDialogProps = {
  details: OverwriteConfirmationRequired;
  onConfirm: (token: string) => void;
  onCancel: () => void;
};

export default function OverwriteConfirmDialog({ details, onConfirm, onCancel }: OverwriteConfirmDialogProps) {
  return (
    <div role="alertdialog" aria-labelledby="overwrite-title" className="rounded border border-red-300 bg-red-50 p-4">
      <h2 id="overwrite-title" className="text-sm font-semibold text-red-800">
        {details.existingDir} already exists
      </h2>
      <p className="mt-1 text-xs text-red-700">
        Last generated {details.existingMtime}
        {details.priorJob ? ` by job ${details.priorJob.jobId} (exit code ${details.priorJob.exitCode ?? 'n/a'})` : ''}.
      </p>
      <ul className="mt-2 list-inside list-disc text-xs text-red-700">
        {details.warnings.map((w) => (
          <li key={w}>{w}</li>
        ))}
      </ul>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => onConfirm(details.confirmToken)}
          className="rounded bg-red-700 px-3 py-1 text-xs font-medium text-white hover:bg-red-800"
        >
          Overwrite anyway
        </button>
        <button type="button" onClick={onCancel} className="rounded border border-slate-300 px-3 py-1 text-xs">
          Cancel
        </button>
      </div>
    </div>
  );
}

// Scrollable, monospace raw-log view (design §1 tree). Renders exactly the
// `log` SSE frames received — never summarizes, truncates silently, or
// reorders (spec R8 "Honest UI": every pixel reflects a real line the child
// process actually wrote to stdout/stderr, or an admin-generated ch:"meta"
// line, distinguishable by `ch`).
import type { SseFrame } from '../../shared/api';

export type LogConsoleProps = {
  lines: Extract<SseFrame, { type: 'log' }>[];
};

const CH_LABEL: Record<Extract<SseFrame, { type: 'log' }>['ch'], string> = {
  stdout: '',
  stderr: '[stderr] ',
  meta: '[admin] ',
};

export default function LogConsole({ lines }: LogConsoleProps) {
  if (lines.length === 0) {
    return <p className="text-xs text-slate-400">No output yet.</p>;
  }

  return (
    <pre className="max-h-80 overflow-y-auto rounded bg-slate-950 p-3 text-xs text-slate-100">
      {lines.map((l) => (
        <div key={l.seq} className={l.ch === 'stderr' ? 'text-amber-300' : l.ch === 'meta' ? 'text-sky-300' : undefined}>
          {CH_LABEL[l.ch]}
          {l.line}
        </div>
      ))}
    </pre>
  );
}

// Small reusable status chip (mockup-driven addition). Until now every panel
// painted status as plain text or a lone dot (AgentRunPanel's toneClass,
// AgentSidebarItem's toneTextClass/toneDotClass) — this is the first filled
// "pill" shape, used by AgentTimeline's per-agent rows. Tone mapping mirrors
// jobStatusTone()'s 4 values so it never becomes a second source of truth.
export type StatusPillTone = 'running' | 'done' | 'failed' | 'idle';

export type StatusPillProps = {
  tone: StatusPillTone;
  label: string;
};

// Literal class strings only, never interpolated (Oxide scans source text
// statically — see agent-identity.ts's gotcha note).
function pillClass(tone: StatusPillTone): string {
  switch (tone) {
    case 'running':
      return 'bg-emerald-50 text-state-running';
    case 'done':
      return 'bg-green-50 text-state-done';
    case 'failed':
      return 'bg-red-50 text-state-failed';
    case 'idle':
      return 'bg-slate-100 text-ink-soft';
  }
}

function dotClass(tone: StatusPillTone): string {
  switch (tone) {
    case 'running':
      return 'bg-state-running';
    case 'done':
      return 'bg-state-done';
    case 'failed':
      return 'bg-state-failed';
    case 'idle':
      return 'bg-slate-300';
  }
}

export default function StatusPill({ tone, label }: StatusPillProps) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${pillClass(tone)}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dotClass(tone)}`} aria-hidden="true" />
      {label}
    </span>
  );
}

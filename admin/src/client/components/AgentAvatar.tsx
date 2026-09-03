// The circular agent badge from the `/design` canvas.
//
// Each of the six pipeline members has a real portrait (see
// `pipeline-blocks.ts` -> `avatarSrc`), ringed in its current status colour.
// A block with no portrait — only the unmapped-stage fallback — still renders,
// falling back to a vector glyph in the agent's accent so an unknown stage is
// never blank.
//
// The ring is the STATUS; the portrait is the IDENTITY. Keeping the two on
// separate visual channels is what lets a member stay recognisable while its
// state changes.
import type { PipelineStageStatus } from '../../server/pipeline';
import type { PipelineBlock } from './pipeline-blocks';

// Literal class strings only — Tailwind v4 scans source text, so an
// interpolated ring class would emit no CSS at all.
const RING: Record<PipelineStageStatus, string> = {
  pending: 'ring-hairline',
  running: 'ring-state-running',
  pass: 'ring-state-done',
  failed: 'ring-state-failed',
  skipped: 'ring-hairline-soft',
};

const PATHS: Record<PipelineBlock['meta']['glyph'], string> = {
  search: 'M10.5 3a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15ZM21 21l-5.2-5.2',
  pen: 'M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z',
  palette: 'M12 3a9 9 0 1 0 0 18 2 2 0 0 0 1.6-3.2 2 2 0 0 1 1.6-3.2H18a3 3 0 0 0 3-3 9 9 0 0 0-9-8.6Z',
  image: 'M3 5.5h18v13H3zM3 15l5-5 4 4 3-3 6 6',
  hammer: 'M14 6l4-4 4 4-4 4-2-2-8 8 2 2-4 4-4-4 4-4 2 2 8-8Z',
  check: 'M20 6.5 9.5 17.5 4 12',
};

export type AgentAvatarProps = {
  block: PipelineBlock;
  /** Rail cards use 40px; the centre panel uses 52px, as in the canvas. */
  size?: 40 | 52;
};

export default function AgentAvatar({ block, size = 40 }: AgentAvatarProps) {
  const dim = size === 52 ? 'h-13 w-13' : 'h-10 w-10';
  const icon = size === 52 ? 24 : 19;
  const dimmed = block.status === 'pending' || block.status === 'skipped';
  const { avatarSrc, label, accentText, glyph } = block.meta;

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-panel-muted ring-2 ${
        RING[block.status]
      } ${dim} ${dimmed ? 'opacity-45' : ''}`}
      style={size === 52 ? { height: 52, width: 52 } : undefined}
      aria-hidden="true"
    >
      {avatarSrc ? (
        // Decorative: both call sites (PipelineColumn, ActiveStagePanel) render
        // `meta.label` as visible text beside the badge, so a named alt would
        // just repeat the agent's name to a screen reader. `title` keeps the
        // name on hover; `loading="lazy"` keeps them off the critical path.
        <img
          src={avatarSrc}
          alt=""
          title={label}
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
        />
      ) : (
        <svg
          width={icon}
          height={icon}
          viewBox="0 0 24 24"
          fill="none"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={accentText}
          stroke="currentColor"
          aria-hidden="true"
        >
          <path d={PATHS[glyph]} />
        </svg>
      )}
    </span>
  );
}

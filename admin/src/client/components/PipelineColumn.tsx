// The "Tu equipo IA" rail, in the `/design` canvas's card treatment.
//
// One compact card per agent: avatar, small step caption in the agent's accent,
// name, status pill, and a coloured left bar. The active card lifts onto the
// selected surface with an accent border, exactly as the canvas showed the
// running agent; pending cards are dashed and dimmed.
//
// Purely presentational. Blocks arrive already derived from the server's
// record, so the rail cannot invent or reorder a step.
import AgentAvatar from './AgentAvatar';
import StageMark, { STATUS_TEXT } from './StageMark';
import { STAGE_LABEL, type PipelineBlock } from './pipeline-blocks';

export type PipelineColumnProps = {
  blocks: PipelineBlock[];
  activeId: string | null;
};

export default function PipelineColumn({ blocks, activeId }: PipelineColumnProps) {
  return (
    <nav aria-label="Equipo de agentes" className="flex min-w-0 flex-col gap-2">
      <span className="cap pl-1 text-ink-faint">Tu equipo IA</span>

      <ol className="flex flex-col gap-2">
        {blocks.map((block, index) => {
          const isActive = block.meta.id === activeId;
          const dim = block.status === 'pending' || block.status === 'skipped';

          return (
            <li key={block.meta.id}>
              <div
                aria-current={isActive ? 'step' : undefined}
                className={`relative flex gap-3 overflow-hidden rounded-xl p-3 ${
                  isActive
                    ? 'bg-panel-muted border border-hairline'
                    : dim
                      ? 'border border-dashed border-hairline-soft'
                      : 'bg-panel border border-hairline-soft'
                }`}
              >
                {/* The canvas's inset accent bar — the agent's identity stripe. */}
                <span className={`absolute inset-y-0 left-0 w-[3px] ${block.meta.accentBar} ${dim ? 'opacity-40' : ''}`} aria-hidden="true" />

                <AgentAvatar block={block} />

                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className={`cap ${dim ? 'text-ink-faint' : block.meta.accentText}`}>
                    Paso {String(index + 1).padStart(2, '0')}
                  </span>
                  <span className={`truncate text-[13px] font-semibold leading-tight ${dim ? 'text-ink-soft' : 'text-ink'}`}>
                    {block.meta.label}
                  </span>

                  <div className="flex items-center gap-2">
                    <StageMark status={block.status} compact />
                    {/* Sub-stages summarised rather than listed, so a card stays
                        one line tall; the centre panel shows them in full. */}
                    {block.stages.length > 1 && (
                      <span className="truncate font-mono text-[10px] text-ink-faint">
                        {block.stages.map((s) => STAGE_LABEL[s.name] ?? s.name).join(' · ')}
                      </span>
                    )}
                  </div>
                  <span className="sr-only">{STATUS_TEXT[block.status]}</span>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

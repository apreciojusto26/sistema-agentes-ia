// The six blocks the operator sees, over the eight stages the server runs.
//
// PRESENTATION METADATA ONLY. This file maps a stage NAME to the block it
// belongs to and gives each block its human label — it does NOT declare an
// ordered stage list. Order comes from `record.stages`, so the column can
// never disagree with what actually ran; if the server ever reorders or adds
// a stage, the UI follows it instead of silently rendering a stale sequence.
//
// A stage with no mapping still renders, in a block of its own named after
// it. Dropping an unknown stage would hide real work from the operator.
import { PIPELINE_STAGES } from '../../shared/pipeline-stages';
import type { PipelineStage, PipelineStageStatus } from '../../server/pipeline';

// `diseno` IS GONE. It mapped the `design` stage to a Design Agent card, and
// that stage no longer exists: Fixed AstraVibe renders one canonical page, so
// nothing chooses a composition. The card is not kept as "Design Agent —
// omitido" either. The rail's job is to show the operator what the team is
// DOING, and a permanently absent member is repo archaeology, not status.
export type BlockId = 'producto' | 'contenido' | 'assets' | 'construccion' | 'validacion';

/**
 * `accent` and `avatarSrc` give each agent its own identity in the rail, the
 * way the `/design` canvas gave its agents distinct avatars and coloured
 * left-bars. Each of the six members has its own PNG portrait under
 * `src/client/public/`; `glyph` stays as the vector fallback used for an
 * unmapped stage, which has no portrait of its own.
 *
 * Avatar paths are ROOT-relative (`/asset_agent.webp`). Vite's `root` is
 * `src/client`, so its publicDir `src/client/public/` is served at `/` — a
 * `/public/...` prefix 404s.
 *
 * The served `.webp` files are DERIVED, not source. The 1024x1024 originals
 * live in `assets/agents/`, deliberately outside publicDir so Vite never
 * ships a 1.9MB PNG to fill a 40px circle. Rebuild them with
 * `pnpm run avatars` after replacing an original.
 *
 * Accent classes are LITERAL strings: Tailwind v4 scans source text, so an
 * interpolated `text-agent-${n}` would compile to no CSS at all.
 */
type BlockMeta = {
  id: BlockId;
  label: string;
  description: string;
  agent: string;
  /** What this member is doing while it runs — the centre panel's headline. */
  doing: string;
  accentText: string;
  accentRing: string;
  accentBar: string;
  /** Top rule of the dense centre card. Literal, for the same reason. */
  accentBorder: string;
  /** This member's portrait, served from Vite's publicDir at the root. */
  avatarSrc: string;
  /** Vector fallback, drawn only when a block has no portrait. */
  glyph: 'search' | 'pen' | 'palette' | 'image' | 'hammer' | 'check';
};

/** stage name -> block. The ONLY place the grouping is declared. */
const STAGE_TO_BLOCK: Record<string, BlockId> = {
  scrape: 'producto',
  normalize: 'producto',
  content: 'contenido',
  assets: 'assets',
  generate: 'construccion',
  build: 'construccion',
  validate: 'validacion',
};

export const BLOCK_META: Record<BlockId, BlockMeta> = {
  producto: {
    id: 'producto',
    label: 'Product Agent',
    agent: 'Product Agent · Extractor + Normalizer',
    doing: 'Analizando el producto',
    description: 'Analiza el producto y convierte la información en un formato canónico.',
    accentText: 'text-agent-1',
    accentRing: 'ring-agent-1',
    accentBar: 'bg-agent-1',
    accentBorder: 'border-t-agent-1',
    avatarSrc: '/product_extractor_agent.webp',
    glyph: 'search',
  },
  contenido: {
    id: 'contenido',
    label: 'Content Agent',
    agent: 'Content Agent · Gemini',
    doing: 'Escribiendo el copy de la landing',
    description: 'Genera la propuesta de valor, beneficios, FAQs, testimonios y copy de la landing.',
    accentText: 'text-agent-2',
    accentRing: 'ring-agent-2',
    accentBar: 'bg-agent-2',
    accentBorder: 'border-t-agent-2',
    avatarSrc: '/content_agent.webp',
    glyph: 'pen',
  },
  assets: {
    id: 'assets',
    label: 'Asset Agent',
    agent: 'Asset Agent · pipeline de imágenes',
    doing: 'Preparando las imágenes reales',
    description: 'Prepara las imágenes reales del producto y las conecta a la landing.',
    accentText: 'text-agent-4',
    accentRing: 'ring-agent-4',
    accentBar: 'bg-agent-4',
    accentBorder: 'border-t-agent-4',
    avatarSrc: '/asset_agent.webp',
    glyph: 'image',
  },
  construccion: {
    id: 'construccion',
    label: 'Build Agent',
    agent: 'Build Agent · Generator + Astro',
    doing: 'Construyendo y prerenderizando',
    description: 'Construye el proyecto final y genera el sitio.',
    accentText: 'text-agent-5',
    accentRing: 'ring-agent-5',
    accentBar: 'bg-agent-5',
    accentBorder: 'border-t-agent-5',
    avatarSrc: '/building_agent.webp',
    glyph: 'hammer',
  },
  validacion: {
    id: 'validacion',
    label: 'Validation Agent',
    agent: 'Validation Agent · contratos',
    doing: 'Comprobando contratos y artefacto',
    description: 'Comprueba contratos, build y que la landing esté lista para preview.',
    accentText: 'text-agent-6',
    accentRing: 'ring-agent-6',
    accentBar: 'bg-agent-6',
    accentBorder: 'border-t-agent-6',
    avatarSrc: '/validation_agent.webp',
    glyph: 'check',
  },
};

/** Human label for a single sub-stage row. */
export const STAGE_LABEL: Record<string, string> = {
  scrape: 'Extractor',
  normalize: 'Normalizer',
  content: 'Content Agent',
  assets: 'Assets',
  generate: 'Generate',
  build: 'Build',
  validate: 'Validate',
};

export type PipelineBlock = {
  meta: BlockMeta;
  stages: PipelineStage[];
  /** Rolled up from the stages it contains — see rollUp(). */
  status: PipelineStageStatus;
};

/**
 * A block's status is the honest summary of its stages:
 *   any failed   -> failed   (a failure must never be averaged away)
 *   any running  -> running
 *   all pass     -> pass
 *   any skipped and none pending -> skipped
 *   otherwise    -> pending
 */
export function rollUp(stages: PipelineStage[]): PipelineStageStatus {
  if (stages.some((s) => s.status === 'failed')) return 'failed';
  if (stages.some((s) => s.status === 'running')) return 'running';
  if (stages.length > 0 && stages.every((s) => s.status === 'pass')) return 'pass';
  if (stages.some((s) => s.status === 'skipped') && !stages.some((s) => s.status === 'pending')) return 'skipped';
  return 'pending';
}

/**
 * Groups the record's stages into blocks, in the order the stages themselves
 * arrive. The client contributes the grouping and the labels; the SERVER
 * contributes the sequence.
 */
export function buildBlocks(stages: PipelineStage[]): PipelineBlock[] {
  const order: BlockId[] = [];
  const grouped = new Map<BlockId, PipelineStage[]>();

  for (const stage of stages) {
    const id = (STAGE_TO_BLOCK[stage.name] ?? (stage.name as BlockId)) as BlockId;
    if (!grouped.has(id)) {
      grouped.set(id, []);
      order.push(id);
    }
    grouped.get(id)!.push(stage);
  }

  return order.map((id) => {
    const blockStages = grouped.get(id)!;
    return {
      meta:
        BLOCK_META[id] ??
        // Unknown stage: still shown, named after itself, never hidden.
        {
          id,
          label: STAGE_LABEL[id] ?? id,
          agent: '',
          doing: '',
          description: '',
          accentText: 'text-ink-soft',
          accentRing: 'ring-hairline',
          accentBar: 'bg-hairline',
          accentBorder: 'border-t-hairline',
          avatarSrc: '',
          glyph: 'check' as const,
        },
      stages: blockStages,
      status: rollUp(blockStages),
    };
  });
}

/**
 * The blocks with nothing run yet, shown BEFORE a pipeline exists so the column
 * explains the flow on arrival instead of being an empty box.
 *
 * DERIVED FROM PIPELINE_STAGES, not from a list of its own. It used to be
 * `Object.values(BLOCK_META)`, and that was the single place in this file that
 * could disagree with the server: when the Design Agent stage was removed, the
 * idle rail would still have advertised a sixth member that no run can ever
 * produce. Going through buildBlocks() means the empty state and a real run are
 * the SAME grouping of the SAME stage list, so the rail can only ever be wrong
 * about what is going to happen if the server itself is.
 *
 * These carry no real stages, so nothing here can misreport a status: every
 * block is `pending`, which is exactly true.
 */
export function emptyBlocks(): PipelineBlock[] {
  return buildBlocks(
    PIPELINE_STAGES.map((name) => ({
      name,
      status: 'pending' as PipelineStageStatus,
      jobId: null,
      startedAt: null,
      endedAt: null,
      errorDetail: null,
      error: null,
      detail: null,
    })),
  );
}

/** The block the operator should be looking at right now. */
export function activeBlock(blocks: PipelineBlock[]): PipelineBlock | null {
  return (
    blocks.find((b) => b.status === 'running') ??
    blocks.find((b) => b.status === 'failed') ??
    [...blocks].reverse().find((b) => b.status === 'pass') ??
    blocks[0] ??
    null
  );
}

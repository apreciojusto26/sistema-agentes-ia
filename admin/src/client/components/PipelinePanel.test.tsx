// @vitest-environment happy-dom
//
// The agent dashboard: one form, one pipeline, five blocks over seven stages.
//
// The properties worth protecting are structural, not cosmetic: that the
// client never declares its own stage sequence, that Content and Design stay
// separate blocks, that a failure marks the rest skipped rather than failed,
// and that the result and preview appear only once the run has really earned
// them. Rendering follows the existing harness convention (createRoot + act,
// no @testing-library) from useJobStream.test.ts.
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PipelinePanel, { slugFromUrl } from './PipelinePanel';
import { buildBlocks, rollUp, activeBlock, emptyBlocks, BLOCK_META } from './pipeline-blocks';
import { PIPELINE_STAGES } from '../../shared/pipeline-stages';
import type { PipelineStage, PipelineStageStatus } from '../../server/pipeline';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_SRC = path.join(__dirname, '../App.tsx');
const COLUMN_SRC = path.join(__dirname, 'PipelineColumn.tsx');
const BLOCKS_SRC = path.join(__dirname, 'pipeline-blocks.ts');
const STYLES_SRC = path.join(__dirname, '../styles.css');

/** The real stage names, in the server's order — read from the server, not
 *  retyped. A literal list here would let this suite keep asserting a pipeline
 *  shape the server had already stopped producing, which is exactly what
 *  happened while `design` was still spelled out below. */
const STAGE_NAMES = [...PIPELINE_STAGES] as string[];

const stage = (name: string, status: PipelineStageStatus, over: Partial<PipelineStage> = {}): PipelineStage => ({
  name: name as PipelineStage['name'],
  status,
  jobId: null,
  startedAt: null,
  endedAt: null,
  error: null,
  detail: null,
  ...over,
});

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal(
    'EventSource',
    class {
      addEventListener() {}
      close() {}
      set onerror(_v: unknown) {}
    },
  );
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ jobs: [] }) }));
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  act(() => root?.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function render(node: React.ReactNode) {
  root = createRoot(container);
  act(() => root.render(node));
}

function setValue(el: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
  act(() => {
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

const button = (text: string) =>
  [...container.querySelectorAll('button')].find((b) => b.textContent?.includes(text)) as HTMLButtonElement | undefined;

// ── 1 & 2: five blocks over seven stages ───────────────────────────────────

describe('the five blocks map onto the seven real stages', () => {
  const allStages = STAGE_NAMES.map((n) => stage(n, 'pending'));

  it('groups the seven stages into exactly five blocks', () => {
    const blocks = buildBlocks(allStages);
    expect(blocks).toHaveLength(5);
    expect(blocks.map((b) => b.meta.id)).toEqual([
      'producto',
      'contenido',
      'assets',
      'construccion',
      'validacion',
    ]);
  });

  it('the idle rail advertises exactly the blocks a real run produces', () => {
    // emptyBlocks() derives from PIPELINE_STAGES through buildBlocks(), so the
    // "nothing has run yet" rail and a finished run cannot describe different
    // teams. Before this, the idle state carried its own list and kept showing
    // a Design Agent that no run could ever produce.
    expect(emptyBlocks().map((b) => b.meta.id)).toEqual(buildBlocks(allStages).map((b) => b.meta.id));
    expect(emptyBlocks().every((b) => b.status === 'pending')).toBe(true);
  });

  it('no block is a Design Agent', () => {
    expect(buildBlocks(allStages).map((b) => b.meta.label)).not.toContain('Design Agent');
    expect(Object.keys(BLOCK_META)).not.toContain('diseno');
  });

  it('every stage lands in a block — none is dropped', () => {
    const covered = buildBlocks(allStages).flatMap((b) => b.stages.map((s) => s.name));
    expect(covered.sort()).toEqual([...STAGE_NAMES].sort());
  });

  it('Producto holds scrape+normalize and Construcción holds generate+build', () => {
    const blocks = buildBlocks(allStages);
    expect(blocks.find((b) => b.meta.id === 'producto')!.stages.map((s) => s.name)).toEqual(['scrape', 'normalize']);
    expect(blocks.find((b) => b.meta.id === 'construccion')!.stages.map((s) => s.name)).toEqual(['generate', 'build']);
  });

  it('Content is its own block, holding only the content stage', () => {
    // WAS 'Content and Design are SEPARATE blocks, never merged' — a guard
    // against the two agents being collapsed into one card. With the Design
    // Agent gone the merge it prevented is impossible, but the half that still
    // matters is kept: Content owns exactly one stage and is not quietly
    // widened to absorb its neighbours.
    const contenido = buildBlocks(allStages).find((b) => b.meta.id === 'contenido')!;
    expect(contenido.stages.map((s) => s.name)).toEqual(['content']);
    expect(BLOCK_META.contenido.agent).toContain('Content');
  });

  it('an unknown stage is still shown, never hidden', () => {
    const blocks = buildBlocks([...allStages, stage('deploy', 'pending')]);
    // Cast because PipelineStageName is a closed union — the point of the test
    // is precisely what happens when the SERVER sends a name the client's
    // types do not know about yet.
    expect(blocks.some((b) => b.stages.some((s) => (s.name as string) === 'deploy'))).toBe(true);
  });

  it('block order follows the RECORD, not a client-side list', () => {
    // Reversed input -> reversed blocks. A hardcoded order would not move.
    const blocks = buildBlocks([...allStages].reverse());
    expect(blocks[0]!.meta.id).toBe('validacion');
  });
});

// ── 11: no duplicated stage list in the client ─────────────────────────────

describe('the client declares no stage sequence of its own', () => {
  it('pipeline-blocks maps by NAME and never lists the stages in order', () => {
    const src = readFileSync(BLOCKS_SRC, 'utf-8');
    // A literal ordered array of stage names would be the duplication.
    expect(src).not.toMatch(/\[\s*'scrape'\s*,\s*'normalize'/);
    expect(src).toContain('STAGE_TO_BLOCK');
  });

  it('the column renders what it is given rather than iterating a constant', () => {
    const src = readFileSync(COLUMN_SRC, 'utf-8');
    expect(src).toContain('blocks.map');
    expect(src).not.toMatch(/const\s+\w*STAGES\w*\s*=\s*\[/);
  });
});

// ── 7: a failure marks the rest skipped ────────────────────────────────────

describe('status roll-up is honest', () => {
  it('a failed stage makes its block failed — never averaged away', () => {
    expect(rollUp([stage('generate', 'pass'), stage('build', 'failed')])).toBe('failed');
  });

  it('running wins over pending', () => {
    expect(rollUp([stage('scrape', 'pass'), stage('normalize', 'running')])).toBe('running');
  });

  it('all pass -> pass', () => {
    expect(rollUp([stage('generate', 'pass'), stage('build', 'pass')])).toBe('pass');
  });

  it('skipped blocks read as skipped, distinct from pending', () => {
    expect(rollUp([stage('build', 'skipped')])).toBe('skipped');
    expect(rollUp([stage('build', 'pending')])).toBe('pending');
  });

  it('a mid-pipeline failure leaves later blocks skipped, not failed', () => {
    const blocks = buildBlocks([
      stage('scrape', 'pass'),
      stage('normalize', 'pass'),
      stage('content', 'failed'),
      stage('assets', 'skipped'),
      stage('generate', 'skipped'),
      stage('build', 'skipped'),
      stage('validate', 'skipped'),
    ]);
    expect(blocks.find((b) => b.meta.id === 'contenido')!.status).toBe('failed');
    for (const id of ['assets', 'construccion', 'validacion']) {
      expect(blocks.find((b) => b.meta.id === id)!.status).toBe('skipped');
    }
  });

  it('the active block is the running one, else the failure', () => {
    const running = buildBlocks([stage('scrape', 'pass'), stage('normalize', 'pass'), stage('content', 'running')]);
    expect(activeBlock(running)!.meta.id).toBe('contenido');
    const failed = buildBlocks([stage('scrape', 'pass'), stage('normalize', 'failed')]);
    expect(activeBlock(failed)!.meta.id).toBe('producto');
  });
});

// ── 3 & 4: one flow, posting to /api/pipeline ──────────────────────────────

describe('a single generation flow', () => {
  it('shows ONE primary input; the technical fields hide behind Opciones avanzadas', () => {
    render(<PipelinePanel />);
    expect(container.querySelectorAll('input')).toHaveLength(1);
    expect(container.textContent).toContain('URL del producto');
    expect(container.textContent).toContain('Opciones avanzadas');

    act(() => button('Opciones avanzadas')!.click());
    expect(container.querySelectorAll('input')).toHaveLength(4);
    expect(container.textContent).toContain('Reusar scrape');
    expect(container.textContent).toContain('Handle de Shopify');
  });

  it('derives a slug from the URL so the common path needs no extra field', () => {
    expect(slugFromUrl('https://es.aliexpress.com/item/Mini-Projector_1005.html')).toBe('mini-projector-1005');
    expect(slugFromUrl('not a url')).toBe('');
  });

  it('POSTs to /api/pipeline with the derived slug and a null handle', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ pipeline: { pipelineId: 'pl_x', stages: [] } }),
    });
    vi.stubGlobal('fetch', fetchSpy);

    render(<PipelinePanel />);
    setValue(container.querySelector('input')!, 'https://example.com/item/star-projector.html');

    const submit = button('Generar landing')!;
    expect(submit.disabled).toBe(false);
    await act(async () => submit.click());

    const call = fetchSpy.mock.calls.find(([u]) => u === '/api/pipeline')!;
    expect(call).toBeTruthy();
    const body = JSON.parse(call[1].body as string);
    expect(body.slug).toBe('star-projector');
    expect(body.url).toBe('https://example.com/item/star-projector.html');
    expect(body.shopifyHandle).toBeNull();
  });

  it('keeps the button disabled until there is something to run', () => {
    render(<PipelinePanel />);
    expect(button('Generar landing')!.disabled).toBe(true);
  });

  it('surfaces a rejected start instead of failing silently', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: 'slug must be kebab-case' }) }),
    );
    render(<PipelinePanel />);
    setValue(container.querySelector('input')!, 'https://example.com/item/x.html');
    await act(async () => button('Generar landing')!.click());
    expect(container.textContent).toContain('slug must be kebab-case');
  });
});

// ── 10: commerce modes ─────────────────────────────────────────────────────

describe('Preview vs Commerce', () => {
  it('announces Preview only until a handle is entered, then Commerce configured', () => {
    render(<PipelinePanel />);
    expect(container.textContent).toContain('Preview only');

    act(() => button('Opciones avanzadas')!.click());
    setValue([...container.querySelectorAll('input')][3]!, 'mi-producto');

    expect(container.textContent).toContain('Commerce configured');
    // The third state is the verifier's to grant, never the UI's.
    expect(container.textContent).not.toContain('Shopify live verified');
  });
});

// ── 8 & 9: result and preview ──────────────────────────────────────────────

describe('result and preview appear only when earned', () => {
  it('no result card before a run finishes', () => {
    render(<PipelinePanel />);
    expect(container.textContent).not.toContain('Landing lista');
    expect(button('Abrir preview')).toBeUndefined();
  });

  it('the result section is gated on a succeeded record', () => {
    const src = readFileSync(path.join(__dirname, 'PipelinePanel.tsx'), 'utf-8');
    expect(src).toContain("record?.status === 'succeeded'");
    // Preview lives inside that gate, so it cannot be offered for a failed run.
    const gate = src.slice(src.indexOf("record?.status === 'succeeded'"));
    expect(gate).toContain('Abrir preview');
  });

  it('a preview failure never rewrites the pipeline verdict', () => {
    const src = readFileSync(path.join(__dirname, 'PipelinePanel.tsx'), 'utf-8');
    const openPreview = src.slice(src.indexOf('async function openPreview'), src.indexOf('const commerceNow'));
    expect(openPreview).toContain('setPreviewError');
    expect(openPreview).not.toContain('setPipelineId');
  });
});

// ── 12: light/dark ─────────────────────────────────────────────────────────

describe('light and dark', () => {
  it('both palettes define the same token names', () => {
    const css = readFileSync(STYLES_SRC, 'utf-8');
    const light = css.slice(css.indexOf(':root:root {'), css.indexOf(":root:root[data-theme='dark']"));
    const dark = css.slice(css.indexOf(":root:root[data-theme='dark']"));
    const names = (block: string) => [...block.matchAll(/(--color-[a-z-]+):/g)].map((m) => m[1]).sort();

    expect(names(light).length).toBeGreaterThan(10);
    expect(names(dark)).toEqual(names(light));
  });

  it('dark is keyed off data-theme, so no component needs to know about it', () => {
    const css = readFileSync(STYLES_SRC, 'utf-8');
    expect(css).toContain(":root:root[data-theme='dark']");
    // No MEDIA QUERY drives the palette — the attribute does, so an explicit
    // choice always wins. (The string appears in older prose comments, which
    // is why this checks for the rule and not the mere word.)
    expect(css).not.toMatch(/@media\s*\(\s*prefers-color-scheme/);
  });

  it('the webfont @import is the first rule, so the optimizer cannot drop it', () => {
    const css = readFileSync(STYLES_SRC, 'utf-8');
    // A CSS `@import` after any other rule is invalid; the build drops it and
    // still reports success, silently leaving the whole page on system-ui.
    // This pins the canvas's Space Grotesk / JetBrains Mono pairing.
    const bare = css.replace(/\/\*[\s\S]*?\*\//g, '').trim();
    expect(bare.startsWith('@import url(')).toBe(true);
    expect(css.slice(0, css.indexOf('@import "tailwindcss"'))).toContain('fonts.googleapis.com');
  });

  it('the header exposes a labelled theme toggle and a real API indicator', () => {
    const src = readFileSync(APP_SRC, 'utf-8');
    expect(src).toContain('aria-label');
    expect(src).toContain('useTheme');
    // The dot reflects a real health call, not an optimistic constant.
    expect(src).toMatch(/api\s*\.\s*getHealth\(\)/);
  });
});

// ── 3 (structural): App mounts one dashboard and no rival form ─────────────

describe('App is the dashboard shell', () => {
  const src = () => readFileSync(APP_SRC, 'utf-8');

  it('mounts PipelinePanel exactly once', () => {
    expect([...src().matchAll(/<PipelinePanel\b/g)]).toHaveLength(1);
  });

  it('no longer renders a second, competing generation form', () => {
    const s = src();
    expect(s).not.toContain('<GeneratorHero');
    expect(s).not.toContain('<GenerateSlugForm');
    expect(s).not.toContain('<AgentTimeline');
  });
});

// ── 5: the modern shell must not be lost again ─────────────────────────────

/**
 * WHY THIS BLOCK EXISTS, stated plainly so nobody deletes it as redundant.
 *
 * This interface was built, used, and then LOST — not by a bad merge but by a
 * cleanup: it lived only as working-tree state (six untracked components plus
 * uncommitted edits), so a path-scoped `git checkout --` reverted the tracked
 * half to HEAD and a clean removed the rest. No commit anywhere in the repo
 * contained it. Recovering it took two backup archives.
 *
 * Every assertion below renders the REAL component and reads the REAL DOM. A
 * source-scan would pass on a file that imports the right things and renders
 * none of them, which is close to the failure that actually happened. There is
 * deliberately no CSS snapshot here — pinning styling would make every visual
 * tweak a test edit, and styling was never what went missing. What went missing
 * was the SHELL: the named regions, the agent rail, the history column, and the
 * one-input form with its advanced fields.
 */
describe('the modern dashboard shell is present, and the legacy one is not', () => {
  const REQUIRED_REGIONS = ['Nueva generación', 'Tu equipo IA', 'Historial', 'Opciones avanzadas'];

  it.each(REQUIRED_REGIONS)('renders the %s region', (label) => {
    render(<PipelinePanel />);
    // Case-insensitive: these labels are uppercased by the `.cap` class in CSS,
    // so asserting the rendered casing would couple this to a style choice.
    expect(container.textContent?.toLowerCase()).toContain(label.toLowerCase());
  });

  it('renders the agent rail with exactly the blocks the server can produce', () => {
    render(<PipelinePanel />);
    const text = container.textContent ?? '';
    for (const label of ['Product Agent', 'Content Agent', 'Asset Agent', 'Build Agent', 'Validation Agent']) {
      expect(text, `${label} is missing from the rail`).toContain(label);
    }
  });

  it('renders NO Design Agent, because no run can produce that stage', () => {
    render(<PipelinePanel />);
    expect(container.textContent).not.toContain('Design Agent');
    // …and not as a disabled/omitted placeholder either. The rail explains what
    // the team is doing; a permanently absent member is repo archaeology.
    expect(container.textContent).not.toMatch(/dise[ñn]o/i);
  });

  it('renders the legacy three-agent surface nowhere', () => {
    render(<PipelinePanel />);
    const text = container.textContent ?? '';
    // The exact strings from the interface this replaced. If any comes back,
    // the old shell has been restored over this one again.
    expect(text).not.toContain('Así trabaja nuestro equipo de IA');
    expect(text).not.toContain('Buscar producto');
    expect(text).not.toContain('Generar una landing');
    expect(text).not.toContain('Extractor de productos');
    expect(text).not.toContain('Constructor de la landing');
  });

  it('keeps every advanced capability reachable rather than dropped', () => {
    // The simplification was UX only. Losing a field would be a real
    // regression dressed up as a cleaner form.
    render(<PipelinePanel />);
    act(() => button('Opciones avanzadas')!.click());
    const text = container.textContent ?? '';
    expect(text).toContain('Reusar scrape');
    expect(text).toContain('Slug manual');
    expect(text).toContain('Handle de Shopify');
  });

  it('the six agent portraits the rail needs all exist on disk', () => {
    // avatar-purity.test.ts covers AGENT_IDENTITY; BLOCK_META is a second
    // avatar consumer and was never checked. A missing file here renders a
    // broken image, which no DOM assertion above would catch.
    const publicDir = path.join(__dirname, '../public');
    for (const meta of Object.values(BLOCK_META)) {
      if (!meta.avatarSrc) continue;
      expect(existsSync(path.join(publicDir, meta.avatarSrc)), `${meta.label}: ${meta.avatarSrc} is missing`).toBe(true);
    }
  });
});

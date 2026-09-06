// @vitest-environment happy-dom
//
// WHAT AN OPERATOR SEES WHEN THEY REOPEN A REPORT.
//
// The steps arrive from the server — live over SSE during a run, and read back
// off admin/.pipelines/<pipelineId>.json for a run that finished yesterday.
// Either way this component's job is the same and narrow: draw exactly what it
// was given.
//
// The properties worth protecting are the ones that keep the panel from
// flattering the run. A skipped operation must not read as a quiet success, a
// warning must not read as a pass, a fact the backend measured must appear
// verbatim, and nothing may be recomputed here — a second opinion rendered in
// React is a UI having an opinion about work it did not do.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import AgentSteps from './AgentSteps';
import type { PipelineStep } from '../../server/pipeline';

const step = (over: Partial<PipelineStep> & { name: string; status: PipelineStep['status'] }): PipelineStep => ({
  startedAt: '2026-09-06T03:00:00.000Z',
  endedAt: '2026-09-06T03:00:01.000Z',
  ms: 1000,
  progress: null,
  note: null,
  warnings: [],
  code: null,
  ...over,
});

/**
 * An Asset Agent run that died at the plan, exactly as the server records it:
 * two operations that happened, seven that never did.
 *
 * Written the way a RECOVERED report arrives — plain JSON off disk, no live
 * subscription — because that is the path this suite is about.
 */
const recoveredAssetRun: PipelineStep[] = [
  step({ name: 'assets:inputs', status: 'passed', ms: 3, note: '3 paso(s) en el copy' }),
  step({
    name: 'assets:plan',
    status: 'failed',
    ms: 12,
    warnings: ['no usable media for this product. Rejected: nothing found'],
  }),
  ...['assets:gallery', 'assets:strip', 'assets:steps', 'assets:manifest', 'assets:refs', 'assets:persist', 'assets:favicon'].map(
    (name) => step({ name, status: 'skipped', endedAt: null, ms: null }),
  ),
];

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  act(() => root?.unmount());
  container.remove();
});

function render(steps: PipelineStep[]) {
  root = createRoot(container);
  act(() => root.render(<AgentSteps steps={steps} />));
  return container;
}

describe('a report read back off disk renders the operations it recorded', () => {
  it('draws every operation the run recorded, under its human name', () => {
    const el = render(recoveredAssetRun);
    const text = el.textContent ?? '';
    // Nine lines for nine recorded operations — the ones that ran AND the ones
    // that were declared and never reached.
    expect(el.querySelectorAll('li')).toHaveLength(9);
    expect(text).toContain('Media localizada y deduplicada');
    expect(text).toContain('Manifiesto de procedencia generado');
    expect(text).toContain('Favicon resuelto');
  });

  it('a skipped operation is drawn as unreached, never as a quiet tick', () => {
    const el = render(recoveredAssetRun);
    const marks = [...el.querySelectorAll('li')].map((li) => li.querySelector('span')?.textContent);
    expect(marks).toEqual(['✓', '×', '—', '—', '—', '—', '—', '—', '—']);
    // And it carries no duration, because there was no work to time.
    const last = el.querySelectorAll('li')[8]!;
    expect(last.textContent).not.toMatch(/\d+\s*ms/);
    expect(last.textContent).toContain('no se ejecutó');
  });

  it('the summary counts what happened, not what was declared', () => {
    // "9 de 9 operaciones" for a stage that died at two is the exact
    // confident-and-wrong reporting this whole system keeps removing.
    expect(render(recoveredAssetRun).textContent).toContain('2 de 9 operaciones');
  });

  it('a warning is drawn as a warning, and its message is shown', () => {
    const el = render([
      step({
        name: 'normalize:social-proof',
        status: 'warning',
        progress: { done: 0, total: 0, label: 'reseñas' },
        warnings: ['la fuente no publicó reseñas — la landing no mostrará ninguna'],
      }),
    ]);
    expect(el.querySelector('li span')?.textContent).toBe('!');
    expect(el.textContent).toContain('la fuente no publicó reseñas');
    expect(el.textContent).toContain('completado con avisos');
    // NOT a pass. The status word is what a screen reader gets, and flattening
    // it would hide the one thing worth reading.
    expect(el.textContent).not.toContain('— completado ');
  });

  it('a measured fact is printed exactly as the backend wrote it', () => {
    const el = render([
      // The shapes a real run produces: a hash and an element count are FACTS,
      // a proportion of reviews or of checks is a RATIO. Each goes to its own
      // field, so every `x/y` the operator reads is a proportion.
      step({ name: 'validate:grammar', status: 'passed', note: 'af765fce5c7d… · 243 elementos' }),
      step({ name: 'validate:social-proof', status: 'passed', progress: { done: 30, total: 30, label: 'factuales' } }),
      step({ name: 'validate:readiness', status: 'passed', progress: { done: 15, total: 15, label: 'checks' }, note: 'READY' }),
    ]);
    const text = el.textContent ?? '';
    expect(text).toContain('af765fce5c7d… · 243 elementos');
    expect(text).toContain('30/30 factuales');
    expect(text).toContain('15/15 checks');
    expect(text).toContain('READY');
    // No fraction was invented for the grammar line.
    expect(text).not.toContain('243/243');
  });

  it('a report written before `note` existed renders without inventing one', () => {
    // Reports persisted by an earlier Admin have no `note` key at all. The
    // component must read that as "no fact was measured" rather than printing
    // an empty span — a recovered report is not a broken one.
    const legacy = { ...step({ name: 'launch', status: 'passed' }) } as Partial<PipelineStep>;
    delete legacy.note;
    const el = render([legacy as PipelineStep]);
    expect(el.textContent).toContain('Navegador iniciado');
    expect(el.querySelectorAll('.font-mono')).toHaveLength(2); // the duration and the summary line
  });

  it('an operation nobody has named yet renders as itself', () => {
    // A stage that grows an operation shows up immediately, under its raw id.
    // Hiding it until somebody adds a translation would make the panel lie by
    // omission.
    expect(render([step({ name: 'assets:something-new', status: 'passed' })]).textContent).toContain(
      'assets:something-new',
    );
  });
});

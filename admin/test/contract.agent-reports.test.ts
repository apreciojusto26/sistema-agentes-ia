// WHAT EACH AGENT DID, WHILE IT DID IT — and still there tomorrow.
//
// ─── THE TWO DEFECTS ───────────────────────────────────────────────────────
//
// An agent went pending → working → done. For forty seconds that told an
// operator that something was happening and nothing about what.
//
// And the report was gone the moment the Admin closed. Each stage's detail was
// already parsed from the child's NDJSON and persisted into
// admin/.jobs/<id>/job.json — durable. What was NOT durable was the record
// tying those jobs into one run, so the work was on disk and unreachable.
//
// ─── WHAT MAKES THE STEPS TRUSTWORTHY ──────────────────────────────────────
//
// They are not a UI invention. Every one is a `withStage(...)` block a script
// really runs and really announces. This suite's job is to prove the UI can
// never show a step that did not happen, and never invents a status for one
// that did.
import { describe, test, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { STEP_LABEL, stepLabel, formatMs } from '../src/client/components/step-labels';
import { ADMIN_OPERATIONS } from '../src/server/pipeline';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

// ───────────────────────────────────────────────────────────────────────────
// THE STEPS ARE REAL
// ───────────────────────────────────────────────────────────────────────────

/** Pulls every `withStage('x')` / `stageStart('x')` a script declares. */
function declaredStages(relative: string): string[] {
  const src = readFileSync(path.join(REPO_ROOT, relative), 'utf-8');
  return [...src.matchAll(/(?:withStage|stageStart)\(\s*'([a-z0-9-]+)'/g)].map((m) => m[1]!);
}

describe('every step the UI can label is a real operation', () => {
  const SCRIPTS = {
    'scraper/scrape.js': ['launch', 'open', 'defer-load', 'structured-data', 'gallery', 'variants', 'reviews', 'images', 'write', 'close'],
    'scripts/generate-content.mjs': ['prepare', 'generate', 'save'],
    'scripts/generate-landing.mjs': ['args', 'validate', 'preflight', 'copy-template', 'write-data', 'patch-theme', 'write-favicon', 'copy-images', 'write-manifest', 'todos'],
  } as const;

  test.each(Object.entries(SCRIPTS))('%s still declares the stages the labels name', (relative, expected) => {
    // If a script renames or drops a stage, this fails HERE rather than the UI
    // silently showing a raw id — or worse, keeping a label for work that no
    // longer happens.
    expect(declaredStages(relative)).toEqual([...expected]);
  });

  test('every label maps to an operation something actually performs', () => {
    // TWO SOURCES OF REAL WORK, and a label must come from one of them.
    //
    //   the CHILD SCRIPTS' `withStage` blocks, announced over NDJSON; and
    //   the ADMIN'S OWN operations, for the three stages that delegate to no
    //   child at all — each one a real call StepRecorder wraps and times.
    //
    // Neither is a wish list. contract.admin-operations.test.ts proves every
    // name in ADMIN_OPERATIONS has a function behind it in the pipeline, so
    // widening this set does not weaken the rule it enforces.
    const real = new Set([
      ...Object.keys(SCRIPTS).flatMap((s) => declaredStages(s)),
      ...ADMIN_OPERATIONS,
    ]);
    const orphans = Object.keys(STEP_LABEL).filter((name) => !real.has(name));
    expect(orphans, 'these labels name operations nothing performs').toEqual([]);
  });

  test('every Admin operation HAS a label — none renders as a raw id', () => {
    // The other direction. An unmapped step degrades to its own id rather than
    // vanishing, which is the right failure mode for a child script that grows
    // a stage; but an Admin operation is declared in this repo, so shipping one
    // with no name is just an omission.
    const unnamed = ADMIN_OPERATIONS.filter((name) => STEP_LABEL[name] === undefined);
    expect(unnamed, 'these operations would render as raw ids').toEqual([]);
  });

  test('an UNMAPPED step renders as itself rather than disappearing', () => {
    // A script that grows a stage shows up immediately, under its raw id.
    // Hiding it until somebody adds a translation would make the panel lie by
    // omission.
    expect(stepLabel('a-brand-new-stage')).toBe('a-brand-new-stage');
    expect(stepLabel('structured-data')).toBe('Datos estructurados extraídos');
  });

  test('the label table states no OUTCOME — only what the operation is', () => {
    // "Reviews obtenidas" would be a claim; the status comes from the child.
    // A label that asserted success would put a green tick on a product whose
    // page had no reviews at all.
    for (const [name, label] of Object.entries(STEP_LABEL)) {
      expect(label.length, `${name} has no label`).toBeGreaterThan(0);
      expect(label, `${name} embeds a status`).not.toMatch(/^(✓|×|!|○)/);
    }
  });

  test('durations are formatted only from measured numbers', () => {
    expect(formatMs(320)).toBe('320 ms');
    expect(formatMs(18_400)).toBe('18.4 s');
    expect(formatMs(65_000)).toBe('1 min 5 s');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// THE PROJECTION
// ───────────────────────────────────────────────────────────────────────────

describe('the pipeline mirrors the child\'s stages without interpreting them', () => {
  const src = readFileSync(path.join(REPO_ROOT, 'admin/src/server/pipeline.ts'), 'utf-8');

  test('steps come from the JobRecord the poll loop already held', () => {
    expect(src).toMatch(/function projectSteps\(job: JobRecord \| null\): PipelineStep\[\]/);
    expect(src).toMatch(/return job\.stages\.map/);
    // No expected-step list anywhere: the pipeline cannot name a step the
    // child did not report.
    expect(src, 'the pipeline declares steps of its own').not.toMatch(/EXPECTED_STEPS|const STEPS =/);
  });

  test('a finished step that carried warnings is NOT reported as a clean pass', () => {
    expect(src).toMatch(/s\.warnings\.length > 0 \? 'warning' : 'passed'/);
  });

  test('every delegated stage streams its own steps as it runs', () => {
    // Three children, three subscriptions — the scrape, the content agent and
    // the generator.
    expect([...src.matchAll(/awaitJob\(registry, [^,]+, \(steps\) => \{/g)]).toHaveLength(3);
  });

  test('a stage begins with no steps and earns each one', () => {
    // Every stage starts empty — `freshStages()` gives it `steps: []` — and a
    // step is appended only when an operation actually starts. Nothing is
    // pre-populated so a card can look busy before it is.
    expect(src).toMatch(/steps: \[\],/);
  });

  test('the Admin-run stages report operations, and each wraps a real call', () => {
    // normalize, assets and validate delegate to no child, so there is no
    // NDJSON to mirror and their agents used to show a single stage-level tick.
    // They now report their OWN operations — through the same PipelineStep, the
    // same record and the same file as the child-reported ones.
    expect(src).toMatch(/class StepRecorder/);
    expect(src).toMatch(/run<T>\(name: string, fn: \(facts: StepFacts\) => T\): T/);
    // The status is the call's outcome, never a decision made before it ran.
    expect(src).toMatch(/ctx\.step\.status = ctx\.step\.warnings\.length > 0 \? 'warning' : 'passed'/);
    expect(src, 'a timer stands in for an operation').not.toMatch(/setInterval\(/);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// PERSISTENCE
// ───────────────────────────────────────────────────────────────────────────

describe('a report outlives the Admin that produced it', () => {
  const originalDir = process.env.ADMIN_PIPELINES_DIR;
  const dirs: string[] = [];

  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
    if (originalDir === undefined) delete process.env.ADMIN_PIPELINES_DIR;
  });

  test('a run left on disk is read back after the process restarts', async () => {
    // A RESTART, SIMULATED HONESTLY. The file is written the way a previous
    // process left it — not through `put()`, whose test seam now cleans up
    // after itself — and then `recover()` is asked to find it, which is
    // exactly what main.ts does at boot.
    const { PIPELINES_DIR } = await import('../src/server/config');
    const store = await import('../src/server/pipeline-store');
    mkdirSync(PIPELINES_DIR, { recursive: true });

    const written = path.join(PIPELINES_DIR, 'pl_recovered.json');
    const record = {
      pipelineId: 'pl_recovered',
      slug: 'zz-report',
      sourceUrl: 'https://es.aliexpress.com/item/1005007345199501.html',
      productId: 'prd_mtest01-abcdef01',
      shopifyHandle: null,
      commerceMode: 'preview-only',
      status: 'succeeded',
      currentStage: null,
      stages: [
        {
          name: 'scrape',
          status: 'pass',
          jobId: 'job-1',
          startedAt: '2026-09-05T18:42:00.000Z',
          endedAt: '2026-09-05T18:42:50.000Z',
          error: null,
          errorDetail: null,
          detail: 'Tubo de luz',
          steps: [
            {
              name: 'launch',
              status: 'passed',
              startedAt: '2026-09-05T18:42:00.000Z',
              endedAt: '2026-09-05T18:42:01.200Z',
              ms: 1200,
              progress: null,
              warnings: [],
            },
          ],
        },
      ],
      outputPath: '/outputs/zz-report',
      createdAt: '2026-09-05T18:42:00.000Z',
      finishedAt: '2026-09-05T18:43:00.000Z',
      error: null,
    };
    writeFileSync(written, JSON.stringify(record, null, 2));

    try {
      expect(store.recover()).toBeGreaterThanOrEqual(1);
      const runs = store.forSlug('zz-report');
      expect(runs.map((r) => r.pipelineId)).toContain('pl_recovered');
      // THE STEPS SURVIVED, which is the whole point — the report an operator
      // opens tomorrow is the one the agents produced today.
      const recovered = runs.find((r) => r.pipelineId === 'pl_recovered')!;
      expect(recovered.stages[0]!.steps.map((s) => s.name)).toEqual(['launch']);
      expect(recovered.stages[0]!.steps[0]!.ms).toBe(1200);
    } finally {
      rmSync(written, { force: true });
    }
  });

  test('a FAILED Validation Agent survives a restart with every check and its code intact', async () => {
    // VALIDATION GATES. Written the way a real process actually leaves it —
    // through the SAME record shape every other stage already persists in,
    // never a parallel store — then read back exactly as `main.ts` does at
    // boot, via `recover()`.
    const { PIPELINES_DIR } = await import('../src/server/config');
    const store = await import('../src/server/pipeline-store');
    mkdirSync(PIPELINES_DIR, { recursive: true });

    const written = path.join(PIPELINES_DIR, 'pl_validation_failed.json');
    const record = {
      pipelineId: 'pl_validation_failed',
      slug: 'zz-validation-gates',
      sourceUrl: 'https://example.com/item/1',
      productId: 'prd_gate-1',
      shopifyHandle: null,
      commerceMode: 'preview-only',
      status: 'failed',
      currentStage: 'validate',
      stages: [
        {
          name: 'validate',
          status: 'failed',
          jobId: null,
          startedAt: '2026-09-06T00:00:00.000Z',
          endedAt: '2026-09-06T00:00:01.000Z',
          error: 'Validation Agent: 2 invariant(s) demostrablemente inválido(s) — validate:grammar, validate:readiness',
          errorDetail: {
            headline: '2 chequeo(s) de Validation fallaron',
            facts: [
              { label: 'validate:grammar', value: 'validation-grammar-failed' },
              { label: 'validate:readiness', value: 'validation-readiness-failed' },
            ],
          },
          detail: null,
          steps: [
            { name: 'validate:artifact', status: 'passed', startedAt: '', endedAt: '', ms: 1, progress: null, note: '5 artefactos presentes', warnings: [], code: null },
            { name: 'validate:grammar', status: 'failed', startedAt: '', endedAt: '', ms: 1, progress: null, note: 'abc123… · 249 elementos', warnings: ['reviews/cards is on the page but its markup matches no shape the grammar declares for it', '1 región(es) de la Structural Grammar V3 sin colapsar o por debajo del mínimo declarado'], code: 'validation-grammar-failed' },
            { name: 'validate:asset-refs', status: 'passed', startedAt: '', endedAt: '', ms: 1, progress: { done: 19, total: 19, label: 'referencias resueltas' }, note: '32 claves en images.ts', warnings: [], code: null },
            { name: 'validate:ownership', status: 'passed', startedAt: '', endedAt: '', ms: 1, progress: null, note: 'aliexpress · 1005007345199501', warnings: [], code: null },
            { name: 'validate:social-proof', status: 'passed', startedAt: '', endedAt: '', ms: 1, progress: { done: 30, total: 30, label: 'factuales' }, note: null, warnings: [], code: null },
            { name: 'validate:readiness', status: 'failed', startedAt: '', endedAt: '', ms: 1, progress: { done: 14, total: 15, label: 'checks' }, note: '1 sin cumplir', warnings: ['Build present: dist/client/index.html not found', 'production readiness: 1/15 checks sin cumplir'], code: 'validation-readiness-failed' },
          ],
        },
      ],
      outputPath: '/outputs/zz-validation-gates',
      createdAt: '2026-09-06T00:00:00.000Z',
      finishedAt: '2026-09-06T00:00:01.000Z',
      error: 'Validation Agent: 2 invariant(s) demostrablemente inválido(s) — validate:grammar, validate:readiness',
    };
    writeFileSync(written, JSON.stringify(record, null, 2));

    try {
      expect(store.recover()).toBeGreaterThanOrEqual(1);
      const runs = store.forSlug('zz-validation-gates');
      const recovered = runs.find((r) => r.pipelineId === 'pl_validation_failed')!;
      // THE PIPELINE FINAL STATUS, preserved — never silently upgraded to
      // succeeded, and never left as `running` by a restart.
      expect(recovered.status).toBe('failed');
      const validate = recovered.stages.find((s: { name: string }) => s.name === 'validate')!;
      expect(validate.status).toBe('failed');
      // EVERY ONE OF THE SIX CHECKS, preserved — the two that failed AND the
      // four that passed, so "× Falló" on reopen still shows the whole board.
      expect(validate.steps.map((s: { name: string }) => s.name)).toEqual([
        'validate:artifact',
        'validate:grammar',
        'validate:asset-refs',
        'validate:ownership',
        'validate:social-proof',
        'validate:readiness',
      ]);
      // THE FAILURE CODES, preserved verbatim — programmatically
      // distinguishable, never re-derived by parsing a message.
      const codes = Object.fromEntries(validate.steps.map((s: { name: string; code: string | null }) => [s.name, s.code]));
      expect(codes['validate:grammar']).toBe('validation-grammar-failed');
      expect(codes['validate:readiness']).toBe('validation-readiness-failed');
      expect(codes['validate:artifact']).toBeNull();
    } finally {
      rmSync(written, { force: true });
    }
  });

  test('a run interrupted mid-flight comes back FAILED, not running', async () => {
    // Its child processes died with the server. Reporting it as in flight
    // forever would block the next generation on a run nobody can finish.
    const { PIPELINES_DIR } = await import('../src/server/config');
    const store = await import('../src/server/pipeline-store');
    mkdirSync(PIPELINES_DIR, { recursive: true });
    const written = path.join(PIPELINES_DIR, 'pl_interrupted.json');
    writeFileSync(
      written,
      JSON.stringify({
        pipelineId: 'pl_interrupted',
        slug: 'zz-interrupted',
        status: 'running',
        currentStage: 'scrape',
        stages: [{ name: 'scrape', status: 'running', steps: [] }],
        createdAt: '2026-09-05T18:42:00.000Z',
        error: null,
      }),
    );
    try {
      store.recover();
      const run = store.forSlug('zz-interrupted')[0]!;
      expect(run.status).toBe('failed');
      expect(run.currentStage).toBeNull();
      expect(run.stages[0]!.status).toBe('failed');
      expect(run.error).toMatch(/se reinició/);
    } finally {
      rmSync(written, { force: true });
    }
  });

  test('the reports live beside the jobs, not inside outputs/', () => {
    // A run that FAILED produced no output directory. A report that only
    // survived success would be missing exactly when it is most wanted.
    const config = readFileSync(path.join(REPO_ROOT, 'admin/src/server/config.ts'), 'utf-8');
    expect(config).toMatch(/export const PIPELINES_DIR = path\.join\(ADMIN_ROOT, '\.pipelines'\)/);
  });

  test('a run interrupted by a restart is recovered as FAILED, never as running', () => {
    const store = readFileSync(path.join(REPO_ROOT, 'admin/src/server/pipeline-store.ts'), 'utf-8');
    expect(store).toMatch(/if \(record\.status === 'running'\) \{/);
    expect(store).toContain("record.status = 'failed'");
    expect(store).toContain('el Admin se reinició mientras esta generación estaba en curso');
  });

  test('the store is recovered at boot, beside the job registry', () => {
    const main = readFileSync(path.join(REPO_ROOT, 'admin/src/server/main.ts'), 'utf-8');
    expect(main).toMatch(/registry\.recover\(\);[\s\S]{0,400}pipelineStore\.recover\(\);/);
  });

  test('the storage is keyed per RUN, so a landing can have many', () => {
    const store = readFileSync(path.join(REPO_ROOT, 'admin/src/server/pipeline-store.ts'), 'utf-8');
    expect(store).toMatch(/const file = \(pipelineId: string\) =>/);
    expect(store).toMatch(/export function forSlug\(slug: string\): PipelineRecord\[\]/);
  });

  test('a FAILED run is persisted too', () => {
    // "Páginas creadas" lists outputs that exist; a failed run made none. Its
    // report is still the thing an operator needs in order to know why.
    const store = readFileSync(path.join(REPO_ROOT, 'admin/src/server/pipeline-store.ts'), 'utf-8');
    expect(store, 'persistence is gated on success').not.toMatch(/status === 'succeeded'[^\n]*persist/);
    expect(store).toMatch(/if \(record\.status === 'running'\) \{[\s\S]*?return;\s*\}\s*if \(pending\)/);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// SELECTING AN AGENT
// ───────────────────────────────────────────────────────────────────────────

describe('agents become clickable when they have something to show', () => {
  const panel = readFileSync(
    path.join(REPO_ROOT, 'admin/src/client/components/PipelinePanel.tsx'),
    'utf-8',
  );
  const column = readFileSync(
    path.join(REPO_ROOT, 'admin/src/client/components/PipelineColumn.tsx'),
    'utf-8',
  );

  test('an agent with no reported stage is disabled', () => {
    expect(panel).toMatch(/const selectable = \(block: PipelineBlock\) =>/);
    expect(panel).toMatch(/block\.stages\.some\(\(stage\) => stage\.status !== 'pending'\)/);
    expect(column).toMatch(/disabled=\{!canSelect\}/);
  });

  test('the panel FOLLOWS the run until the operator picks an agent', () => {
    // `pinned === null` means follow. A panel that jumped away mid-read
    // because the next stage started would make the reports unusable exactly
    // when they became interesting.
    expect(panel).toMatch(/const \[pinned, setPinned\] = useState<BlockId \| null>\(null\)/);
    expect(panel).toMatch(/const active = pinnedBlock \?\? following;/);
  });

  test('a click pins, and a new run releases the pin', () => {
    expect(panel).toMatch(/onSelect=\{\(id\) => setPinned\(id\)\}/);
    expect(panel).toMatch(/setPinned\(null\);[\s\S]{0,200}setFormError\(null\)/);
  });

  test('the landing detail offers the same five agents, from the stored run', () => {
    const detail = readFileSync(
      path.join(REPO_ROOT, 'admin/src/client/components/LandingDetail.tsx'),
      'utf-8',
    );
    expect(detail).toMatch(/buildBlocks\(lastRun\.stages\)/);
    expect(detail).toMatch(/onClick=\{\(\) => setSelected\(b\.meta\.id\)\}/);
    expect(detail).toContain('<AgentSteps');
    // And it says so plainly when a landing predates stored reports.
    expect(detail).toContain('No hay ningún informe guardado para esta landing');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// NO FAKE PROGRESS
// ───────────────────────────────────────────────────────────────────────────

describe('the step list cannot show work that did not happen', () => {
  const steps = readFileSync(
    path.join(REPO_ROOT, 'admin/src/client/components/AgentSteps.tsx'),
    'utf-8',
  );

  test('it renders the steps it is given and predicts none', () => {
    expect(steps).toMatch(/steps\.map\(\(step\) =>/);
    expect(steps, 'the component declares steps of its own').not.toMatch(/const (EXPECTED|ALL_STEPS|STEPS) =/);
    expect(steps, 'a timer stands in for progress').not.toMatch(/setInterval|setTimeout/);
  });

  test('a duration is shown only when one was measured', () => {
    expect(steps).toMatch(/typeof step\.ms === 'number'/);
    expect(steps).toMatch(/const timed = steps\.filter\(\(s\) => typeof s\.ms === 'number'\)/);
  });

  test('progress counters come from the child, never from a fraction of time', () => {
    expect(steps).toMatch(/step\.progress\.done\}\/\{step\.progress\.total/);
  });

  test('and nothing animates — motion reads as progress', () => {
    // no-fake-spinner.test.ts allows `animate-` in exactly one component
    // across the whole client, and the rule is right: a step waiting on a
    // network call would look like it was advancing.
    // Comments stripped, the way no-fake-spinner.test.ts does it: the
    // component explains why it does not animate, and a scan that flagged the
    // explanation would force it to be deleted.
    const code = steps.replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toMatch(/animate-/);
  });
});

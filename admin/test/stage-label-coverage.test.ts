// Coverage contract for stage-label.ts (spec "Real-Stage Label Mapping",
// design §3.1 + §9.3, CORRECTED source of truth — see design §0 correction
// note). `admin/test/contract.scrape-log-lines.test.ts` contains ZERO stage
// literals (it is an emoji console.log source scan); it is NOT used here.
//
// Sources of truth, read directly from the real files rather than a fixture,
// so a future rename fails THIS test instead of silently degrading the UI
// to a raw enum name:
//   - scrape:   scraper/scrape.js's real `withStage('…')` call sites (10)
//   - generate: admin/test/contract.generate-landing.test.ts's two
//               `stage.start` expectation arrays (8 + 1 conditional = 9
//               union — `write-manifest` added by Product Identity +
//               Generation Isolation, design D5, task 5.4)
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, vi } from 'vitest';
import { stageLabel, isMappedStage } from '../src/shared/stage-label';
import type { ScrapeStage, GenerateStage, ContentStage } from '../src/shared/events';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCRAPE_JS_PATH = path.join(REPO_ROOT, 'scraper/scrape.js');
const GENERATE_CONTRACT_TEST_PATH = path.join(__dirname, 'contract.generate-landing.test.ts');
const CONTENT_CONTRACT_TEST_PATH = path.join(__dirname, 'contract.generate-content.test.ts');

const EXPECTED_SCRAPE_STAGES: ScrapeStage[] = [
  'launch',
  'open',
  'defer-load',
  'structured-data',
  'gallery',
  'variants',
  'reviews',
  'images',
  'write',
  'close',
];

const EXPECTED_GENERATE_STAGES: GenerateStage[] = [
  'args',
  'validate',
  'preflight',
  'copy-template',
  'write-data',
  // Design System Fase 2 (OQ-1/OQ-2, owner-authorized): emitted only when
  // --design is passed, so it appears in Group D's pin but not Group B's.
  // This array is the UNION of both, hence 10.
  'write-design',
  'patch-theme',
  'copy-images',
  'write-manifest',
  'todos',
];

const EXPECTED_CONTENT_STAGES: ContentStage[] = ['prepare', 'generate', 'save'];

function extractScrapeStagesFromScript(): string[] {
  const source = readFileSync(SCRAPE_JS_PATH, 'utf8');
  const re = /withStage\(\s*'([a-z-]+)'/g;
  const found = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) {
    found.add(match[1]);
  }
  return [...found];
}

function extractGenerateStagesFromContractTest(): string[] {
  const source = readFileSync(GENERATE_CONTRACT_TEST_PATH, 'utf8');
  // Matches the two `.toEqual([ 'a', 'b', ... ])` arrays that follow a
  // `stage.start` filter — extract every quoted stage literal inside each
  // array block that appears after a `stage.start` mention on a nearby line.
  const found = new Set<string>();
  const blockRe = /stage\.start[\s\S]{0,40}\.toEqual\(\[([\s\S]*?)\]\)/g;
  let block: RegExpExecArray | null;
  while ((block = blockRe.exec(source)) !== null) {
    const stringRe = /'([a-z-]+)'/g;
    let s: RegExpExecArray | null;
    while ((s = stringRe.exec(block[1])) !== null) {
      found.add(s[1]);
    }
  }
  return [...found];
}

function extractContentStagesFromContractTest(): string[] {
  const source = readFileSync(CONTENT_CONTRACT_TEST_PATH, 'utf8');
  const found = new Set<string>();
  const blockRe = /stage\.start[\s\S]{0,60}\.toEqual\(\[([\s\S]*?)\]\)/g;
  let block: RegExpExecArray | null;
  while ((block = blockRe.exec(source)) !== null) {
    const stringRe = /'([a-z-]+)'/g;
    let s: RegExpExecArray | null;
    while ((s = stringRe.exec(block[1])) !== null) {
      found.add(s[1]);
    }
  }
  return [...found];
}

describe('stage-label-coverage (spec Real-Stage Label Mapping, corrected sources — design §0/§9.3)', () => {
  it('scraper/scrape.js has exactly the 10 expected withStage(...) call sites', () => {
    const real = extractScrapeStagesFromScript().sort();
    expect(real).toEqual([...EXPECTED_SCRAPE_STAGES].sort());
  });

  it('every real scrape stage from scrape.js is mapped in stage-label.ts', () => {
    for (const stage of extractScrapeStagesFromScript()) {
      expect(isMappedStage(stage), `scrape stage "${stage}" is unmapped`).toBe(true);
    }
  });

  it('contract.generate-landing.test.ts has exactly the 10 expected stage.start stages (union of both arrays)', () => {
    const real = extractGenerateStagesFromContractTest().sort();
    expect(real).toEqual([...EXPECTED_GENERATE_STAGES].sort());
  });

  it('every real generate stage from the contract test is mapped in stage-label.ts', () => {
    for (const stage of extractGenerateStagesFromContractTest()) {
      expect(isMappedStage(stage), `generate stage "${stage}" is unmapped`).toBe(true);
    }
  });

  it('ScrapeStage and GenerateStage key sets are disjoint (guards the merged lookup table)', () => {
    const scrape = new Set(EXPECTED_SCRAPE_STAGES);
    const overlap = EXPECTED_GENERATE_STAGES.filter((s) => scrape.has(s as unknown as ScrapeStage));
    expect(overlap).toEqual([]);
  });

  it('contract.generate-content.test.ts has exactly the 3 expected stage.start stages', () => {
    const real = extractContentStagesFromContractTest().sort();
    expect(real).toEqual([...EXPECTED_CONTENT_STAGES].sort());
  });

  it('every real content stage from the contract test is mapped in stage-label.ts', () => {
    for (const stage of extractContentStagesFromContractTest()) {
      expect(isMappedStage(stage), `content stage "${stage}" is unmapped`).toBe(true);
    }
  });

  it('ScrapeStage, GenerateStage, and ContentStage key sets are pairwise disjoint (3-way, guards the merged lookup table)', () => {
    const scrape = new Set(EXPECTED_SCRAPE_STAGES);
    const generate = new Set(EXPECTED_GENERATE_STAGES);
    const content = new Set(EXPECTED_CONTENT_STAGES);

    const scrapeVsContent = EXPECTED_CONTENT_STAGES.filter((s) => scrape.has(s as unknown as ScrapeStage));
    const generateVsContent = EXPECTED_CONTENT_STAGES.filter((s) => generate.has(s as unknown as GenerateStage));
    const scrapeVsGenerate = EXPECTED_GENERATE_STAGES.filter((s) => scrape.has(s as unknown as ScrapeStage));

    expect(scrapeVsContent).toEqual([]);
    expect(generateVsContent).toEqual([]);
    expect(scrapeVsGenerate).toEqual([]);
    // `validate` is the documented near-miss (AD1) — GenerateStage already
    // owns it, which is exactly why ContentStage uses `save` instead.
    expect(content.has('validate' as unknown as ContentStage)).toBe(false);
  });

  it('every real stage literal maps to a non-empty Spanish string, never the raw literal, never blank', () => {
    for (const stage of [...EXPECTED_SCRAPE_STAGES, ...EXPECTED_GENERATE_STAGES, ...EXPECTED_CONTENT_STAGES]) {
      const label = stageLabel(stage);
      expect(label.length).toBeGreaterThan(0);
      expect(label).not.toBe(stage);
    }
  });

  it('every mapped label contains no raw enum-looking token (cheap "did someone paste the raw name" guard)', () => {
    for (const stage of [...EXPECTED_SCRAPE_STAGES, ...EXPECTED_GENERATE_STAGES, ...EXPECTED_CONTENT_STAGES]) {
      const label = stageLabel(stage);
      expect(label).not.toMatch(/^[a-z]+(-[a-z]+)+$/);
    }
  });

  it('an unmapped stage falls back to the raw name verbatim, never blank, and warns via console.warn', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const label = stageLabel('totally-made-up');
      expect(label).toBe('totally-made-up');
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('isMappedStage returns false for an unmapped stage and true for every real one', () => {
    expect(isMappedStage('totally-made-up')).toBe(false);
    for (const stage of [...EXPECTED_SCRAPE_STAGES, ...EXPECTED_GENERATE_STAGES, ...EXPECTED_CONTENT_STAGES]) {
      expect(isMappedStage(stage)).toBe(true);
    }
  });
});

// Baseline lock for scraper/scrape.js (spec R5, R11, R12; design §8 Group E).
//
// Written BEFORE scrape.js is touched by Batch C's LG_EVENTS instrumentation
// (task C8) — this is the RED-baseline-lock step: run it once against the
// UNMODIFIED script to prove it's a true baseline (not a guess), THEN
// instrument scrape.js additively and re-run to prove the legacy strings
// survived byte-for-byte. There is no separate test runner for scraper/; the
// static source-scan here is scrape.js's only automated regression guard.
//
// Deliberately a text scan of the real file, not a spawn — scrape.js needs a
// live browser + network to actually run, which is out of scope for a fast,
// deterministic unit suite.

import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCRAPE_JS = path.join(REPO_ROOT, 'scraper', 'scrape.js');

const source = readFileSync(SCRAPE_JS, 'utf-8');

describe('scraper/scrape.js — legacy console.log literals (baseline lock)', () => {
  test.each([
    '🚀 Abriendo producto...',
    '📜 Cargando contenido diferido...',
    '📦 Leyendo datos estructurados...',
    // NOTE: two spaces between the emoji and the text — do not "fix" this.
    '🖼  Extrayendo galería...',
    '🎨 Extrayendo variantes...',
    '💬 Expandiendo reseñas...',
    'reseñas cargadas en el DOM',
    'no se pudo abrir el modal',
    '🔥 RESULTADO',
    '💾 Guardado en ',
    '💥',
  ])('contains the verbatim literal: %j', (literal) => {
    expect(source).toContain(literal);
  });

  test('outputDir config value is unchanged (archiving depends on it, design §7)', () => {
    expect(source).toContain("outputDir: './output'");
  });

  test('CLI still defaults to a hardcoded product URL when no argv is passed (the URL-preflight guard reasoning)', () => {
    expect(source).toMatch(/process\.argv\[2\]\s*\|\|/);
  });
});

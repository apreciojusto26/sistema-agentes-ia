import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from '../../scripts/lib/impeccable-principles.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CSS = readFileSync(
  path.join(REPO_ROOT, 'content/landing-astravibe/src/styles/global.css'),
  'utf8',
);

function colorToken(name: string): string {
  const match = CSS.match(new RegExp(`--color-${name}:\\s*(#[0-9A-Fa-f]{6})`));
  expect(match, `--color-${name} must exist in the Fixed theme`).not.toBeNull();
  return match![1];
}

const STEEL = colorToken('steel');
const LIGHT_SURFACES = ['bone', 'bone-dim', 'surface'] as const;

describe('Fixed AstraVibe accessibility baseline', () => {
  it('pins the corrected muted foreground token', () => {
    expect(STEEL).toBe('#63686E');
  });

  it('keeps muted text at WCAG AA contrast on every light surface it uses', () => {
    for (const surface of LIGHT_SURFACES) {
      expect(contrastRatio(STEEL, colorToken(surface)), `steel on ${surface}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('rejects the previous muted foreground because it fails a real light surface', () => {
    const regressiveRatios = LIGHT_SURFACES.map((surface) => contrastRatio('#8A9096', colorToken(surface))!);
    expect(regressiveRatios.some((ratio) => ratio < 4.5)).toBe(true);
  });
});

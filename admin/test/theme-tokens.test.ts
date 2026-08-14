// Design tokens contract (design §1, spec "Agent Accent + Neutral + Status
// Color Tokens", D2a). Parses the real `@theme { … }` block in
// admin/src/client/styles.css with a brace-balanced slice (not a lazy
// regex, since the block legitimately contains nested `{` via comments and
// could in principle contain other at-rules) and asserts:
//   - all 22 committed tokens are present with a non-empty hex value
//   - agent-accent hexes are disjoint from status hexes (D2a, load-bearing:
//     a status semantic must never double as an agent's brand color)
//   - no two agent accents share a hue
//   - every token is a well-formed 6-digit hex
//   - tint tokens are never reused as any non-tint token
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STYLES_PATH = path.resolve(__dirname, '../src/client/styles.css');

const REQUIRED_TOKENS = [
  // agent accents (6)
  '--color-agent-scrape',
  '--color-agent-scrape-tint',
  '--color-agent-content',
  '--color-agent-content-tint',
  '--color-agent-generate',
  '--color-agent-generate-tint',
  // neutrals / surfaces (5)
  '--color-panel',
  '--color-panel-soft',
  '--color-ink',
  '--color-ink-soft',
  '--color-hairline',
  // status semantics (4)
  '--color-state-running',
  '--color-state-done',
  '--color-state-failed',
  '--color-state-idle',
  // checklist dark card (3)
  '--color-checklist-surface',
  '--color-checklist-ink',
  '--color-checklist-ink-soft',
  // status on dark (3)
  '--color-state-running-on-dark',
  '--color-state-done-on-dark',
  '--color-state-failed-on-dark',
] as const;

function extractThemeBlock(source: string): string {
  const start = source.indexOf('@theme');
  if (start === -1) throw new Error('no @theme block found in styles.css');
  const openBrace = source.indexOf('{', start);
  if (openBrace === -1) throw new Error('@theme block has no opening brace');

  let depth = 0;
  for (let i = openBrace; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) return source.slice(openBrace + 1, i);
    }
  }
  throw new Error('@theme block never closes (unbalanced braces)');
}

function parseTokens(themeBlock: string): Map<string, string> {
  const map = new Map<string, string>();
  const re = /(--[a-z0-9-]+)\s*:\s*([^;]+);/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(themeBlock)) !== null) {
    map.set(match[1], match[2].trim());
  }
  return map;
}

function normalizeHex(value: string): string {
  return value.trim().toLowerCase();
}

describe('theme-tokens (design §1, spec D2a)', () => {
  const source = readFileSync(STYLES_PATH, 'utf8');
  const themeBlock = extractThemeBlock(source);
  const tokens = parseTokens(themeBlock);

  it('defines all 22 committed tokens with a non-empty value', () => {
    for (const name of REQUIRED_TOKENS) {
      expect(tokens.has(name), `missing token ${name}`).toBe(true);
      expect(tokens.get(name)!.length, `${name} has an empty value`).toBeGreaterThan(0);
    }
  });

  it('every token value is a well-formed 6-digit hex color', () => {
    for (const name of REQUIRED_TOKENS) {
      const value = tokens.get(name);
      expect(value, `${name} missing`).toBeDefined();
      expect(value, `${name} is not a 6-digit hex: ${value}`).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('agent-accent tokens (incl. tints) are disjoint from status tokens (incl. on-dark) — D2a', () => {
    const agentNames = [
      '--color-agent-scrape',
      '--color-agent-scrape-tint',
      '--color-agent-content',
      '--color-agent-content-tint',
      '--color-agent-generate',
      '--color-agent-generate-tint',
    ];
    const statusNames = [
      '--color-state-running',
      '--color-state-done',
      '--color-state-failed',
      '--color-state-idle',
      '--color-state-running-on-dark',
      '--color-state-done-on-dark',
      '--color-state-failed-on-dark',
    ];

    const agentHexes = new Set(agentNames.map((n) => normalizeHex(tokens.get(n)!)));
    const statusHexes = new Set(statusNames.map((n) => normalizeHex(tokens.get(n)!)));

    const intersection = [...agentHexes].filter((hex) => statusHexes.has(hex));
    expect(intersection, `agent accent hex(es) reused as a status color: ${intersection.join(', ')}`).toEqual([]);
  });

  it('no two agent accent base colors share the same hue (scrape/content/generate distinct)', () => {
    const bases = ['--color-agent-scrape', '--color-agent-content', '--color-agent-generate'].map((n) =>
      normalizeHex(tokens.get(n)!),
    );
    expect(new Set(bases).size).toBe(bases.length);
  });

  it('tint tokens are not reused as any non-tint token value', () => {
    const tintNames = ['--color-agent-scrape-tint', '--color-agent-content-tint', '--color-agent-generate-tint'];
    const tintHexes = new Set(tintNames.map((n) => normalizeHex(tokens.get(n)!)));

    const nonTintNames = REQUIRED_TOKENS.filter((n) => !tintNames.includes(n));
    const collisions = nonTintNames.filter((n) => tintHexes.has(normalizeHex(tokens.get(n)!)));
    expect(collisions, `tint hex reused by non-tint token(s): ${collisions.join(', ')}`).toEqual([]);
  });
});

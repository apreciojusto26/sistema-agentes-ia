// Fase 3 — theme token VALUE-FORMAT contract (`theme-token-format`).
//
// Regression origin, verbatim from a real Design Agent run: the model emitted
//   "radius": { "card": "pill", "tile": "pill", "pill": "pill" }
//   "shadow": { "card": "lift", "lift": "lift" }
// using TOKEN NAMES as VALUES. Every group and key was legal, so the spec
// passed the contract, and patchThemeBlock() wrote `--radius-card: pill;` into
// the generated global.css. The browser drops that declaration: cards render
// with no radius and no shadow, and nothing anywhere reports an error.
//
// This suite runs against the PRODUCTION contract — never a fixture copy — and
// asserts the gate is fail-closed in both directions: the real-world invalid
// values are rejected, and every value shape the template's own @theme block
// actually uses is still accepted.
import { describe, it, expect } from 'vitest';
import { collectDesignErrors, validateDesignSpec, checkDesignSupport } from '../../scripts/lib/design-contract.mjs';

/** Minimal spec that passes everything EXCEPT whatever `theme` we inject. */
function specWithTheme(theme: Record<string, unknown>) {
  return {
    schema: 1,
    productId: 'prd_mabcdefg-12345678',
    design: { family: 'premium', density: 'balanced' },
    theme,
    sections: [{ category: 'hero', type: 'Hero', variant: 'default', order: 0 }],
  };
}

const formatIssues = (theme: Record<string, unknown>) =>
  collectDesignErrors(specWithTheme(theme)).filter((i: any) => i.code === 'theme-token-format');

describe('theme token value format (Fase 3 — fail-closed)', () => {
  describe('the exact regression that shipped invalid CSS', () => {
    it('rejects radius.card = "pill" (a token NAME used as a value)', () => {
      const issues = formatIssues({ radius: { card: 'pill' } });
      expect(issues).toHaveLength(1);
      expect(issues[0].path).toBe('theme.radius.card');
      expect(issues[0].message).toContain('pill');
    });

    it('rejects shadow.card = "lift"', () => {
      const issues = formatIssues({ shadow: { card: 'lift' } });
      expect(issues).toHaveLength(1);
      expect(issues[0].path).toBe('theme.shadow.card');
    });

    it('rejects the full real-world payload and names EVERY bad token, not just the first', () => {
      const issues = formatIssues({
        radius: { card: 'pill', tile: 'pill', pill: 'pill' },
        shadow: { card: 'lift', lift: 'lift' },
      });
      expect(issues).toHaveLength(5);
      expect(issues.map((i: any) => i.path).sort()).toEqual([
        'theme.radius.card',
        'theme.radius.pill',
        'theme.radius.tile',
        'theme.shadow.card',
        'theme.shadow.lift',
      ]);
    });

    it('makes the whole spec invalid — it can never reach the renderer', () => {
      const spec = specWithTheme({ radius: { card: 'pill' } });
      expect(() => validateDesignSpec(spec)).toThrow();
      expect(checkDesignSupport(spec).status).toBe('invalid');
    });
  });

  describe('rejects other token-name-as-value confusions', () => {
    it.each([
      ['colors', 'rust', 'graphite'],
      ['colors', 'bone', 'surface'],
      ['fonts', 'display', 'display'],
      ['radius', 'tile', 'card'],
      ['shadow', 'lift', 'none-ish'],
    ])('%s.%s = "%s"', (group, key, value) => {
      expect(formatIssues({ [group]: { [key]: value } })).toHaveLength(1);
    });
  });

  describe('accepts every shape the template @theme block actually uses', () => {
    it.each([
      ['colors', 'rust', '#C8552F'],
      ['colors', 'surface', '#FFFFFF'],
      ['colors', 'bone', '#F7F3EC'],
      ['fonts', 'display', '"Archivo Variable", ui-sans-serif, system-ui, sans-serif'],
      ['fonts', 'sans', 'ui-monospace'],
      ['radius', 'card', '1.5rem'],
      ['radius', 'pill', '999px'],
      ['shadow', 'card', '0 2px 10px -3px rgb(30 33 36 / 0.10)'],
      ['shadow', 'ring-white', '0 0 0 4px #FFFFFF'],
    ])('%s.%s = "%s" is accepted', (group, key, value) => {
      expect(formatIssues({ [group]: { [key]: value } })).toEqual([]);
    });

    it('accepts modern colour functions so a legitimate oklch()/color-mix() is never rejected', () => {
      expect(formatIssues({ colors: { rust: 'oklch(0.7 0.15 40)' } })).toEqual([]);
      expect(formatIssues({ colors: { gold: 'color-mix(in oklab, #C9A227 60%, white)' } })).toEqual([]);
      expect(formatIssues({ colors: { bone: 'rgb(247 243 236 / 0.9)' } })).toEqual([]);
    });

    it('accepts shadow "none"', () => {
      expect(formatIssues({ shadow: { card: 'none' } })).toEqual([]);
    });
  });

  describe('text tokens — same defect class', () => {
    it('accepts the template\'s own text values', () => {
      expect(
        formatIssues({ text: { hero: { size: '2.5rem', lineHeight: '1.03', letterSpacing: '-0.03em' } } }),
      ).toEqual([]);
    });

    it('rejects a size that is not a length', () => {
      const issues = formatIssues({ text: { hero: { size: 'display' } } });
      expect(issues).toHaveLength(1);
      expect(issues[0].path).toBe('theme.text.hero.size');
    });

    it('keeps lineHeight unitless-legal (1.03 is NOT an error)', () => {
      expect(formatIssues({ text: { display: { lineHeight: '1.08' } } })).toEqual([]);
    });
  });
});

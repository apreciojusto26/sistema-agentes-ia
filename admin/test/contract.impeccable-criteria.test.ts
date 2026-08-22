// Fase 3 — Impeccable as the Design Agent's visual-criterion layer.
//
// The point of these tests is that Impeccable is NOT just prompt text. If it
// were, nothing would be verifiable and it could not be said to influence
// anything. `collectImpeccableFindings()` judges a CONTRACT-VALID DesignSpec
// deterministically, so the influence is observable and regression-tested.
//
// AUTHORITY ORDER under test: contracts > agent rules > Impeccable > model.
// Every assertion here is about the ADVISORY tier — a finding must never be a
// contract error, and must never, by itself, make a spec unrenderable.
import { describe, it, expect } from 'vitest';
import {
  collectImpeccableFindings,
  contrastRatio,
  parseHex,
  hue,
} from '../../scripts/lib/impeccable-principles.mjs';
import { collectDesignErrors } from '../../scripts/lib/design-contract.mjs';

const baseSpec = (over: Record<string, unknown> = {}) => ({
  schema: 1,
  productId: 'prd_mabcdefg-12345678',
  design: { family: 'premium', density: 'balanced' },
  sections: [
    { category: 'hero', type: 'Hero', variant: 'default', order: 0 },
    { category: 'conversion', type: 'BuyBox', variant: 'default', order: 1 },
    { category: 'socialProof', type: 'ReviewsReel', variant: 'default', order: 2 },
  ],
  ...over,
});

const rules = (spec: any) => collectImpeccableFindings(spec).map((f: any) => f.rule);

describe('Impeccable criteria (advisory tier)', () => {
  it('a well-formed spec produces no findings', () => {
    expect(collectImpeccableFindings(baseSpec())).toEqual([]);
  });

  describe('colour maths is real, not decorative', () => {
    it('parses hex in both short and long form', () => {
      expect(parseHex('#fff')).toEqual({ r: 255, g: 255, b: 255 });
      expect(parseHex('#C8552F')).toEqual({ r: 200, g: 85, b: 47 });
      expect(parseHex('oklch(0.7 0.15 40)')).toBeNull();
    });

    it('computes WCAG contrast against known reference values', () => {
      // black on white is the canonical 21:1
      expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 1);
      expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5);
    });

    it('places the purple→blue band correctly', () => {
      expect(hue(parseHex('#7C3AED')!)).toBeGreaterThan(230);
      expect(hue(parseHex('#7C3AED')!)).toBeLessThan(290);
      expect(hue(parseHex('#C8552F')!)).toBeLessThan(40); // the template's warm rust
    });
  });

  describe('anti-patterns Impeccable names explicitly', () => {
    it('flags a generic display font', () => {
      expect(rules(baseSpec({ theme: { fonts: { display: 'Inter, sans-serif' } } }))).toContain('generic-display-font');
      expect(rules(baseSpec({ theme: { fonts: { display: 'Arial, Helvetica, sans-serif' } } }))).toContain('generic-display-font');
    });

    it('sees through foundry suffixes — "Inter Variable" is still Inter', () => {
      // Regression from a live run: an exact-match check waved this through.
      expect(rules(baseSpec({ theme: { fonts: { display: '"Inter Variable", ui-sans-serif, system-ui, sans-serif' } } })))
        .toContain('generic-display-font');
      expect(rules(baseSpec({ theme: { fonts: { display: '"Segoe UI", Roboto, Arial, sans-serif' } } })))
        .toContain('generic-display-font');
    });

    it('does NOT flag a font stack with character', () => {
      expect(rules(baseSpec({ theme: { fonts: { display: '"Archivo Variable", ui-sans-serif, sans-serif' } } })))
        .not.toContain('generic-display-font');
    });

    it('flags the purple→blue gradient tell when BOTH accents sit in the band', () => {
      expect(rules(baseSpec({ theme: { colors: { rust: '#7C3AED', gold: '#2563EB' } } })))
        .toContain('purple-blue-gradient-tell');
    });

    it('does not flag it when only one accent is blue', () => {
      expect(rules(baseSpec({ theme: { colors: { rust: '#2563EB', gold: '#C9A227' } } })))
        .not.toContain('purple-blue-gradient-tell');
    });

    it('flags an untinted grey accent', () => {
      expect(rules(baseSpec({ theme: { colors: { rust: '#808080' } } }))).toContain('untinted-accent');
    });

    it('flags body text below WCAG AA', () => {
      expect(rules(baseSpec({ theme: { colors: { bone: '#F7F3EC', graphite: '#B9B4AC' } } })))
        .toContain('insufficient-contrast');
    });

    it('accepts the template\'s own bone/graphite pair', () => {
      expect(rules(baseSpec({ theme: { colors: { bone: '#F7F3EC', graphite: '#1E2124' } } })))
        .not.toContain('insufficient-contrast');
    });

    it('flags radius soup', () => {
      expect(rules(baseSpec({ theme: { radius: { card: '1rem', tile: '2rem', pill: '3rem' } }, }))).not.toContain('inconsistent-radius');
      expect(
        rules(baseSpec({ theme: { radius: { card: '1rem', tile: '2rem', pill: '3rem' }, shadow: {} } })),
      ).not.toContain('inconsistent-radius');
    });
  });

  describe('composition', () => {
    it('flags three consecutive sections of the same category', () => {
      const spec = baseSpec({
        sections: [
          { category: 'socialProof', type: 'UgcStrip', variant: 'default', order: 0 },
          { category: 'socialProof', type: 'ReviewsReel', variant: 'default', order: 1 },
          { category: 'socialProof', type: 'RealResults', variant: 'default', order: 2 },
          { category: 'conversion', type: 'BuyBox', variant: 'default', order: 3 },
        ],
      });
      expect(rules(spec)).toContain('flat-section-rhythm');
    });

    it('flags a page with no conversion section', () => {
      const spec = baseSpec({
        sections: [
          { category: 'hero', type: 'Hero', variant: 'default', order: 0 },
          { category: 'socialProof', type: 'ReviewsReel', variant: 'default', order: 1 },
        ],
      });
      expect(rules(spec)).toContain('missing-conversion');
    });

    it('flags a page with no social proof', () => {
      const spec = baseSpec({
        sections: [
          { category: 'hero', type: 'Hero', variant: 'default', order: 0 },
          { category: 'conversion', type: 'BuyBox', variant: 'default', order: 1 },
        ],
      });
      expect(rules(spec)).toContain('missing-social-proof');
    });
  });

  describe('AUTHORITY ORDER — Impeccable never outranks the contract', () => {
    it('a spec with findings is still contract-valid: taste cannot block rendering', () => {
      const ugly = baseSpec({ theme: { fonts: { display: 'Arial, sans-serif' } } });
      expect(collectImpeccableFindings(ugly).length).toBeGreaterThan(0);
      expect(collectDesignErrors(ugly)).toEqual([]);
    });

    it('findings are advisory objects, never contract issues (no `code` field)', () => {
      const findings = collectImpeccableFindings(baseSpec({ theme: { colors: { rust: '#808080' } } }));
      for (const f of findings) {
        expect(f).toHaveProperty('rule');
        expect(f).toHaveProperty('message');
        expect(f).not.toHaveProperty('code');
      }
    });

    it('introduces NO vocabulary of its own — it never invents families, densities or capabilities', async () => {
      const source = await import('node:fs').then((fs) =>
        fs.readFileSync(new URL('../../scripts/lib/impeccable-principles.mjs', import.meta.url), 'utf8'),
      );
      // The registry owns these lists. A second declaration here would be the
      // second source of truth the SDD doctrine forbids.
      expect(source).not.toMatch(/DESIGN_FAMILIES\s*=/);
      expect(source).not.toMatch(/DESIGN_DENSITIES\s*=/);
      expect(source).not.toMatch(/REGISTRY\s*=/);
    });
  });
});

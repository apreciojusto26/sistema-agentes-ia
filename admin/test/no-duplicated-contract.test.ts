// Anti-drift guard (spec R6, design §8 Group H): asserts nobody re-implements
// the content-contract whitelist inside admin/src instead of importing it
// from scripts/lib/content-contract.mjs. 'ratingBreakdown' is a distinctive
// field name from ALLOWED_PRODUCT_FIELDS that could only appear under
// admin/src if someone copy-pasted the whitelist rather than importing it.
//
// Extended for the Design System (agents.MD §5.7) with the identical
// mechanism: the design registry — capabilities, families, densities, theme
// tokens — has ONE source of truth in scripts/lib/design-registry.mjs, and
// admin/src/server/validation/design.ts is a thin re-export of it, never a
// second copy. 'FeaturedTestimonial' (a registered type) and 'energetic' (a
// registered family) are the sentinels: both are distinctive enough that they
// could only appear under admin/src via a copy-pasted list.
//
// Expected green immediately — ongoing regression guard, not a RED/GREEN
// pair (no runtime behavior of its own to test-first).

import { describe, test, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const ADMIN_SRC = path.join(REPO_ROOT, 'admin/src');
const FIXTURES_DIR = path.join(REPO_ROOT, 'admin/test/fixtures');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (full === FIXTURES_DIR) continue;
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

describe('Group H — no-duplicated-contract (anti-drift)', () => {
  test('no file under admin/src contains a re-implemented whitelist ("ratingBreakdown" literal)', () => {
    const files = walk(ADMIN_SRC);
    const offenders = files.filter((f) => readFileSync(f, 'utf-8').includes('ratingBreakdown'));
    expect(offenders).toEqual([]);
  });

  test('admin/src/server/validation/content.ts re-exports from scripts/lib/content-contract.mjs (no re-declared field list)', () => {
    const contentTs = readFileSync(
      path.join(ADMIN_SRC, 'server/validation/content.ts'),
      'utf-8',
    );
    expect(contentTs).toContain("from '../../../../scripts/lib/content-contract.mjs'");
    expect(contentTs).not.toMatch(/const\s+ALLOWED_PRODUCT_FIELDS\s*=/);
    expect(contentTs).not.toMatch(/const\s+REQUIRED_PRODUCT_FIELDS\s*=/);
  });

  // --- Design System registry (agents.MD §5.7) ------------------------------

  test('no file under admin/src re-declares a registry capability list ("FeaturedTestimonial" / "energetic" literals)', () => {
    const files = walk(ADMIN_SRC);
    const offenders = files.filter((f) => {
      const source = readFileSync(f, 'utf-8');
      return source.includes('FeaturedTestimonial') || source.includes('energetic');
    });
    expect(offenders).toEqual([]);
  });

  test('admin/src/server/validation/design.ts re-exports from scripts/lib (no re-declared registry)', () => {
    const designTs = readFileSync(path.join(ADMIN_SRC, 'server/validation/design.ts'), 'utf-8');

    expect(designTs).toContain("from '../../../../scripts/lib/design-contract.mjs'");
    expect(designTs).toContain("from '../../../../scripts/lib/design-registry.mjs'");

    // A local `const X = [...]` for any of these would be a second source of
    // truth, exactly what content.ts is forbidden from doing above.
    expect(designTs).not.toMatch(/const\s+REGISTRY\s*=/);
    expect(designTs).not.toMatch(/const\s+DESIGN_FAMILIES\s*=/);
    expect(designTs).not.toMatch(/const\s+DESIGN_DENSITIES\s*=/);
    expect(designTs).not.toMatch(/const\s+THEME_TOKENS\s*=/);
    expect(designTs).not.toMatch(/const\s+THEME_GROUPS\s*=/);
  });

  test('the design registry lives in exactly one file under scripts/lib', () => {
    const registrySource = readFileSync(
      path.join(REPO_ROOT, 'scripts/lib/design-registry.mjs'),
      'utf-8',
    );
    expect(registrySource).toContain('FeaturedTestimonial');
    expect(registrySource).toContain('energetic');

    // The contract consumes the registry, it never restates it.
    const contractSource = readFileSync(
      path.join(REPO_ROOT, 'scripts/lib/design-contract.mjs'),
      'utf-8',
    );
    expect(contractSource).toContain("from './design-registry.mjs'");
    expect(contractSource).not.toContain('FeaturedTestimonial');
    expect(contractSource).not.toMatch(/const\s+DESIGN_FAMILIES\s*=/);
  });
});

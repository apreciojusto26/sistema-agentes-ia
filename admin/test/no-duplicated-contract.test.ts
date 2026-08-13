// Anti-drift guard (spec R6, design §8 Group H): asserts nobody re-implements
// the content-contract whitelist inside admin/src instead of importing it
// from scripts/lib/content-contract.mjs. 'ratingBreakdown' is a distinctive
// field name from ALLOWED_PRODUCT_FIELDS that could only appear under
// admin/src if someone copy-pasted the whitelist rather than importing it.
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
});

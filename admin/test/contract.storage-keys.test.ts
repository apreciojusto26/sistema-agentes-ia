// No landing may WRITE a brand-scoped storage key.
//
// `astravibe:cartId` and `astravibe:offerEndsAt` were hardcoded in the
// template, so every landing this system generated wrote the star projector's
// brand into a stranger's browser whatever it was selling. Same class as the
// comparison heading; invisible only because storage keys are never rendered.
//
// THE GUARD HAS TO BE PRECISE. A naive "no `astravibe:` anywhere" scan would
// fail on the migration constants that MUST name the old keys, and on the
// tests that prove the migration works. So it distinguishes:
//
//   allowed   the LEGACY_STORAGE_KEYS declaration, and tests referencing it
//   forbidden any other source writing or reading a brand-scoped key
import { describe, test, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SRC = path.join(REPO_ROOT, 'content/landing-base/src');

const keys = await import(pathToFileURL(path.join(SRC, 'lib/storage-keys.ts')).href).catch(() => null);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|astro)$/.test(full)) out.push(full);
  }
  return out;
}

/** Strips comments — history is documented in prose all over this repo. */
const code = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n');

const ALLOWED = [
  'lib/storage-keys.ts',       // declares the legacy names, by definition
  'lib/storage-keys.test.ts',  // proves the migration, so must name them
];

describe('brand-scoped storage keys are gone from runtime code', () => {
  test('only the migration module and its test mention a brand-scoped key', () => {
    const offenders = walk(SRC)
      .filter((f) => /['"`]astravibe:/.test(code(readFileSync(f, 'utf-8'))))
      .map((f) => path.relative(SRC, f))
      .filter((rel) => !ALLOWED.includes(rel));

    expect(offenders, 'a source still uses a brand-scoped storage key').toEqual([]);
  });

  test('the guard is not vacuous — it really can see those strings', () => {
    // A scan that matched nothing anywhere would pass the test above while
    // proving nothing. The allowed file must actually contain them.
    const declaring = code(readFileSync(path.join(SRC, 'lib/storage-keys.ts'), 'utf-8'));
    expect(declaring).toMatch(/['"]astravibe:cartId['"]/);
    expect(declaring).toMatch(/['"]astravibe:offerEndsAt['"]/);
  });

  test('the legacy names appear ONLY inside LEGACY_STORAGE_KEYS', () => {
    const src = code(readFileSync(path.join(SRC, 'lib/storage-keys.ts'), 'utf-8'));
    const block = src.slice(src.indexOf('LEGACY_STORAGE_KEYS'), src.indexOf('} as const', src.indexOf('LEGACY_STORAGE_KEYS')));
    expect([...src.matchAll(/['"]astravibe:/g)].length, 'a legacy name escaped the migration block').toBe(
      [...block.matchAll(/['"]astravibe:/g)].length,
    );
  });
});

describe('the writers use the neutral keys', () => {
  test.each([
    ['cart store', 'stores/cart.ts', 'cartId'],
    ['countdown', 'components/islands/CountdownTimer.tsx', 'offerEndsAt'],
  ])('%s reads STORAGE_KEYS.%s and migrates', (_n, rel, key) => {
    const src = code(readFileSync(path.join(SRC, rel), 'utf-8'));
    expect(src).toContain(`STORAGE_KEYS.${key}`);
    expect(src).toMatch(/readMigrating|writeMigrating|clearMigrating/);
    // No raw setItem/getItem left that would bypass the migration helpers.
    expect(src, 'a raw storage call bypasses the migration').not.toMatch(
      /(local|session)Storage\.(setItem|getItem)\(/,
    );
  });
});

describe('a generated landing writes no brand-scoped key', () => {
  test('the neutral keys are what the template ships', () => {
    expect(keys).not.toBeNull();
    expect(Object.values(keys!.STORAGE_KEYS)).toEqual(['commerce:cartId', 'offer:endsAt']);
    for (const k of Object.values(keys!.STORAGE_KEYS)) {
      expect(k as string).not.toMatch(/astravibe/i);
    }
  });
});

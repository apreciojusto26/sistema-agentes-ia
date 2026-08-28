// READINESS: a landing that ships analytics must also ship the gate.
//
// Every check is an INVARIANT about what the landing does, never "does a file
// exist" — a module can be present and imported by nobody. The two synthetic
// landings below are the shapes this rule exists to reject.
import { describe, test, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const TEMPLATE = path.join(REPO_ROOT, 'content/landing-base');
const readiness = await import(pathToFileURL(path.join(REPO_ROOT, 'scripts/lib/consent-readiness.mjs')).href);

describe('readiness: analytics configured without a gate must FAIL', () => {
  test('the real template passes', () => {
    expect(readiness.collectConsentIssues(TEMPLATE)).toEqual([]);
    expect(readiness.isConsentReady(TEMPLATE, { PUBLIC_GA_MEASUREMENT_ID: 'G-1' })).toBe(true);
  });

  test('no provider configured never blocks', () => {
    expect(readiness.analyticsConfigured({})).toBe(false);
    expect(readiness.isConsentReady('/nonexistent', {})).toBe(true);
  });

  test('a landing whose Base loads GA directly is NOT ready', () => {
    // The pre-fix shape, reconstructed — this is the regression the rule exists
    // for, and it must be caught by behaviour, not by a missing filename.
    const dir = mkdtempSync(path.join(tmpdir(), 'consent-'));
    for (const rel of [
      'src/lib/analytics-loader.ts', 'src/lib/consent.ts',
      'src/components/islands/ConsentGate.tsx', 'src/lib/navigation.ts',
      'src/pages/index.astro', 'src/pages/legal/cookies.astro',
    ]) {
      mkdirSync(path.join(dir, path.dirname(rel)), { recursive: true });
      cpSync(path.join(TEMPLATE, rel), path.join(dir, rel));
    }
    mkdirSync(path.join(dir, 'src/layouts'), { recursive: true });
    writeFileSync(
      path.join(dir, 'src/layouts/Base.astro'),
      '<script async src="https://www.googletagmanager.com/gtag/js?id=X"></script>\n<ConsentGate />',
    );
    const codes = readiness.collectConsentIssues(dir).map((i: { code: string }) => i.code);
    expect(codes).toContain('consent-base-loads-analytics');
    expect(readiness.isConsentReady(dir, { PUBLIC_GA_MEASUREMENT_ID: 'G-1' })).toBe(false);
  });

  test('a landing with the gate file but no mount is NOT ready', () => {
    // The "decorative file" case the rule was told not to accept.
    const dir = mkdtempSync(path.join(tmpdir(), 'consent-'));
    for (const rel of [
      'src/lib/analytics-loader.ts', 'src/lib/consent.ts',
      'src/components/islands/ConsentGate.tsx', 'src/lib/navigation.ts',
      'src/pages/index.astro', 'src/pages/legal/cookies.astro',
    ]) {
      mkdirSync(path.join(dir, path.dirname(rel)), { recursive: true });
      cpSync(path.join(TEMPLATE, rel), path.join(dir, rel));
    }
    mkdirSync(path.join(dir, 'src/layouts'), { recursive: true });
    writeFileSync(path.join(dir, 'src/layouts/Base.astro'), '<html><body><slot /></body></html>');
    const codes = readiness.collectConsentIssues(dir).map((i: { code: string }) => i.code);
    expect(codes).toContain('consent-ui-unmounted');
  });
});

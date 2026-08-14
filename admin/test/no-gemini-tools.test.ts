// Structural enforcement for the Gemini request-body chokepoint (spec
// "Gemini API Safety Lockdown", "Gemini API Key Transport Hygiene", "Content
// Job Kind and Process Topology"; design AD3, addendum §6 T1).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT_PATH = path.join(REPO_ROOT, 'scripts/generate-content.mjs');
const SCRIPT_URL = new URL('../../scripts/generate-content.mjs', import.meta.url).href;

/** Strips BOTH // line comments and block comments — stronger than
 * no-fake-spinner.test.ts's line-only stripper, deliberately: this script's
 * own JSDoc legitimately says "no-tools chokepoint" in prose, which a
 * line-only stripper would leave in place and falsely trip a bare "tools"
 * word-boundary scan. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('no-gemini-tools (structural enforcement — request body never carries tools)', () => {
  it('buildRequestBody() returns an object with no "tools" key and a non-empty systemInstruction', async () => {
    const { buildRequestBody } = await import(SCRIPT_URL);
    const body = buildRequestBody({
      systemInstruction: 'schema + tone rules',
      contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
    });
    expect('tools' in body).toBe(false);
    expect(body.systemInstruction.parts[0].text.length).toBeGreaterThan(0);
  });

  it('source contains no literal "tools" object-key (comment-stripped scan)', () => {
    const code = stripComments(readFileSync(SCRIPT_PATH, 'utf8'));
    expect(code).not.toMatch(/['"]?\btools\b['"]?\s*:/);
  });

  it('source imports no child_process / spawn() / exec() — content generation is HTTP-only', () => {
    const code = stripComments(readFileSync(SCRIPT_PATH, 'utf8'));
    expect(code).not.toMatch(/child_process/);
    expect(code).not.toMatch(/\bspawn\s*\(/);
    expect(code).not.toMatch(/\bexecSync?\s*\(/);
  });

  it('source never concatenates the API key into a URL query string ("?key=" or "key=")', () => {
    const code = stripComments(readFileSync(SCRIPT_PATH, 'utf8'));
    expect(code).not.toMatch(/\?key=/);
    expect(code).not.toMatch(/[^-]key=/);
  });

  it('the literal "x-goog-api-key" header appears exactly once', () => {
    const code = stripComments(readFileSync(SCRIPT_PATH, 'utf8'));
    const matches = code.match(/x-goog-api-key/g) ?? [];
    expect(matches.length).toBe(1);
  });

  // APPENDED (remediation: sdd-verify WARNING 4). Design J3 accepted the
  // GEMINI_BASE_URL test-override exfiltration surface on the strength of
  // three stated mitigations, one of which was "asserts it is read in
  // exactly one place" — that assertion never actually existed until now.
  it('process.env.GEMINI_BASE_URL is read in exactly one place (design J3 mitigation, single override chokepoint)', () => {
    const code = stripComments(readFileSync(SCRIPT_PATH, 'utf8'));
    const matches = code.match(/GEMINI_BASE_URL/g) ?? [];
    expect(matches.length).toBe(1);
    expect(code).toMatch(/process\.env\.GEMINI_BASE_URL/);
  });
});

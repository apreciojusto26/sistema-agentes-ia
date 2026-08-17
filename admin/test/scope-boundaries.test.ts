// Scope-boundary contract test (spec R14 "Scope Boundaries", proposal's
// "Out of scope" list, design/design-addendum). Batch G — the final
// automated gate before Batch H's manual QA.
//
// This is a real, mechanical enforcement layer: every check below would
// FAIL if a future commit (or this one) actually crossed one of the
// boundaries the proposal drew. It is intentionally NOT prose assertion —
// each `it` block inspects the real filesystem, real git state, or the real
// admin/src source tree.
//
// Mechanism notes:
// - "unmodified by this change" is checked via `git status --porcelain`
//   against the CURRENT git state for the exact protected paths. As of this
//   batch, zero commits have been made for agents-dashboard (admin/ is
//   still untracked, content/landing-base has never been staged or
//   modified) — HEAD is therefore a valid "before this change" baseline.
//   `git status --porcelain -- <path>` catches both modified tracked files
//   AND newly added untracked files under that path, which a plain `git
//   diff` would miss for the untracked case.
// - "no auth/no prod-Redis" is checked via a static source-scan of every
//   real file under admin/src (mirroring the no-fake-spinner.test.ts and
//   no-duplicated-contract.test.ts convention already in this suite) —
//   grepping for the actual package names / env var names / route
//   keywords that would appear if someone added this, not a strawman.
// - "admin/ is a sibling, not nested" is a plain fs.existsSync path check.

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { describe, it, expect } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const ADMIN_SRC = path.join(REPO_ROOT, 'admin/src');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function gitPorcelain(relPaths: string[]): string {
  return execFileSync('git', ['status', '--porcelain', '--', ...relPaths], {
    cwd: REPO_ROOT,
    encoding: 'utf-8',
  });
}

// Zero-context diff against HEAD for a single file: only the actual
// added/removed lines, no surrounding unchanged lines and no @@ position
// numbers to keep the comparison content-based, not line-number-based.
function gitDiffNoContext(relPath: string): string {
  return execFileSync('git', ['diff', '-U0', 'HEAD', '--', relPath], {
    cwd: REPO_ROOT,
    encoding: 'utf-8',
  });
}

// Extracts every added ('+...') / removed ('-...') content line from a
// unified diff, in order, dropping the '+++'/'---' file-header lines and the
// '@@ ... @@' hunk-header lines. The leading +/- marker is kept so an added
// line and a removed line with identical text are still distinguishable.
function extractChangedLines(diffText: string): string[] {
  return diffText
    .split('\n')
    .filter(
      (line) =>
        (line.startsWith('+') || line.startsWith('-')) &&
        !line.startsWith('+++') &&
        !line.startsWith('---'),
    );
}

describe('scope-boundaries (Batch G — machine-checkable, spec R14)', () => {
  describe('boundary: admin/ is a sibling of content/landing-base, never nested inside it', () => {
    it('content/landing-base/admin does NOT exist', () => {
      // copyTemplate()'s EXCLUDE_DIRS only skips node_modules|dist|.astro|
      // .vercel|.git — an admin/ nested here would ship into every
      // generated outputs/{slug} landing.
      const nested = path.join(REPO_ROOT, 'content/landing-base/admin');
      expect(existsSync(nested)).toBe(false);
    });

    it('admin/ exists at repo root', () => {
      expect(existsSync(path.join(REPO_ROOT, 'admin'))).toBe(true);
      expect(existsSync(path.join(REPO_ROOT, 'admin/package.json'))).toBe(true);
    });
  });

  describe('boundary: no core-logic / checkout / commerce changes in content/landing-base', () => {
    // Proposal "Out of scope": content/landing-base core logic, components,
    // hooks, tracking, checkout, or commerce behavior. Design's real file
    // inventory (verified at design time) maps "checkout/commerce" onto
    // these concrete paths.
    const protectedRelPaths = [
      'content/landing-base/src/components',
      'content/landing-base/src/lib/kv.ts',
      'content/landing-base/src/lib/shopify',
      'content/landing-base/src/lib/sumup',
      'content/landing-base/src/pages/api',
    ];

    it('all protected content/landing-base paths exist (guarding against a stale/renamed path silently no-op-ing this test)', () => {
      for (const rel of protectedRelPaths) {
        expect(existsSync(path.join(REPO_ROOT, rel)), `${rel} should exist`).toBe(true);
      }
    });

    it('git reports zero modified/untracked files under any protected path (src/components, kv.ts, lib/shopify, lib/sumup, pages/api)', () => {
      const output = gitPorcelain(protectedRelPaths);
      expect(output.trim()).toBe('');
    });
  });

  describe('boundary: no authentication/authorization surface added to admin/', () => {
    const AUTH_DEP_NAMES = [
      'passport',
      'jsonwebtoken',
      'next-auth',
      'bcrypt',
      'bcryptjs',
      'argon2',
      '@fastify/jwt',
      '@fastify/auth',
      '@fastify/session',
      '@fastify/cookie',
      'express-session',
    ];

    it('admin/package.json declares no auth-related dependency', () => {
      const pkg = JSON.parse(readFileSync(path.join(REPO_ROOT, 'admin/package.json'), 'utf-8'));
      const allDeps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
      const offenders = AUTH_DEP_NAMES.filter((name) => name in allDeps);
      expect(offenders).toEqual([]);
    });

    it('no file under admin/src imports/references an auth library, session cookie, JWT, or bearer-token handling', () => {
      const files = walk(ADMIN_SRC);
      const authPattern =
        /\b(passport|jsonwebtoken|next-auth|bcrypt|argon2|authorization\s*:\s*['"]?bearer|set-cookie|req\.session|reply\.session)\b/i;
      const offenders = files
        .filter((f) => authPattern.test(readFileSync(f, 'utf-8')))
        .map((f) => path.relative(REPO_ROOT, f));
      expect(offenders).toEqual([]);
    });

    it('no route file under admin/src/server/routes implements a login/signup/session endpoint', () => {
      const routesDir = path.join(ADMIN_SRC, 'server/routes');
      const files = existsSync(routesDir) ? walk(routesDir) : [];
      const loginRoutePattern = /['"`]\/(api\/)?(login|logout|signup|signin|session|auth)\b/i;
      const offenders = files
        .filter((f) => loginRoutePattern.test(readFileSync(f, 'utf-8')))
        .map((f) => path.relative(REPO_ROOT, f));
      expect(offenders).toEqual([]);
    });
  });

  describe('boundary: admin/ never reads/writes the production Upstash Redis instance', () => {
    it('admin/package.json declares no @upstash/redis (or any redis client) dependency', () => {
      const pkg = JSON.parse(readFileSync(path.join(REPO_ROOT, 'admin/package.json'), 'utf-8'));
      const allDeps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
      const offenders = Object.keys(allDeps).filter((name) => /redis/i.test(name));
      expect(offenders).toEqual([]);
    });

    it('no file under admin/src imports @upstash/redis or references the production Redis env var names', () => {
      const files = walk(ADMIN_SRC);
      const redisPattern = /@upstash\/redis|UPSTASH_REDIS_REST_URL|UPSTASH_REDIS_REST_TOKEN/;
      const offenders = files
        .filter((f) => redisPattern.test(readFileSync(f, 'utf-8')))
        .map((f) => path.relative(REPO_ROOT, f));
      expect(offenders).toEqual([]);
    });

    it('content/landing-base/src/lib/kv.ts (the real Redis client) is not imported from anywhere under admin/src', () => {
      const files = walk(ADMIN_SRC);
      const offenders = files
        .filter((f) => /content\/landing-base\/src\/lib\/kv(\.ts)?['"]/.test(readFileSync(f, 'utf-8')))
        .map((f) => path.relative(REPO_ROOT, f));
      expect(offenders).toEqual([]);
    });
  });

  describe('boundary: content-agent — the Scope tripwire made mechanical (proposal Scope tripwire, design §7 J5)', () => {
    // History of the first `it` in this block (do not delete this note when
    // editing the tripwire again — it is the reason the mechanism looks the
    // way it does):
    //
    // 1. Content Agent SDD change introduced a blunt assertion here:
    //    `git status --porcelain` on content-contract.mjs must be empty,
    //    i.e. the file must be COMPLETELY untouched by that change. Its own
    //    header comment already flagged this as a POINT-IN-TIME guard valid
    //    only "as of this batch" (nothing had been committed for admin/ yet,
    //    so HEAD was a valid "before this change" baseline).
    // 2. Product Identity + Generation Isolation's own Batch 4 legitimately
    //    needed to touch content-contract.mjs (task 4.1: optional top-level
    //    `productId` format check via `isProductId`, design #423 D1) — and
    //    the sub-agent that implemented it DELETED the whole assertion
    //    instead of narrowing it. The project owner rejected that: deleting
    //    a guardrail because it's inconvenient for one authorized change
    //    defeats its purpose for every future UNauthorized one.
    // 3. This restores a REAL tripwire, narrowed instead of removed: it
    //    still inspects real git output (same `-- <path>` convention as
    //    every other check in this file), but instead of demanding zero
    //    diff, it demands the diff be EITHER empty OR line-for-line
    //    identical to the exact, reviewed Fase 4 addition below. Any other
    //    change — a different rewording, an unrelated edit anywhere else in
    //    the file, a partially-applied version of the same addition — is a
    //    different line sequence and therefore still fails, exactly like
    //    the original all-or-nothing check did for anything at all.
    //
    // Scope note: the ORIGINAL tripwire (see git history of this file, the
    // "add Gemini-powered content generation agent" commit) covered ONLY
    // `scripts/lib/content-contract.mjs` — it never checked
    // `scripts/lib/content-contract.d.mts`. That narrower historical scope
    // is preserved here deliberately; this tripwire does not extend to the
    // `.d.mts` file.
    it('scripts/lib/content-contract.mjs diff against HEAD is either empty, or is EXACTLY the reviewed Fase 4 productId addition (design #423 D1, task 4.1) — pinned line-for-line, nothing else is permitted', () => {
      // The exact, reviewed diff for task 4.1 (design #423 D1): the
      // `isProductId` import, the header-comment note, the new private
      // `collectTopLevelIssues()` helper (format-only check for the
      // OPTIONAL top-level `productId`, error code 'product-id-invalid'),
      // and its two call sites in `collectContentErrors`/`validateContent`.
      // This is a real pin against `git diff -U0 HEAD`, not a keyword
      // allowlist — any future change to this file, even one that also
      // concerns `productId`, is "not contemplated" until this pin is
      // deliberately updated alongside its own SDD review.
      const EXPECTED_PRODUCT_ID_DIFF_LINES = [
        '+//',
        '+// Product identity (design "Product Identity + Generation Isolation", Fase 4):',
        '+// an OPTIONAL top-level `productId` is format-checked here (never required —',
        '+// absence is never an error). It rides top-level, NEVER inside `product` —',
        '+// ALLOWED_PRODUCT_FIELDS / the product.* whitelist is intentionally untouched.',
        '+',
        "+import { isProductId } from './product-id.cjs';",
        '+// Format-only check for the OPTIONAL top-level `productId` (design D1):',
        '+// absent => never an error; present => must match PRODUCT_ID_RE via',
        '+// isProductId. Runs first in both collect-all and fail-fast so the FIRST',
        '+// issue in either mode stays in sync (see header comment on check order).',
        '+function collectTopLevelIssues(input) {',
        '+  const issues = [];',
        '+  if (input.productId !== undefined && !isProductId(input.productId)) {',
        '+    issues.push({',
        "+      code: 'product-id-invalid',",
        "+      path: 'productId',",
        '+      message: `content.json "productId" is present but invalid: expected format prd_{base36ts}-{rand8}, got ${JSON.stringify(input.productId)}`,',
        '+    });',
        '+  }',
        '+  return issues;',
        '+}',
        '+',
        '+  issues.push(...collectTopLevelIssues(input));',
        '+',
        '+  throwFirst(collectTopLevelIssues(input));',
        '+',
      ];

      const diffLines = extractChangedLines(gitDiffNoContext('scripts/lib/content-contract.mjs'));

      if (diffLines.length === 0) {
        // Clean against HEAD (e.g. once this batch's changes are committed
        // and this pin becomes the new baseline) — satisfies the original
        // "unmodified" invariant going forward.
        expect(diffLines).toEqual([]);
        return;
      }

      expect(diffLines).toEqual(EXPECTED_PRODUCT_ID_DIFF_LINES);
    });

    it('admin/package.json declares exactly the pre-existing dependency set — no new runtime dependency for the Gemini call', () => {
      const pkg = JSON.parse(readFileSync(path.join(REPO_ROOT, 'admin/package.json'), 'utf-8'));
      expect(pkg.dependencies).toEqual({ fastify: pkg.dependencies.fastify, '@fastify/static': pkg.dependencies['@fastify/static'] });
      expect(Object.keys(pkg.dependencies).sort()).toEqual(['@fastify/static', 'fastify']);
    });

    it('no file under admin/src or scripts/ references a Gemini SDK, axios, or dotenv — raw fetch only', () => {
      const files = [...walk(ADMIN_SRC), ...walk(path.join(REPO_ROOT, 'scripts'))];
      const bannedPattern = /@google\/genai|['"]axios['"]|['"]dotenv['"]/;
      const offenders = files
        .filter((f) => bannedPattern.test(readFileSync(f, 'utf-8')))
        .map((f) => path.relative(REPO_ROOT, f));
      expect(offenders).toEqual([]);
    });
  });
});

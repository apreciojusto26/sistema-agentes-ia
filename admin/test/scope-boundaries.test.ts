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
    it('scripts/lib/content-contract.mjs is unmodified by this change (git reports zero diff/untracked-add)', () => {
      const output = gitPorcelain(['scripts/lib/content-contract.mjs']);
      expect(output.trim()).toBe('');
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

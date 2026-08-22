// Landing isolation & portability.
//
// THE DEFECT. `content/landing-base` carries no `.git` and no `.gitignore`,
// and copyTemplate() excludes `.git` anyway, so a generated landing had
// neither and therefore resolved the GENERATOR's repository:
// `git rev-parse --show-toplevel` inside outputs/<slug>/ returned
// /…/landing-generator. `git add .` in a landing staged against the parent
// index, and the folder could not be pushed to its own repo or imported by
// Vercel without dragging the whole generator along.
//
// These tests assert the landing is a self-contained, portable project — and,
// just as importantly, that it does NOT depend on any symlinked node_modules,
// which is a separate trap: the verification symlinks used during development
// once chained content/landing-base's store through outputs/proyector, and
// deleting one broke the other.
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const GENERATOR = path.join(REPO_ROOT, 'scripts/generate-landing.mjs');
const MINIMAL_CONTENT = path.join(__dirname, 'fixtures/minimal-content.json');

const SLUG_A = 'zz-isolation-a';
const SLUG_B = 'zz-isolation-b';
const DIR_A = path.join(REPO_ROOT, 'outputs', SLUG_A);
const DIR_B = path.join(REPO_ROOT, 'outputs', SLUG_B);

function generate(slug: string) {
  execFileSync(process.execPath, [GENERATOR, '--slug', slug, '--content', MINIMAL_CONTENT, '--force'], {
    cwd: REPO_ROOT,
    encoding: 'utf-8',
  });
}

function git(args: string[], cwd: string) {
  return execFileSync('git', args, { cwd, encoding: 'utf-8' }).trim();
}

beforeAll(() => {
  rmSync(DIR_A, { recursive: true, force: true });
  rmSync(DIR_B, { recursive: true, force: true });
  generate(SLUG_A);
  generate(SLUG_B);
});

afterAll(() => {
  rmSync(DIR_A, { recursive: true, force: true });
  rmSync(DIR_B, { recursive: true, force: true });
});

describe('each landing is its own git repository', () => {
  it('contains a .git directory', () => {
    expect(existsSync(path.join(DIR_A, '.git'))).toBe(true);
    expect(existsSync(path.join(DIR_B, '.git'))).toBe(true);
  });

  it('git rev-parse --show-toplevel points at the LANDING, never at the generator', () => {
    // The whole defect in one assertion.
    expect(git(['rev-parse', '--show-toplevel'], DIR_A)).toBe(DIR_A);
    expect(git(['rev-parse', '--show-toplevel'], DIR_B)).toBe(DIR_B);
    expect(git(['rev-parse', '--show-toplevel'], DIR_A)).not.toBe(REPO_ROOT);
  });

  it('two outputs are INDEPENDENT repositories', () => {
    expect(git(['rev-parse', '--show-toplevel'], DIR_A)).not.toBe(git(['rev-parse', '--show-toplevel'], DIR_B));
  });

  it('starts on branch main', () => {
    expect(git(['branch', '--show-current'], DIR_A)).toBe('main');
  });

  it('makes NO automatic commit — history is the operator\'s decision', () => {
    expect(() => git(['rev-parse', 'HEAD'], DIR_A)).toThrow();
    expect(git(['log', '--oneline', '--all'], DIR_A)).toBe('');
  });

  it('has no remote configured', () => {
    expect(git(['remote'], DIR_A)).toBe('');
  });
});

describe('staging in one landing cannot reach the other or the parent', () => {
  it('git add . in A stages only A\'s files, and B and the parent are untouched', () => {
    const parentBefore = git(['status', '--porcelain'], REPO_ROOT);
    const bBefore = git(['status', '--porcelain'], DIR_B);

    git(['add', '.'], DIR_A);
    const stagedInA = git(['diff', '--cached', '--name-only'], DIR_A);

    expect(stagedInA.length).toBeGreaterThan(0);
    // Nothing staged in A may belong to the generator or to B.
    for (const file of stagedInA.split('\n')) {
      expect(file.startsWith('..')).toBe(false);
      expect(file).not.toContain(SLUG_B);
    }

    expect(git(['status', '--porcelain'], DIR_B)).toBe(bBefore);
    expect(git(['status', '--porcelain'], REPO_ROOT)).toBe(parentBefore);

    git(['reset'], DIR_A);
  });
});

describe('the parent repository never tracks landing internals', () => {
  it('git status in the generator shows nothing from outputs/', () => {
    const status = git(['status', '--porcelain'], REPO_ROOT);
    const outputLines = status.split('\n').filter((l) => l.includes('outputs/'));
    expect(outputLines).toEqual([]);
  });

  it('the ONLY path the parent tracks under outputs/ is the .gitkeep', () => {
    // A stray tracked file under outputs/ is what makes gitignore look broken:
    // git never ignores a path that is already in the index.
    const tracked = git(['ls-files', '--cached', 'outputs/'], REPO_ROOT);
    expect(tracked).toBe('outputs/.gitkeep');
  });

  it('the ignore RULE itself is correct, independently of the index', () => {
    const check = (p: string) => {
      try {
        execFileSync('git', ['check-ignore', '-q', '--no-index', p], { cwd: REPO_ROOT });
        return true;
      } catch {
        return false;
      }
    };
    expect(check(`outputs/${SLUG_A}/package.json`)).toBe(true);
    expect(check(`outputs/${SLUG_A}/src/data/product.ts`)).toBe(true);
  });
});

describe('.gitignore and .env inside the landing', () => {
  const ignoreFile = () => readFileSync(path.join(DIR_A, '.gitignore'), 'utf-8');

  it('exists and covers the Astro/Node essentials', () => {
    const content = ignoreFile();
    for (const rule of ['node_modules/', 'dist/', '.astro/', '.vercel/', '.env', '.env.*']) {
      expect(content, `missing rule ${rule}`).toContain(rule);
    }
  });

  it('re-admits .env.example so the landing can document its variables', () => {
    expect(ignoreFile()).toContain('!.env.example');
  });

  it('.env is ignored INSIDE the landing', () => {
    writeFileSync(path.join(DIR_A, '.env'), 'PUBLIC_SHOPIFY_PRODUCT_HANDLE=x\n');
    expect(() => execFileSync('git', ['check-ignore', '-q', '.env'], { cwd: DIR_A })).not.toThrow();
    // and it never shows up as an untracked file
    expect(git(['status', '--porcelain'], DIR_A)).not.toContain('.env\n');
  });

  it('no real secret is written by the generator', () => {
    const envPath = path.join(DIR_A, '.env');
    if (existsSync(envPath)) {
      const env = readFileSync(envPath, 'utf-8');
      expect(env).not.toMatch(/^PUBLIC_SHOPIFY_STOREFRONT_TOKEN=.+$/m);
    }
  });
});

describe('portability — no dependency on a shared node_modules', () => {
  it('the landing ships package.json AND a lockfile, so deps are reinstallable', () => {
    expect(existsSync(path.join(DIR_A, 'package.json'))).toBe(true);
    expect(existsSync(path.join(DIR_A, 'pnpm-lock.yaml'))).toBe(true);
  });

  it('the generated artefact contains NO node_modules at all', () => {
    // Not even a symlink: the verification symlinks used during development
    // chained content/landing-base's store through outputs/proyector, and
    // deleting one silently broke the other.
    expect(existsSync(path.join(DIR_A, 'node_modules'))).toBe(false);
  });

  it('no top-level entry in the landing is a symlink', () => {
    const symlinks = readdirSync(DIR_A).filter((entry) => lstatSync(path.join(DIR_A, entry)).isSymbolicLink());
    expect(symlinks).toEqual([]);
  });

  it('no source file has a FUNCTIONAL dependency on a path outside the landing', () => {
    // Scoped to real code, not prose. Several modules legitimately EXPLAIN in
    // a comment that content/landing-base is copied wholesale — that is
    // documentation, not a dependency — and `.generation.json` records the
    // template it came from on purpose, as provenance. What must not exist is
    // an import, a require, or a path traversal that escapes the landing.
    const stripComments = (src: string) =>
      src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*(\/\/|\*|#).*$/gm, '');

    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name === '.git') continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
          continue;
        }
        if (!/\.(ts|tsx|astro|mjs|js)$/.test(entry.name)) continue;

        const code = stripComments(readFileSync(full, 'utf-8'));
        const specifiers = [
          ...code.matchAll(/(?:from|import|require)\s*\(?\s*['"]([^'"]+)['"]/g),
        ].map((m) => m[1]);

        for (const spec of specifiers) {
          if (spec.includes('content/landing-base') || spec.includes('outputs/')) {
            offenders.push(`${path.relative(DIR_A, full)} → ${spec}`);
          }
          // A relative specifier that climbs above the landing root.
          if (spec.startsWith('.')) {
            const resolved = path.resolve(path.dirname(full), spec);
            if (!resolved.startsWith(DIR_A)) offenders.push(`${path.relative(DIR_A, full)} → ${spec}`);
          }
        }
      }
    };
    walk(DIR_A);
    expect(offenders).toEqual([]);
  });

  it('deleting a temporary verification symlink cannot break the artefact', () => {
    // The testing mechanism and the shipped artefact are separate: a symlink
    // is something a developer adds to build in place, never something the
    // generator produces. Removing it must be a no-op for the project.
    const link = path.join(DIR_A, 'node_modules');
    execFileSync('ln', ['-sfn', path.join(REPO_ROOT, 'content/landing-base/node_modules'), link]);
    expect(lstatSync(link).isSymbolicLink()).toBe(true);

    rmSync(link, { force: true });

    expect(existsSync(path.join(DIR_A, 'package.json'))).toBe(true);
    expect(existsSync(path.join(DIR_A, 'pnpm-lock.yaml'))).toBe(true);
    expect(existsSync(path.join(DIR_A, 'src/pages/index.astro'))).toBe(true);
    expect(git(['rev-parse', '--show-toplevel'], DIR_A)).toBe(DIR_A);
  });
});

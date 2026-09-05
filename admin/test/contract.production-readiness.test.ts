// PRODUCTION READINESS — the checks an operator runs before shipping, and the
// harness that exercises the real world by hand.
//
// Both are about the same question asked in two places: is what we produced
// actually correct, and does the system still work against a third party.
import { describe, test, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, mkdtempSync, rmSync, writeFileSync, cpSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FIX = path.join(REPO_ROOT, 'admin/test/fixtures');
const sha = (f: string) => createHash('sha256').update(readFileSync(f)).digest('hex');

/** Generates a landing and returns its directory. */
function generate(slug: string, extra: string[] = []) {
  const out = path.join(REPO_ROOT, 'outputs', slug);
  rmSync(out, { recursive: true, force: true });
  const r = spawnSync(
    process.execPath,
    [
      path.join(REPO_ROOT, 'scripts/generate-landing.mjs'),
      '--slug', slug,
      '--content', path.join(FIX, 'fixed/content.json'),
      '--merchant', path.join(FIX, 'fixed/merchant.json'),
      '--force',
      ...extra,
    ],
    { cwd: REPO_ROOT, encoding: 'utf-8' },
  );
  return { out, stdout: r.stdout ?? '', status: r.status };
}

// ───────────────────────────────────────────────────────────────────────────
// SOCIAL PREVIEW OWNERSHIP
// ───────────────────────────────────────────────────────────────────────────

describe('a landing never shares another product as its own', () => {
  const TEMPLATE_COVER = path.join(REPO_ROOT, 'content/landing-astravibe/public/og-cover.png');

  test('a PNG main image becomes the social preview', () => {
    const { out } = generate('zz-og-png', [
      '--images', path.join(FIX, 'assets/a/images'),
      '--product', path.join(FIX, 'assets/a/product.json'),
    ]);
    try {
      const cover = path.join(out, 'public/og-cover.png');
      expect(existsSync(cover)).toBe(true);
      expect(sha(cover), "the landing still ships AstraVibe's artwork").not.toBe(sha(TEMPLATE_COVER));
      expect(sha(cover)).toBe(sha(path.join(FIX, 'assets/a/images/img_0.png')));
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });

  test('a JPEG main image becomes the preview under its REAL extension', () => {
    // THIS TEST USED TO ASSERT THE OPPOSITE, and the reversal is an improvement
    // rather than a relaxation. The old rule deleted the cover whenever the
    // source was not a PNG, because Base.astro requested a fixed
    // `/og-cover.png` and lived under a protected path.
    //
    // That path is now authorized and fixed: the layout reads the filename from
    // src/data/og.ts, so there is no `.png` to satisfy and no reason to rename a
    // JPEG into a lie about a file other systems read. Absence is still the
    // answer when there is no usable media — it is no longer the answer to a
    // file extension.
    const dir = mkdtempSync(path.join(tmpdir(), 'og-jpg-'));
    mkdirSync(path.join(dir, 'images'), { recursive: true });
    cpSync(path.join(FIX, 'assets/a/images/img_0.png'), path.join(dir, 'images/img_0.jpg'));
    writeFileSync(
      path.join(dir, 'product.json'),
      JSON.stringify({
        identity: { productId: null, name: 'Producto', brand: null },
        media: { images: [{ url: null, localPath: 'images/img_0.jpg', order: 0 }], videos: [] },
      }),
    );
    const { out } = generate('zz-og-jpg', [
      '--images', path.join(dir, 'images'),
      '--product', path.join(dir, 'product.json'),
    ]);
    try {
      expect(existsSync(path.join(out, 'public/og-cover.jpg'))).toBe(true);
      expect(readFileSync(path.join(out, 'src/data/og.ts'), 'utf-8')).toContain("'og-cover.jpg'");
      // The template's own cover never survives, whatever the extension.
      expect(existsSync(path.join(out, 'public/og-cover.png'))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(out, { recursive: true, force: true });
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// THE READINESS COMMAND
// ───────────────────────────────────────────────────────────────────────────

describe('one command answers "is this ready?"', () => {
  const check = (dir: string) =>
    spawnSync(process.execPath, [path.join(REPO_ROOT, 'scripts/check-readiness.mjs'), dir], {
      cwd: REPO_ROOT,
      encoding: 'utf-8',
    });

  test('a good landing passes every check', () => {
    const { out } = generate('zz-ready', [
      '--images', path.join(FIX, 'assets/a/images'),
      '--product', path.join(FIX, 'assets/a/product.json'),
    ]);
    try {
      const r = check(out);
      expect(r.stdout, r.stdout).toMatch(/READY —/);
      expect(r.status).toBe(0);
      for (const name of [
        'Structural Grammar sealed',
        'Fixed template authority',
        'Design Agent absent',
        'Assets real',
        'Theme safe',
        'Favicon valid',
        'Social preview',
        'Commerce authority',
      ]) {
        expect(r.stdout).toContain(name);
      }
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });

  test('it FAILS when a landing would ship the template artwork', () => {
    // The check has to be able to say no, or it is decoration.
    const { out } = generate('zz-ready-bad', [
      '--images', path.join(FIX, 'assets/a/images'),
      '--product', path.join(FIX, 'assets/a/product.json'),
    ]);
    try {
      // Written OVER the file the landing DECLARES — the only way this artwork
      // could actually reach a social card now that the filename is generated
      // beside the image instead of being a fixed `/og-cover.png`.
      const declared = /ogImageFile: string \| null = '([^']+)'/.exec(
        readFileSync(path.join(out, 'src/data/og.ts'), 'utf-8'),
      )![1];
      cpSync(
        path.join(REPO_ROOT, 'content/landing-astravibe/public/og-cover.png'),
        path.join(out, 'public', declared),
      );
      const r = check(out);
      expect(r.status).toBe(1);
      expect(r.stdout).toMatch(/NOT READY/);
      expect(r.stdout).toMatch(/AstraVibe's own artwork/);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });

  test('it FAILS when a design artefact appears', () => {
    const { out } = generate('zz-ready-design');
    try {
      writeFileSync(path.join(out, 'src/data/design.ts'), 'export const design = {};\n');
      const r = check(out);
      expect(r.status).toBe(1);
      expect(r.stdout).toMatch(/Design Agent wrote here/);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });

  test('it never writes to the tree it inspects', () => {
    const { out } = generate('zz-ready-ro');
    try {
      const before = spawnSync('git', ['status', '--porcelain', out], { cwd: REPO_ROOT, encoding: 'utf-8' }).stdout;
      check(out);
      const after = spawnSync('git', ['status', '--porcelain', out], { cwd: REPO_ROOT, encoding: 'utf-8' }).stdout;
      expect(after).toBe(before);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// THE LIVE SMOKE REFUSES TO RUN BY ACCIDENT
// ───────────────────────────────────────────────────────────────────────────

describe('the live smoke is opt-in, twice', () => {
  const smoke = (env: Record<string, string>) =>
    spawnSync(process.execPath, [path.join(REPO_ROOT, 'scripts/e2e/admin-live-smoke.mjs')], {
      cwd: REPO_ROOT,
      encoding: 'utf-8',
      env: { ...process.env, LIVE_SMOKE: '', SOURCE_URL: '', GEMINI_API_KEY: '', ...env },
    });

  test('without LIVE_SMOKE=1 it refuses', () => {
    const r = smoke({});
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/refusing to run without LIVE_SMOKE=1/);
  });

  test('there is no default URL — someone would be scraped by accident', () => {
    const r = smoke({ LIVE_SMOKE: '1' });
    expect(r.stderr).toMatch(/SOURCE_URL is required/);
  });

  test('a non-https URL is refused', () => {
    const r = smoke({ LIVE_SMOKE: '1', SOURCE_URL: 'http://example.invalid/p' });
    expect(r.stderr).toMatch(/must be https/);
  });

  test('it stops before the network when the model key is absent', () => {
    const r = smoke({ LIVE_SMOKE: '1', SOURCE_URL: 'https://example.invalid/p' });
    expect(r.stderr).toMatch(/GEMINI_API_KEY is not set/);
  });

  test('the source hardcodes no URL and prints no secret', () => {
    const src = readFileSync(path.join(REPO_ROOT, 'scripts/e2e/admin-live-smoke.mjs'), 'utf-8');
    // Presence is recorded; a value never is.
    expect(src).toMatch(/Boolean\(process\.env\.GEMINI_API_KEY\)/);
    expect(src).not.toMatch(/process\.env\.GEMINI_API_KEY\s*\}/);
    expect(src).not.toMatch(/https:\/\/(www\.)?(aliexpress|amazon|leroymerlin)/i);
  });

  test('and it never updates a golden from a live run', () => {
    // A real URL producing an unexpected shape is a finding. Moving a seal to
    // match it would make every earlier phase meaningless.
    const src = readFileSync(path.join(REPO_ROOT, 'scripts/e2e/admin-live-smoke.mjs'), 'utf-8');
    expect(src).toMatch(/goldens are never updated from a live run/);
    expect(src).not.toMatch(/writeFileSync\([^)]*GRAMMAR/);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// COPY OWNERSHIP — the check that would have stopped the first real landing
// ───────────────────────────────────────────────────────────────────────────
//
// Every readiness check that existed passed on a landing whose H1 read
// "24 ambientes. Un solo proyector." over a photograph of an RGB light tube,
// and whose social card pointed at https://astravibe.bamzuk.com/og-cover.png.
// It reported READY. The checks verified provenance, assets, contrast and
// seals — everything except whether the rendered words belong to this product.
//
// MEASURED ON A BUILT LANDING, because that is the only place the question
// exists: the rendered page against the values this run emitted. The fixture is
// outputs/zz-cmp, produced by scripts/e2e/comparison-states.mjs, copied without
// its node_modules so a mutation cannot disturb the original.

describe.runIf(existsSync(path.join(REPO_ROOT, 'outputs/zz-cmp/dist/client/index.html')))(
  'a READY landing renders its own copy, or it is not READY',
  () => {
    const SOURCE = path.join(REPO_ROOT, 'outputs/zz-cmp');
    const check = (dir: string) =>
      spawnSync(process.execPath, [path.join(REPO_ROOT, 'scripts/check-readiness.mjs'), dir], {
        cwd: REPO_ROOT,
        encoding: 'utf-8',
      });

    /** A disposable copy of a real, built landing. */
    const clone = () => {
      const dir = mkdtempSync(path.join(tmpdir(), 'own-'));
      const out = path.join(dir, 'landing');
      cpSync(SOURCE, out, {
        recursive: true,
        filter: (src) => !src.includes('node_modules') && !src.includes('/.astro') && !src.includes('/.vercel'),
      });
      return { dir, out };
    };

    /** Rewrites one file inside the clone. */
    const patch = (out: string, rel: string, fn: (text: string) => string) => {
      const file = path.join(out, rel);
      const before = readFileSync(file, 'utf-8');
      const after = fn(before);
      expect(after, `the ${rel} mutation is a no-op — the probe is wrong`).not.toBe(before);
      writeFileSync(file, after);
    };

    const PAGE = 'dist/client/index.html';

    test('the untouched landing is READY, and says why it owns its copy', () => {
      const { dir, out } = clone();
      try {
        const r = check(out);
        expect(r.stdout, r.stdout).toMatch(/READY —/);
        expect(r.stdout).toContain('Copy ownership');
        expect(r.stdout).toContain('Social preview origin');
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    test('THE ORIGINAL BLOCKER: an H1 describing another product fails', () => {
      // The literal headline that shipped on a light tube.
      const { dir, out } = clone();
      try {
        patch(out, PAGE, (h) =>
          h.replace(/(<h1[^>]*>)[\s\S]*?(<\/h1>)/, '$1<span>24 ambientes.<br>Un solo proyector.</span>$2'),
        );
        const r = check(out);
        expect(r.status).toBe(1);
        expect(r.stdout).toMatch(/NOT READY/);
        expect(r.stdout).toMatch(/the H1 renders/);
        expect(r.stdout).toContain('24 ambientes');
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    test('and so does an H1 that quietly drifts from the emitted tagline', () => {
      // Not a foreign product — just a word changed. Ownership is EQUALITY, so
      // there is no threshold below which drift is tolerated.
      const { dir, out } = clone();
      try {
        patch(out, PAGE, (h) => h.replace(/(<h1[^>]*>[\s\S]*?)(<\/h1>)/, '$1 y algo más$2'));
        const r = check(out);
        expect(r.status).toBe(1);
        expect(r.stdout).toMatch(/the H1 renders/);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    test('a how-it-works heading that is not the template\'s fails', () => {
      // "Cómo usar mi Astra Vibe" — the other sentence that shipped.
      const { dir, out } = clone();
      try {
        patch(out, PAGE, (h) => {
          const section = /<section id="como-funciona"[\s\S]*?<\/section>/.exec(h)![0];
          return h.replace(
            section,
            section.replace(/(<h2[^>]*>)[\s\S]*?(<\/h2>)/, '$1Cómo usar mi<br>Astra Vibe$2'),
          );
        });
        const r = check(out);
        expect(r.status).toBe(1);
        expect(r.stdout).toMatch(/the how-it-works heading renders/);
        expect(r.stdout).toMatch(/needs a data authority/);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    test('a landing shipping the TEMPLATE\'s brand fails', () => {
      const { dir, out } = clone();
      try {
        patch(out, 'src/data/product.ts', (t) => t.replace(/^ {2}brand: .*,$/m, '  brand: "AstraVibe",'));
        const r = check(out);
        expect(r.status).toBe(1);
        expect(r.stdout).toMatch(/ships the template's own brand/);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    test('a landing whose brand is the SELLER\'s legal name fails', () => {
      // The fallback F3A had and this fix pack removed: canonical brand null →
      // merchantConfig.legalName. A legal identity is not a product's brand.
      const { dir, out } = clone();
      try {
        const legalName = /legalName:\s*"((?:[^"\\]|\\.)*)"/.exec(
          readFileSync(path.join(out, 'src/data/merchant.ts'), 'utf-8'),
        )?.[1];
        expect(legalName, 'the fixture landing has no merchant to borrow a name from').toBeTruthy();
        patch(out, 'src/data/product.ts', (t) =>
          t.replace(/^ {2}brand: .*,$/m, `  brand: ${JSON.stringify(legalName)},`),
        );
        const r = check(out);
        expect(r.status).toBe(1);
        expect(r.stdout).toMatch(/the SELLER's legal name/);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    test('a null brand that reached the page as the WORD "null" fails', () => {
      const { dir, out } = clone();
      try {
        // Injected AWAY from the H1, so this probe tests the null rule rather
        // than tripping the heading check first.
        patch(out, PAGE, (h) => h.replace('</body>', '<span>null</span></body>'));
        const r = check(out);
        expect(r.status).toBe(1);
        expect(r.stdout).toMatch(/renders the literal "null"/);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    /** Puts an og:image into the built head, where the layout would have. */
    const withOgImage = (out: string, url: string) =>
      patch(out, PAGE, (h) =>
        h.replace(
          '<meta property="og:type"',
          `<meta property="og:image" content="${url}"><meta property="og:type"`,
        ),
      );

    test('THE OTHER ORIGINAL BLOCKER: the template\'s own domain is denied by name', () => {
      // Verbatim from the first real landing's <head>. The literal is no longer
      // written anywhere in the template — contract.template-residuals.test.ts
      // proves that — and this is the belt to that brace.
      const { dir, out } = clone();
      try {
        withOgImage(out, 'https://astravibe.bamzuk.com/og-cover.png');
        const r = check(out);
        expect(r.status).toBe(1);
        expect(r.stdout).toMatch(/the template's own domain/);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    test('and so is the placeholder a build with no domain would otherwise produce', () => {
      // `new URL('/x', Astro.url)` at build time yields http://localhost:4321/x
      // — not another product's artwork, but not a social card either. The tag
      // is omitted instead; this is the guard for the day it is not.
      const { dir, out } = clone();
      try {
        withOgImage(out, 'http://localhost:4321/og-cover.webp');
        const r = check(out);
        expect(r.status).toBe(1);
        expect(r.stdout).toMatch(/nobody's server but this machine/);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    test('a card on this landing\'s own domain passes, and is checked against SITE_URL when it is known', () => {
      const { dir, out } = clone();
      try {
        withOgImage(out, 'https://tienda.example/og-cover.webp');
        // MEASURED ON THE ARTEFACT when SITE_URL is not in this shell — a check
        // that failed because a terminal lacks an env var would be reporting on
        // the terminal, not the landing.
        expect(check(out).stdout).toMatch(/https:\/\/tienda\.example — this landing's own/);

        // And when it IS known, the origins must be the same one.
        const withEnv = (SITE_URL: string) =>
          spawnSync(process.execPath, [path.join(REPO_ROOT, 'scripts/check-readiness.mjs'), out], {
            cwd: REPO_ROOT,
            encoding: 'utf-8',
            env: { ...process.env, SITE_URL },
          });
        expect(withEnv('https://tienda.example').stdout).toMatch(/matches SITE_URL/);
        const wrong = withEnv('https://otra-tienda.example');
        expect(wrong.status).toBe(1);
        expect(wrong.stdout).toMatch(/not this landing's https:\/\/otra-tienda\.example/);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  },
);

// ───────────────────────────────────────────────────────────────────────────
// THE EMITTER WRITES NOTHING THE CONTENT AGENT SAID IT COULD NOT VALIDATE
// ───────────────────────────────────────────────────────────────────────────
//
// `badges`, `offer`, `benefits`, `heroPills` and `specs` left the Fixed content
// contract in F3A after a sweep found no consumer, and the sweep still holds:
// not one component, layout or page in the template reads any of them. They
// survive only because the template's `Product` type requires the keys.
//
// The emitter used to pass the model's own words straight into them, and that
// cost three build failures before it was closed — an `id` on every SpecItem,
// a `body` instead of a `text` on every BenefitItem, and, on a real product
// live, `icon: "brightness"`, which is not in the design system's registered
// icon set. None of the three could ever have reached a pixel. All three abort
// a build, and the third did so on the rerun of the very landing this fix pack
// exists for.

describe('Version A compat slots carry no model output', () => {
  const generateWith = (slug: string, mutate: (doc: Record<string, unknown>) => void) => {
    const dir = mkdtempSync(path.join(tmpdir(), 'compat-'));
    const doc = JSON.parse(readFileSync(path.join(FIX, 'fixed/content.json'), 'utf-8'));
    mutate(doc);
    const contentPath = path.join(dir, 'content.json');
    writeFileSync(contentPath, JSON.stringify(doc, null, 2));
    const out = path.join(REPO_ROOT, 'outputs', slug);
    rmSync(out, { recursive: true, force: true });
    const r = spawnSync(
      process.execPath,
      [
        path.join(REPO_ROOT, 'scripts/generate-landing.mjs'),
        '--slug', slug,
        '--content', contentPath,
        '--merchant', path.join(FIX, 'fixed/merchant.json'),
        '--force',
      ],
      { cwd: REPO_ROOT, encoding: 'utf-8' },
    );
    return { dir, out, status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
  };

  test('an icon the design system never registered cannot reach the module', () => {
    // THE LIVE FAILURE, REPRODUCED. Gemini chose "brightness" for a light tube
    // — a reasonable-sounding name that is not in the IconName union, which IS
    // the registry. A model may select from the registered vocabulary; it may
    // not extend it.
    const { dir, out, status } = generateWith('zz-compat-icon', (doc) => {
      const product = doc.product as Record<string, unknown>;
      product.benefits = [{ id: 'b1', icon: 'brightness', title: 'Luz', text: 'Brilla.' }];
    });
    try {
      expect(status, 'generation failed outright').toBe(0);
      const emitted = readFileSync(path.join(out, 'src/data/product.ts'), 'utf-8');
      expect(emitted, 'an unregistered icon reached the typed module').not.toContain('brightness');
      expect(emitted).toMatch(/^ {2}benefits: \[\],$/m);
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(out, { recursive: true, force: true });
    }
  });

  test('and neither can an item shape no type declares', () => {
    const { dir, out, status } = generateWith('zz-compat-shape', (doc) => {
      const product = doc.product as Record<string, unknown>;
      product.specs = [{ id: 's1', label: 'Material', value: 'ABS' }];
      product.badges = ['Envío 24h'];
      product.heroPills = ['Inventado'];
    });
    try {
      expect(status).toBe(0);
      const emitted = readFileSync(path.join(out, 'src/data/product.ts'), 'utf-8');
      for (const field of ['badges', 'heroPills', 'benefits', 'specs']) {
        expect(emitted, `${field} still carries the model's words`).toMatch(
          new RegExp(`^  ${field}: \\[\\],$`, 'm'),
        );
      }
      // `offer` is an object, so its empty form is inert rather than absent.
      expect(emitted).toMatch(/durationMinutes: 0/);
      expect(emitted).not.toContain('Inventado');
      expect(emitted).not.toContain('Envío 24h');
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(out, { recursive: true, force: true });
    }
  });

  test('the emitter is not even HANDED the content document any more', () => {
    // The structural form of the same claim: `buildProductTs` takes the
    // assembled FixedProductData and the Shopify handle, and nothing else. A
    // field cannot bypass an authority it has no reference to.
    const src = readFileSync(path.join(REPO_ROOT, 'scripts/generate-landing.mjs'), 'utf-8');
    expect(src).toMatch(/function buildProductTs\(shopifyHandle, fixed\)/);
    const body = /function buildProductTs\([\s\S]*?\n\}/.exec(src)![0];
    expect(body, 'the emitter reads the raw content document again').not.toMatch(/serialize\(product\./);
  });
});

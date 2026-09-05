// THE LIBRARY OF LANDINGS — derived from what is on disk, not from job history.
//
// ─── WHY NOT THE JOB HISTORY ───────────────────────────────────────────────
//
// The Admin's right-hand column listed JOBS, and an operator read it as "my
// pages". They are different things and the difference compounds: one landing
// generated four times is four jobs and one page; a job that failed produced
// no page at all; a landing generated before this Admin existed has no job.
//
// So the library is DISCOVERED from outputs/, the only thing that actually is
// the set of landings. A row is an OUTPUT, never an execution.
//
// ─── WHAT MAKES A DIRECTORY A LANDING ──────────────────────────────────────
//
// A readable `.generation.json`. That file is written by the generator's
// write-manifest stage and carries the identity, the mode and the timestamps —
// a directory without one was not produced by this system (or was produced
// before manifests existed), and guessing from a folder name is exactly the
// reasoning the lineage guard exists to forbid.
//
// Everything else is enrichment: the product module for the display name, the
// asset manifest for the media count, dist/ for whether it was ever built.
// Each is read defensively, because a landing mid-regeneration is a real state.
import { existsSync, readFileSync, readdirSync, statSync, rmSync } from 'node:fs';
import path from 'node:path';
import { OUTPUTS_DIR } from './config';
import { readGenerationManifest } from './generation-manifest';
import { resolveSourceIdentity } from '../../../scripts/lib/source-identity.mjs';
import type { SourceProductIdentity } from '../../../scripts/lib/source-identity.mjs';

export type LandingSummary = {
  /** The output directory name. An address, never an identity. */
  slug: string;
  /** What to call it in a list — the narrowed product name. */
  displayName: string;
  /** The full listing title, for search and for the detail view. */
  sourceTitle: string | null;
  /** Provider + external id, when the source can be identified. */
  source: SourceProductIdentity | null;
  /** 'preview' until a Shopify product is linked. */
  mode: 'preview' | 'commerce';
  shopifyHandle: string | null;
  /** The public origin this landing was generated for, if any. */
  siteUrl: string | null;
  /** Has it ever been built? A landing with no dist cannot be previewed. */
  built: boolean;
  assetCount: number;
  /** When the generator last wrote this directory. */
  generatedAt: string | null;
  /** RUN identity of the last generation. Metadata, never shown as the name. */
  productId: string | null;
};

/** A slug is a directory name. Nothing else is ever accepted as one. */
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Resolves a slug to a real output directory, or null.
 *
 * THE ONE PLACE A CLIENT STRING BECOMES A PATH, and it is deliberately
 * paranoid. `..`, an absolute path, a symlink out of the tree and a
 * lookalike prefix (`outputs-evil`) each fail here rather than deeper down
 * where the operation is a delete or a file read.
 */
export function resolveOutputDir(slug: unknown): string | null {
  if (typeof slug !== 'string' || !SLUG_RE.test(slug)) return null;
  const resolved = path.resolve(OUTPUTS_DIR, slug);
  // `+ path.sep` matters: without it `/outputs-evil` passes a `startsWith`
  // test against `/outputs`.
  if (!resolved.startsWith(path.resolve(OUTPUTS_DIR) + path.sep)) return null;
  if (!existsSync(resolved) || !statSync(resolved).isDirectory()) return null;
  return resolved;
}

/** Reads one emitted string field out of a generated product module. */
function productField(dir: string, field: string): string | null {
  const file = path.join(dir, 'src/data/product.ts');
  if (!existsSync(file)) return null;
  try {
    const match = new RegExp(`^  ${field}: ("(?:[^"\\\\]|\\\\.)*"|null),$`, 'm').exec(
      readFileSync(file, 'utf-8'),
    );
    if (!match || match[1] === 'null') return null;
    return JSON.parse(match[1]) as string;
  } catch {
    return null;
  }
}

/**
 * How many media files this landing actually ships.
 *
 * TWO SOURCES, IN ORDER, because two exist. The asset producer writes
 * `.assets.json` when it runs; `.generation.json` records the copied assets
 * for every generation. Reading only the first reported `0 imágenes` for a
 * landing carrying eight photographs — found by looking at the detail view of
 * a real one.
 */
function assetCount(dir: string, manifest: { assets?: unknown[] } | null): number {
  const file = path.join(dir, '.assets.json');
  if (existsSync(file)) {
    try {
      const parsed = JSON.parse(readFileSync(file, 'utf-8')) as { assets?: unknown[] };
      if (Array.isArray(parsed.assets)) return parsed.assets.length;
    } catch {
      /* fall through to the generation manifest */
    }
  }
  return Array.isArray(manifest?.assets) ? manifest.assets.length : 0;
}

/** One landing, or null when the directory is not one. */
export function describe(slug: string): LandingSummary | null {
  const dir = resolveOutputDir(slug);
  if (!dir) return null;
  const manifest = readGenerationManifest(dir) as
    | (ReturnType<typeof readGenerationManifest> & {
        slug?: string;
        siteUrl?: string | null;
        productName?: string | null;
        productDisplayName?: string | null;
        commerce?: { mode?: string; shopifyHandle?: string | null };
        timestamps?: { generatedAt?: string | null };
      })
    | null;
  if (!manifest) return null;

  // THE NAME COMES FROM THE MODULE FIRST. `.generation.json` records it too,
  // but the module is what the page actually renders — and a manifest written
  // by an older generation may predate the display name entirely.
  const displayName =
    productField(dir, 'displayName') ??
    manifest.productDisplayName ??
    productField(dir, 'name') ??
    manifest.productName ??
    slug;

  return {
    slug,
    displayName,
    sourceTitle: productField(dir, 'name') ?? manifest.productName ?? null,
    source: manifest.source ?? resolveSourceIdentity(manifest.sourceUrl ?? null),
    mode: manifest.commerce?.shopifyHandle ? 'commerce' : 'preview',
    shopifyHandle: manifest.commerce?.shopifyHandle ?? null,
    siteUrl: manifest.siteUrl ?? null,
    built: existsSync(path.join(dir, 'dist/client/index.html')),
    assetCount: assetCount(dir, manifest as { assets?: unknown[] }),
    generatedAt: manifest.timestamps?.generatedAt ?? null,
    productId: manifest.productId ?? null,
  };
}

/**
 * Every landing on disk, newest first.
 *
 * DIRECTORIES THAT ARE NOT LANDINGS ARE SKIPPED SILENTLY — `.smoke`, the
 * archived first-run evidence, a half-copied tree with no manifest. The
 * library is a statement about what exists, so anything it cannot verify it
 * does not claim.
 */
export function list(): LandingSummary[] {
  if (!existsSync(OUTPUTS_DIR)) return [];
  const found: LandingSummary[] = [];
  for (const entry of readdirSync(OUTPUTS_DIR)) {
    if (entry.startsWith('.')) continue;
    const summary = describe(entry);
    if (summary) found.push(summary);
  }
  return found.sort((a, b) => (a.generatedAt ?? '') < (b.generatedAt ?? '') ? 1 : -1);
}

export type DeleteOutcome =
  | { ok: true; slug: string }
  | { ok: false; code: 'not-found' | 'not-a-landing'; message: string };

/**
 * Removes a landing's generated files, and nothing else.
 *
 * ─── THREE CONDITIONS, ALL CHECKED ON THE SERVER ───────────────────────────
 *
 *   1. the slug resolves to a directory strictly inside outputs/
 *   2. that directory has a readable .generation.json
 *   3. the path removed is the RESOLVED one, never the string that arrived
 *
 * The client never supplies a path — only a slug — and the string it supplies
 * is never concatenated into one. A delete is the one operation where being
 * wrong is unrecoverable, so a directory that cannot be shown to be a landing
 * is refused rather than removed "just in case".
 *
 * IT TOUCHES NOTHING IN SHOPIFY. The product, the storefront and the shop
 * configuration are the merchant's, they live in someone else's system, and
 * this function has no client that could reach them even if it wanted to.
 */
export function remove(slug: unknown): DeleteOutcome {
  const dir = resolveOutputDir(slug);
  if (!dir) {
    return { ok: false, code: 'not-found', message: 'No existe una landing con ese identificador.' };
  }
  if (!readGenerationManifest(dir)) {
    return {
      ok: false,
      code: 'not-a-landing',
      message:
        'Esa carpeta no tiene un manifiesto de generación válido, así que no se puede demostrar que sea ' +
        'una landing de este sistema. No se elimina nada.',
    };
  }
  rmSync(dir, { recursive: true, force: true });
  return { ok: true, slug: dir.split(path.sep).pop()! };
}

/**
 * Resolves a file inside a landing's BUILT output, for the preview iframe.
 *
 * Two containments, not one: the slug must resolve to a landing, and the
 * requested file must resolve inside that landing's `dist/client`. A request
 * for `../../../etc/passwd` fails the second even after passing the first.
 */
export function resolvePreviewFile(slug: unknown, relative: string): string | null {
  const dir = resolveOutputDir(slug);
  if (!dir) return null;
  const root = path.join(dir, 'dist/client');
  if (!existsSync(root)) return null;

  const requested = relative.replace(/^\/+/, '') || 'index.html';
  const resolved = path.resolve(root, requested);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) return null;
  if (!existsSync(resolved)) return null;
  // A directory request means its index, the way a static server behaves.
  const target = statSync(resolved).isDirectory() ? path.join(resolved, 'index.html') : resolved;
  return existsSync(target) ? target : null;
}

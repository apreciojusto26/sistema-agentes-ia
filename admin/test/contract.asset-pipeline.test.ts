// Fase 4 — product asset pipeline.
//
// THE REGRESSION THIS LOCKS DOWN. The scraper writes `img_0.webp … img_N.webp`;
// the template registers asset KEYS (`gallery-01`, `ugc-01`, `step-01`) backed
// by `.jpg` stock photos. The legacy `--images` mode copies a file only when
// its bare filename already exists in `src/assets/product/`, so not one scraped
// image ever matched: every landing shipped with stock photos of a DIFFERENT
// product while the real media sat unused on disk. That is contamination under
// CLAUDE.md §10, not a cosmetic issue.
//
// These tests run against the PRODUCTION module and assert the properties that
// make a repeat impossible: real media wins, selection never depends on the
// source filename, and every failure mode is reported rather than skipped.
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  planAssets,
  materializeAssets,
  buildImagesModule,
  stableName,
  TEMPLATE_SLOT_KEYS,
  SUPPORTED_EXTENSIONS,
} from '../../scripts/lib/asset-pipeline.mjs';

const temps: string[] = [];

function fixtureDir(files: Record<string, string>) {
  const dir = mkdtempSync(path.join(tmpdir(), 'lg-assets-'));
  temps.push(dir);
  for (const [name, content] of Object.entries(files)) writeFileSync(path.join(dir, name), content);
  return dir;
}

const media = (names: string[]) => names.map((n, i) => ({ url: `https://cdn.example/${n}`, localPath: `output/images/${n}`, order: i }));

afterEach(() => {
  while (temps.length) rmSync(temps.pop()!, { recursive: true, force: true });
});

describe('asset pipeline — planning', () => {
  it('materialises every real image under stable, position-derived names', () => {
    const dir = fixtureDir({ 'img_0.webp': 'a', 'img_1.webp': 'b', 'img_2.webp': 'c' });
    const plan = planAssets(media(['img_0.webp', 'img_1.webp', 'img_2.webp']), dir);

    expect(plan.assets.map((a: any) => a.dest)).toEqual(['product-01.webp', 'product-02.webp', 'product-03.webp']);
    expect(plan.rejected).toEqual([]);
    expect(plan.main.dest).toBe('product-01.webp');
  });

  it('names are independent of the source filename — the whole point of the fix', () => {
    const dir = fixtureDir({ 'WhatsApp Image 2026.jpeg': 'a', 'IMG-4821 (1).png': 'b' });
    const plan = planAssets(media(['WhatsApp Image 2026.jpeg', 'IMG-4821 (1).png']), dir);

    expect(plan.assets.map((a: any) => a.dest)).toEqual(['product-01.jpeg', 'product-02.png']);
  });

  it('canonical `order` decides sequence, not directory order', () => {
    const dir = fixtureDir({ 'a.webp': '1', 'b.webp': '2' });
    const plan = planAssets(
      [
        { url: null, localPath: 'output/images/b.webp', order: 0 },
        { url: null, localPath: 'output/images/a.webp', order: 1 },
      ],
      dir,
    );
    expect(plan.assets.map((a: any) => a.src)).toEqual(['b.webp', 'a.webp']);
    expect(plan.main.src).toBe('b.webp');
  });

  it('falls back to a NATURAL directory sort when media[] is absent (img_2 before img_10)', () => {
    const dir = fixtureDir({ 'img_2.webp': 'b', 'img_10.webp': 'c', 'img_1.webp': 'a' });
    const plan = planAssets(null, dir);
    expect(plan.assets.map((a: any) => a.src)).toEqual(['img_1.webp', 'img_2.webp', 'img_10.webp']);
  });

  it('stableName zero-pads so ordering survives a lexicographic sort', () => {
    expect(stableName(0, '.webp')).toBe('product-01.webp');
    expect(stableName(9, '.webp')).toBe('product-10.webp');
  });
});

describe('asset pipeline — fail-closed handling', () => {
  it('reports, never silently skips: unsupported type', () => {
    const dir = fixtureDir({ 'doc.pdf': 'x', 'ok.webp': 'y' });
    const plan = planAssets(media(['doc.pdf', 'ok.webp']), dir);
    expect(plan.assets).toHaveLength(1);
    expect(plan.rejected).toContainEqual({ reason: 'unsupported-type', detail: 'doc.pdf' });
  });

  it('reports a missing file', () => {
    const dir = fixtureDir({ 'ok.webp': 'y' });
    const plan = planAssets(media(['ghost.webp', 'ok.webp']), dir);
    expect(plan.rejected).toContainEqual({ reason: 'file-missing', detail: 'ghost.webp' });
  });

  it('reports an empty file rather than shipping a 0-byte image', () => {
    const dir = fixtureDir({ 'empty.webp': '', 'ok.webp': 'y' });
    const plan = planAssets(media(['empty.webp', 'ok.webp']), dir);
    expect(plan.rejected).toContainEqual({ reason: 'empty-file', detail: 'empty.webp' });
  });

  it('deduplicates by CONTENT hash, not by name', () => {
    const dir = fixtureDir({ 'a.webp': 'same-bytes', 'b.webp': 'same-bytes', 'c.webp': 'other' });
    const plan = planAssets(media(['a.webp', 'b.webp', 'c.webp']), dir);
    expect(plan.assets).toHaveLength(2);
    expect(plan.rejected[0].reason).toBe('duplicate');
  });

  it('rejects a media entry with no usable reference', () => {
    const dir = fixtureDir({ 'ok.webp': 'y' });
    const plan = planAssets([{ url: null, localPath: null, order: 0 }, ...media(['ok.webp'])], dir);
    expect(plan.rejected).toContainEqual({ reason: 'no-reference', detail: JSON.stringify({ url: null, localPath: null, order: 0 }) });
  });

  it('rejects path traversal in a reference', () => {
    const dir = fixtureDir({ 'ok.webp': 'y' });
    const plan = planAssets([{ localPath: '../../../etc/passwd', order: 0 }], dir);
    expect(plan.rejected[0].reason).toMatch(/unsafe-name|unsupported-type/);
    expect(plan.assets).toHaveLength(0);
  });

  it('an empty media list against an empty directory yields no main image', () => {
    const dir = fixtureDir({});
    const plan = planAssets([], dir);
    expect(plan.assets).toEqual([]);
    expect(plan.main).toBeNull();
  });

  it('a missing images directory is reported, not thrown', () => {
    const plan = planAssets(media(['a.webp']), path.join(tmpdir(), 'lg-does-not-exist-xyz'));
    expect(plan.rejected[0].reason).toBe('images-dir-missing');
  });

  it('every supported extension is actually accepted', () => {
    const files = Object.fromEntries(SUPPORTED_EXTENSIONS.map((e: string, i: number) => [`f${i}${e}`, `bytes-${i}`]));
    const dir = fixtureDir(files);
    const plan = planAssets(media(Object.keys(files)), dir);
    expect(plan.assets).toHaveLength(SUPPORTED_EXTENSIONS.length);
  });
});

describe('generated images.ts — no template stock may survive', () => {
  const dir = () => fixtureDir({ 'img_0.webp': 'a', 'img_1.webp': 'b', 'img_2.webp': 'c' });
  const build = () => buildImagesModule(planAssets(media(['img_0.webp', 'img_1.webp', 'img_2.webp']), dir()));

  it('EVERY template slot key is re-pointed at a real product file', () => {
    const src = build();
    for (const key of TEMPLATE_SLOT_KEYS) {
      expect(src, `slot ${key} is not remapped`).toContain(`'${key}': product`);
    }
  });

  it('imports ONLY product-NN files — never a template stock asset', () => {
    const src = build();
    const imports = [...src.matchAll(/from '@\/assets\/product\/([^']+)'/g)].map((m) => m[1]);
    expect(imports.length).toBeGreaterThan(0);
    for (const file of imports) expect(file).toMatch(/^product-\d{2}\./);
    expect(src).not.toMatch(/gallery-0\d\.jpg|ugc-0\d\.jpg|step-01\.jpg/);
  });

  it('aliases BOTH the bare filename and the canonical localPath', () => {
    // Real regression: one Content Agent run emitted
    // "asset": "output/images/img_0.webp" (the full localPath) instead of the
    // bare "img_0.webp". Only the basename was aliased, so every lookup
    // missed, resolveMedia() returned empty placeholders, and the built page
    // contained ZERO images — with no error anywhere.
    const src = build();
    expect(src).toContain("'img_0.webp': product01");
    expect(src).toContain("'output/images/img_0.webp': product01");
  });

  it('keeps the ORIGINAL scraped filenames as aliases, so content.json keeps resolving', () => {
    // The Content Agent already emits `"asset": "img_0.webp"`. Dropping these
    // aliases would make resolveMedia() return an empty placeholder for every
    // content-referenced image — the failure this phase exists to remove.
    const src = build();
    expect(src).toContain("'img_0.webp': product01");
    expect(src).toContain("'img_1.webp': product02");
  });

  it('cycles real images when there are fewer of them than slots', () => {
    const d = fixtureDir({ 'only.webp': 'a' });
    const src = buildImagesModule(planAssets(media(['only.webp']), d));
    // 1 asset, 9 slots: all must still resolve, all to the same real file.
    for (const key of TEMPLATE_SLOT_KEYS) expect(src).toContain(`'${key}': product01`);
  });

  it('refuses to build a module with zero assets instead of emitting an empty map', () => {
    const d = fixtureDir({});
    expect(() => buildImagesModule(planAssets([], d))).toThrow(/zero assets/);
  });
});

describe('materialisation', () => {
  it('copies each planned file to its stable destination', () => {
    const src = fixtureDir({ 'img_0.webp': 'a', 'img_1.webp': 'b' });
    const dest = mkdtempSync(path.join(tmpdir(), 'lg-dest-'));
    temps.push(dest);
    mkdirSync(dest, { recursive: true });

    const plan = planAssets(media(['img_0.webp', 'img_1.webp']), src);
    const copied = materializeAssets(plan, dest);

    expect(copied.map((c: any) => c.dest)).toEqual(['product-01.webp', 'product-02.webp']);
    for (const c of copied) expect(c.sha256).toMatch(/^[0-9a-f]{64}$/);
  });
});

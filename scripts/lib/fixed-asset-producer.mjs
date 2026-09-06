// THE ASSET PRODUCER — turns the scrape's real media into a FixedAssetOutput.
//
// Until F4 the Admin could PASS an asset output but never PRODUCE one, so the
// only way to fill the Fixed media slots was to hand-write a fixture. This is
// the layer that ends that: it reads the CanonicalProduct's media, materialises
// the files, and assigns them to the page's fixed slots.
//
// DETERMINISTIC, AND NOT NEGOTIABLY SO. Same canonical product plus same
// directory of bytes must give the same output, every time — the structural
// fingerprint of a generated landing depends on it, and a producer that
// shuffled or sampled would make the seal untestable. No randomness, no clock,
// no network: by the time this runs the source snapshot is already on disk.
//
// IT DECIDES WHAT FACTUAL MEDIA FILLS THE FIXED SLOTS. It does not decide
// layout, variants, CSS, breakpoints, grid, typography or section order — all
// of that is frozen in AstraVibe and sealed by Structural Grammar V1.
//
// ─── NO CYCLING, EVER ──────────────────────────────────────────────────────
//
// The old buildImagesModule aliased the template's slot keys over the real
// images with `i % assets.length`, so `ugc-01`, `ugc-02` and `ugc-03` always
// resolved to product photographs whether or not any media had been assigned
// to them. That is fabricated cardinality: a page showing the same photo six
// times because a fixture once had six.
//
// The rule here is the opposite. One unique asset means one strip item. Three
// unique assets may mean three. Nothing is repeated to reach a number.
//
// ─── VIDEO ────────────────────────────────────────────────────────────────
//
// Supported in shape, absent in fact. `scraper/scrape.js` contains no video
// extraction at all and product-normalizer.mjs writes `videos: []` as a
// literal, so no real product supplies one today. The producer reads the field
// anyway: when a future scraper fills it, video flows into heroExtras without
// redesigning the section, and Grammar V1 already knows the shape.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { planAssets, materializeAssets, describeRejections } from './asset-pipeline.mjs';

/** Aspect ratios the fixed regions render at. Not a choice — the layout's. */
const GALLERY_RATIO = '4/5';
const STRIP_RATIO = '9/16';
const STEP_RATIO = '4/3';

/**
 * Rejection reasons that are this pipeline doing its job, not a problem.
 *
 * A duplicate is dropped because showing one photograph twice is fabricated
 * cardinality, and an unsupported type is skipped because Astro's image
 * pipeline would fail the build on it. Both are deterministic and intended, so
 * they are COUNTED. Every other reason means the canonical product named a
 * file the disk does not have, which is the source failing its own promise.
 */
const DELIBERATE_REJECTIONS = ['duplicate', 'unsupported-type'];

/**
 * Reads intrinsic dimensions out of an image header.
 *
 * NO DEPENDENCY, deliberately: agents.MD forbids introducing packages during
 * product generation, and `sharp` belongs to the template rather than to
 * scripts/. Thirty lines of header parsing beats a new install.
 *
 * DIMENSIONS ARE PROVENANCE HERE, NOT RENDER DATA. MediaRef carries no width
 * or height — astro:assets derives them from the file at build time and the
 * grammar normalises them away. They are recorded so the manifest can state
 * what the source actually was, and `null` is a real answer for a format this
 * does not parse.
 *
 * @returns {{width: number, height: number} | null}
 */
export function readImageSize(file) {
  let buf;
  try {
    buf = readFileSync(file);
  } catch {
    return null;
  }
  if (buf.length < 24) return null;

  // PNG: IHDR width/height at a fixed offset.
  if (buf.readUInt32BE(0) === 0x89504e47) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  // GIF: little-endian, right after the header.
  if (buf.toString('ascii', 0, 3) === 'GIF') {
    return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
  }
  // WebP (VP8X / VP8L / VP8 ) — three container variants, each with its own
  // encoding of the same two numbers.
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    const fourcc = buf.toString('ascii', 12, 16);
    if (fourcc === 'VP8X') return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
    if (fourcc === 'VP8 ') return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
    if (fourcc === 'VP8L') {
      const b = buf.readUInt32LE(21);
      return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 };
    }
    return null;
  }
  // JPEG: walk the segment chain to the first SOF marker.
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let off = 2;
    while (off + 9 < buf.length) {
      if (buf[off] !== 0xff) return null;
      const marker = buf[off + 1];
      const len = buf.readUInt16BE(off + 2);
      // SOF0..SOF15, skipping the non-frame markers interleaved among them.
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: buf.readUInt16BE(off + 5), width: buf.readUInt16BE(off + 7) };
      }
      off += 2 + len;
    }
  }
  return null;
}

/** Alt text that describes the product, never an imagined buyer. */
const altFor = (productName, i) =>
  productName ? `${productName}, imagen ${i + 1}` : `Imagen ${i + 1} del producto`;

/**
 * The operations produceFixedAssets ACTUALLY performs, in the order it performs
 * them.
 *
 * ─── WHY THIS LIST IS EXPORTED ─────────────────────────────────────────────
 *
 * The Admin declares the sequence of operations its asset stage is about to
 * attempt, so that a failure at step three can leave four and five honestly
 * marked `skipped` rather than dropping them. If the Admin kept its own copy
 * of these names they would drift the first time a boundary here moved, and
 * the operator would be told a stage skipped work that no longer exists.
 *
 * ONE AUTHORITY, therefore: the producer names its own operations, and
 * contract.agent-reports.test.ts asserts it really calls exactly these, in
 * exactly this order.
 */
export const FIXED_ASSET_OPERATIONS = [
  'assets:plan',
  'assets:gallery',
  'assets:strip',
  'assets:steps',
  'assets:manifest',
];

/**
 * The default observer: it calls the operation and gets out of the way.
 *
 * A producer that behaves differently when someone is watching is not a
 * producer anyone can trust, so instrumentation is a WRAPPER and never a
 * branch — with no observer supplied the call sequence, the return value and
 * the bytes on disk are what they have always been.
 */
const NO_FACTS = { count() {}, note() {}, warn() {} };
const PASS_THROUGH = { step: (_name, fn) => fn(NO_FACTS) };

/**
 * Produces the FixedAssetOutput for one product.
 *
 * @param {object}   opts
 * @param {object}   opts.canonicalProduct  the normalized scrape
 * @param {string}   opts.imagesDir         directory holding the scraped bytes
 * @param {string|null} [opts.destDir]      where to copy them; null = plan only
 * @param {number}   [opts.stepCount]       how many how-it-works steps the copy has
 * @param {{step: Function}} [opts.observer]   watches the real boundaries below
 * @returns {{assetOutput: object, plan: object, manifest: object, rejected: string[]}}
 */
export function produceFixedAssets({
  canonicalProduct,
  imagesDir,
  destDir = null,
  stepCount = 0,
  observer = PASS_THROUGH,
}) {
  const media = canonicalProduct?.media?.images ?? [];
  const productName = canonicalProduct?.identity?.name ?? null;

  // planAssets already does the hard, deterministic part: canonical order,
  // rejection reporting, and sha256 dedupe. Reusing it rather than writing a
  // second selector is the whole reason it survived the F3 audit.
  // ─── plan ───────────────────────────────────────────────────────────────
  //
  // ONE OPERATION, REPORTED AS ONE. planAssets walks the canonical media in a
  // single pass: it resolves each reference against the bytes on disk, rejects
  // what Astro cannot optimise, sha256s what survives and drops a file whose
  // digest it has already seen. Reporting that as separate "hashes calculated"
  // and "duplicates removed" lines would take two passes over the same bytes
  // to make two lines true — a slower pipeline bought with a prettier list.
  // The COUNTS are separable and real, so the counts are what get reported.
  const plan = observer.step('assets:plan', (facts) => {
    const planned = planAssets(media, imagesDir);
    const duplicates = planned.rejected.filter((r) => r.reason === 'duplicate').length;
    facts.count(planned.assets.length, planned.assets.length + planned.rejected.length, 'archivos aceptados');
    // The RATIO above already carries "accepted of considered"; repeating it
    // here would print the same number twice. What it does not carry is why
    // the rest were not.
    facts.note(`${planned.rejected.length} rechazados · ${duplicates} duplicados`);

    // A REJECTION IS NOT AUTOMATICALLY A WARNING, and the difference is which
    // side failed. Deduping and skipping a format Astro cannot optimise are
    // this pipeline working exactly as designed — they are counted. A file the
    // canonical product NAMED and the disk does not have is the source failing
    // its own promise, and that is the operator's business.
    for (const rejection of planned.rejected) {
      if (!DELIBERATE_REJECTIONS.includes(rejection.reason)) {
        facts.warn(`imagen no materializada (${rejection.reason}): ${rejection.detail}`);
      }
    }

    if (planned.assets.length === 0) {
      throw new FixedAssetError(
        `no usable media for this product. Rejected: ${describeRejections(planned.rejected).join('; ') || 'nothing found'}`,
        planned,
      );
    }

    if (destDir) {
      mkdirSync(destDir, { recursive: true });
      materializeAssets(planned, destDir);
    }
    return planned;
  });

  // The canonical, position-derived key. Never the source filename: that comes
  // from whatever the provider called the file and is not stable across runs.
  const keyOf = (asset) => path.basename(asset.dest, path.extname(asset.dest));

  // ─── gallery: every unique asset, in canonical order ────────────────────
  const gallery = observer.step('assets:gallery', (facts) => {
    const slots = plan.assets.map((asset, i) => ({
      id: `g${i + 1}`,
      asset: keyOf(asset),
      alt: altFor(productName, i),
      ratio: GALLERY_RATIO,
    }));
    facts.note(`${slots.length} slots`);
    return slots;
  });

  // ─── heroExtras: the product's OWN clips ───────────────────────────────
  //
  // Always empty today, and not for want of trying: the scraper extracts no
  // video. It is read rather than hardcoded so the day a source supplies one,
  // nothing here changes.
  //
  // AND NO OPERATION LINE OF ITS OWN, for the same reason. An operation that
  // can only ever report zero is a line that sounds like work and describes
  // none. The day a scraper supplies video, this gets its boundary along with
  // the extraction that justifies it.
  const videos = Array.isArray(canonicalProduct?.media?.videos) ? canonicalProduct.media.videos : [];
  const heroExtras = videos
    .map((v, i) => {
      const asset = typeof v === 'string' ? v : (v?.localPath ?? v?.url ?? null);
      if (!asset) return null;
      const poster = typeof v === 'object' && v?.poster ? { poster: String(v.poster) } : {};
      return {
        asset: path.basename(String(asset).split('?')[0]),
        alt: productName ? `${productName}, vídeo ${i + 1}` : `Vídeo ${i + 1} del producto`,
        ratio: '9/16',
        kind: 'video',
        ...poster,
      };
    })
    .filter(Boolean);

  // ─── product media strip ───────────────────────────────────────────────
  //
  // NOT UGC — see the header of fixed-asset-output.mjs. Every unique asset,
  // once. One asset means one item; nothing is repeated to reach a count.
  const productMediaStrip = observer.step('assets:strip', (facts) => {
    const slots = plan.assets.map((asset, i) => ({
      asset: keyOf(asset),
      alt: altFor(productName, i),
      ratio: STRIP_RATIO,
    }));
    facts.note(`${slots.length} slots`);
    return slots;
  });

  // ─── step media ────────────────────────────────────────────────────────
  //
  // Keyed by POSITION, because the template knows positions and a key derived
  // from a heading detaches the moment the heading is rewritten.
  //
  // Reuse here is not fabricated cardinality: the number of steps comes from
  // the copy, not from the media, so a three-step narrative with two photos
  // must still fill three slots. Distinct while there is choice, then the last
  // asset repeats — deterministic, and recorded in the manifest.
  const stepMedia = observer.step('assets:steps', (facts) => {
    const assigned = {};
    for (let i = 0; i < stepCount; i++) {
      const asset = plan.assets[Math.min(i, plan.assets.length - 1)];
      assigned[`step-${i}`] = {
        asset: keyOf(asset),
        alt: productName ? `${productName}, paso ${i + 1}` : `Paso ${i + 1}`,
        ratio: STEP_RATIO,
      };
    }
    // THE COPY DECIDES HOW MANY STEPS EXIST, the media decides how many
    // DISTINCT photographs fill them. Reporting both is what makes the reuse
    // above legible rather than surprising.
    facts.count(Object.keys(assigned).length, stepCount, 'pasos');
    const distinct = new Set(Object.values(assigned).map((m) => m.asset)).size;
    if (stepCount > 0 && distinct < stepCount) {
      facts.note(`${distinct} imagen(es) distintas para ${stepCount} pasos — la última se repite`);
    }
    return assigned;
  });

  const manifest = observer.step('assets:manifest', (facts) => {
    const built = {
      schema: 1,
      productId: canonicalProduct?.identity?.productId ?? null,
      // PROVENANCE, at the level F4 actually needs: enough to prove no file was
      // invented. Each entry ties a copied file back to the source reference the
      // scrape recorded and to the bytes themselves.
      assets: plan.assets.map((asset) => {
        const size = destDir ? readImageSize(path.join(destDir, asset.dest)) : readImageSize(asset.srcPath);
        return {
          key: keyOf(asset),
          file: asset.dest,
          sourceRef: asset.ref,
          sourceName: asset.src,
          sha256: asset.sha256,
          bytes: asset.bytes,
          width: size?.width ?? null,
          height: size?.height ?? null,
          // Listing photography from the provider. NOT customer content — no
          // source in this pipeline supplies that, and calling it `ugc` because
          // it ends up in a scrolling band is how a false claim gets made.
          kind: 'image',
          provenance: 'product/promotional',
        };
      }),
      rejected: plan.rejected,
      stepAssignments: Object.entries(stepMedia).map(([slot, m]) => ({ slot, asset: m.asset })),
    };
    facts.note(
      `${built.assets.length} entradas · gallery ${gallery.length} · strip ${productMediaStrip.length} · pasos ${built.stepAssignments.length}`,
    );
    return built;
  });

  return {
    assetOutput: { gallery, heroExtras, productMediaStrip, stepMedia },
    plan,
    manifest,
    rejected: describeRejections(plan.rejected),
  };
}

export class FixedAssetError extends Error {
  constructor(message, plan) {
    super(message);
    this.name = 'FixedAssetError';
    this.plan = plan;
  }
}

/**
 * Verifies every ref in an asset output resolves to a file that exists.
 *
 * THE F3 LESSON, made mechanical. The deleted `fixed-content.json` referenced
 * `video-02` and `video-03`, keys present in no images module — resolveMedia()
 * answers an unknown key with an empty placeholder, so those rendered blank
 * frames behind a green build. A ref nothing can resolve must be an error.
 *
 * @returns {{code: string, message: string}[]}
 */
export function collectUnresolvedRefs(assetOutput, resolvableKeys) {
  const keys = resolvableKeys instanceof Set ? resolvableKeys : new Set(resolvableKeys);
  const issues = [];
  const check = (media, where) => {
    if (!media || typeof media.asset !== 'string') return;
    if (!keys.has(media.asset)) {
      issues.push({
        code: 'asset-ref-unresolved',
        message: `${where} references "${media.asset}", which resolves to no copied file`,
      });
    }
    if (media.poster && !keys.has(media.poster)) {
      issues.push({
        code: 'asset-poster-unresolved',
        message: `${where} has poster "${media.poster}", which resolves to no copied file`,
      });
    }
  };

  for (const list of ['gallery', 'heroExtras', 'productMediaStrip']) {
    (assetOutput?.[list] ?? []).forEach((m, i) => check(m, `${list}[${i}]`));
  }
  for (const [slot, m] of Object.entries(assetOutput?.stepMedia ?? {})) {
    check(m, `stepMedia.${slot}`);
  }
  return issues;
}

/** sha256 of a file, for callers that want to assert dedupe from outside. */
export function fileDigest(file) {
  return existsSync(file) && statSync(file).isFile()
    ? createHash('sha256').update(readFileSync(file)).digest('hex')
    : null;
}

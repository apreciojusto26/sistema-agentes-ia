// THE LLM BOUNDARY, replaced by a deterministic writer.
//
// SAME CONTRACT AS THE REAL AGENT — that is the whole point. It reads the
// canonical product the real normalizer produced, writes a content.json to the
// same --staged path, and the document it writes is validated by the same
// content-contract.mjs the real agent is validated by. What it does NOT do is
// call Gemini, which is the only reason it exists.
//
// It writes NO packs, NO media beyond the gallery the Version A schema still
// requires, and NO commercial policy. Those belong to other authorities, and
// an adapter that filled them would be testing a pipeline nobody runs.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

// THE SAME EVENT EMITTER THE REAL AGENT USES. The registry learns where the
// content landed by parsing a `result` event off stderr, so an adapter that
// only wrote the file would be speaking a different protocol — and the thing
// under test here is the protocol.
const require = createRequire(import.meta.url);
const events = require(
  path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../../scripts/lib/events.cjs'),
);
const emit = events.createEmitter('content');

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? null : process.argv[i + 1];
};

const product = JSON.parse(readFileSync(arg('--product'), 'utf-8'));
const name = product?.identity?.name ?? 'Producto';
const brand = product?.identity?.brand ?? null;
const images = product?.media?.images ?? [];

const gallery = images.map((img, i) => ({
  id: `g${i + 1}`,
  // The ref the real agent emits: the scraped file, which buildImagesModule
  // maps into the generated images.ts under both its name and its localPath.
  asset: path.basename(img.localPath ?? img.url ?? `img_${i}.jpg`),
  alt: `${name}, imagen ${i + 1}`,
  ratio: '4/5',
  label: `Vista ${i + 1}`,
}));

// THE RATING FACTS ARE PROJECTED, NOT AUTHORED — the real agent overwrites
// whatever the model wrote with the scraper's numbers, and an adapter that
// skipped this produced a landing with no stars anywhere: a structurally
// DIFFERENT page, which the profile comparison caught immediately.
const socialProof = product.socialProof ?? {};
const ratingAverage = typeof socialProof.rating === 'number' ? socialProof.rating : null;
const ratingCount = typeof socialProof.reviewCount === 'number' ? socialProof.reviewCount : null;

const content = {
  product: {
    brand,
    name,
    ratingAverage,
    ratingCount,
    tagline: `${name} para dormir sin dolor cervical`,
    subtagline: 'Espuma viscoelástica de alta densidad que recupera su forma cada noche.',
    badges: ['Espuma viscoelástica', 'Funda lavable'],
    trustTicker: ['Envío peninsular', 'Devoluciones en 14 días', 'Atención en español'],
    offer: { durationMinutes: 30, label: 'Oferta activa', expiredLabel: 'Oferta finalizada' },
    // `BenefitItem` IS `{ id, icon, title, text }`. These had no `icon` at all
    // and called the copy `body` — a shape no type declares and the live
    // Content Agent does not produce. Same story as `specs` below: invisible
    // until the build stage started type-checking what it builds.
    benefits: [
      { id: 'b1', icon: 'shield', title: 'Soporte cervical', text: 'La doble curva sostiene el cuello en cualquier postura.' },
      { id: 'b2', icon: 'star', title: 'No se aplasta', text: 'La espuma recupera su forma cada mañana.' },
      { id: 'b3', icon: 'truck', title: 'Funda lavable', text: 'Se quita y va a la lavadora.' },
      { id: 'b4', icon: 'shield', title: 'Transpirable', text: 'Perforaciones que dejan pasar el aire.' },
    ],
    heroPills: ['Viscoelástica', 'Funda lavable', 'Doble altura'],
    // `SpecItem` IS `{ label, value }` AND NOTHING ELSE. These carried an `id`
    // each, which no type declares and nothing renders — and `astro build`
    // transpiled it happily, so the invalid fixture survived until the build
    // stage started running `astro check` and named it in one line.
    specs: [
      { label: 'Material', value: 'Espuma viscoelástica' },
      { label: 'Funda', value: 'Poliéster lavable' },
    ],
    // VERSION A COMPAT SLOT. The schema requires the key; the Fixed projection
    // drops it and merchant config supplies the bundles that render.
    packs: [{ id: 'IGNORED-BY-FIXED', units: 99, freeUnits: 99, label: 'not the authority', default: true }],
    gallery,
    // THE REAL HowToStep SHAPE: { step, title, text, media }. `media` is
    // REQUIRED by 06-how-it-works.astro, which renders <Media media={step.media} />
    // with no guard — an omitted one crashes the build with "Cannot read
    // properties of undefined". The content contract checks key presence, not
    // item shape, so nothing upstream catches it; getting this wrong here is
    // how that was found.
    steps: [
      { step: 1, title: 'Sacala de la caja', text: 'Dejala expandir un par de horas.', media: { asset: 'step-01', alt: 'La almohada expandiéndose', ratio: '4/3' } },
      { step: 2, title: 'Elegí tu altura', text: 'Dos caras, dos alturas distintas.', media: { asset: 'ugc-01', alt: 'Las dos caras de la almohada', ratio: '4/3' } },
      { step: 3, title: 'Dormí', text: 'El cuello queda alineado toda la noche.', media: { asset: 'ugc-02', alt: 'Alguien durmiendo de lado', ratio: '4/3' } },
    ],
    comparison: [
      { feature: 'Soporte cervical', ours: true, rival: false },
      { feature: 'Espuma', ours: true, rival: 'Fibra suelta' },
      { feature: 'Funda lavable', ours: true, rival: true },
      // CLOSES ON L01 (text|text). FIXED_GRAMMAR seals only two closing shapes
      // for comparison/rows; a table ending on a body shape does not collapse
      // into its tuple form and the page fingerprints differently.
      { feature: 'Altura', ours: 'Dos caras', rival: 'Única' },
    ],
    comparisonRival: 'Una almohada común',
    ugc: [],
    cta: {
      primary: 'Comprar ahora',
      sticky: 'Agregar al carrito',
      checkout: 'Finalizar compra',
      pending: 'Procesando…',
      soldOut: 'Agotado',
    },
    variantGroupLabel: 'Altura',
  },
  faq: [
    { id: 'f1', question: '¿Se aplasta con el uso?', answer: 'No: la espuma viscoelástica recupera su forma.' },
    { id: 'f2', question: '¿La funda se lava?', answer: 'Sí, se quita y va a la lavadora.' },
    { id: 'f3', question: '¿Sirve si duermo de lado?', answer: 'Sí, para eso está la cara alta.' },
    { id: 'f4', question: '¿Cuánto tarda en expandirse?', answer: 'Un par de horas fuera de la caja.' },
  ],
  testimonials: [
    { id: 't1', author: 'M***a', rating: 5, date: '2026-02-11', title: 'Dormí de un tirón', body: 'Primera noche sin despertarme con el cuello duro.', variant: 'quote' },
    { id: 't2', author: 'J***o', rating: 4, date: '2026-01-28', body: 'Tarda en expandirse pero después va bien.', variant: 'reel' },
    { id: 't3', author: 'L***a', rating: 5, date: '2026-03-02', body: 'La cara alta es la que me sirve.', variant: 'quote' },
    { id: 't4', author: 'P***o', rating: 5, date: '2026-03-14', body: 'La funda se lava sin deformarse.', variant: 'reel' },
  ],
};

const staged = arg('--staged');
mkdirSync(path.dirname(staged), { recursive: true });
writeFileSync(staged, JSON.stringify(content, null, 2));

const attempts = arg('--attempts-dir');
if (attempts) mkdirSync(attempts, { recursive: true });

emit('result', null, {
  stagedPath: staged,
  model: 'fake-deterministic',
  turns: 1,
  promptTokenCount: 0,
  candidatesTokenCount: 0,
  totalTokenCount: 0,
  thoughtsTokenCount: null,
  attemptsDir: attempts,
  productFields: Object.keys(content.product).length,
  faqCount: content.faq.length,
  testimonialCount: content.testimonials.length,
});

process.stdout.write(`fake content agent: wrote ${staged}\n`);
process.exit(0);

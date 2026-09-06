// HUMAN NAMES FOR THE OPERATIONS THE AGENTS ACTUALLY RUN.
//
// ─── THIS FILE INVENTS NOTHING ─────────────────────────────────────────────
//
// Every key below is a real `withStage(...)` block inside a real script, whose
// start and end are already announced over the NDJSON protocol and already
// parsed and persisted by the job registry. Nothing here decides that a step
// happened; it decides what to CALL one that did.
//
// The distinction is the whole point of the file. A UI that listed "expected
// steps" and ticked them off would be a progress bar with extra words: it
// would show "✓ Reviews obtenidas" for a product whose page had none, which is
// precisely the class of confident-and-wrong reporting this system keeps
// removing from its landings. If a step is not in the record, it is not drawn.
//
// AN UNMAPPED STEP RENDERS AS ITSELF. A script that grows a stage shows up in
// the panel immediately, under its raw id, rather than disappearing until
// somebody remembers to add a translation.
//
//   scrape.js         launch open defer-load structured-data gallery variants
//                     reviews images write close
//   generate-content  prepare generate save
//   generate-landing  args validate preflight copy-template write-data
//                     patch-theme write-favicon copy-images write-manifest todos
//
// ─── AND THE ONES THE ADMIN RUNS ITSELF ────────────────────────────────────
//
// Three stages delegate to no child, so there is no NDJSON to mirror: the
// Admin performs their operations in-process and records them through
// StepRecorder, which wraps a REAL call and times it. Same rule, same file: a
// key here names an operation that runs, or it does not belong here.
//
// Their ids are NAMESPACED because the flat table below is shared. A child
// already declares `validate`, `gallery` and `images`; an Admin operation
// reusing one of those names would inherit the child's label and describe the
// wrong work in the panel.
//
//   normalize  extraction canonical identity variants media social-proof
//   assets     inputs plan gallery strip steps manifest refs persist favicon
//   validate   artifact grammar asset-refs ownership social-proof readiness
export const STEP_LABEL: Record<string, string> = {
  // ── Product Agent · scrape.js ────────────────────────────────────────────
  launch: 'Navegador iniciado',
  open: 'Página abierta',
  'defer-load': 'Contenido diferido cargado',
  'structured-data': 'Datos estructurados extraídos',
  gallery: 'Galería recogida',
  variants: 'Variantes leídas',
  reviews: 'Reseñas recogidas',
  images: 'Imágenes descargadas',
  write: 'Extracción guardada',
  close: 'Navegador cerrado',

  // ── Content Agent · generate-content.mjs ─────────────────────────────────
  prepare: 'Prompt preparado',
  generate: 'Modelo ejecutado',
  save: 'Contenido validado y guardado',

  // ── Build Agent · generate-landing.mjs ───────────────────────────────────
  args: 'Argumentos leídos',
  validate: 'Entradas validadas',
  preflight: 'Linaje de producto comprobado',
  'copy-template': 'Plantilla copiada',
  'write-data': 'FixedProductData ensamblado',
  'patch-theme': 'Paleta aplicada',
  'write-favicon': 'Marca resuelta',
  'copy-images': 'Media copiada',
  'write-manifest': 'Manifiesto escrito',
  todos: 'Pendientes recopilados',

  // ── Product Agent · el normalizador, dentro de archiveScrape ─────────────
  // One per section normalizeProduct actually projects. `specifications` has
  // no entry because the normalizer writes a literal `[]` for it — there is no
  // structured source, so there is no operation to name.
  'normalize:extraction': 'Extracción recibida',
  'normalize:canonical': 'Producto normalizado',
  'normalize:identity': 'Identidad canónica resuelta',
  'normalize:variants': 'Variantes normalizadas',
  'normalize:media': 'Media normalizada',
  'normalize:social-proof': 'Social proof normalizado',

  // ── Asset Agent · produceFixedAssets + el propio stage ───────────────────
  // The middle five are the producer's own boundaries, which it names and
  // exports so this table cannot describe a boundary that has moved.
  'assets:inputs': 'Entradas del producto leídas',
  'assets:plan': 'Media localizada y deduplicada',
  'assets:gallery': 'Gallery asignada',
  'assets:strip': 'ProductMediaStrip asignada',
  'assets:steps': 'Media de los pasos asignada',
  'assets:manifest': 'Manifiesto de procedencia generado',
  'assets:refs': 'Referencias verificadas',
  'assets:persist': 'Decisiones de media persistidas',
  'assets:favicon': 'Favicon resuelto',

  // ── Validation Agent · un chequeo real por línea ─────────────────────────
  'validate:artifact': 'Artefactos de la landing',
  'validate:grammar': 'Structural Grammar V3',
  'validate:asset-refs': 'Referencias de assets',
  'validate:ownership': 'Propiedad del producto',
  'validate:social-proof': 'Procedencia de la prueba social',
  'validate:readiness': 'Production readiness',
};

/** The step's human name, or its own id when nobody has named it yet. */
export const stepLabel = (name: string): string => STEP_LABEL[name] ?? name;

/**
 * A duration an operator can read.
 *
 * Only ever called with a number the child actually measured — a step with no
 * reliable duration shows none rather than a plausible-looking zero.
 */
export function formatMs(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  const minutes = Math.floor(ms / 60_000);
  return `${minutes} min ${Math.round((ms % 60_000) / 1000)} s`;
}

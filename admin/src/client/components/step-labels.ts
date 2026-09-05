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

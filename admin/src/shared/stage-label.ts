// Real-Stage Label Mapping (spec, design §3.1). Two lookup tables typed
// `Record<ScrapeStage, string>` / `Record<GenerateStage, string>` so the
// compiler enforces key-side coverage: adding a member to either union in
// events.ts without updating this file fails `pnpm typecheck`.
//
// GOTCHA (design §11 judgment call #11): this file lives in
// admin/src/shared/, which tsconfig.server.json ALSO compiles — so
// `import.meta.env` is not guaranteed to exist there. Guarded below with a
// `typeof import.meta.env !== 'undefined'` check rather than assuming
// client-only usage.
import type { ScrapeStage, GenerateStage, ContentStage } from './events';

const SCRAPE_LABELS: Record<ScrapeStage, string> = {
  launch: 'Abriendo el navegador',
  open: 'Entrando a la página del producto',
  'defer-load': 'Cargando el contenido de la página',
  'structured-data': 'Leyendo los datos del producto',
  gallery: 'Juntando las fotos del producto',
  variants: 'Revisando colores y medidas',
  reviews: 'Leyendo las reseñas de los compradores',
  images: 'Descargando las imágenes',
  write: 'Guardando todo lo encontrado',
  close: 'Cerrando el navegador',
};

const GENERATE_LABELS: Record<GenerateStage, string> = {
  args: 'Leyendo lo que pediste',
  validate: 'Revisando que el contenido esté completo',
  preflight: 'Verificando que se pueda crear la carpeta',
  'copy-template': 'Copiando la plantilla base',
  'write-data': 'Escribiendo los textos de tu landing',
  'write-design': 'Guardando el diseño elegido',
  'patch-theme': 'Aplicando los colores y las tipografías',
  'write-favicon': 'Creando el favicon de la marca',
  'copy-images': 'Copiando las imágenes a la landing',
  'write-manifest': 'Guardando el registro de la generación (.generation.json)',
  todos: 'Anotando lo que falta revisar',
};

const CONTENT_LABELS: Record<ContentStage, string> = {
  prepare: 'Preparando los datos del producto',
  generate: 'Escribiendo los textos con IA',
  save: 'Guardando los textos generados',
};

const ALL: Record<string, string> = { ...SCRAPE_LABELS, ...GENERATE_LABELS, ...CONTENT_LABELS };

// `import.meta.env` is a Vite-injected type — tsconfig.server.json compiles
// this file too but declares no `vite/client` types (types: ["node"] only),
// so `import.meta.env` does not type-check there even behind a `typeof`
// guard. Read it through an unknown-typed cast instead — still a genuine
// runtime existence check, just not relying on ambient Vite types.
function isDevMode(): boolean {
  const meta = import.meta as unknown as { env?: { DEV?: boolean } };
  return !!meta.env?.DEV;
}

/**
 * Spanish plain-language label for a real ScrapeStage/GenerateStage value.
 * D3: never silent, never blank. An unmapped stage returns the raw name
 * verbatim — the UI degrades to "honest but ugly", never "empty and
 * confident".
 */
export function stageLabel(stage: string): string {
  const label = ALL[stage];
  if (label !== undefined) return label;

  if (isDevMode()) {
    console.warn(`[stage-label] unmapped stage "${stage}" — showing the raw name. Add it to stage-label.ts.`);
  }
  return stage;
}

export function isMappedStage(stage: string): boolean {
  return ALL[stage] !== undefined;
}

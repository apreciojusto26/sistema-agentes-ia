// Hand-written declarations — see fixed-asset-output.d.mts for why ".d.mts".

export interface FaviconFile {
  name: string;
  contents: Buffer | string;
}

export interface FaviconManifest {
  schema: 1;
  source: 'operator' | 'generated' | 'canonical';
  fingerprint: string;
  promptVersion: number;
  files: { name: string; sha256: string }[];
  /** Kept apart from the deterministic record: a clock must not change a build. */
  operational: { generatedAt: string | null; provider: string | null };
  reused?: boolean;
}

export declare const FAVICON_SOURCES: readonly string[];
export declare const PROMPT_VERSION: number;
export declare const MAX_OPERATOR_BYTES: number;
export declare const MIN_OPERATOR_SIZE: number;

export declare function faviconFingerprint(input: {
  brand?: string | null;
  productName?: string | null;
  palette?: Record<string, string | null>;
  promptVersion?: number;
}): string;

export declare function validateOperatorFavicon(
  file: string,
  opts?: { baseDir?: string | null },
): { ok: true; buffer: Buffer; width: number; height: number } | { ok: false; code: string; message: string };

export declare function wrapRasterAsSvg(png: Buffer): string;
export declare function paletteFromCss(css: string): Record<string, string | null>;

export declare function resolveFixedFavicon(opts: {
  operatorPath?: string | null;
  operatorBaseDir?: string | null;
  previous?: FaviconManifest | null;
  generate?: ((input: Record<string, unknown>) => Promise<Buffer | null> | Buffer | null) | null;
  brand?: string | null;
  productName?: string | null;
  palette?: Record<string, string | null>;
  now?: string | null;
}): Promise<{ files: FaviconFile[]; manifest: FaviconManifest; providerCalled: boolean }>;

export declare function writeFaviconFiles(publicDir: string, files: FaviconFile[]): void;

export declare class FixedFaviconError extends Error {
  code: string;
}

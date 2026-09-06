// Hand-written declarations — see fingerprint.d.mts for the convention.
//
// PARTIAL, like fixed-favicon.d.mts: what a TypeScript consumer calls. The
// narrowing rules themselves (the leading-noise table, the separators, the
// tidy pass) are internal and stay that way.

/** The ceiling a cart line can render. A ceiling, not a target. */
export declare const DISPLAY_NAME_MAX_CHARS: number;

/**
 * Narrows a factual listing title to something a cart line can render.
 * Returns '' when there is no title — never a placeholder.
 */
export declare function deriveDisplayName(sourceTitle: unknown): string;

/** Is `name` a narrowing of `sourceTitle`, rather than a rewrite of it? */
export declare function isDerivedFrom(name: unknown, sourceTitle: unknown): boolean;

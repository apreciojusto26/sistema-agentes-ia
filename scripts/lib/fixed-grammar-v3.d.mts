// Hand-written declarations — see fingerprint.d.mts for the convention.
//
// The grammar and its optional-slot list are opaque to TypeScript on purpose:
// they are DATA that only structuralFingerprint interprets, and giving them a
// structural type here would be a second declaration of the grammar's shape
// living outside the sealed artifact that defines it.
export declare const FIXED_GRAMMAR_V3: readonly unknown[];
export declare const FIXED_OPTIONAL_SLOTS_V3: readonly unknown[];

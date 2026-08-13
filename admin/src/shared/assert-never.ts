// Exhaustiveness helper (design §6: ManualArtifactPanel's `switch (state.kind)`
// must be "closed by default: assertNever(state)"). Calling this at a
// `default` branch makes the branch a compile error the moment a new variant
// is added to a union without updating every switch over it — the structural
// enforcement layer 2 that keeps ContentStageState honest.
export function assertNever(value: never): never {
  throw new Error(`assertNever: unexpected value ${JSON.stringify(value)}`);
}

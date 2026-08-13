import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 20_000,
    // Batch A has no runtime logic yet, so there are zero tests. Batch B
    // onward adds real specs; this keeps `pnpm test` green as scaffolding.
    passWithNoTests: true,
    // Several suites deliberately exercise REAL shared filesystem state
    // (admin/.jobs/ with reserved zz- ids, and — as of Batch E —
    // admin/.staged/content.json, a SINGLETON path with no per-test DI seam,
    // matching STAGED_CONTENT_PATH's design as a fixed real path). Running
    // test FILES in parallel (vitest's default) let content.test.ts and
    // jobs.test.ts race on that singleton file and flake. Job-id-scoped
    // suites (registry.test.ts etc.) don't need this, but disabling
    // cross-file parallelism repo-wide is the simplest correct fix and the
    // suite is fast enough (~1s) that the perf cost is negligible. Applies
    // across both projects below (root-level `test` options are inherited).
    fileParallelism: false,
    // Batch F: split into two projects so server/shared specs keep running
    // under 'node' (fast, no DOM needed) while the first client specs
    // (useJobStream's EventSource-driven hook, design §8 "a happy-dom
    // project entry ... added only when the first client test exists — no
    // dead config") get a real DOM. Root-level options (testTimeout,
    // passWithNoTests, fileParallelism) apply to both.
    projects: [
      {
        test: {
          name: 'server',
          environment: 'node',
          include: ['src/server/**/*.test.ts', 'src/shared/**/*.test.ts', 'test/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'client',
          environment: 'happy-dom',
          include: ['src/client/**/*.test.ts', 'src/client/**/*.test.tsx'],
        },
      },
    ],
  },
});

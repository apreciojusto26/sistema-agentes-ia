/// <reference types="vitest/config" />
import { getViteConfig } from 'astro/config';

// Pure-logic unit tests only (no Astro/React rendering). Uses Astro's own
// `getViteConfig` helper (not a bare `defineConfig`) so the `@/*` tsconfig
// alias AND the `astro:env/server` virtual module both resolve inside
// vitest — several of the pure functions under test live in modules that
// statically import `astro:env/server` even though the tested functions
// themselves never call it at runtime.
export default getViteConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});

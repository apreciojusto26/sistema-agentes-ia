// LOAD-BEARING contract test (Design System Fase 2, design ADR-1).
//
// The design registry exists TWICE by necessity:
//   build-time  scripts/lib/design-registry.mjs        (authoritative)
//   runtime     content/landing-base/src/design-system/registry.ts
//
// content/landing-base is COPIED wholesale into outputs/{slug}/, so at runtime
// it cannot reach scripts/lib. That duplication is unavoidable — but Fase 1's
// whole doctrine (see no-duplicated-contract.test.ts) is that a contract has
// ONE source of truth. This test IS the compensating control that keeps that
// true in practice: if the two ever diverge on ANY field of ANY capability,
// the build fails here.
//
// Do NOT weaken an assertion in this file to make a change pass. A divergence
// means one of the two registries is wrong; fix the registry, not the test.
import { describe, test, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

const BUILD_TIME_URL = pathToFileURL(
  path.join(REPO_ROOT, 'scripts/lib/design-registry.mjs'),
).href;
const RUNTIME_PATH = path.join(
  REPO_ROOT,
  'content/landing-base/src/design-system/registry.ts',
);

// ADR-1 guarantee in action: the runtime registry is pure data with only a
// type-only import, so it loads here with NO Vite pipeline and NO `@/` alias.
// If this import ever needs Astro/Vite to resolve, ADR-1 has been violated and
// the RUNTIME REGISTRY must be corrected — never this test.
const buildTime = await import(BUILD_TIME_URL);
const runtime = await import(pathToFileURL(RUNTIME_PATH).href);

type Entry = {
  category: string;
  type: string;
  variant: string;
  component: string;
  propsSchema: Record<string, unknown>;
  familiesAllowed: unknown;
  densityAllowed: unknown;
  incompatibleWith: unknown[];
  requiresData: string[];
};

const keyOf = (e: Entry) => `${e.category}/${e.type}/${e.variant}`;
const byKey = (entries: Entry[]) => new Map(entries.map((e) => [keyOf(e), e]));

const buildEntries: Entry[] = buildTime.REGISTRY;
const runtimeEntries: Entry[] = runtime.REGISTRY;

describe('design registry parity — build-time ↔ runtime', () => {
  test('both registries declare the same number of capabilities', () => {
    expect(runtimeEntries).toHaveLength(buildEntries.length);
  });

  test('no capability exists only at build time', () => {
    const runtimeKeys = new Set(runtimeEntries.map(keyOf));
    const missing = buildEntries.map(keyOf).filter((k) => !runtimeKeys.has(k));
    expect(missing, `missing from the RUNTIME registry: ${missing.join(', ')}`).toEqual([]);
  });

  test('no capability exists only at runtime', () => {
    const buildKeys = new Set(buildEntries.map(keyOf));
    const extra = runtimeEntries.map(keyOf).filter((k) => !buildKeys.has(k));
    expect(extra, `missing from the BUILD-TIME registry: ${extra.join(', ')}`).toEqual([]);
  });

  test('declaration order is identical (order is part of the contract)', () => {
    expect(runtimeEntries.map(keyOf)).toEqual(buildEntries.map(keyOf));
  });

  // Field-by-field rather than one deep-equal on the whole array: a failure
  // must name the capability AND the field, or a drift in a 14-entry registry
  // is unreadable in the diff.
  describe('every field of every capability is identical', () => {
    const runtimeMap = byKey(runtimeEntries);

    for (const expected of buildEntries) {
      const key = keyOf(expected);

      test(`${key}`, () => {
        const actual = runtimeMap.get(key);
        expect(actual, `${key} absent from the runtime registry`).toBeDefined();
        if (!actual) return;

        expect(actual.component, `${key} component path`).toBe(expected.component);
        expect(actual.propsSchema, `${key} propsSchema`).toEqual(expected.propsSchema);
        expect(actual.familiesAllowed, `${key} familiesAllowed`).toEqual(expected.familiesAllowed);
        expect(actual.densityAllowed, `${key} densityAllowed`).toEqual(expected.densityAllowed);
        expect(actual.incompatibleWith, `${key} incompatibleWith`).toEqual(expected.incompatibleWith);
        // Data requirements are part of the contract: a capability that
        // declares `testimonials:reel` at build time but nothing at runtime
        // would let the design gate accept a spec the renderer cannot feed.
        expect(actual.requiresData, `${key} requiresData`).toEqual(expected.requiresData);
      });
    }
  });

  // A component path that resolves at build time but not at runtime would let
  // the parity pass while the page fails to render.
  test('every component path points at a file that really exists', async () => {
    const { readFileSync } = await import('node:fs');
    for (const entry of runtimeEntries) {
      const rel = entry.component.replace('@/', 'content/landing-base/src/');
      expect(
        readFileSync(path.join(REPO_ROOT, rel), 'utf-8').length,
        `${entry.component} unreadable`,
      ).toBeGreaterThan(0);
    }
  });

  // The template's own default spec is what a generation WITHOUT --design
  // renders. If it stopped validating, every legacy generation would be
  // rendering a document the contract rejects.
  test('the template default DesignSpec validates as `pass` against the Fase 1 contract', async () => {
    const contract = await import(
      pathToFileURL(path.join(REPO_ROOT, 'scripts/lib/design-contract.mjs')).href
    );
    const defaultSpec = await import(
      pathToFileURL(path.join(REPO_ROOT, 'content/landing-base/src/data/design.ts')).href
    );

    const issues = contract.collectDesignErrors(defaultSpec.design);
    expect(issues, `default spec issues: ${JSON.stringify(issues)}`).toEqual([]);

    const support = contract.checkDesignSupport(defaultSpec.design);
    expect(support.status, `support: ${JSON.stringify(support)}`).toBe('pass');
  });

  test('the template default renders exactly the 11 legacy capabilities, in order, with no props', () => {
    const runtimeMap = byKey(runtimeEntries);
    return import(
      pathToFileURL(path.join(REPO_ROOT, 'content/landing-base/src/data/design.ts')).href
    ).then((mod) => {
      const sections = mod.design.sections;
      expect(sections).toHaveLength(11);
      sections.forEach((s: Entry & { order: number; props?: unknown }, i: number) => {
        expect(s.order, `section ${i} order`).toBe(i);
        expect(s.variant, `section ${i} variant`).toBe('default');
        expect(s.props, `section ${i} props`).toBeUndefined();
        const entry = runtimeMap.get(keyOf(s));
        expect(entry, `${keyOf(s)} not registered`).toBeDefined();
        // Legacy only: no building block may sneak into the default spec.
        expect(entry!.component, `${keyOf(s)} is not a legacy section`).toMatch(
          /^@\/components\/sections\//,
        );
      });
    });
  });

  test('resolveCapability agrees on both sides, including the no-fallback rule', () => {
    for (const entry of buildEntries) {
      const b = buildTime.resolveCapability(entry.category, entry.type, entry.variant);
      const r = runtime.resolveCapability(entry.category, entry.type, entry.variant);
      expect(r?.component, `${keyOf(entry)} runtime resolve`).toBe(b?.component);
    }

    // Neither side may substitute a different variant for an unknown one.
    expect(buildTime.resolveCapability('hero', 'ProductHero', 'default')).toBeNull();
    expect(runtime.resolveCapability('hero', 'ProductHero', 'default')).toBeNull();
    expect(buildTime.resolveCapability('hero', 'NeverRegistered', 'default')).toBeNull();
    expect(runtime.resolveCapability('hero', 'NeverRegistered', 'default')).toBeNull();
  });
});

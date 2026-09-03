// BUILD HARNESS for sealing the COMMERCE canonical fingerprint. Never deployed.
//
// Swaps two modules for hermetic fixtures at build time — the Shopify catalog
// and the merchant config — so the commerce structure can be measured with
// every commerce surface genuinely rendered, without a network call and
// without a production token.
//
// AN ALIAS RATHER THAN A FLAG, deliberately. A "fixture" branch inside
// src/lib/shopify/catalog.ts would put a fake-data path in the code that ships,
// one env var away from a real deployment serving invented prices. Nothing in
// src/ knows this file exists.
//
// Usage:
//   astro build --config astro.config.commerce-fixture.mjs
import base from './astro.config.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));

export default {
  ...base,
  outDir: './dist-commerce-fixture',
  vite: {
    ...base.vite,
    resolve: {
      alias: [
        {
          find: /^@\/lib\/shopify\/catalog$/,
          replacement: path.join(dir, 'test-fixtures/commerce-catalog.ts'),
        },
        { find: /^@\/data\/merchant$/, replacement: path.join(dir, 'test-fixtures/merchant.ts') },
      ],
    },
  },
};

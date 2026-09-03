// A/B BUILD HARNESS — swaps the product's whole data layer for a fixture.
//
// AB_FIXTURE=a|b selects which product. PUBLIC_COMMERCE_MODE=preview drops the
// commerce catalog alias so the real preview path runs; anything else builds
// the commerce profile against the fixture catalog.
//
// Aliases, never runtime flags: nothing in src/ knows these fixtures exist.
import base from './astro.config.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const which = process.env.AB_FIXTURE === 'b' ? 'b' : 'a';
const preview = process.env.PUBLIC_COMMERCE_MODE === 'preview';
const f = (n) => path.join(dir, `test-fixtures/ab/${n}-${which}.ts`);

const alias = [
  { find: /^@\/data\/product$/, replacement: f('product') },
  { find: /^@\/data\/faq$/, replacement: f('faq') },
  { find: /^@\/data\/testimonials$/, replacement: f('testimonials') },
  { find: /^@\/data\/merchant$/, replacement: f('merchant') },
];
// In preview the real catalog must run — that IS the path under test.
if (!preview) alias.push({ find: /^@\/lib\/shopify\/catalog$/, replacement: f('catalog') });

export default {
  ...base,
  outDir: `./dist-ab-${which}-${preview ? 'preview' : 'commerce'}`,
  vite: { ...base.vite, resolve: { alias } },
};

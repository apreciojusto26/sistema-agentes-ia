// Assertions for the live-model E2E. Deliberately a separate file from the
// shell runner so the checks are reviewable, and reusable if the run is driven
// another way.
//
// It asserts what only a REAL model run can show: that comparisonRival is
// inferred from the product rather than copied from the few-shot, and that the
// three fabrications removed earlier stay removed when the model is free to
// invent them again.
import { readFileSync } from 'node:fs';
import path from 'node:path';

const dir = process.argv[2];
if (!dir) {
  console.error('usage: assert-model-inference.mjs <evidence-dir>');
  process.exit(1);
}

const read = (f) => readFileSync(path.join(dir, f), 'utf-8');
const json = (f) => JSON.parse(read(f));

const example = json(path.join(process.cwd(), 'scripts/example-content.json'));
const a = json('a.content.json');
const b = json('b.content.json');
const htmlA = read('a.index.html');
const htmlB = read('b.index.html');

const failures = [];
const check = (ok, msg) => { if (!ok) failures.push(msg); else console.log(`  PASS  ${msg}`); };

// --- the gap this run exists to close -------------------------------------
check(!!a.product.comparisonRival?.trim(), 'A: comparisonRival is present');
check(!!b.product.comparisonRival?.trim(), 'B: comparisonRival is present');
check(
  a.product.comparisonRival !== b.product.comparisonRival,
  'A and B got DIFFERENT rivals (not one generic phrase for everything)',
);
for (const [label, c] of [['A', a], ['B', b]]) {
  check(
    c.product.comparisonRival !== example.product.comparisonRival,
    `${label}: the rival is not the few-shot's rival copied verbatim`,
  );
  check(
    c.product.comparisonRival === c.product.comparisonRival.toLowerCase(),
    `${label}: the rival is a generic category, not a capitalised brand`,
  );
}

// --- fabrications must stay removed ---------------------------------------
for (const [label, c] of [['A', a], ['B', b]]) {
  const t = c.testimonials ?? [];
  check(t.every((x) => !('verified' in x)), `${label}: no invented purchase verification`);
  check(t.every((x) => !('location' in x)), `${label}: no invented reviewer location`);
}

// --- leakage --------------------------------------------------------------
const exampleFacts = [
  example.product.brand, example.product.name, example.product.comparisonRival,
].filter(Boolean);
for (const [label, c, html] of [['A', a, htmlA], ['B', b, htmlB]]) {
  for (const fact of exampleFacts) {
    check(!JSON.stringify(c).includes(fact), `${label}: no verbatim copy of the example fact "${fact}"`);
  }
  check(!/\*{2,}/.test(html), `${label}: no masked reviewer reached the HTML`);
  check(!html.includes('Compra verificada'), `${label}: no verification badge rendered`);
  check(!html.includes('lámparas decorativas comunes'), `${label}: the old hardcoded rival is gone`);
  check(!/googletagmanager\.com|clarity\.ms/.test(html), `${label}: no tracker before consent`);
  check(!/astravibe:/.test(html), `${label}: no brand-scoped storage key in the HTML`);
}

// --- identity -------------------------------------------------------------
check(read('a.favicon.svg') !== read('b.favicon.svg'), 'the two products got different favicons');

console.log();
if (failures.length) {
  console.error(`✗ ${failures.length} assertion(s) failed:`);
  for (const f of failures) console.error(`   - ${f}`);
  process.exit(1);
}
console.log('✓ live-model E2E: all assertions passed');

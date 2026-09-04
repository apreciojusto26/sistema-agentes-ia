// THE SCRAPE BOUNDARY, and only the boundary.
//
// The real scraper turns a URL into files in its output directory. That is the
// one part of the pipeline that depends on a live third party, so it is the one
// part replaced — by copying a fixture into the same place, with the same
// productId discipline.
//
// LG_PRODUCT_ID IS HONOURED, not ignored. The registry mints an id per scrape
// job and archiveScrape refuses an archive whose product.json carries a
// different one. That ownership gate is REAL and stays under test; an adapter
// that wrote a hardcoded id would have to disable it, which is precisely the
// kind of "make the fixture pass" that hides contamination bugs.
//
// This process is spawned, awaited and its exit code recorded exactly as the
// real scraper's is. Stubbing the STAGE instead would have skipped the state
// machine, and the state machine is most of what the E2E tests.
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dest = process.env.E2E_SCRAPE_OUT;
if (!dest) {
  process.stderr.write('E2E_SCRAPE_OUT is not set — the harness must say where to write\n');
  process.exit(1);
}

mkdirSync(dest, { recursive: true });
cpSync(path.join(here, 'scrape'), dest, { recursive: true });

const productPath = path.join(dest, 'product.json');
const product = JSON.parse(readFileSync(productPath, 'utf-8'));
const minted = process.env.LG_PRODUCT_ID;
if (minted) {
  product.productId = minted;
  const manifestPath = path.join(dest, '.scrape-run.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
  manifest.productId = minted;
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
}
writeFileSync(productPath, JSON.stringify(product, null, 2));

process.stdout.write(`fake scraper: wrote ${dest} (productId ${product.productId})\n`);
process.exit(0);

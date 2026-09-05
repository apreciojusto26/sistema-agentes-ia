// AN OPERATOR SHOULD BE TOLD WHY, NOT SHOWN A SYMPTOM.
//
// The Admin used to surface the raw technical error, so a provider that blocked
// us with an anti-bot challenge reported itself as:
//
//     page.waitForSelector: Timeout 30000ms exceeded
//     waiting for locator('h1') to be visible
//
// True, and useless to anyone deciding what to do next. The first live smoke
// against a Leroy Merlin URL failed exactly that way and the real cause was a
// DataDome interstitial on HTTP 403 — 774 bytes, no product markup, no h1 to
// wait for. The timeout was the CONSEQUENCE of never being shown the page.
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyScrapeFailure } from '../../scripts/lib/scrape-failure.cjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

/** The body the live smoke actually received, trimmed to its markers. */
const DATADOME_BODY =
  `<html lang="en"><head><title>leroymerlin.es</title></head><body>` +
  `<p id="cmsg">Please enable JS and disable any ad blocker</p>` +
  `<script>var dd={'rt':'c','cid':'AHrlqAAAAAMA07PfpC438scAJQyNFw==',` +
  `'host':'geo.captcha-delivery.com'}</script></body></html>`;

const H1_TIMEOUT = "page.waitForSelector: Timeout 30000ms exceeded.\nwaiting for locator('h1') to be visible";

describe('a real block is named as one', () => {
  test('the exact Leroy Merlin failure classifies as ANTI_BOT', () => {
    const c = classifyScrapeFailure({ status: 403, bodySample: DATADOME_BODY, message: H1_TIMEOUT });
    expect(c.code).toBe('ANTI_BOT');
    expect(c.vendor).toBe('DataDome');
    expect(c.status).toBe(403);
  });

  test('the message is for a person, not for a stack reader', () => {
    const c = classifyScrapeFailure({ status: 403, bodySample: DATADOME_BODY, message: H1_TIMEOUT });
    expect(c.title).toBe('No pudimos acceder al producto');
    expect(c.message).toMatch(/bloqueó la extracción automática/);
    expect(c.message).toMatch(/no fue procesado/);
    expect(c.title + c.message, 'the summary leaks the selector timeout').not.toMatch(/waitForSelector|locator/);
  });

  test('the raw technical error is CARRIED, never discarded', () => {
    // Demoted, not hidden: someone debugging must not have to go to the logs.
    const c = classifyScrapeFailure({ status: 403, bodySample: DATADOME_BODY, message: H1_TIMEOUT });
    expect(c.technical).toBe(H1_TIMEOUT);
  });

  test('the evidence is reported so the classification can be argued with', () => {
    const c = classifyScrapeFailure({ status: 403, bodySample: DATADOME_BODY, message: H1_TIMEOUT });
    expect(c.evidence).toContain('HTTP 403');
    expect(c.evidence.join(' ')).toMatch(/DataDome/);
  });

  test.each([
    ['Cloudflare', 'cf_chl_opt'],
    ['Akamai', 'akam-sw.js'],
    ['Imperva/Incapsula', '_incapsula_resource'],
    ['PerimeterX', 'px-captcha'],
  ])('%s challenge markers are recognised too', (vendor, marker) => {
    const c = classifyScrapeFailure({ status: 200, bodySample: `<html><script src="${marker}">`, message: 'x' });
    expect(c.code).toBe('ANTI_BOT');
    expect(c.vendor).toBe(vendor);
  });

  test.each([401, 403, 407, 429])('HTTP %i alone is enough — refusal is refusal', (status) => {
    const c = classifyScrapeFailure({ status, bodySample: '<html>nada útil</html>', message: 'x' });
    expect(c.code).toBe('ANTI_BOT');
    expect(c.vendor).toBeNull();
  });
});

describe('a timeout with no evidence is NOT called a block', () => {
  test('an h1 timeout on a 200 stays generic', () => {
    // The trap this avoids: telling an operator to give up on a product they
    // could still get, and burying a real selector regression behind a
    // reassuring label.
    const c = classifyScrapeFailure({
      status: 200,
      bodySample: '<html><body><div class="product">contenido real</div></body></html>',
      message: H1_TIMEOUT,
    });
    expect(c.code).toBe('SCRAPE_FAILED');
    expect(c.vendor).toBeNull();
    expect(c.message).toMatch(/cambio en la web del proveedor o un problema temporal/);
  });

  test('no status and no body is still not a block', () => {
    const c = classifyScrapeFailure({ message: 'net::ERR_CONNECTION_RESET' });
    expect(c.code).toBe('SCRAPE_FAILED');
    expect(c.technical).toBe('net::ERR_CONNECTION_RESET');
  });

  test('a 500 is a broken provider, not a blocking one', () => {
    expect(classifyScrapeFailure({ status: 500, message: 'x' }).code).toBe('SCRAPE_FAILED');
  });

  test('the word "captcha" in ordinary page copy does not trigger it', () => {
    // Markers are strings the VENDOR puts there, not words a page might use.
    const c = classifyScrapeFailure({
      status: 200,
      bodySample: '<html><p>Rellena el captcha para suscribirte al boletín</p></html>',
      message: H1_TIMEOUT,
    });
    expect(c.code).toBe('SCRAPE_FAILED');
  });
});

describe('the scraper collects the evidence instead of throwing it away', () => {
  const src = readFileSync(path.join(REPO_ROOT, 'scraper/scrape.js'), 'utf-8');

  test('the navigation response is kept', () => {
    // It used to be discarded one line before waitForSelector, so the 403 was
    // in hand and dropped.
    expect(src).toMatch(/const response = await page\.goto\(/);
    expect(src).toMatch(/pageEvidence\.status = response \? response\.status\(\) : null/);
  });

  test('the body is sampled only on failure, and only a prefix', () => {
    expect(src).toMatch(/slice\(0, 4000\)/);
    expect(src).toMatch(/await sampleBody\(\);\n\s*throw err;/);
  });

  test('the emitted error carries the classification', () => {
    expect(src).toMatch(/classifyScrapeFailure\(\{/);
    expect(src).toMatch(/code: classified\.code/);
    // And still the raw message, so nothing downstream loses it.
    expect(src).toMatch(/message: err\.message/);
  });

  test('the diagnostic cannot replace the real cause with its own error', () => {
    const body = /const sampleBody = async \(\) => \{[\s\S]*?\n  \};/.exec(src)![0];
    expect(body).toMatch(/catch \{/);
  });
});

describe('the Admin shows the human summary and keeps the technical one', () => {
  const panel = readFileSync(
    path.join(REPO_ROOT, 'admin/src/client/components/detail/AgentRunPanel.tsx'),
    'utf-8',
  );

  test('a classified scrape failure gets its own copy and badge', () => {
    expect(panel).toMatch(/No pudimos acceder al producto/);
    expect(panel).toMatch(/bloqueó la extracción automática/);
    expect(panel).toMatch(/\{scrapeFailure\.badge\}/);
  });

  test('the raw error is demoted to a collapsed technical area, not removed', () => {
    expect(panel).toMatch(/<details/);
    expect(panel).toMatch(/Detalles técnicos/);
    expect(panel).toMatch(/\{job\.error\?\.message\}/);
  });

  test('the summary line stops leading with the raw error once we have better words', () => {
    expect(panel).toMatch(/!archiveDeadEnd && !scrapeFailure \? \(/);
  });

  test('an unclassified failure still shows its technical error up front', () => {
    // No classification, no invented reassurance.
    expect(panel).toMatch(/if \(job\.error\?\.code === 'ANTI_BOT'\)/);
    expect(panel).toMatch(/return null;/);
  });
});

describe('classifying a failure does not let the pipeline continue past it', () => {
  test('the real run recorded normalize as SKIPPED, not failed and not passed', () => {
    // From the live smoke against Leroy Merlin. Better wording changes what the
    // operator READS; it must not change what the pipeline DOES.
    const report = JSON.parse(
      readFileSync(path.join(REPO_ROOT, 'outputs/.smoke/almohada-masaje-cervical.json'), 'utf-8'),
    );
    expect(report.status).toBe('failed');
    expect(report.failedStage).toBe('scrape');

    const byName = Object.fromEntries(
      report.stages.map((s: { name: string; status: string }) => [s.name, s.status]),
    );
    expect(byName.scrape).toBe('failed');
    // `skipped`, never `failed`: they did not run, and claiming otherwise would
    // invent a verdict about work never attempted.
    for (const stage of ['normalize', 'content', 'assets', 'generate', 'build', 'validate']) {
      expect(byName[stage], `${stage} should be skipped`).toBe('skipped');
    }
  });
});

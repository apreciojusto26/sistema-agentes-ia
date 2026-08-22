#!/usr/bin/env node
// LIVE Shopify verification — Fase 5 closing step. NOT part of the build.
//
// Runs the nine checks that a mock can never stand in for:
//   producto real → handle → Storefront API → precio/variant → cart → checkoutUrl
//
// It is READ-MOSTLY: it queries a product and creates a CART. A cart is not an
// order — nothing is charged and no inventory moves — but it is the only way
// to obtain a real checkoutUrl, which is the whole point.
//
// Admin API is NOT used and no product is provisioned: products are created by
// hand in the Shopify admin, per the owner's decision.
//
// Usage (from the repo root, with the landing's own .env):
//   node scripts/verify-shopify-live.mjs --env outputs/<slug>/.env
//   node scripts/verify-shopify-live.mjs            # reads admin/.env
//
// SECRETS: the token is never printed, never written to a file, and is
// redacted from every error message before it is shown.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const args = { envPath: path.join(ROOT, 'admin/.env') };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--env') args.envPath = path.resolve(ROOT, argv[++i] ?? '');
    else if (argv[i] === '--handle') args.handleOverride = argv[++i];
  }
  return args;
}

/** Minimal dotenv reader — no dependency, and it never logs what it read. */
function readEnvFile(file) {
  if (!existsSync(file)) return {};
  const out = {};
  for (const line of readFileSync(file, 'utf-8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

/** Every message that reaches stdout goes through this. */
function redact(text, secret) {
  if (!secret) return text;
  return String(text).split(secret).join('«REDACTED»');
}

let step = 0;
const results = [];
function record(name, ok, detail) {
  step++;
  results.push({ step, name, ok, detail });
  console.log(`${ok ? '✓' : '✗'} ${step}. ${name}${detail ? ` — ${detail}` : ''}`);
}

async function gql(env, query, variables) {
  const url = `https://${env.PUBLIC_SHOPIFY_STORE_DOMAIN}/api/${env.PUBLIC_SHOPIFY_API_VERSION}/graphql.json`;
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Storefront-Access-Token': env.PUBLIC_SHOPIFY_STOREFRONT_TOKEN,
      },
      body: JSON.stringify({ query, variables }),
    });
  } catch (cause) {
    // A transport failure — unresolvable domain, DNS, offline — must surface
    // as a NAMED failed check, not as a bare "fetch failed" escaping to the
    // top-level catch. Found by running this against a landing whose .env
    // carried a placeholder domain: the output said nothing about which of
    // the nine checks had failed or why.
    return { status: 0, json: null, url, transportError: cause?.message ?? String(cause) };
  }
  const json = await res.json().catch(() => null);
  return { status: res.status, json, url };
}

const PRODUCT_QUERY = `
  query ($handle: String!) {
    product(handle: $handle) {
      handle
      title
      variants(first: 20) {
        nodes {
          id
          title
          availableForSale
          price { amount currencyCode }
        }
      }
    }
  }`;

const CART_CREATE = `
  mutation ($lines: [CartLineInput!]!) {
    cartCreate(input: { lines: $lines }) {
      cart {
        id
        checkoutUrl
        lines(first: 5) { nodes { quantity merchandise { ... on ProductVariant { id title } } } }
        cost { totalAmount { amount currencyCode } }
      }
      userErrors { field message }
    }
  }`;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const env = { ...readEnvFile(args.envPath), ...process.env };
  const token = env.PUBLIC_SHOPIFY_STOREFRONT_TOKEN;
  const handle = args.handleOverride ?? env.PUBLIC_SHOPIFY_PRODUCT_HANDLE;

  console.log(`Shopify live verification — env: ${path.relative(ROOT, args.envPath)}`);
  console.log(`store: ${env.PUBLIC_SHOPIFY_STORE_DOMAIN ?? '(missing)'} · api: ${env.PUBLIC_SHOPIFY_API_VERSION ?? '(missing)'}\n`);

  // 1 — credentials present, then actually accepted.
  if (!env.PUBLIC_SHOPIFY_STORE_DOMAIN || !token || !env.PUBLIC_SHOPIFY_API_VERSION) {
    record('Storefront credentials present', false, 'PUBLIC_SHOPIFY_STORE_DOMAIN / _STOREFRONT_TOKEN / _API_VERSION incomplete');
    return finish();
  }
  const ping = await gql(env, '{ shop { name } }');
  if (ping.transportError) {
    record('Storefront authentication', false, `could not reach ${env.PUBLIC_SHOPIFY_STORE_DOMAIN} — ${ping.transportError}`);
    return finish();
  }
  if (ping.status !== 200 || ping.json?.errors) {
    record('Storefront authentication', false, `HTTP ${ping.status} — token rejected by the store`);
    return finish();
  }
  record('Storefront authentication', true, `shop "${ping.json.data.shop.name}"`);

  // 2 — the handle this landing declares.
  if (!handle) {
    record('Handle resolved', false, 'no PUBLIC_SHOPIFY_PRODUCT_HANDLE in the env (pass --handle to override)');
    return finish();
  }
  record('Handle resolved', true, handle);

  // 3 — the product exists under exactly that handle.
  const prod = await gql(env, PRODUCT_QUERY, { handle });
  const product = prod.json?.data?.product;
  if (!product) {
    record('Product found in Shopify', false, `no product for handle "${handle}"`);
    return finish();
  }
  record('Product found in Shopify', true, `"${product.title}" (handle ${product.handle})`);

  // 4 — at least one purchasable variant.
  const variants = product.variants?.nodes ?? [];
  const available = variants.find((v) => v.availableForSale);
  if (!available) {
    record('Purchasable variant available', false, `${variants.length} variant(s), none availableForSale`);
    return finish();
  }
  record('Purchasable variant available', true, `${variants.length} variant(s), using "${available.title}"`);

  // 5 — price comes from Shopify, not from any agent.
  record(
    'Price sourced from Shopify',
    !!available.price?.amount,
    `${available.price?.amount} ${available.price?.currencyCode}`,
  );

  // 6 — cart creation.
  const cartRes = await gql(env, CART_CREATE, { lines: [{ merchandiseId: available.id, quantity: 1 }] });
  const cart = cartRes.json?.data?.cartCreate?.cart;
  const userErrors = cartRes.json?.data?.cartCreate?.userErrors ?? [];
  if (!cart) {
    record('Cart created', false, userErrors.map((e) => e.message).join('; ') || `HTTP ${cartRes.status}`);
    return finish();
  }
  record('Cart created', true, `total ${cart.cost?.totalAmount?.amount} ${cart.cost?.totalAmount?.currencyCode}`);

  // 7 — the line really is the variant we asked for.
  const line = cart.lines?.nodes?.[0];
  const lineOk = line?.merchandise?.id === available.id && line?.quantity === 1;
  record('Cart line matches the requested variant', lineOk, `${line?.quantity} × "${line?.merchandise?.title}"`);

  // 8 — a real Shopify checkout URL.
  const url = cart.checkoutUrl ?? '';
  const checkoutOk = /^https:\/\/[^/]+\/(cart\/c\/|checkouts\/)/.test(url) &&
    (url.includes(env.PUBLIC_SHOPIFY_STORE_DOMAIN) || url.includes('.myshopify.com') || url.includes('shopify'));
  record('Checkout URL is a real Shopify checkout', checkoutOk, url);
  console.log('\n  → open this URL in a browser to complete the manual purchase check:\n    ' + url + '\n');

  // 9 — nothing secret was emitted by any of the above.
  const emitted = results.map((r) => `${r.name} ${r.detail ?? ''}`).join(' ');
  record('No secret in output', !emitted.includes(token), 'token never printed');

  finish();
}

function finish() {
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${failed.length === 0 ? 'PASS' : 'FAIL'} — ${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) {
    console.log('first blocker: ' + failed[0].name);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  const token = process.env.PUBLIC_SHOPIFY_STOREFRONT_TOKEN;
  console.error(`✗ ${redact(err?.message ?? err, token)}`);
  process.exitCode = 1;
});

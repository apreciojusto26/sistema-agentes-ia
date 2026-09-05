// @ts-check
import { existsSync, readFileSync } from 'node:fs';
import { defineConfig, envField } from 'astro/config';
import react from '@astrojs/react';
import vercel from '@astrojs/vercel';
import tailwindcss from '@tailwindcss/vite';

// THE SITE IDENTITY IS THE LANDING'S, NOT THE TEMPLATE'S.
//
// `site` read the literal `https://astravibe.bamzuk.com`, so EVERY generated
// landing resolved its absolute URLs against the star projector's domain. A
// real product shipped `<meta property="og:image" content="https://astravibe.
// bamzuk.com/og-cover.png">` — another product's domain, pointing at a file
// that landing had deliberately deleted.
//
// THE AUTHORITY IS `SITE_URL`, WHICH THIS REPO ALREADY HAS. It is declared in
// the env schema below and resolved by src/lib/site-origin.ts as "the one
// trusted public origin", used for SumUp callbacks and payment redirects. A
// landing has exactly one origin; introducing a second variable for the same
// fact would let the payment callbacks and the social card disagree about
// which site this is.
//
// VALIDATED, NOT TRUSTED. Astro would accept any string here and emit it into
// every canonical and OG URL. The rules are the origin rules site-origin.ts
// already enforces at runtime, applied at config time so a malformed value
// fails the build instead of shipping. site-origin.ts cannot be imported: this
// config is plain ESM run by Node before any TypeScript exists.
//
// NO FALLBACK. Absent means absent — `Astro.site` stays undefined and the
// layout falls back to the REQUEST url, which is right for a preview that has
// no domain yet. Inventing one is how the previous product's identity survived.
function configuredSite() {
  const raw = (process.env.SITE_URL ?? siteUrlFromEnvFile())?.trim();
  if (!raw) return undefined;

  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`SITE_URL must be a valid absolute URL origin, got ${JSON.stringify(raw)}`);
  }
  const local = url.hostname === 'localhost' || url.hostname.endsWith('.localhost') || url.hostname.startsWith('127.');
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) {
    throw new Error('SITE_URL must use HTTPS outside localhost');
  }
  if (url.username || url.password) throw new Error('SITE_URL must not contain credentials');
  if (url.pathname !== '/' || url.search || url.hash) {
    throw new Error('SITE_URL must contain only an origin, without path, query or fragment');
  }
  return url.origin;
}

const site = configuredSite();

/**
 * Reads SITE_URL out of this landing's OWN .env.
 *
 * ASTRO DOES NOT DO THIS FOR US, and that is the whole reason this function
 * exists. Vite loads .env into `import.meta.env` for the APP, but the config
 * file is evaluated by Node before any of that, so `process.env.SITE_URL` is
 * undefined at the moment `site` has to be decided. Verified by building a
 * landing whose .env carried a real origin and watching it produce no og:image.
 *
 * That gap made the origin depend on whoever remembered to export a variable:
 * a landing generated WITH a domain and rebuilt later without one silently
 * lost its canonical origin. The generator writes SITE_URL into the output's
 * .env; this is the half that reads it back.
 *
 * ONE KEY, PARSED NARROWLY. `process.loadEnvFile()` would hoist every line of
 * the file into the process — including the operator's Shopify credentials —
 * for the sake of one public hostname. An explicit `process.env.SITE_URL`
 * still wins: an export is a deliberate override of what was persisted.
 */
function siteUrlFromEnvFile() {
  const envPath = new URL('./.env', import.meta.url);
  if (!existsSync(envPath)) return undefined;
  const match = /^SITE_URL=(.*)$/m.exec(readFileSync(envPath, 'utf-8'));
  // Quotes are stripped the way dotenv does; anything else is passed through
  // to the validation below, which is the only thing that decides.
  return match?.[1]?.trim().replace(/^["']|["']$/g, '') || undefined;
}

// https://astro.build/config
export default defineConfig({
  // SPREAD, NOT `site: undefined`. tsconfig sets exactOptionalPropertyTypes, so
  // an explicit undefined is a type error where an ABSENT key is the state
  // Astro actually documents for "this landing has no domain yet".
  ...(site ? { site } : {}),
  // SSR is scoped to /checkout + /api/* only — src/pages/index.astro opts back
  // out via `export const prerender = true` and stays a static build artifact.
  output: 'server',
  adapter: vercel(),
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
  },
  env: {
    // `optional: true` on every field so `astro dev`/`astro build` never hard-fail
    // before ops provisions real credentials (task 1.5). Each lib's own
    // `assertEnv()` throws loud at call-time instead — mirrors
    // src/lib/shopify/client.ts's existing convention.
    schema: {
      // Legacy static Admin token. Shopify stopped issuing these for apps
      // created after 2026-01-01; when unset, admin-token.ts mints one via the
      // client credentials grant using the two fields below.
      SHOPIFY_ADMIN_TOKEN: envField.string({ context: 'server', access: 'secret', optional: true }),
      SHOPIFY_CLIENT_ID: envField.string({ context: 'server', access: 'secret', optional: true }),
      SHOPIFY_CLIENT_SECRET: envField.string({ context: 'server', access: 'secret', optional: true }),
      SHOPIFY_ADMIN_API_VERSION: envField.string({ context: 'server', access: 'public', optional: true }),
      // Canonical public origin — for payment redirects/webhooks AND for
      // `site` above, which is the same fact. Server-only prevents clients
      // from influencing trusted SumUp callback URLs.
      SITE_URL: envField.string({ context: 'server', access: 'secret', optional: true }),
      SUMUP_API_KEY: envField.string({ context: 'server', access: 'secret', optional: true }),
      SUMUP_MERCHANT_CODE: envField.string({ context: 'server', access: 'secret', optional: true }),
      // No signature/HMAC mechanism exists for SumUp's online-checkout webhook
      // (verified against developer.sumup.com/online-payments/webhooks/ — the
      // payload is `{event_type, id}` with no signing header at all). Kept as
      // an optional field for forward-compat only; unused by webhook.ts today.
      SUMUP_WEBHOOK_SECRET: envField.string({ context: 'server', access: 'secret', optional: true }),
      UPSTASH_REDIS_REST_URL: envField.string({ context: 'server', access: 'public', optional: true }),
      UPSTASH_REDIS_REST_TOKEN: envField.string({ context: 'server', access: 'secret', optional: true }),
      ALERT_WEBHOOK_URL: envField.string({ context: 'server', access: 'secret', optional: true }),
      // Gates GET /api/diagnostics/session. Unset = route disabled (404),
      // so a deploy without it fails closed instead of exposing the trail.
      DIAGNOSTICS_TOKEN: envField.string({ context: 'server', access: 'secret', optional: true }),
      PUBLIC_GA_MEASUREMENT_ID: envField.string({ context: 'server', access: 'public', optional: true }),
      PUBLIC_CLARITY_PROJECT_ID: envField.string({ context: 'server', access: 'public', optional: true }),
    },
  },
});

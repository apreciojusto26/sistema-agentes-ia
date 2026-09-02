// @ts-check
import { defineConfig, envField } from 'astro/config';
import react from '@astrojs/react';
import vercel from '@astrojs/vercel';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  site: 'https://astravibe.bamzuk.com',
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
      // Canonical public origin for payment redirects/webhooks. Server-only
      // prevents clients from influencing trusted SumUp callback URLs.
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

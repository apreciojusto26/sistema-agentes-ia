// @ts-check
import { defineConfig, envField } from 'astro/config';
import react from '@astrojs/react';
import vercel from '@astrojs/vercel';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  site: 'https://cortto.example',
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
      SHOPIFY_ADMIN_TOKEN: envField.string({ context: 'server', access: 'secret', optional: true }),
      SHOPIFY_ADMIN_API_VERSION: envField.string({ context: 'server', access: 'public', optional: true }),
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
    },
  },
});

#!/usr/bin/env bash
# Rebuilds the two artifacts contract.fixed-e2e-profile.test.ts measures.
#
# Generates a Preview and a Commerce landing from the four per-authority
# fixtures, builds both, and leaves them under outputs/ for the suite to
# fingerprint against the sealed A/B profiles.
#
# THE COMMERCE HARNESS IS WRITTEN HERE, NOT BY THE GENERATOR. A shipped landing
# carries no fixture path and no alternate astro config — generate-landing.mjs
# excludes them from the copy on purpose. Swapping the Shopify catalog for a
# hermetic fixture is a thing a TEST does to an output, which is why the config
# and the fixture catalog are written after generation and never survive into a
# deployable tree.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

FIX=admin/test/fixtures/fixed
COMMON=(--content "$FIX/content.json" --assets "$FIX/assets.json" --merchant "$FIX/merchant.json" --force)

echo "==> preview"
node scripts/generate-landing.mjs --slug zz-fixed-preview "${COMMON[@]}"
(cd outputs/zz-fixed-preview && pnpm install --silent && pnpm exec astro check && pnpm exec astro build)

echo "==> commerce"
node scripts/generate-landing.mjs --slug zz-fixed-commerce --shopify-handle nubecalma-almohada-cervical "${COMMON[@]}"
cd outputs/zz-fixed-commerce
mkdir -p test-harness
sed 's#\.\./\.\./src/lib/shopify/catalog#../src/lib/shopify/catalog#' \
  "$ROOT/content/landing-astravibe/test-fixtures/ab/catalog-a.ts" > test-harness/catalog.ts
cat > astro.config.commerce-harness.mjs <<'EOF'
// TEST-ONLY, written by scripts/e2e/fixed-profile.sh. Never shipped.
import base from './astro.config.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = path.dirname(fileURLToPath(import.meta.url));
export default {
  ...base,
  outDir: './dist-commerce',
  vite: {
    ...base.vite,
    resolve: {
      alias: [{ find: /^@\/lib\/shopify\/catalog$/, replacement: path.join(dir, 'test-harness/catalog.ts') }],
    },
  },
};
EOF
pnpm install --silent
pnpm exec astro build --config astro.config.commerce-harness.mjs

# FAIL-CLOSED, asserted rather than assumed. The same tree with no hermetic
# catalog and no credentials must ABORT — never quietly render a preview.
echo "==> fail-closed check (this build is EXPECTED to fail)"
if pnpm exec astro build > /dev/null 2>&1; then
  echo "FAIL: commerce mode built with no Shopify credentials — it degraded instead of aborting" >&2
  exit 1
fi
echo "    ok — commerce aborted without credentials"

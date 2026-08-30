#!/usr/bin/env bash
# E2E: the ONE path this project has never verified against the real model —
#   CanonicalProduct -> Content Agent -> product.comparisonRival
#
# Everything else in the completeness work was proven against real builds and a
# real browser. This was not, because the environment had no GEMINI_API_KEY, and
# a simulated run would have been worse than an admitted gap.
#
# NO SECRET IS STORED HERE. The key is read from the environment at run time:
#
#   GEMINI_API_KEY=... scripts/e2e/model-inference.sh <productA.json> <productB.json>
#
# The two products must be from CLEARLY DIFFERENT categories — that is the whole
# point. If both are pillows, a rival copied from the few-shot still looks right.
set -euo pipefail

if [[ -z "${GEMINI_API_KEY:-}" ]]; then
  echo "✗ GEMINI_API_KEY is not set. Export it for this command only; do not commit it." >&2
  exit 1
fi

A="${1:?usage: model-inference.sh <productA.json> <productB.json>}"
B="${2:?usage: model-inference.sh <productA.json> <productB.json>}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT="${ROOT}/outputs/e2e-model-inference"
EVIDENCE="${OUT}/evidence"
mkdir -p "$EVIDENCE"

run_one() {
  local label="$1" product="$2" slug="e2e-${1}"

  echo "── ${label}: content agent ──"
  node "${ROOT}/scripts/generate-content.mjs" --product "$product" \
    --out "${EVIDENCE}/${label}.content.json"

  echo "── ${label}: landing ──"
  rm -rf "${ROOT}/outputs/${slug}"
  node "${ROOT}/scripts/generate-landing.mjs" \
    --slug "$slug" \
    --content "${EVIDENCE}/${label}.content.json" \
    --merchant "${ROOT}/admin/test/fixtures/merchant/test-merchant.json"

  ( cd "${ROOT}/outputs/${slug}" \
    && ln -sfn "${ROOT}/content/landing-base/node_modules" node_modules \
    && PUBLIC_GA_MEASUREMENT_ID="${PUBLIC_GA_MEASUREMENT_ID:-}" \
       node ./node_modules/astro/bin/astro.mjs build >/dev/null )

  cp "${ROOT}/outputs/${slug}/dist/client/index.html" "${EVIDENCE}/${label}.index.html"
  cp "${ROOT}/outputs/${slug}/public/favicon.svg"     "${EVIDENCE}/${label}.favicon.svg"
}

run_one a "$A"
run_one b "$B"

echo
echo "── assertions ──"
node "${ROOT}/scripts/e2e/assert-model-inference.mjs" "$EVIDENCE"
echo
echo "Evidence kept in: ${EVIDENCE}"

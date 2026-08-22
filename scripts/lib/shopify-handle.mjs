// Shopify product handle format (Fase 5).
//
// Lives in its own module rather than inside generate-landing.mjs because
// that script executes main() on import — it carries no
// `import.meta.url === argv[1]` guard — so a test importing the validator
// from it would run a whole generation as a side effect. Duplicating the
// regex into the test instead would have been a second source of truth for
// what a valid handle is.

/**
 * Lowercase alphanumerics separated by single hyphens, max 255 chars — the
 * shape Shopify itself produces when it slugifies a product title.
 *
 * Deliberately strict. A handle is operator-supplied, and a malformed one
 * would otherwise surface only as "Product not found — build aborted" long
 * after the landing was declared buyable.
 */
export function isShopifyHandle(value) {
  return typeof value === 'string' && value.length <= 255 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

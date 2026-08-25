// THE GUARD THAT REPLACES A COMMENT.
//
// StickyAddToCart used to say "Mirror BundleSelector's decision logic so the
// sticky bar and buy box can never disagree". Nothing enforced that. The two
// copies matched because someone typed them correctly, and the next
// presentation would have been the third copy.
//
// This file is that promise as a test. It reads the REAL sources of the two
// presentations and fails if either one re-derives a commercial predicate or
// reaches for a transaction endpoint directly. It is deliberately a static
// scan and not a parser: the patterns below are the exact expressions that
// were duplicated, so a regression reproduces them almost verbatim.
//
// WHY CartDrawer IS OUT OF SCOPE. It also calls syncCartLine() and computes
// `isPending`, and that is correct: it is a cart EDITOR — it changes the
// quantity of a line that already exists. It never decides add-to-cart vs
// checkout for a selected product, which is the decision this file protects.
// Listing it as an exception here, by name and with the reason, is the honest
// alternative to a pattern loose enough to let it through by accident.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

/**
 * Strips full-line `//` comments and block comments before scanning — the same
 * convention contract.design-blocks.test.ts's B2 scanner uses, and for the same
 * reason: these files DOCUMENT the patterns they are forbidden to contain, and
 * a scanner that flagged its own explanation would be useless. Caught on the
 * first run of this test, by this test, on the hook's own header.
 *
 * Only line-leading `//` is removed, so a `//` inside a string or a URL is
 * untouched.
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !/^\s*\/\//.test(l))
    .join('\n');
}

const read = (rel: string) =>
  stripComments(readFileSync(fileURLToPath(new URL(`../../../${rel}`, import.meta.url)), 'utf-8'));

/** The presentations. Neither may contain a commercial decision. */
const PRESENTATIONS = [
  ['BundleSelector', 'components/islands/BundleSelector.tsx'],
  ['StickyAddToCart', 'components/islands/StickyAddToCart.tsx'],
  // The third presentation, and the one this guard existed to make safe:
  // conversion/BuyBox/compact mounts its own island rather than branching
  // BundleSelector on a prop. It was added AFTER the guard, and it had to
  // satisfy it on the first run.
  ['CompactBuySelector', 'components/islands/CompactBuySelector.tsx'],
] as const;

const HOOK = 'components/islands/parts/use-buy-action.ts';

/**
 * Each entry is a predicate that WAS duplicated, with the pattern that catches
 * it coming back and the name of the field the hook now supplies instead.
 */
const COMMERCE_PREDICATES = [
  {
    what: 'variant availability',
    pattern: /availableForSale/,
    useInstead: 'soldOut',
  },
  {
    what: 'cart-line sync (variant)',
    pattern: /cart\??\.?\s*\.?line\.variantId\s*===/,
    useInstead: 'inSync',
  },
  {
    what: 'cart-line sync (quantity)',
    pattern: /line\.quantity\s*===/,
    useInstead: 'inSync',
  },
  {
    what: 'in-flight cart status',
    pattern: /'(creating|updating|restoring)'/,
    useInstead: 'isPending',
  },
  {
    what: 'the add-to-cart analytics event',
    pattern: /trackEvent\s*\(/,
    useInstead: 'onCta',
  },
  {
    what: 'the cart mutation',
    pattern: /syncCartLine\s*\(/,
    useInstead: 'onCta',
  },
  {
    what: 'the checkout call',
    pattern: /(^|[^.\w])checkout\s*\(\s*\)/m,
    useInstead: 'onCta',
  },
] as const;

/** Modules a presentation must not reach for at all. */
const FORBIDDEN_IMPORTS = [
  { what: 'the cart transaction endpoints', pattern: /import\s*\{[^}]*\b(checkout|syncCartLine)\b[^}]*\}\s*from\s*'@\/stores\/cart'/ },
  { what: 'the analytics module', pattern: /from\s*'@\/lib\/analytics'/ },
  { what: 'useSelection directly (it must arrive through useBuyAction)', pattern: /from\s*'@\/components\/islands\/parts\/use-selection'/ },
];

describe('neither presentation re-implements the buy decision', () => {
  test.each(PRESENTATIONS)('%s consumes useBuyAction', (_name, file) => {
    const src = read(file);
    expect(src).toMatch(/import\s*\{[^}]*\buseBuyAction\b[^}]*\}\s*from\s*'@\/components\/islands\/parts\/use-buy-action'/);
    expect(src).toMatch(/useBuyAction\s*\(/);
  });

  test.each(PRESENTATIONS)('%s re-derives no commercial predicate', (name, file) => {
    const src = read(file);
    const offenders = COMMERCE_PREDICATES.filter((p) => p.pattern.test(src)).map(
      (p) => `${p.what} — use \`${p.useInstead}\` from useBuyAction() instead`,
    );
    expect(offenders, `${name} re-implemented shared commerce logic`).toEqual([]);
  });

  test.each(PRESENTATIONS)('%s imports no transaction endpoint', (name, file) => {
    const src = read(file);
    const offenders = FORBIDDEN_IMPORTS.filter((f) => f.pattern.test(src)).map((f) => f.what);
    expect(offenders, `${name} reaches past the hook`).toEqual([]);
  });
});

describe('the hook really is the single source', () => {
  test('every predicate the presentations lost lives in use-buy-action.ts', () => {
    // The other half of the guard: without this, deleting the logic from all
    // three files would pass the assertions above.
    const src = read(HOOK);
    for (const { what, pattern } of COMMERCE_PREDICATES) {
      expect(pattern.test(src), `${what} is not implemented in the hook either`).toBe(true);
    }
  });

  test('it calls the existing cart plumbing rather than reimplementing it', () => {
    const src = read(HOOK);
    // The debounce, the serialized queue, cart status and persistence stay in
    // stores/cart.ts. A hook that grew its own setTimeout would be re-creating
    // a race-condition fix that already exists.
    expect(src).toMatch(/from\s*'@\/stores\/cart'/);
    expect(src, 'the hook grew its own debounce').not.toMatch(/setTimeout|debounce/i);
    expect(src, 'the hook grew its own fetch').not.toMatch(/fetch\s*\(/);
    expect(src, 'the hook writes cart state directly').not.toMatch(/\$cart\.set|\$cartStatus\.set/);
  });

  test('begin_checkout is NOT fired here — it stays where the totals settle', () => {
    // Moving it would change when it fires and would double-count against the
    // copy already in stores/cart.ts.
    expect(read(HOOK)).not.toContain('begin_checkout');
    expect(read('stores/cart.ts')).toContain("trackEvent('begin_checkout'");
  });

  test('exactly ONE add_to_cart call site exists in the whole island layer', () => {
    // Counted across every island, not just the two presentations: a third
    // presentation added later must reach the hook, not copy the block.
    const files = [
      'components/islands/BundleSelector.tsx',
      'components/islands/StickyAddToCart.tsx',
      'components/islands/CompactBuySelector.tsx',
      'components/islands/CartDrawer.tsx',
      'components/islands/parts/use-buy-action.ts',
      'components/islands/parts/use-selection.ts',
    ];
    const withEvent = files.filter((f) => read(f).includes("trackEvent('add_to_cart'"));
    expect(withEvent).toEqual(['components/islands/parts/use-buy-action.ts']);
  });

  test('the two presentations agree on the CTA because they share it, not because they match', () => {
    // The strongest available static statement: the CTA label, the disabled
    // flag and aria-busy are all READ, never computed, in both files.
    for (const [name, file] of PRESENTATIONS) {
      const src = read(file);
      expect(src, `${name} builds its own CTA label`).not.toMatch(/ctaLabel\s*=\s*(cta\.|soldOut|isPending)/);
      expect(src, `${name} builds its own disabled state`).not.toMatch(/ctaDisabled\s*=\s*(true|false|soldOut)/);
      expect(src, `${name} builds its own aria-busy`).not.toMatch(/ariaBusy\s*=\s*(true|false)/);
    }
  });
});

describe('CartDrawer is the documented exception, and stays one', () => {
  test('it edits an existing line and never decides add-to-cart vs checkout', () => {
    const src = read('components/islands/CartDrawer.tsx');
    // It is allowed syncCartLine (quantity steppers, remove).
    expect(src).toMatch(/syncCartLine\s*\(/);
    // It must NOT take on the buy decision: no availability check, no in-sync
    // comparison, no add_to_cart. If it ever needs those, it has become a
    // third presentation and belongs on the hook.
    //
    // (A certain flex utility name is deliberately NOT spelled anywhere in this
    // file. Tailwind v4 scans .ts SOURCE TEXT, comments included, so writing it
    // in ordinary prose injected a real rule into the production CSS bundle of
    // every generated landing. Caught by diffing the bundle against HEAD during
    // this refactor — and caught a SECOND time in the comment that first tried
    // to explain it. Prose in a test file is not free.)
    expect(src, 'CartDrawer grew an availability check').not.toMatch(/availableForSale/);
    expect(src, 'CartDrawer grew an in-sync check').not.toMatch(/line\.quantity\s*===/);
    expect(src, 'CartDrawer grew add_to_cart').not.toContain("trackEvent('add_to_cart'");
  });
});

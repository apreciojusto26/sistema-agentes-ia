// Scope-boundary contract test (spec R14 "Scope Boundaries", proposal's
// "Out of scope" list, design/design-addendum). Batch G — the final
// automated gate before Batch H's manual QA.
//
// This is a real, mechanical enforcement layer: every check below would
// FAIL if a future commit (or this one) actually crossed one of the
// boundaries the proposal drew. It is intentionally NOT prose assertion —
// each `it` block inspects the real filesystem, real git state, or the real
// admin/src source tree.
//
// Mechanism notes:
// - "unmodified by this change" is checked via `git status --porcelain`
//   against the CURRENT git state for the exact protected paths. As of this
//   batch, zero commits have been made for agents-dashboard (admin/ is
//   still untracked, content/landing-base has never been staged or
//   modified) — HEAD is therefore a valid "before this change" baseline.
//   `git status --porcelain -- <path>` catches both modified tracked files
//   AND newly added untracked files under that path, which a plain `git
//   diff` would miss for the untracked case.
// - "no auth/no prod-Redis" is checked via a static source-scan of every
//   real file under admin/src (mirroring the no-fake-spinner.test.ts and
//   no-duplicated-contract.test.ts convention already in this suite) —
//   grepping for the actual package names / env var names / route
//   keywords that would appear if someone added this, not a strawman.
// - "admin/ is a sibling, not nested" is a plain fs.existsSync path check.

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { describe, it, expect } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const ADMIN_SRC = path.join(REPO_ROOT, 'admin/src');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function gitPorcelain(relPaths: string[]): string {
  return execFileSync('git', ['status', '--porcelain', '--', ...relPaths], {
    cwd: REPO_ROOT,
    encoding: 'utf-8',
  });
}

// Zero-context diff against HEAD for a single file: only the actual
// added/removed lines, no surrounding unchanged lines and no @@ position
// numbers to keep the comparison content-based, not line-number-based.
function gitDiffNoContext(relPath: string): string {
  return execFileSync('git', ['diff', '-U0', 'HEAD', '--', relPath], {
    cwd: REPO_ROOT,
    encoding: 'utf-8',
  });
}

// Extracts every added ('+...') / removed ('-...') content line from a
// unified diff, in order, dropping the '+++'/'---' file-header lines and the
// '@@ ... @@' hunk-header lines. The leading +/- marker is kept so an added
// line and a removed line with identical text are still distinguishable.
function extractChangedLines(diffText: string): string[] {
  return diffText
    .split('\n')
    .filter(
      (line) =>
        (line.startsWith('+') || line.startsWith('-')) &&
        !line.startsWith('+++') &&
        !line.startsWith('---'),
    );
}

describe('scope-boundaries (Batch G — machine-checkable, spec R14)', () => {
  describe('boundary: admin/ is a sibling of content/landing-base, never nested inside it', () => {
    it('content/landing-base/admin does NOT exist', () => {
      // copyTemplate()'s EXCLUDE_DIRS only skips node_modules|dist|.astro|
      // .vercel|.git — an admin/ nested here would ship into every
      // generated outputs/{slug} landing.
      const nested = path.join(REPO_ROOT, 'content/landing-base/admin');
      expect(existsSync(nested)).toBe(false);
    });

    it('admin/ exists at repo root', () => {
      expect(existsSync(path.join(REPO_ROOT, 'admin'))).toBe(true);
      expect(existsSync(path.join(REPO_ROOT, 'admin/package.json'))).toBe(true);
    });
  });

  describe('boundary: no core-logic / checkout / commerce changes in content/landing-base', () => {
    // Proposal "Out of scope": content/landing-base core logic, components,
    // hooks, tracking, checkout, or commerce behavior. Design's real file
    // inventory (verified at design time) maps "checkout/commerce" onto
    // these concrete paths.
    //
    // AUTHORISED EXCEPTION — Design System Fase 5 (owner, 2026-08-22).
    //
    // `content/landing-base/src/lib/shopify/catalog.ts` was modified once,
    // deliberately, to delete a hardcoded product handle. Until then every
    // generated landing fetched the base template's star projector whatever
    // product it advertised, and `commerce.shopifyHandle` in the data layer
    // looked like the knob while being read by nobody. The replacement is
    // `resolveProductHandle()`, which fails closed and reads
    // PUBLIC_SHOPIFY_PRODUCT_HANDLE per landing. Its guard is
    // `catalog.handle.test.ts`, alongside it.
    //
    // AUTHORISED EXCEPTION — Design integrity & data-aware rendering (owner,
    // this phase).
    //
    // `content/landing-base/src/components/sections/10-reviews-reel.astro` was
    // modified deliberately, across two phases, and is now a ONE-LINE SHIM.
    //
    // It used to filter testimonials to `variant === 'reel'` and, when that
    // came back empty, render a full-width dark band with wave dividers and
    // carousel arrows around an empty track — shipped with build PASS and
    // validate PASS, because nothing in the stack was looking.
    //
    // Structural variants v1 moved that composition into
    // src/design-system/blocks/social-proof/ReviewsReel/Carousel.astro, its
    // sibling Grid.astro, and the reel-reviews.ts selector they share (which
    // carries the fail-closed backstop, once, for both). The registry points
    // at the blocks; this file now renders <Carousel /> and nothing else.
    //
    // It is NOT dead code and must not be deleted: design-system/test-fixtures/
    // LegacyIndex2074c93.astro is byte-locked to index.astro at HEAD 2074c93
    // and imports this path statically. legacy-render.golden.test.ts renders
    // that fixture against the live default-DesignSpec page and requires the
    // two to be BYTE-IDENTICAL — which is the mechanical proof that promoting
    // this legacy section to registry variants changed nothing for a
    // generation that passes no --design. That test passes.
    //
    // Its guards are admin/test/contract.design-integrity.test.ts and
    // content/landing-base/src/design-system/blocks/social-proof/ReviewsReel/
    // variants.render.test.ts.
    //
    // `content/landing-base/src/components/sections/04-gallery-strip.astro` is
    // the SAME arrangement, one capability later: media/GalleryStrip gained
    // strip|grid variants, its composition moved to
    // design-system/blocks/media/GalleryStrip/Strip.astro alongside Grid.astro
    // and the gallery-images.ts resolver they share (which owns the Shopify-
    // over-local precedence rule, and the fail-closed guard, once), and this
    // file became a one-line shim for the same byte-locked-fixture reason.
    // The golden test passes. Guards: contract.design-integrity.test.ts and
    // design-system/blocks/media/GalleryStrip/variants.render.test.ts.
    //
    // `content/landing-base/src/components/sections/09-ugc-strip.astro` is the
    // THIRD and last file under this arrangement: socialProof/UgcStrip gained
    // strip|grid variants, its composition moved to
    // design-system/blocks/social-proof/UgcStrip/Strip.astro alongside
    // Grid.astro and the ugc-items.ts accessor they share, and this file became
    // a one-line shim for the same byte-locked-fixture reason. The golden test
    // passes. Guards: contract.design-integrity.test.ts and
    // design-system/blocks/social-proof/UgcStrip/variants.render.test.ts.
    //
    // `content/landing-base/src/components/sections/08-faq.astro` is the
    // FOURTH file under this arrangement, and the first outside
    // socialProof/media: conversion/Faq gained accordion|open-list variants,
    // its composition moved to design-system/blocks/conversion/Faq/
    // Accordion.astro alongside OpenList.astro and the faq-items.ts accessor
    // they share, and this file became a one-line shim for the same
    // byte-locked-fixture reason. The golden test passes. Guards:
    // contract.design-integrity.test.ts and
    // design-system/blocks/conversion/Faq/variants.render.test.ts.
    //
    // `content/landing-base/src/components/sections/06-how-it-works.astro` is
    // the FIFTH file under this arrangement: product/HowItWorks gained
    // vertical-steps|horizontal-timeline variants, its composition moved to
    // design-system/blocks/product/HowItWorks/HorizontalTimeline.astro
    // alongside VerticalSteps.astro and the steps.ts accessor they share, and
    // this file became a one-line shim. The golden test passes. Guards:
    // contract.design-integrity.test.ts and
    // design-system/blocks/product/HowItWorks/variants.render.test.ts.
    //
    // `content/landing-base/src/components/sections/11-comparison.astro` is the
    // SIXTH file under this arrangement: product/Comparison gained table|cards
    // variants, its composition moved to
    // design-system/blocks/product/Comparison/Table.astro alongside Cards.astro
    // and the comparison-rows.ts module they share — which also owns the ONE
    // reading of `boolean | string`. This file became a one-line shim.
    //
    // From this phase on, a shim's markup is ALSO pinned against the frozen
    // 4732910 render by test-fixtures/legacy-markup/historical-markup.golden.test.ts,
    // which is the invariant legacy-render.golden.test.ts could never cover.
    // Guards: contract.design-integrity.test.ts,
    // design-system/blocks/product/Comparison/variants.render.test.ts, and that
    // historical golden.
    //
    // `content/landing-base/src/components/sections/03-hero.astro` is the
    // SEVENTH file under this arrangement, and the only one whose capability
    // also changed NAME: hero/Hero gained default|split variants by ABSORBING
    // hero/ProductHero/split, which stopped existing as a type. The legacy
    // collage composition moved to design-system/blocks/hero/Hero/Default.astro
    // alongside Split.astro (moved, not rewritten) and the hero-gallery.ts
    // accessor they share, and this file became a one-line shim.
    //
    // Three frozen references guard it, not one: Hero.html from 4732910, and
    // HeroSplitLeft.html / HeroSplitCenter.html from 19f60d5 — the commit that
    // introduced split. The split pair is frozen WITH a known defect (no
    // `#hero-end`, so the sticky CTA never appears on a split hero), because
    // this migration had to prove behaviour preservation before anything
    // functional moved. See "Hero split Sticky CTA anchor parity". Guards:
    // contract.design-spec.test.ts, contract.design-registry-parity.test.ts,
    // design-system/blocks/hero/Hero/variants.render.test.ts, and the
    // historical golden.
    //
    // `content/landing-base/src/components/sections/05-buy-box.astro` is the
    // EIGHTH file under this arrangement, and the first that mounts a commerce
    // island: conversion/BuyBox gained card|compact variants, the legacy
    // composition moved to design-system/blocks/conversion/BuyBox/Card.astro
    // beside Compact.astro and the buy-box-data.ts accessor they share, and
    // this file became a one-line shim.
    //
    // `content/landing-base/src/components/islands/CompactBuySelector.tsx` is
    // NEW under the same protected path, and it is the reason the boundary is
    // worth reading twice. It is a PRESENTATION, not a transaction: every
    // commercial decision it makes arrives from parts/use-buy-action.ts, and
    // parts/buy-action.contract.test.ts fails if it ever re-derives one. The
    // alternative — a `presentation` prop branching BundleSelector's whole DOM
    // — was rejected because it would have made propsSchema a disguised
    // variant, the exact taxonomy this design system spent eight capabilities
    // establishing.
    //
    // Its guards: the historical golden (BuyBox.html, verified against a
    // worktree at 4732910 rather than assumed), legacy-render.golden.test.ts,
    // buy-action.contract.test.ts, and
    // design-system/blocks/conversion/BuyBox/variants.render.test.ts.
    //
    // `content/landing-base/src/components/sections/07-featured-testimonial.astro`
    // is the NINTH file under this arrangement, and the only one so far that
    // shrank the registry instead of growing it. socialProof/FeaturedTestimonial
    // ABSORBED socialProof/FeaturedQuote — one composition, one variant, and a
    // `tone` prop with three values — so this file became a one-line shim and
    // blocks/social-proof/FeaturedQuote/ was deleted outright.
    //
    // The tone enum gained `plain`, and that is what makes this shim safe: the
    // legacy section drew NO background, which neither `light` nor `muted`
    // could express. Without it the historical composition would have become
    // unreachable and every legacy generation would have quietly gained a
    // surface. `plain` is also the block's default, so an omitted prop cannot
    // drift either.
    //
    // Guards: FeaturedTestimonial.html — LITERALLY the 4732910 render, produced
    // in a worktree at that commit rather than re-derived from today's code —
    // plus legacy-render.golden.test.ts and the structural evidence in
    // design-system/blocks/blocks.render.test.ts, which fails if the three
    // tones ever stop emitting an identical tag sequence. That last one is the
    // inverse of the Hero evidence above: `align` had to CHANGE the markup to
    // earn its prop; `tone` has to leave the structure alone to keep its own.
    //
    // `content/landing-base/src/components/sections/12-guarantee.astro` is the
    // TENTH file under this arrangement, and the one whose merge also FIXED a
    // shipped defect rather than only removing a duplicate.
    // conversion/Guarantee absorbed conversion/ProductGuarantee — one
    // composition, one variant, a `tone` dial of gold | plain — and
    // blocks/conversion/ProductGuarantee/ was deleted outright.
    //
    // Both types had carried id={SECTION_ANCHORS.Guarantee}. A DesignSpec
    // naming both validated, built, and served a page with TWO id="guarantee"
    // elements repeating the same guarantee word for word, with the footer's
    // href="#guarantee" resolving to whichever came first. That was verified by
    // generating and building such a landing, not inferred. Deleting the
    // duplicate type is what makes the combination unrepresentable; no
    // incompatibleWith rule was added, because there is nothing left to forbid.
    //
    // `gold` is the legacy surface AND the default, and two details resolved in
    // the BASELINE's favour to keep it byte-identical: the section literal keeps
    // the legacy class order, and the gold heading carries no colour class.
    // ProductGuarantee had added `text-graphite` there, which global.css already
    // applies to `body` — a visual no-op that would still have changed the bytes
    // of every legacy generation.
    //
    // Guards: Guarantee.html, derived reproducibly as the 4732910 render plus
    // the single `id` attribute 224a71b added, with the hand-edited result
    // verified byte-identical to a live HEAD render; the anchor-collision
    // assertions in historical-markup.golden.test.ts and
    // renderer.integration.test.ts; and the structural evidence in
    // blocks.render.test.ts.
    //
    // `content/landing-base/src/components/sections/01-utility-bar.astro` is
    // the ELEVENTH file under this arrangement, and the first that is not a
    // design-system conversion at all.
    //
    // Its trust ticker is sticky on EVERY page of the landing, legal pages
    // included, and the Content Agent used to write the whole array. That is
    // how /legal/devoluciones ended up displaying "Garantía de 30 días" in its
    // own header while its body, correctly reading merchant.returnsWindowDays,
    // said "Disponés de 14 días" — one page contradicting itself on one screen.
    //
    // The policy half of the ticker is derived from merchant config now, through
    // the same lib/policy.ts builders that Guarantee, BuyBox, the policy FAQ and
    // the legal pages use. product.trustTicker keeps the product copy. The two
    // are concatenated at the render site rather than merged upstream, so no
    // single array exists for a model to write a policy claim into.
    //
    // Guards: contract.commercial-policy.test.ts (no renderer may read
    // product.guarantee or product.shipping, every policy surface goes through
    // lib/policy, no shipped asset carries a baked policy), lib/policy.test.ts,
    // and the Guarantee / BuyBox / Faq historical goldens, all three updated by
    // hand with the removed claim and its deterministic replacement written out.
    //
    // `content/landing-base/src/components/sections/13-real-results.astro` is
    // the TWELFTH file under this arrangement and the only DELETION.
    //
    // socialProof/RealResults was the last legacy capability. It was not
    // promoted: it rendered a five-bar rating histogram from
    // product.ratingBreakdown, a field with no canonical source, above a UGC
    // grid rendering the same product.ugc entries as socialProof/UgcStrip —
    // which the default DesignSpec already composed at order 6, so every legacy
    // landing showed that collection twice, once framed as "Resultados reales".
    //
    // Nothing replaced it. Fewer sections is the correct outcome when one of
    // them duplicated another's data under a claim the data does not support,
    // and the hardcoded headings went with it rather than moving to UgcStrip.
    //
    // With it gone the registry has 21 capabilities and ZERO entries resolving
    // to components/sections — asserted by measurement in
    // contract.design-spec.test.ts, not by a hand-written list. The `legacy()`
    // helper in both registry mirrors was deleted with its last caller.
    //
    // Guards: the byte-lock on test-fixtures/LegacyIndex2074c93.astro, updated
    // BY HAND for the second time (first was the consent phase) with both the
    // fixture header and the sha comment recording what left and why.
    //
    // NO PATH IS EXEMPTED HERE, ON PURPOSE. This assertion measures WORKING
    // TREE dirtiness (`git status --porcelain`), not history, so once that
    // change is committed these files are clean again and the boundary holds
    // exactly as before — with no hole carved into it. Adding an ignore entry
    // would have turned src/lib/shopify into a permanently editable zone to
    // "fix" a condition that resolves itself on commit. The authorisation is
    // recorded here as history; the guardrail keeps its full strength.
    //
    // THIS TEST IS EXPECTED TO BE RED until the phase is committed. That is
    // the mechanism working, not a regression — and it is exactly why the
    // exception is written down here instead of being coded around.
    const protectedRelPaths = [
      'content/landing-base/src/components',
      'content/landing-base/src/lib/kv.ts',
      'content/landing-base/src/lib/shopify',
      'content/landing-base/src/lib/sumup',
      'content/landing-base/src/pages/api',
    ];

    it('all protected content/landing-base paths exist (guarding against a stale/renamed path silently no-op-ing this test)', () => {
      for (const rel of protectedRelPaths) {
        expect(existsSync(path.join(REPO_ROOT, rel)), `${rel} should exist`).toBe(true);
      }
    });

    it('git reports zero modified/untracked files under any protected path (src/components, kv.ts, lib/shopify, lib/sumup, pages/api)', () => {
      const output = gitPorcelain(protectedRelPaths);
      expect(output.trim()).toBe('');
    });
  });

  describe('boundary: no authentication/authorization surface added to admin/', () => {
    const AUTH_DEP_NAMES = [
      'passport',
      'jsonwebtoken',
      'next-auth',
      'bcrypt',
      'bcryptjs',
      'argon2',
      '@fastify/jwt',
      '@fastify/auth',
      '@fastify/session',
      '@fastify/cookie',
      'express-session',
    ];

    it('admin/package.json declares no auth-related dependency', () => {
      const pkg = JSON.parse(readFileSync(path.join(REPO_ROOT, 'admin/package.json'), 'utf-8'));
      const allDeps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
      const offenders = AUTH_DEP_NAMES.filter((name) => name in allDeps);
      expect(offenders).toEqual([]);
    });

    it('no file under admin/src imports/references an auth library, session cookie, JWT, or bearer-token handling', () => {
      const files = walk(ADMIN_SRC);
      const authPattern =
        /\b(passport|jsonwebtoken|next-auth|bcrypt|argon2|authorization\s*:\s*['"]?bearer|set-cookie|req\.session|reply\.session)\b/i;
      const offenders = files
        .filter((f) => authPattern.test(readFileSync(f, 'utf-8')))
        .map((f) => path.relative(REPO_ROOT, f));
      expect(offenders).toEqual([]);
    });

    it('no route file under admin/src/server/routes implements a login/signup/session endpoint', () => {
      const routesDir = path.join(ADMIN_SRC, 'server/routes');
      const files = existsSync(routesDir) ? walk(routesDir) : [];
      const loginRoutePattern = /['"`]\/(api\/)?(login|logout|signup|signin|session|auth)\b/i;
      const offenders = files
        .filter((f) => loginRoutePattern.test(readFileSync(f, 'utf-8')))
        .map((f) => path.relative(REPO_ROOT, f));
      expect(offenders).toEqual([]);
    });
  });

  describe('boundary: admin/ never reads/writes the production Upstash Redis instance', () => {
    it('admin/package.json declares no @upstash/redis (or any redis client) dependency', () => {
      const pkg = JSON.parse(readFileSync(path.join(REPO_ROOT, 'admin/package.json'), 'utf-8'));
      const allDeps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
      const offenders = Object.keys(allDeps).filter((name) => /redis/i.test(name));
      expect(offenders).toEqual([]);
    });

    it('no file under admin/src imports @upstash/redis or references the production Redis env var names', () => {
      const files = walk(ADMIN_SRC);
      const redisPattern = /@upstash\/redis|UPSTASH_REDIS_REST_URL|UPSTASH_REDIS_REST_TOKEN/;
      const offenders = files
        .filter((f) => redisPattern.test(readFileSync(f, 'utf-8')))
        .map((f) => path.relative(REPO_ROOT, f));
      expect(offenders).toEqual([]);
    });

    it('content/landing-base/src/lib/kv.ts (the real Redis client) is not imported from anywhere under admin/src', () => {
      const files = walk(ADMIN_SRC);
      const offenders = files
        .filter((f) => /content\/landing-base\/src\/lib\/kv(\.ts)?['"]/.test(readFileSync(f, 'utf-8')))
        .map((f) => path.relative(REPO_ROOT, f));
      expect(offenders).toEqual([]);
    });
  });

  describe('boundary: content-agent — the Scope tripwire made mechanical (proposal Scope tripwire, design §7 J5)', () => {
    // History of the first `it` in this block (do not delete this note when
    // editing the tripwire again — it is the reason the mechanism looks the
    // way it does):
    //
    // 1. Content Agent SDD change introduced a blunt assertion here:
    //    `git status --porcelain` on content-contract.mjs must be empty,
    //    i.e. the file must be COMPLETELY untouched by that change. Its own
    //    header comment already flagged this as a POINT-IN-TIME guard valid
    //    only "as of this batch" (nothing had been committed for admin/ yet,
    //    so HEAD was a valid "before this change" baseline).
    // 2. Product Identity + Generation Isolation's own Batch 4 legitimately
    //    needed to touch content-contract.mjs (task 4.1: optional top-level
    //    `productId` format check via `isProductId`, design #423 D1) — and
    //    the sub-agent that implemented it DELETED the whole assertion
    //    instead of narrowing it. The project owner rejected that: deleting
    //    a guardrail because it's inconvenient for one authorized change
    //    defeats its purpose for every future UNauthorized one.
    // 3. This restores a REAL tripwire, narrowed instead of removed: it
    //    still inspects real git output (same `-- <path>` convention as
    //    every other check in this file), but instead of demanding zero
    //    diff, it demands the diff be EITHER empty OR line-for-line
    //    identical to the exact, reviewed Fase 4 addition below. Any other
    //    change — a different rewording, an unrelated edit anywhere else in
    //    the file, a partially-applied version of the same addition — is a
    //    different line sequence and therefore still fails, exactly like
    //    the original all-or-nothing check did for anything at all.
    //
    // Scope note: the ORIGINAL tripwire (see git history of this file, the
    // "add Gemini-powered content generation agent" commit) covered ONLY
    // `scripts/lib/content-contract.mjs` — it never checked
    // `scripts/lib/content-contract.d.mts`. That narrower historical scope
    // is preserved here deliberately; this tripwire does not extend to the
    // `.d.mts` file.
    it('scripts/lib/content-contract.mjs diff against HEAD is either empty, or is EXACTLY the reviewed Fase 4 productId addition (design #423 D1, task 4.1) — pinned line-for-line, nothing else is permitted', () => {
      // The exact, reviewed diff for task 4.1 (design #423 D1): the
      // `isProductId` import, the header-comment note, the new private
      // `collectTopLevelIssues()` helper (format-only check for the
      // OPTIONAL top-level `productId`, error code 'product-id-invalid'),
      // and its two call sites in `collectContentErrors`/`validateContent`.
      // This is a real pin against `git diff -U0 HEAD`, not a keyword
      // allowlist — any future change to this file, even one that also
      // concerns `productId`, is "not contemplated" until this pin is
      // deliberately updated alongside its own SDD review.
      const EXPECTED_PRODUCT_ID_DIFF_LINES = [
        '+//',
        '+// Product identity (design "Product Identity + Generation Isolation", Fase 4):',
        '+// an OPTIONAL top-level `productId` is format-checked here (never required —',
        '+// absence is never an error). It rides top-level, NEVER inside `product` —',
        '+// ALLOWED_PRODUCT_FIELDS / the product.* whitelist is intentionally untouched.',
        '+',
        "+import { isProductId } from './product-id.cjs';",
        '+// Format-only check for the OPTIONAL top-level `productId` (design D1):',
        '+// absent => never an error; present => must match PRODUCT_ID_RE via',
        '+// isProductId. Runs first in both collect-all and fail-fast so the FIRST',
        '+// issue in either mode stays in sync (see header comment on check order).',
        '+function collectTopLevelIssues(input) {',
        '+  const issues = [];',
        '+  if (input.productId !== undefined && !isProductId(input.productId)) {',
        '+    issues.push({',
        "+      code: 'product-id-invalid',",
        "+      path: 'productId',",
        '+      message: `content.json "productId" is present but invalid: expected format prd_{base36ts}-{rand8}, got ${JSON.stringify(input.productId)}`,',
        '+    });',
        '+  }',
        '+  return issues;',
        '+}',
        '+',
        '+  issues.push(...collectTopLevelIssues(input));',
        '+',
        '+  throwFirst(collectTopLevelIssues(input));',
        '+',
      ];

      // SECOND authorised diff — Design integrity & data-aware rendering
      // (owner, this phase). NARROWED, NOT DELETED: the note above records
      // that a previous sub-agent deleted this whole assertion rather than
      // narrow it, and the owner rejected that. So this addition is pinned
      // line-for-line exactly like the Fase 4 one, and any change that is not
      // one of these two reviewed sequences still fails.
      //
      // What it authorises, and why:
      //   - TESTIMONIAL_VARIANTS: one constant that drives the enum check, the
      //     new coverage rule and the Content Agent's prompt, so the three can
      //     never disagree. 'card' is dropped from it — no component in the
      //     template or in any generated landing ever selected that variant.
      //   - the coverage loop: membership alone accepted 1 quote + 3 card +
      //     ZERO reel, which is contract-valid and renders 10-reviews-reel as
      //     an empty carousel inside a full-width dark band.
      const EXPECTED_DESIGN_INTEGRITY_DIFF_LINES = [
        "+",
        "+/**",
        "+ * The testimonial variants the RENDERER actually consumes. Every entry here is",
        "+ * backed by a real selector in a real component \u2014 verified repo-wide:",
        "+ *",
        "+ *   'quote' -> 07-featured-testimonial.astro          `.find(t => t.variant === 'quote')`",
        "+ *              social-proof/FeaturedQuote/Default.astro  (same selector)",
        "+ *   'reel'  -> 10-reviews-reel.astro                  `.filter(t => t.variant === 'reel')`",
        "+ *",
        "+ * `'card'` USED TO BE HERE and was removed: no component in the template or in",
        "+ * any generated landing ever selected it. Three of the four testimonials the",
        "+ * first live generation produced were `card` \u2014 perfectly contract-valid, and",
        "+ * rendered by nothing. Data the system accepts but can never display is not a",
        "+ * feature, it is a silent budget leak on every Gemini call.",
        "+ *",
        "+ * Adding a variant back here is only correct once a component selects it.",
        "+ * This list drives THREE things \u2014 the enum check, the coverage rule, and the",
        "+ * Content Agent's prompt \u2014 so it can never drift from what ships.",
        "+ */",
        "+export const TESTIMONIAL_VARIANTS = ['quote', 'reel'];",
        "-    if (!['quote', 'card', 'reel'].includes(item.variant)) {",
        "+    if (!TESTIMONIAL_VARIANTS.includes(item.variant)) {",
        "-        message: `testimonials[${i}].variant must be 'quote' | 'card' | 'reel', got \"${item.variant}\"`,",
        "+        message: `testimonials[${i}].variant must be ${TESTIMONIAL_VARIANTS.map((v) => `'${v}'`).join(' | ')}, got \"${item.variant}\"`,",
        "+",
        "+  // COVERAGE, not just membership. The enum check above accepts a set of",
        "+  // testimonials that is 100% valid and still leaves a section empty: the",
        "+  // first live generation returned 1 quote + 3 card + ZERO reel, so",
        "+  // 10-reviews-reel.astro rendered its dark band, its wave dividers and its",
        "+  // carousel arrows around an empty track. Membership was never the",
        "+  // guarantee the renderer needed \u2014 coverage is.",
        "+  //",
        "+  // Emitted as a per-variant issue so the Content Agent's retry loop gets a",
        "+  // correction it can act on (\"falta reel\"), not a vague rejection.",
        "+  for (const variant of TESTIMONIAL_VARIANTS) {",
        "+    if (!testimonials.some((t) => t.variant === variant)) {",
        "+      issues.push({",
        "+        code: 'testimonials-variant-uncovered',",
        "+        path: 'testimonials',",
        "+        message:",
        "+          `content.json \"testimonials\" has no entry with variant \"${variant}\". ` +",
        "+          `Every variant in the contract is rendered by a real section, so a missing one ` +",
        "+          `ships a visibly empty section. Add at least one testimonial with variant \"${variant}\".`,",
        "+        variant,",
        "+      });",
        "+    }",
        "+  }",
        "+",
      ];

      const diffLines = extractChangedLines(gitDiffNoContext('scripts/lib/content-contract.mjs'));

      if (diffLines.length === 0) {
        // Clean against HEAD (e.g. once this batch's changes are committed
        // and this pin becomes the new baseline) — satisfies the original
        // "unmodified" invariant going forward.
        expect(diffLines).toEqual([]);
        return;
      }

      // THIRD authorised diff — Generated Landing Completeness (owner, this
      // phase). Narrowed, never deleted, same as the two above.
      //
      // What it authorises, and why each one is a REMOVAL of a fabricated
      // claim rather than a new capability:
      //   - `verified` leaves TESTIMONIAL_REQUIRED_FIELDS. CanonicalReview has
      //     no verification signal at all — product-normalizer.mjs's
      //     projectReview() projects five keys and its own comment names
      //     `verified` and `purchaseVerified` among the fields it refuses to
      //     let through. A REQUIRED boolean with no provenance is a field the
      //     model must invent, and it was rendering as a gold "Compra
      //     verificada" badge on every generated landing.
      //   - `location` leaves TESTIMONIAL_ALL_FIELDS, for the same reason with
      //     worse evidence: every city ever rendered was copied out of the
      //     few-shot example.
      //   - `comparisonRival` joins ALLOWED_PRODUCT_FIELDS. This one ADDS a
      //     field, and it exists to delete a hardcoded claim: the comparison
      //     heading was the template literal
      //     `${brand} vs. lámparas decorativas comunes`, so every landing
      //     claimed to beat a decorative lamp whatever it actually sold.
      const EXPECTED_COMPLETENESS_DIFF_LINES = [
        "-  'specs', 'packs', 'gallery', 'steps', 'comparison',",
        "+  'specs', 'packs', 'gallery', 'steps', 'comparison', 'comparisonRival',",
        "-export const TESTIMONIAL_REQUIRED_FIELDS = ['id', 'author', 'rating', 'date', 'body', 'verified', 'variant'];",
        "+// `verified` WAS here and was removed (D1). CanonicalReview carries no",
        "+// verification signal at all — product-normalizer.mjs's projectReview()",
        "+// projects exactly five keys and its own comment names `verified` and",
        "+// `purchaseVerified` among the fields it refuses to let through. A required",
        "+// boolean with no provenance is a field the model has to invent, and every",
        "+// generated landing was rendering it as a gold \"Compra verificada\" badge.",
        "+//",
        "+// If the scraper ever captures a real signal, it comes back as an OPTIONAL",
        "+// `purchaseVerified` with explicit provenance — a separate change, not this one.",
        "+export const TESTIMONIAL_REQUIRED_FIELDS = ['id', 'author', 'rating', 'date', 'body', 'variant'];",
        "-export const TESTIMONIAL_ALL_FIELDS = ['id', 'author', 'location', 'rating', 'date', 'title', 'body', 'verified', 'variant'];",
        "+// `location` left too (D2), for the same reason and with worse evidence: it is",
        "+// absent from CanonicalReview, so every \"· Mendoza\" ever rendered was copied",
        "+// out of the few-shot example. Being OPTIONAL did not make it honest — it made",
        "+// it invisible.",
        "+export const TESTIMONIAL_ALL_FIELDS = ['id', 'author', 'rating', 'date', 'title', 'body', 'variant'];",
      ];

      // FOURTH authorised diff — the FeaturedTestimonial/FeaturedQuote merge.
      // ONE comment line, and it is a documentation REPAIR, not a contract
      // change: no constant moves, no field is added or removed, and
      // TESTIMONIAL_VARIANTS is untouched.
      //
      // This block claims each variant is "backed by a real selector in a real
      // component — verified repo-wide". socialProof/FeaturedQuote was absorbed
      // into socialProof/FeaturedTestimonial and its file deleted, so the line
      // named a path that no longer exists. A comment whose whole authority is
      // "verified repo-wide" cannot be allowed to point at a deleted file; the
      // selector itself is unchanged and still lives in the surviving block.
      const EXPECTED_FEATURED_TESTIMONIAL_MERGE_DIFF_LINES = [
        "- *              social-proof/FeaturedQuote/Default.astro  (same selector)",
        "+ *              social-proof/FeaturedTestimonial/Default.astro (same selector)",
      ];

      // FIFTH authorised diff — commercial policy consistency.
      //
      // `guarantee` and `shipping` LEAVE ALLOWED_PRODUCT_FIELDS. Like the third
      // diff above, every line of this is a REMOVAL of a claim nobody
      // configured, not a new capability:
      //
      //   - guarantee.{days,title,text,points}. CanonicalProduct carries no
      //     guarantee signal, the system instruction had no rule about one, and
      //     the only thing shaping the output was the few-shot's `days: 30`.
      //     Meanwhile merchant.returnsWindowDays said 14, so a landing asserted
      //     "Garantía de 30 días" above a returns page reading "14 días" — and
      //     the trust ticker put the 30 into the header of that very page.
      //     The object also promised conditions no field states at all
      //     ("Reembolso completo, sin preguntas").
      //
      //   - shipping.etaLabel. Same shape: product-normalizer.mjs has no
      //     shipping signal, so every "Envío en 24-48h" came from the example
      //     too. It is merchant.shippingEtaLabel now.
      //
      //   - shipping.freeOverCents. REQUIRED of the model, invented, and
      //     rendered by NOTHING — the same dead-field class as `verified` and
      //     `location` before it.
      //
      // `badges` and `trustTicker` deliberately STAY. The policy half of both
      // is derived in lib/policy.ts and concatenated at the render site, so the
      // model keeps its product copy and has no array to write a policy claim
      // into.
      const EXPECTED_POLICY_CONSISTENCY_DIFF_LINES = [
        "+// `guarantee` and `shipping` WERE here and are both gone (commercial policy",
        "+// consistency). Neither was ever a product fact:",
        "+//",
        "+//   guarantee.{days,title,text,points} \u2014 CanonicalProduct carries no guarantee",
        "+//     signal, the system instruction had no rule about one, and the only thing",
        "+//     shaping the output was the few-shot example's `days: 30`. Meanwhile",
        "+//     merchant.returnsWindowDays said 14. The whole object was the model",
        "+//     writing the merchant's commercial policy for it, including conditions",
        "+//     nobody configured (\"Reembolso completo, sin preguntas\").",
        "+//",
        "+//   shipping.etaLabel \u2014 same story. product-normalizer.mjs has no shipping",
        "+//     signal at all, so every \"Env\u00edo en 24-48h\" came from the example too. It",
        "+//     is merchant.shippingEtaLabel now.",
        "+//",
        "+//   shipping.freeOverCents \u2014 REQUIRED of the model, invented, and rendered by",
        "+//     NOTHING. Same dead-field class as `verified` and `location` before it.",
        "+//     Removed rather than kept \"just in case\"; the free-shipping claim still",
        "+//     reached visitors, but through trustTicker prose, not this field.",
        "+//",
        "+// `badges` and `trustTicker` STAY, and are now product-only. The policy half of",
        "+// both is derived in landing-base/src/lib/policy.ts and concatenated at the",
        "+// render site, so the model has no array to write a policy claim into.",
        "-  'guarantee', 'shipping', 'ugc', 'cta', 'variantGroupLabel', 'errors',",
        "+  'ugc', 'cta', 'variantGroupLabel', 'errors',",
      ];

      // SIXTH authorised diff — the RealResults integrity removal.
      //
      // `ratingBreakdown` leaves ALLOWED_PRODUCT_FIELDS, and ratingAverage /
      // ratingCount leave the MODEL's authority without leaving content.json.
      //
      //   ratingBreakdown had NO canonical source at all. product-normalizer.mjs
      //   projects socialProof.rating and socialProof.reviewCount, both nullable,
      //   and nothing resembling a distribution — so the five-bar histogram in
      //   13-real-results.astro came from the few-shot's 180/22/8/3/1 and from
      //   free invention. A fabricated statistic drawn as a chart, which reads
      //   as data rather than as marketing. It is NOT replaced by a distribution
      //   computed from the average: an average does not determine one, and
      //   picking a plausible breakdown is fabrication with extra steps.
      //
      //   ratingAverage / ratingCount DO have canonical sources, which sat
      //   unused while every landing displayed whatever the example had taught.
      //   They move to MODEL_UNAUTHORED_PRODUCT_FIELDS: still accepted in
      //   content.json, never requested, and overwritten by generate-content.mjs
      //   from the canonical product in the same `save` stage that re-stamps
      //   productId. Null is propagated, not patched.
      const EXPECTED_RATING_PROVENANCE_DIFF_LINES = [
        "+// `ratingBreakdown` WAS here and is GONE. It rendered a five-bar histogram in",
        "+// 13-real-results.astro, and it had NO canonical source at all:",
        "+// product-normalizer.mjs projects socialProof.rating and socialProof.reviewCount",
        "+// (both nullable) and nothing resembling a distribution. The bars came from the",
        "+// few-shot's 180/22/8/3/1 and from free invention \u2014 a fabricated statistic drawn",
        "+// as a chart, which reads as data rather than as marketing.",
        "+//",
        "+// It is NOT replaced by a distribution computed from the average. An average",
        "+// does not determine a distribution: 4.9 is consistent with infinitely many",
        "+// breakdowns, and picking a plausible one is fabrication with extra steps.",
        "+//",
        "+// `ratingAverage` and `ratingCount` STAY in content.json but leave the model's",
        "+// authority \u2014 see REQUIRED_PRODUCT_FIELDS below. They have real canonical",
        "+// sources and are projected onto the content deterministically.",
        "-  'ratingAverage', 'ratingCount', 'ratingBreakdown',",
        "+  'ratingAverage', 'ratingCount',",
        "-// errors has a sane default (translation-only field) so it's not required input.",
        "-export const REQUIRED_PRODUCT_FIELDS = ALLOWED_PRODUCT_FIELDS.filter((f) => f !== 'errors');",
        "+// Fields the model is NOT asked for.",
        "+//",
        "+//   errors            has a sane default (translation-only field).",
        "+//   ratingAverage     PROJECTED from CanonicalProduct.socialProof.rating.",
        "+//   ratingCount       PROJECTED from CanonicalProduct.socialProof.reviewCount.",
        "+//",
        "+// The two rating fields are accepted in ALLOWED_PRODUCT_FIELDS because they end",
        "+// up in content.json, but generate-content.mjs overwrites whatever the model",
        "+// wrote with the canonical values, so the model has no authority over them. It",
        "+// used to invent both: the scraper's real rating and review count sat unused in",
        "+// CanonicalProduct while the landing displayed whatever the few-shot had taught.",
        "+export const MODEL_UNAUTHORED_PRODUCT_FIELDS = ['errors', 'ratingAverage', 'ratingCount'];",
        "+export const REQUIRED_PRODUCT_FIELDS = ALLOWED_PRODUCT_FIELDS.filter(",
        "+  (f) => !MODEL_UNAUTHORED_PRODUCT_FIELDS.includes(f),",
        "+);",
      ];

      // EXACTLY one of the reviewed sequences. Not a union, not a superset:
      // a partially-applied or reworded version of either is a different line
      // sequence and still fails, exactly as the all-or-nothing check did.
      expect(

        [
          EXPECTED_PRODUCT_ID_DIFF_LINES,
          EXPECTED_DESIGN_INTEGRITY_DIFF_LINES,
          EXPECTED_COMPLETENESS_DIFF_LINES,
          EXPECTED_FEATURED_TESTIMONIAL_MERGE_DIFF_LINES,
          EXPECTED_POLICY_CONSISTENCY_DIFF_LINES,
          EXPECTED_RATING_PROVENANCE_DIFF_LINES,
        ],
        'content-contract.mjs diff matches no reviewed change',
      ).toContainEqual(diffLines);
    });

    it('admin/package.json declares exactly the pre-existing dependency set — no new runtime dependency for the Gemini call', () => {
      const pkg = JSON.parse(readFileSync(path.join(REPO_ROOT, 'admin/package.json'), 'utf-8'));
      expect(pkg.dependencies).toEqual({ fastify: pkg.dependencies.fastify, '@fastify/static': pkg.dependencies['@fastify/static'] });
      expect(Object.keys(pkg.dependencies).sort()).toEqual(['@fastify/static', 'fastify']);
    });

    it('no file under admin/src or scripts/ references a Gemini SDK, axios, or dotenv — raw fetch only', () => {
      const files = [...walk(ADMIN_SRC), ...walk(path.join(REPO_ROOT, 'scripts'))];
      const bannedPattern = /@google\/genai|['"]axios['"]|['"]dotenv['"]/;
      const offenders = files
        .filter((f) => bannedPattern.test(readFileSync(f, 'utf-8')))
        .map((f) => path.relative(REPO_ROOT, f));
      expect(offenders).toEqual([]);
    });
  });
});

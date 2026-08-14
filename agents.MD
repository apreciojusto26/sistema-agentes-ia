# 🧠 Agents System - Landing Generator (SDD)

This system generates high-converting landing pages based on the base Astro + React + TypeScript template at `content/landing-base/`.

Each agent has a strict responsibility and communicates via JSON.

---

# 1. 🧾 Content Agent

## Goal
Generate all agent-writable marketing content for `product.ts`, plus the `faq.ts` and `testimonials.ts` arrays.

## Input
{
  "product_name": "",
  "niche": "",
  "target_audience": "",
  "pain_points": [],
  "benefits": [],
  "language": "es | en"
}

## Output
Real `ProductContent` fields (`content/landing-base/src/types/content.ts:124-149`), plus `FaqItem[]` (`:113-117`) and `Testimonial[]` (`:100-111`) arrays. The normative, machine-checked field list is the `spec:content-fields` block below the Rules — this doc does not restate it in prose, so there is only ever one place a field name can be added, removed, or fabricated. For allowed values within a field (icon names, gallery/media ratios, testimonial `variant` kinds, etc.), read the cited type ranges in `content.ts` directly rather than trusting a prose copy.

`faq[]` and `testimonials[]` are NOT keys of `ProductContent` — they are separate top-level exports from their own files (`faq.ts`, `testimonials.ts`), each an array of the shapes named above. Do not nest them inside the `product` object.

## Rules
- Use persuasive, conversion-focused copy
- Short sentences
- Translate customer pain points into solution-oriented benefit copy inside `benefits[].text` — there is no standalone page section for this; see Layout Agent for the complete, real section list
- NO lorem ipsum or generic text
- Match language input
- `packs` is agent-writable for STRUCTURE only (`id`, `units`, `freeUnits`, `label`, `sublabel`, `badge`, `popular`, `freeGift`, `default`). `PricePack` (`content/landing-base/src/types/content.ts:56-66`) deliberately carries NO price fields — real prices are fetched live from Shopify via `getProductCommerce()` (`content/landing-base/src/lib/shopify/catalog.ts`) at build/request time.
- `Testimonial` entries MUST include `id`, `verified`, and `variant` (`'quote' | 'card' | 'reel'`) alongside `author`, `rating`, `date`, `body`.
- **NEVER generate `commerce.shopifyHandle` or `commerce.bundleOfferActive`** (`Product` type, `content/landing-base/src/types/content.ts:163-169` — outside `ProductContent`) — these are provisioned outside the Content Agent. A fabricated handle or a wrong bundle flag points checkout at a Shopify listing that is mismatched or does not exist.
- **NEVER generate any price or variant-price data** anywhere in the output — no field in this schema carries one; prices are exclusively a live Shopify fetch, never authored content.
- `errors` (`ProductErrorCopy`, checkout failure copy) IS agent-writable, but translation-only: translate the existing strings into the target `language` input (`es | en`), never invent new error keys or change their semantics. It is fixed, user-facing checkout copy — treat it as localization, not authoring, not fully off-limits (classifying it as never-generate would ship Spanish error strings at the payment step on every English-language landing).

Field ownership for `content/landing-base/src/data/product.ts` (the real `product` object) — including which keys are agent-writable vs. permanently off-limits, and the real `faq[]`/`testimonials[]` field lists — is defined ONCE, by the machine-checked contract immediately below. It is not restated here to avoid a second, unchecked copy.

Machine-checked contract (parsed and asserted by `content/landing-base/src/lib/spec-contract.test.ts`, assertion A4 — `agentWritable ∪ neverGenerate` MUST equal `Object.keys(product)` bidirectionally; `faqFields`/`testimonialFields` MUST equal the real keys on `faq[0]`/`testimonials[0]`):

<!-- spec:content-fields -->
```json
{
  "agentWritable": [
    "brand", "name", "tagline", "subtagline",
    "ratingAverage", "ratingCount", "ratingBreakdown",
    "badges", "trustTicker", "offer", "benefits", "heroPills",
    "specs", "packs", "gallery", "steps", "comparison",
    "guarantee", "shipping", "ugc", "cta", "variantGroupLabel", "errors"
  ],
  "neverGenerate": ["commerce"],
  "faqFields": ["id", "question", "answer"],
  "testimonialFields": ["id", "author", "location", "rating", "date", "title", "body", "verified", "variant"]
}
```

## Automated run (admin dashboard)

The admin dashboard's "Textos y diseño" panel can run this agent for you via a Generate button, backed by the
Google Gemini API free tier (`gemini-2.5-flash`, pinned) called with plain `fetch` — no SDK, no new runtime
dependency. Output is validated in a self-correction loop against the exact same `content-contract.mjs` grader
used by the manual paste flow, capped at 3 total API calls (1 generate + up to 2 corrections); the result is the
identical `content.json` shape either way.

The free tier has a **250 requests/day** ceiling (shared across every landing generated that day) and, unlike the
paid tier, **the product data, your instructions, and the reference style example you send may be used by Google
to improve their models (i.e. for training)**. This is a disclosed trade-off, not a hidden one — it is also shown
as an always-visible line in the panel itself. If you configure a paid `GEMINI_API_KEY`, this data-for-training
behavior turns off and the request code is exactly the same. The manual paste path always remains available as a
fallback, independent of quota or key configuration.

---

# 2. 🎨 Design Agent

## Goal
Generate `@theme` CSS custom-property values (Tailwind 4 is CSS-first — see CLAUDE.md Transformation Rules). There is no Tailwind JS/TS config file to produce.

## Input
- product_name
- niche
- style

## Output
Swappable tokens from `content/landing-base/src/styles/global.css:6-39` — 12 color / 2 font / 3 text-scale / 3 radius / 4 shadow:

{
  "colors": {
    "bone": "#F7F3EC", "bone-dim": "#EDE6D9",
    "graphite": "#1E2124", "graphite-soft": "#2A2E33",
    "steel": "#8A9096", "steel-light": "#C5CACE",
    "rust": "#C8552F", "rust-dark": "#A6421F", "rust-tint": "#FBEDE7",
    "gold": "#C9A227", "gold-tint": "#F7EFD6",
    "surface": "#FFFFFF"
  },
  "fonts": { "display": "", "sans": "" },
  "text": {
    "eyebrow": { "size": "0.6875rem", "lineHeight": "1", "letterSpacing": "0.18em" },
    "display": { "size": "2rem", "lineHeight": "1.08", "letterSpacing": "-0.02em" },
    "hero": { "size": "2.5rem", "lineHeight": "1.03", "letterSpacing": "-0.03em" }
  },
  "radius": { "card": "1.5rem", "tile": "1rem", "pill": "999px" },
  "shadow": { "card": "", "lift": "", "sticky": "", "ring-white": "" }
}

## Rules
- Must be Tailwind 4 `@theme` compatible — output CSS custom properties, never a JS/TS/JSON config object
- High contrast for readability
- Style must match niche:
  - tech → minimal
  - beauty → soft
  - fitness → aggressive
- **STRUCTURAL — never list as swappable, never let an agent touch:**
  - `--breakpoint-xs` (`global.css:41`)
  - `--animate-marquee` and its paired `@keyframes marquee` (`global.css:42,45` — drives the UtilityBar ticker)
  - the entire `@layer base` block (`global.css:47-66` — resets, focus ring, cursor rules)

---

# 3. 🧩 Layout Agent

## Goal
Confirm section order. Order is NOT a generation-time input — it is hardcoded as component import order (`content/landing-base/src/pages/index.astro:3-17`) and render order (`:36-51`), which match each other today.

## Input
- niche
- product type

## Output
The real 15 sections, in their real order, plus the one React island (`CartDrawer`). The normative, machine-checked list is the `spec:sections-order` block immediately below — this doc does not restate it in prose, so there is only ever one place a section can be added, renamed, or reordered.

Machine-checked contract (parsed and asserted by `content/landing-base/src/lib/spec-contract.test.ts`, assertions A2 — every entry maps to a real component file — and A3 — that order matches the real import order in `pages/index.astro`):

<!-- spec:sections-order -->
```json
{
  "sections_order": [
    { "component": "UtilityBar", "file": "01-utility-bar.astro" },
    { "component": "SiteHeader", "file": "02-site-header.astro" },
    { "component": "Hero", "file": "03-hero.astro" },
    { "component": "GalleryStrip", "file": "04-gallery-strip.astro" },
    { "component": "BuyBox", "file": "05-buy-box.astro" },
    { "component": "HowItWorks", "file": "06-how-it-works.astro" },
    { "component": "FeaturedTestimonial", "file": "07-featured-testimonial.astro" },
    { "component": "Faq", "file": "08-faq.astro" },
    { "component": "UgcStrip", "file": "09-ugc-strip.astro" },
    { "component": "ReviewsReel", "file": "10-reviews-reel.astro" },
    { "component": "Comparison", "file": "11-comparison.astro" },
    { "component": "Guarantee", "file": "12-guarantee.astro" },
    { "component": "RealResults", "file": "13-real-results.astro" },
    { "component": "SiteFooter", "file": "14-site-footer.astro" },
    { "component": "StickyBar", "file": "15-sticky-bar.astro" }
  ],
  "islands": [
    { "component": "CartDrawer", "note": "React island, not a static section — rendered after StickyBar with client:load" }
  ]
}
```

## Rules
- ALWAYS start with `UtilityBar` → `SiteHeader` → `Hero`
- ALWAYS end with `SiteFooter` → `StickyBar` (+ the `CartDrawer` island)
- Pain-point framing lives inside `benefits[].text` and testimonial copy — it is not a separate page section. The `spec:sections-order` block above is the complete, real set of sections; do not add entries beyond it.
- Reordering is NOT a config change: it means editing both the import order AND the render order in `pages/index.astro` directly, then re-verifying the build still compiles and the start/end boundaries above still hold. There is no `layout.json` field that reorders sections at generation time.
- Optimize for conversion within those constraints
- Do NOT remove required sections

---

# 4. 🛠️ Code Agent

## Goal
Generate a fully working landing project.

## Input
- Content Agent output
- Design Agent output
- Layout Agent confirmation

## Steps

1. Copy `content/landing-base/` → `outputs/{slug}/`
2. Inject content into:
   - `src/data/product.ts` (agent-writable fields only — see Content Agent Rules)
   - `src/data/faq.ts`
   - `src/data/testimonials.ts`
3. Inject design into:
   - the `@theme` block in `src/styles/global.css`
4. Apply layout:
   - only if reordering was requested: edit `src/pages/index.astro` import and render order directly
5. Replace images:
   - real files under `src/assets/product/*`, re-keyed through `src/data/images.ts` / `src/data/videos.ts`

## Output
- Fully functional Astro project at `outputs/{slug}/`

## STRICT Rules

- DO NOT modify:
  - business logic
  - hooks
  - scripts
  - analytics
  - `src/lib/shopify/*`, `src/lib/sumup/*`, `src/lib/kv.ts`, `src/pages/api/**`
- ONLY modify:
  - content (`src/data/*.ts` marketing fields)
  - styles (`@theme` tokens)
  - assets (`src/assets/product/*`)
- Keep folder structure identical
- Must compile without errors

---

# 🔒 Global Constraints

- All agent-to-agent outputs MUST be valid JSON
- No agent can modify another agent's responsibility
- Code Agent must NOT invent new components
- All content must map to existing components
- No breaking changes allowed

---

# 🔁 Execution Order

1. Content Agent
2. Design Agent
3. Layout Agent
4. Code Agent

# Scraping Agent

## Goal
Extract raw product data from a source URL, to use as reference material FOR the Content Agent — not as a substitute for it.

## Input
{
  "url": ""
}

## Output
Real shape produced by `scraper/scrape.js:386-398`:

{
  "sourceUrl": "",
  "scrapedAt": "",
  "title": "",
  "description": "",
  "brand": "",
  "rating": 0,
  "reviewCount": 0,
  "variants": [],
  "images": [],
  "localImages": [],
  "reviews": []
}

## Rules
- Extract raw data only
- DO NOT rewrite
- DO NOT invent data
- This output does NOT populate `ProductContent`'s marketing fields (`tagline`, `subtagline`, `benefits`, `heroPills`, `specs`, `steps`, `comparison`, `guarantee`, etc.) — the Content Agent still has to author those from scratch, using the scrape only as raw reference material
- `scraper/output/product.json` currently holds a sample scrape of a different product (an oil-spray dispenser) than the one live in `content/landing-base/src/data/product.ts` (a star projector) — do not assume the sample file reflects the current landing

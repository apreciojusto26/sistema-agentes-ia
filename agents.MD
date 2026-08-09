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
Real `ProductContent` fields (`content/landing-base/src/types/content.ts:124-149`), plus `FaqItem[]` (`:113-117`) and `Testimonial[]` (`:100-111`) arrays:

{
  "brand": "",
  "name": "",
  "tagline": "",
  "subtagline": "",
  "ratingAverage": 0,
  "ratingCount": 0,
  "ratingBreakdown": { "5": 0, "4": 0, "3": 0, "2": 0, "1": 0 },
  "badges": [""],
  "trustTicker": [""],
  "offer": { "durationMinutes": 0, "label": "", "expiredLabel": "" },
  "benefits": [
    { "id": "", "icon": "shield | truck | star | check | cross | chevron | camera | knife | board | lock | hook | sparkle | gift | clock", "title": "", "text": "" }
  ],
  "heroPills": ["", "", ""],
  "specs": [{ "label": "", "value": "" }],
  "packs": [
    { "id": "", "units": 0, "freeUnits": 0, "label": "", "sublabel": "", "badge": "", "popular": false, "freeGift": false, "default": false }
  ],
  "gallery": [{ "id": "", "asset": null, "alt": "", "ratio": "1/1 | 4/5 | 3/4 | 4/3 | 16/9 | 9/16", "caption": "" }],
  "steps": [{ "step": 1, "title": "", "text": "", "media": { "asset": null, "alt": "", "ratio": "4/3" } }],
  "comparison": [{ "feature": "", "ours": true, "rival": false }],
  "guarantee": { "days": 30, "title": "", "text": "", "points": [""] },
  "shipping": { "etaLabel": "", "freeOverCents": null },
  "ugc": [{ "asset": null, "alt": "", "ratio": "9/16" }],
  "cta": { "primary": "", "sticky": "", "checkout": "", "pending": "", "soldOut": "" },
  "variantGroupLabel": "",
  "faq": [{ "id": "", "question": "", "answer": "" }],
  "testimonials": [{ "id": "", "author": "", "location": "", "rating": 5, "date": "YYYY-MM-DD", "title": "", "body": "", "verified": true, "variant": "quote | card | reel" }]
}

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
- `errors` (`ProductErrorCopy`, checkout failure copy) is also outside this agent's scope — it is fixed system copy, not marketing content.

Field-ownership split for `content/landing-base/src/data/product.ts` (the real `product` object):
- **agentWritable**: `brand`, `name`, `tagline`, `subtagline`, `ratingAverage`, `ratingCount`, `ratingBreakdown`, `badges`, `trustTicker`, `offer`, `benefits`, `heroPills`, `specs`, `packs` (structure only), `gallery`, `steps`, `comparison`, `guarantee`, `shipping`, `ugc`, `cta`, `variantGroupLabel` — plus the `faq[]` and `testimonials[]` arrays in their own files
- **neverGenerate**: `commerce` (`shopifyHandle`, `bundleOfferActive`), `errors` (`network`, `soldOut`, `expired`, `noDiscount`, `generic`)

Machine-checked contract (parsed and asserted by `content/landing-base/src/lib/spec-contract.test.ts`, assertion A4 — `agentWritable ∪ neverGenerate` MUST equal `Object.keys(product)` bidirectionally; `faqFields`/`testimonialFields` MUST equal the real keys on `faq[0]`/`testimonials[0]`):

<!-- spec:content-fields -->
```json
{
  "agentWritable": [
    "brand", "name", "tagline", "subtagline",
    "ratingAverage", "ratingCount", "ratingBreakdown",
    "badges", "trustTicker", "offer", "benefits", "heroPills",
    "specs", "packs", "gallery", "steps", "comparison",
    "guarantee", "shipping", "ugc", "cta", "variantGroupLabel"
  ],
  "neverGenerate": ["commerce", "errors"],
  "faqFields": ["id", "question", "answer"],
  "testimonialFields": ["id", "author", "location", "rating", "date", "title", "body", "verified", "variant"]
}
```

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
The real 15 sections, in their real order, plus the one React island:

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
- Pain-point framing lives inside `benefits[].text` and testimonial copy — it is not a separate page section. The list above is the complete, real set of sections; do not add entries beyond it.
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

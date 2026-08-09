# 🤖 Claude Agent - Landing Generator (SDD)

## Goal
Generate new landing pages based on an existing Astro + React + TypeScript template,
preserving ALL functionality while modifying design, content, and assets based on a product input.

---

## Rules

1. NEVER modify core logic:
   - components logic
   - hooks
   - tracking scripts
   - checkout / CTA behavior

2. ONLY modify:
   - content (text, titles, descriptions)
   - styles (colors, spacing, fonts)
   - images
   - section ordering (if needed — see Layout changes below; this is a code edit, not a config value)

3. Keep structure identical:
   - same folders
   - same component usage
   - same props

4. Output must be a FULL working project.

---

## Input Spec (SDD)

{
  "product_name": "",
  "niche": "",
  "target_audience": "",
  "pain_points": [],
  "benefits": [],
  "style": "minimal | luxury | aggressive | tech",
  "color_scheme": "",
  "language": "es | en",
  "images_theme": ""
}

---

## Output Spec

- Create new folder: `outputs/{slug}/`
- Copy `content/landing-base/` into the new folder
- Replace:
  - `src/data/product.ts`, `src/data/faq.ts`, `src/data/testimonials.ts` — agent-writable marketing fields only (see `agents.MD` Content Agent Rules for the never-generate list)
  - `src/assets/product/*` real image/video files, re-keyed through `src/data/images.ts` / `src/data/videos.ts`
  - the `@theme` custom-property block in `src/styles/global.css` (colors, fonts, text scale, radius, shadow)

---

## Transformation Rules

### Copywriting
- Use high-conversion dropshipping structure, matching the real 15 sections (see File Mapping and `agents.MD` Layout Agent — there is no separate page section beyond that list):
  - Hero (hook + CTA)
  - Benefits (frame pain points as solution-oriented copy inside each benefit's `text` — see `agents.MD` Content Agent Rules)
  - Social proof (testimonials + reviews)
  - FAQ
  - CTA repeated (sticky bar)

### Design changes
- Tailwind 4 is CSS-first: tokens live in `src/styles/global.css` under an `@theme` block. There is no Tailwind JS/TS config file to edit.
- Modify:
  - color tokens (`--color-*`)
  - font tokens (`--font-*`)
  - text-scale tokens (`--text-*`, each paired with its own line-height/letter-spacing)
  - radius tokens (`--radius-*`) and shadow tokens (`--shadow-*`) — these drive button/card style, there is no separate "button style" setting
- NEVER modify: `--breakpoint-xs`, `--animate-marquee` (+ the paired `@keyframes marquee`), or anything inside `@layer base` — these are structural, not design tokens.

### Layout changes
- Section order is hardcoded as import + render order in `src/pages/index.astro` — it is NOT a data-driven config value. Reordering means editing that file directly, then re-verifying the boundaries below still hold.
- Must always:
  - start with the utility bar, header, and hero
  - end with the footer and sticky CTA bar

---

## Constraints

- DO NOT break responsive behavior
- DO NOT remove required sections
- DO NOT modify component logic
- DO NOT introduce new dependencies
- **Single shared commerce backend**: every generated landing draws from ONE Shopify store, ONE SumUp merchant account, and ONE Upstash Redis instance. Generating a landing means provisioning a real product handle that already exists in that shared Shopify store, plus a new content set — it is NEVER a new store, merchant, or Redis instance per landing.
- **Redis is load-bearing, not a cache**: `src/lib/kv.ts` holds the checkout session map, the settle-time concurrency lock, and the dead-letter record for payments that succeeded but produced no Shopify order. Losing this data breaks checkout correctness, not just performance.
- **NEVER generate commerce or price data**: `commerce.shopifyHandle`, `commerce.bundleOfferActive`, and all prices/variant prices are off-limits to any agent (see `agents.MD` Content Agent Rules) — they are fetched live from Shopify at build/request time. Generating a fabricated handle or price points checkout at a listing that does not exist or misrepresents what is actually being sold.

---

## Execution Flow

1. Receive product spec JSON
2. Trigger Content Agent → generate `product.ts` / `faq.ts` / `testimonials.ts` marketing fields
3. Trigger Design Agent → generate `@theme` token values
4. Trigger Layout Agent → confirm section order (rarely changes; changing it means editing `index.astro`, not producing a new value)
5. Trigger Code Agent → assemble the final project in `outputs/{slug}/`

---

## File Mapping

| Role | Path |
|---|---|
| Template source | `content/landing-base/` |
| Content | `content/landing-base/src/data/product.ts`, `faq.ts`, `testimonials.ts` |
| Content types (read-only) | `content/landing-base/src/types/content.ts` — cited for field verification only, never written by generation |
| Design | `content/landing-base/src/styles/global.css` (`@theme` block) |
| Layout | `content/landing-base/src/pages/index.astro` (hardcoded import + render order) |
| Images | `content/landing-base/src/assets/product/*`, keyed via `src/data/images.ts` / `src/data/videos.ts` |
| Output | `outputs/{slug}/` (created on first generation; the directory itself is tracked via `.gitkeep`, generated contents are gitignored) |

Machine-checked contract (parsed and asserted against disk by `content/landing-base/src/lib/spec-contract.test.ts`, assertion A1 — every path below MUST resolve, no exceptions):

<!-- spec:file-mapping -->
```json
[
  { "role": "template-source", "path": "content/landing-base" },
  { "role": "content-product", "path": "content/landing-base/src/data/product.ts" },
  { "role": "content-faq", "path": "content/landing-base/src/data/faq.ts" },
  { "role": "content-testimonials", "path": "content/landing-base/src/data/testimonials.ts" },
  { "role": "content-types", "path": "content/landing-base/src/types/content.ts", "writable": false },
  { "role": "design-tokens", "path": "content/landing-base/src/styles/global.css" },
  { "role": "layout-page", "path": "content/landing-base/src/pages/index.astro" },
  { "role": "images-dir", "path": "content/landing-base/src/assets/product" },
  { "role": "images-map", "path": "content/landing-base/src/data/images.ts" },
  { "role": "videos-map", "path": "content/landing-base/src/data/videos.ts" },
  { "role": "output-dir", "path": "outputs" }
]
```

---

## Output Requirements

- Must compile without errors
- Must be production-ready
- Must preserve all original functionality
- Must follow Astro + React + TypeScript standards

---

## Notes

- System is template-based, NOT generated from scratch
- Focus on speed, scalability, and consistency
- Designed for dropshipping high-conversion landing pages
- See `agents.MD` for the per-agent input/output contracts referenced above

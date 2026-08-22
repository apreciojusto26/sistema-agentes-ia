# 🧠 Agents System — Dropshipping Landing Generator

This system generates high-converting dropshipping landing pages based on the
canonical Astro + React + TypeScript template located at:

`content/landing-base/`

The system uses deterministic code for extraction and rendering, and LLM-based
agents only for tasks that require reasoning, copywriting, product analysis,
design decisions, or semantic validation.

Every agent communicates through structured JSON.

---

# 0. 🏗️ System Architecture

The generation pipeline is:

```text
User provides AliExpress URL
          │
          ▼
┌─────────────────────────────┐
│ Product Extraction Pipeline │
│ Existing Playwright scraper │
└──────────────┬──────────────┘
               │
               ▼
         raw product data
               │
               ▼
       Product Normalizer
               │
               ▼
          product.json
               │
               ▼
        ┌──────────────┐
        │ Content Agent│
        │     LLM      │
        └──────┬───────┘
               │
               ▼
           copy.json
               │
               ▼
┌───────────────────────────────┐
│ Product Consistency Validator │
│             LLM + code        │
└───────────────┬───────────────┘
                │
          ┌─────┴─────┐
          │           │
        FAIL         PASS
          │           │
          ▼           ▼
       Repair    Design & Layout
                       │
                       ▼
                  design.json
                       │
                       ▼
              Landing Renderer
                       │
                       ▼
                 Astro Landing
                       │
                       ▼
                   QA Agent
                       │
                  ┌────┴────┐
                  │         │
                FAIL       PASS
                  │         │
                Repair    Complete
```
No stage may be skipped.
A failed validation blocks the next stage.

# 1. 🕷️ Product Extraction Pipeline

### Goal

Extract factual product information from a source URL using the existing
Playwright scraper.

This is NOT an LLM agent.

The actual browser automation and extraction MUST be performed by the existing
scraper located at:

`scraper/scrape.js`

The scraper already uses Playwright to simulate browser behavior and retrieve
product information from websites such as AliExpress.

Do NOT create a second scraper.

Do NOT replace the existing scraper with an LLM.

Do NOT ask an LLM to navigate AliExpress.

### Responsabilities

The Product Extraction Pipeline is responsible for:

1. Receiving the source URL.
2. Creating or assigning a unique productId.
3. Executing the existing scraper.
4. Collecting the raw scraper output.
5. Validating that the scraper returned usable data.
6. Downloading/storing product assets through the existing scraper logic.
7. Normalizing the result into the canonical product.json format.
8. Passing the normalized product data to the Content Agent.

### input
```json
{
  "productId": "",
  "url": ""
}
```
Existing Scraper

The pipeline MUST execute:
`scraper/scrape.js`

The scraper is the source of truth for source extraction.

Do not duplicate its functionality elsewhere.

### Raw Scraper Output

The existing scraper currently produces the following shape:
```json
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
```
The exact scraper implementation and output contract must remain authoritative.

### Rules

* Extract factual data only.
* DO NOT rewrite marketing copy.
* DO NOT invent missing data.
* DO NOT fabricate reviews.
* DO NOT fabricate specifications.
* DO NOT fabricate ratings.
* DO NOT fabricate review counts.
* DO NOT modify the source data to make it sound better.
* Preserve the original source URL.
* Preserve the extraction timestamp.
* Every extracted asset MUST belong to the current productId.
* Every extracted review MUST belong to the current product.
* Every extracted image MUST belong to the current product.

The extraction stage is allowed to fail.

For Example:

```json
{
  "productId": "prd_123",
  "status": "failed",
  "errors": [
    {
      "type": "NO_PRODUCT_TITLE",
      "message": "Product title could not be extracted."
    }
  ]
}
```
If extraction fails, the Content Agent MUST NOT run.

# 2. 🧹 Product Normalizer

### Goal

Convert the raw scraper result into a stable product schema that all
downstream agents understand.

The Product Normalizer is deterministic code.

It is NOT an LLM.

##### Input

The raw output from:

`scraper/scrape.js`

###### Output

```json
{
  "productId": "",
  "source": {
    "platform": "aliexpress",
    "url": "",
    "scrapedAt": ""
  },
  "identity": {
    "title": "",
    "brand": "",
    "category": ""
  },
  "description": "",
  "socialProof": {
    "rating": 0,
    "reviewCount": 0,
    "reviews": []
  },
  "variants": [],
  "specifications": [],
  "media": {
    "images": [],
    "videos": []
  }
}
```
The exact implementation may evolve, but the normalized structure must remain
stable for downstream agents.

##### Rules

* Do not add invented information.
* Do not remove factual information unless explicitly mapped to another field.
* Do not rewrite marketing content.
* Preserve source data.
* Preserve product identity.
* Preserve asset ownership.
* Attach productId to the normalized product.

The normalized product is the factual source of truth for all subsequent
agents.

# 🧾 Content Agent

### Goal

Generate conversion-focused marketing content using the normalized product
data as the factual source of truth.

This is an LLM agent.

###### Input
```json
{
  "productId": "",
  "product": {},
  "language": "es | en",
  "targetAudience": "",
  "niche": "",
  "positioning": ""
}
```

###### Output
The output must contain:
```json
{
  "productId": "",
  "product": {},
  "language": "es | en",
  "targetAudience": "",
  "niche": "",
  "positioning": ""
}
```
---

#### Responsabilities
The Content Agent may generate:

* brand presentation
* product name
* tagline
* subtagline
* benefits
* hero copy
* hero pills
* feature descriptions
* specifications presentation
* steps
* comparison copy
* guarantee copy
* shipping copy
* CTA copy
* FAQ
* testimonial presentation
* UGC descriptions
* trust messaging

#### Rules
###### General
* Use persuasive, conversion-focused copy.
* Use short, clear sentences.
* Match the requested language.
* Do not use lorem ipsum.
* Do not generate generic placeholder content.
* Do not reference another product.
* Do not reference the template’s previous product.
* Do not copy content from the existing landing unless it is intentionally
    reusable structural content.

#### Factual Accuracy
The Content Agent MUST distinguish between:

Supported facts

Information explicitly present in the scraped product data.

Examples:

* material
* dimensions
* product functions
* number of modes
* included accessories
* rating
* review count
* variants

These may be used.

Unsupported claims

Information not present in the source data.

Examples:

* medical claims
* guaranteed results
* invented certifications
* invented materials
* invented specifications
* invented warranties
* invented customer experiences

These MUST NOT be fabricated.

#### Commerce Restrictions

The Content Agent MUST NEVER generate:

* Shopify handles
* Shopify product IDs
* prices
* variant prices
* checkout identifiers
* payment identifiers
* Redis identifiers

The following fields remain outside the Content Agent’s responsibility:

```
commerce.shopifyHandle
commerce.bundleOfferActive
prices
variant prices
```
Commerce information is provided by the existing commerce system.

#### Packs

packs may only be generated for structure.

Allowed:
```
id
units
freeUnits
label
sublabel
badge
popular
freeGift
default
```
Never generate price information inside packs.

#### Testimonials

Testimonials MUST follow the existing Testimonial type.

They MUST include:
```
id
author
location
rating
date
title
body
verified
variant
```

The agent must distinguish between:

1. Real source reviews.
2. Marketing transformations of supplied review data.

The agent MUST NOT fabricate a customer experience and present it as a
verified real customer.

#### Errors

errors is agent-writable only for localization.

The agent may translate the existing error messages.

It MUST NOT:

* create new error keys
* change their semantics
* modify checkout behavior

#### Machine-Checked Content Contract

The existing spec-contract.test.ts is authoritative for the fields that
the Content Agent can modify.

```html
<!-- spec:content-fields -->
```
```json
{
  "agentWritable": [
    "brand",
    "name",
    "tagline",
    "subtagline",
    "ratingAverage",
    "ratingCount",
    "ratingBreakdown",
    "badges",
    "trustTicker",
    "offer",
    "benefits",
    "heroPills",
    "specs",
    "packs",
    "gallery",
    "steps",
    "comparison",
    "guarantee",
    "shipping",
    "ugc",
    "cta",
    "variantGroupLabel",
    "errors"
  ],
  "neverGenerate": [
    "commerce"
  ],
  "faqFields": [
    "id",
    "question",
    "answer"
  ],
  "testimonialFields": [
    "id",
    "author",
    "location",
    "rating",
    "date",
    "title",
    "body",
    "verified",
    "variant"
  ]
}
```
This block must remain synchronized with the actual TypeScript types and
spec-contract.test.ts.

# 4. 🔍 Product Consistency Validator

### Goal
Ensure that every generated piece of content and every asset belongs to the
same product.

This is a mandatory validation gate.

The validator may use deterministic checks and an LLM for semantic checks.

###### Input 
```json
{
  "productId": "",
  "sourceProduct": {},
  "content": {},
  "assets": []
}
```
###### Output
```json
{
  "productId": "",
  "status": "pass",
  "errors": [],
  "warnings": []
}
```
#### Deterministic Checks

The validator MUST check:

* productId consistency
* asset paths
* asset ownership
* missing assets
* duplicate assets
* stale asset references
* required fields
* schema validity
* broken mappings
* old product filenames
* references to previous product IDs

#### Semantic Checks

The validator SHOULD check:
###### Product identity

* product name
* product type
* brand
* category

###### Product facts

* specifications
* dimensions
* materials
* features
* variants
* supported claims

###### Marketing copy

* hero
* benefits
* FAQ
* comparison
* guarantee
* CTA
* testimonials

###### Assets

* product images
* videos
* gallery
* UGC
* image descriptions

#### Contamination Detection

The validator MUST detect product contamination such as:

```
Old product name in new copy
Old brand in new FAQ
Old image in new gallery
Old review in new testimonial section
Old specification in comparison
Old product in CTA
Old image key in images.ts
Old asset in videos.ts
```

#### Failure

If validation fails:
```json
{
  "productId": "prd_123",
  "status": "fail",
  "errors": [
    {
      "type": "PRODUCT_CONTAMINATION",
      "field": "comparison",
      "message": "Comparison contains information belonging to another product."
    }
  ],
  "warnings": []
}
```
The landing MUST NOT proceed to Design & Layout.

The system must send the errors back to the responsible stage for repair.

# 5. 🎨 Design & Layout Agent

### Goal
Determine how the landing should look and how the existing registered sections
should be composed.

This is an LLM agent.

The agent controls presentation.

It does NOT generate arbitrary source code.

###### Input
```json
{
  "productId": "",
  "product": {},
  "content": {},
  "niche": "",
  "targetAudience": "",
  "style": ""
}
```
###### Output
```json
{
  "productId": "",
  "design": {
    "family": "",
    "density": ""
  },
  "theme": {
    "colors": {},
    "fonts": {},
    "text": {},
    "radius": {},
    "shadow": {}
  },
  "sections": []
}
```
#### 5.1 Design Families

The agent may select from registered design families such as:
```
minimal
premium
editorial
ecommerce
bold
tech
soft
energetic
luxury
```
The final list must correspond to what the implementation actually supports.

#### 5.2 Section Variants

The agent may select registered section variants.

Example:
```json
{
  "type": "hero",
  "variant": "split"
}
```
Another product could use:
```json
{
  "type": "hero",
  "variant": "centered"
}
```
The agent MUST NOT invent variants that do not exist.

Invalid:
```json
{
  "type": "hero",
  "variant": "random-ai-design"
}
```
#### 5.3 Layout Rules

The following boundaries are mandatory:
```
UtilityBar
SiteHeader
Hero
    ↓
FLEXIBLE CONTENT AREA
    ↓
SiteFooter
StickyBar
CartDrawer
```

The flexible content area may change:

* section order
* section variants
* visual hierarchy
* density

The following elements MUST always exist:

* UtilityBar
* SiteHeader
* Hero
* SiteFooter
* StickyBar
* CartDrawer

The Design & Layout Agent MUST NOT remove them.

#### 5.4 Section Ordering

Section ordering is allowed ONLY for sections registered as reorderable by
the implementation.

The agent must not directly edit index.astro to perform product-specific
layout changes.

The long-term architecture must use a renderer/configuration layer.

The desired output is:
```json
{
  "sections": [
    {
      "type": "gallery",
      "variant": "editorial"
    },
    {
      "type": "buyBox",
      "variant": "standard"
    },
    {
      "type": "howItWorks",
      "variant": "steps"
    },
    {
      "type": "reviews",
      "variant": "carousel"
    }
  ]
}
```
Only registered section types and variants are valid.

#### 5.5 Design Tokens

The Design Agent may control:

* colors
* fonts
* text scale
* spacing
* density
* radius
* shadows

Tailwind 4 uses CSS-first configuration.

The final implementation must map these values to the existing
@theme system.

#### 5.6 Protected Structural Tokens

The agent MUST NOT modify:
```
--breakpoint-xs
--animate-marquee
@keyframes marquee
@layer base
```
These are structural.

#### 5.7 DesignSpec v1 — What Is ACTUALLY Implemented

Sections 5 through 5.6 above describe the Design & Layout Agent as a whole.
This section records what exists **in code today** versus what is still
aspirational, so the two are never confused.

**Implemented (Fase 1 — contract):**

```
scripts/lib/design-registry.mjs    the ONE source of truth for capabilities
scripts/lib/design-registry.d.mts  hand-written declarations
scripts/lib/design-contract.mjs    deterministic validator (collect-all + fail-fast)
scripts/lib/design-contract.d.mts  hand-written declarations
admin/src/server/validation/design.ts  thin re-export adapter (not wired to any route)
admin/test/contract.design-spec.test.ts
admin/test/fixtures/design-spec/*.json
```

**Implemented (Fase 2 — the contract is now RENDERED):**

```
content/landing-base/src/types/design.ts             runtime types
content/landing-base/src/design-system/registry.ts   runtime registry (pure data)
content/landing-base/src/design-system/blocks/**     the 3 building blocks
content/landing-base/src/data/design.ts              default DesignSpec
content/landing-base/src/pages/index.astro           dynamic sections[] rendering
scripts/generate-landing.mjs                         --design, fail-closed, write-design
admin/test/contract.design-registry-parity.test.ts   build-time ↔ runtime parity
```

The registry now declares **14** capabilities: the 11 legacy flexible-content
sections plus 3 design-system building blocks. The blocks are ADDITIVE — every
legacy capability keeps its own type and its own component, so a generation
without `--design` renders exactly what it rendered before Fase 2. In
particular `conversion/Guarantee/default` (the legacy section) and
`conversion/ProductGuarantee/default` (the block) coexist; the second never
replaces the first.

**Two registries, one contract.** `content/landing-base` is COPIED into
`outputs/{slug}/`, so at runtime it cannot reach `scripts/lib`. The registry
therefore exists twice by necessity. `admin/test/contract.design-registry-parity.test.ts`
is the compensating control and is LOAD-BEARING: it fails if the two diverge on
any field of any capability. Never weaken it to make a change pass.

**Generation modes.** `--design <spec.json>` selects explicit mode:

| | `--design` present | `--design` absent (legacy) |
| --- | --- | --- |
| Section list | the DesignSpec's `sections[]` | template default = the 11 legacy sections, original order |
| Theme tokens | `DesignSpec.theme` ONLY | `content.json.design` |
| Unknown token | **hard failure**, nothing written | `console.warn` + skip (unchanged) |
| Invalid spec | **fails before `copy-template`** — no partial output | n/a |
| `write-design` stage | emitted | not emitted |

`content.json.design` and `DesignSpec.theme` carry the same token shape but are
DIFFERENT documents. In explicit mode `content.json.design` is ignored
entirely — no merge, no fallback — because two unordered writers of the same
`@theme` block is precisely the silent-fallback failure this system forbids.

The DesignSpec v1 document shape:

```json
{
  "schema": 1,
  "productId": "prd_...",
  "design": { "family": "premium", "density": "balanced" },
  "theme": {
    "colors": {}, "fonts": {}, "radius": {}, "shadow": {}, "text": {}
  },
  "sections": [
    { "category": "hero", "type": "Hero", "variant": "default", "order": 0 }
  ]
}
```

`theme` is optional. `productId` is REQUIRED here (unlike content.json's
optional one) because §8 mandates every artifact carry it.

The registry's 14 capabilities are NOT restated in this document on purpose:
duplicating them here would create the exact second source of truth that
`admin/test/no-duplicated-contract.test.ts` forbids. Read
`scripts/lib/design-registry.mjs` — it is the contract, and it is tested.

**Verdicts.** The contract returns exactly three outcomes, never a fourth:

```
{ "status": "pass" }
{ "status": "unsupported_design", "missingCapability": "hero/ImmersiveHero/parallax" }
{ "status": "invalid", "issues": [ ... ] }
```

`unsupported_design` means the design system cannot express the request (§6.3 —
a developer must then expand it deliberately). `invalid` means the document
itself is malformed. Conflating them would let a schema typo read as a missing
feature. There is no fallback component, no nearest-variant substitution, and
no best-effort render.

**Structural invariants enforced by the contract:** exactly one hero, hero
first, at least one `conversion` section, each registered `type` at most once,
`order` equal to array position, and every section resolvable in the registry.
Shell presence (§5.3) is deliberately NOT enforced here — the shell is not
addressable through `sections[]` at all, and enforcing it is the renderer's
job. The contract validates; the renderer resolves.

**Explicitly OUT of v1 — do not assume these exist:**

| Capability | Status |
| --- | --- |
| `motion` / Framer Motion | Not implemented. The key is REJECTED (`spec-unknown-fields`), not ignored. No dependency added. |
| spacing / density design tokens | `global.css` declares no spacing or density scale. `design.density` is a SEMANTIC dimension only — it maps to nothing yet. |
| component `props` | PARTIAL (Fase 2). The 11 legacy sections still declare `propsSchema: {}` — none of them accepts a prop. The 3 building blocks declare REAL props (`align`, `tone`) backed by an actual rendering difference. No other capability may invent one. |
| family / density restrictions | `familiesAllowed: '*'`, `densityAllowed: '*'` — no real restriction has been established. |
| incompatibility rules | `incompatibleWith: []` everywhere. The engine is tested against a fixture registry; production declares none. |
| section variants beyond `default` | PARTIAL (Fase 2). `hero/ProductHero/split` is the first non-default variant. All 11 legacy capabilities remain `default`. A variant is only ever resolved by exact match — `ProductHero/default` does NOT resolve, and nothing substitutes a sibling variant. |
| Design Agent (LLM) | Does not exist. Nothing produces a DesignSpec yet. |
| `JobKind: 'design'` | Not added. `JobKind` denotes a real spawned-child lifecycle; there is no Design Agent script, runner, route, event stream or UI stage, so adding it would create dead branches. It lands together with the agent. |
| dynamic `sections[]` rendering | IMPLEMENTED (Fase 2). `index.astro` renders its flexible content area from `src/data/design.ts`'s `sections[]`, resolved through the runtime registry via an eager `import.meta.glob` (so `prerender = true` still holds). The shell stays statically imported and is never addressable. An unresolvable capability FAILS THE BUILD — it is never skipped and never substituted. |

**KNOWN GAP — the Content Agent is not wired to this contract.**

`scripts/generate-content.mjs` still instructs the model to optionally emit a
`design` key (§12's Gemini path). That value flows to
`scripts/generate-landing.mjs`'s `patchThemeBlock()`, which applies known keys
and, for unknown ones, emits `console.warn(...)` and CONTINUES.

That is a silent fallback — precisely what §5.7's contract forbids — and it is
still live. It was left untouched deliberately: Fase 1 is purely contractual,
and rewiring the pipeline inside it would change production generation
behavior. Closing this gap (routing the Content Agent's `design` output, or a
future Design Agent's, through `design-contract.mjs` and failing hard) is the
responsibility of a later phase.

Until then, two paths coexist: an unvalidated legacy one that runs, and a
validated contract that nothing calls yet.

# 6. 🛠️ Landing Renderer / Code Agent

### Goal
Generate the final Astro project from validated product content, design
configuration, and product-specific assets.

This is primarily deterministic code.

It should NOT rely on an LLM to invent source code.

###### Input
```json
{
  "productId": "",
  "content": {},
  "design": {},
  "assets": {}
}
```
#### Process
###### Step 1
Copy:
`content/landing-base/`
to:
`outputs/{slug}/`

The base template must remain unchanged.

###### Step 2

Inject validated content into:
```
src/data/product.ts
src/data/faq.ts
src/data/testimonials.ts
```
Only fields approved by the Content Agent contract may be modified.

###### Step 3

Inject design configuration.

This may include:
```
design tokens
section configuration
registered variants
layout configuration
```

###### Step 4

Register product-specific assets.

Assets MUST be isolated by product.

Example:
```
assets/
└── {productId}/
    ├── hero.webp
    ├── gallery-01.webp
    ├── gallery-02.webp
    └── review-01.webp
```

###### Step 5

Render only registered components and variants.

The renderer MUST NOT invent components.

###### Step 6

Build the final Astro project.

#### 6.1 Allowed Modifications

The Renderer may modify:

* marketing content
* FAQ
* testimonials
* design configuration
* registered design tokens
* product assets
* asset mappings
* registered section configuration
* registered component variants

#### 6.2 Forbidden Modifications

The Renderer MUST NOT modify:
```
src/lib/shopify/*
src/lib/sumup/*
src/lib/kv.ts
src/pages/api/**
```

It also MUST NOT modify:

* checkout logic
* payment logic
* Redis behavior
* analytics logic
* tracking scripts
* business logic
* unrelated hooks
* dependencies

#### 6.3 No Arbitrary Components

If the Design Agent requests a capability that does not exist:

DO NOT invent it during generation.

Return:
```json
{
  "status": "unsupported_design",
  "missingCapability": ""
}
```
The design system must then be expanded intentionally by a developer.

This prevents uncontrolled AI-generated UI code.

# 7. 🧪 QA Agent

### Goal
Verify that the final landing is functional, consistent, and isolated.

This is the final validation stage.

###### Input
```json
{
  "productId": "",
  "outputPath": ""
}
```

#### Build Checks

Verify:

* Astro build succeeds.
* TypeScript checks succeed.
* No broken imports.
* No missing assets.
* No broken routes.
* No invalid configuration.

#### Product Checks

Verify:

* correct product name
* correct product images
* correct reviews
* correct specifications
* correct variants
* correct copy
* correct FAQ
* correct comparison
* correct CTA

#### Contamination Checks

Verify that no previous product remains:

* names
* brands
* images
* reviews
* specifications
* comparison data
* image mappings
* videos
* asset references

#### UI Checks

Verify:

* responsive behavior
* mobile layout
* desktop layout
* section rendering
* typography
* buttons
* CTA
* cart
* sticky bar
* navigation

#### Commerce Checks

Verify that:

* Shopify integration remains intact.
* SumUp integration remains intact.
* Redis integration remains intact.
* Checkout behavior remains intact.
* Cart behavior remains intact.
* API routes remain intact.
* Tracking remains intact.

###### Output
```json
{
  "productId": "",
  "status": "pass",
  "errors": [],
  "warnings": []
}
```
A failed QA blocks deployment.

# 8. 🔒 Global Constraints

Product Isolation

Every generation MUST have a unique:
`productId`

Every artifact must belong to exactly one product.

No agent may read another product’s generated assets or content.

#### JSON Communication

All agent-to-agent communication MUST be valid JSON.

Every artifact MUST contain:
`productId`

#### Single Source of Truth

The normalized product.json is the factual source of truth for the product.

The Content Agent may transform facts into marketing language.

The Design Agent may transform product positioning into visual decisions.

Neither agent may alter factual source data.

#### No Cross-Product Contamination

Never use another generated landing as a source of:

* copy
* images
* reviews
* specifications
* product data
* asset mappings
* testimonials

The canonical template is the ONLY source for reusable structural code.

#### No Arbitrary Code Generation

AI agents may select and configure capabilities that already exist.

AI agents must not create arbitrary components during generation.

#### No Dependency Changes

Product generation must not:

* install packages
* remove packages
* upgrade dependencies
* modify package manager configuration

Any new dependency must be introduced intentionally at the development
stage, not during product generation.

# 9. 🔐 Commerce Protection

Every generated landing uses the same:
```
ONE Shopify store
ONE SumUp merchant account
ONE Upstash Redis instance
```
Generating a landing does NOT create a new store, merchant, or Redis instance.

#### Shopify

Never fabricate:

* product handles
* prices
* variant prices
* product IDs
* checkout IDs

Commerce data must come from the existing Shopify integration.

#### SumUp

Never modify:
`src/lib/sumup/*`

#### Redis

Never modify:
`src/lib/kv.ts`

Redis is load-bearing infrastructure.

It contains checkout-related state and payment consistency mechanisms.

It MUST NOT be treated as disposable cache data.

# 10. 📁 Product Isolation

Generated data must be associated with:
`productId`

Recommended structure:
```
outputs/
└── {slug}/
    ├── product.json
    ├── copy.json
    ├── design.json
    ├── assets/
    │   ├── hero.webp
    │   ├── gallery-01.webp
    │   └── gallery-02.webp
    └── landing/
```
The exact filesystem may evolve, but logical isolation is mandatory.

#### Product Identity Contract

The block below documents the REAL contract implemented by the
"product-identity-generation-isolation" change: the shape of `productId`,
where it is born, how it propagates end to end, the `.generation.json`
manifest schema, and the three fail-closed ownership guards that enforce
isolation. It is NOT yet asserted by any test that runs in CI (see the
`note` field below) — same known gap as the rest of this file's anchors,
tracked separately, out of scope to fix here.

```html
<!-- spec:product-identity -->
```
```json
{
  "productId": {
    "format": "prd_<base36-ms>-<8-hex-chars-from-uuid>",
    "regex": "^prd_[0-9a-z]{6,12}-[0-9a-f]{8}$",
    "sourceOfTruth": "scripts/lib/product-id.cjs (newProductId, isProductId, PRODUCT_ID_RE)",
    "mintedBy": [
      "admin/src/server/jobs/registry.ts#createScrapeJob — mints when the operator does not pin one",
      "scraper/scrape.js standalone/manual runs — resolves --product-id arg > LG_PRODUCT_ID env > self-mint"
    ]
  },
  "propagation": [
    "admin POST /api/jobs {kind:'scrape'} -> registry mints/accepts productId",
    "runner.ts buildScrapeSpec -> env.LG_PRODUCT_ID (not argv)",
    "scraper/scrape.js -> output/product.json.productId, output/.scrape-run.json",
    "admin archiveScrape (ownership guard #1, fail-closed) -> admin/.jobs/{jobId}/scrape/",
    "scripts/generate-content.mjs -> .staged/content.json.productId + .provenance",
    "scripts/generate-landing.mjs preflight (ownership guard #3) + copy-images (ownership guard #2)",
    "outputs/{slug}/.generation.json — final manifest, written unconditionally by the write-manifest stage"
  ],
  "generationManifest": {
    "path": "outputs/{slug}/.generation.json",
    "schema": 1,
    "fields": [
      "schema", "productId", "slug", "lineage", "sourceUrl", "itemId", "productName",
      "jobs{scrape,content,generate}", "timestamps{scrapedAt,contentAt,generatedAt}",
      "assets[]{src,dest,bytes,sha256}", "assetsSourceDir", "assetsUnmatched",
      "template{dir,commit}", "generator{script,schema}", "flags{force}"
    ],
    "lineageValues": ["scraped", "legacy", "manual"],
    "note": "dot-prefixed, inert to the Astro build — never read at runtime by the landing itself"
  },
  "ownershipGuards": [
    {
      "checkpoint": "archive (scrape job, admin registry #onExit)",
      "code": "archive-ownership-mismatch",
      "behavior": "FAIL-CLOSED: job.status becomes 'failed', job.error={stage:'archive',code}, job.archivePath stays null, no flag bypasses this. Downstream POST /api/jobs {kind:'content'} answers 409 no-scrape-artifact because archivePath is null, so the pipeline is structurally cut — no content job, no generate job for that lineage.",
      "file": "admin/src/server/jobs/archive.ts, admin/src/server/jobs/registry.ts"
    },
    {
      "checkpoint": "generate-landing.mjs copy-images",
      "code": "images-owner-mismatch",
      "behavior": "fails closed when the --images source dir's product.json/.scrape-run.json productId differs from content.productId. A missing id on either side is legacy tolerance (warn, proceed).",
      "file": "scripts/generate-landing.mjs"
    },
    {
      "checkpoint": "generate-landing.mjs preflight + admin route (defense in depth)",
      "code": "generation-owner-mismatch",
      "behavior": "fails closed when outputs/{slug}/.generation.json's productId differs from the staged content's productId. --force and confirmToken do NOT bypass this, in either the script or the admin route.",
      "file": "scripts/generate-landing.mjs, admin/src/server/routes/jobs.ts, admin/src/shared/api.ts (GenerationOwnerMismatch)"
    }
  ],
  "resetFlag": {
    "exists": false,
    "note": "No --reset flag exists in this phase. A fatally-archived scrape (archive-ownership-mismatch) or a lineage-collided outputs/{slug} (generation-owner-mismatch) cannot be forced, retried, or auto-recovered by any flag. The operator must re-scrape (archive case) or manually resolve the directory (generation case). Destructive regeneration is deferred to a future change."
  }
}
```
This block must remain synchronized with `scripts/lib/product-id.cjs`,
`scripts/generate-landing.mjs`, and `admin/src/server/jobs/archive.ts` /
`registry.ts`.

# 11. 🧩 Current Template Contract

The canonical template is:
`content/landing-base/`

Current content files:
```
content/landing-base/src/data/product.ts
content/landing-base/src/data/faq.ts
content/landing-base/src/data/testimonials.ts
```
Content types:
`content/landing-base/src/types/content.ts`

Design tokens:
`content/landing-base/src/styles/global.css`

Page entry:
`content/landing-base/src/pages/index.astro`

Images:
`content/landing-base/src/assets/product/`

Image map:
`content/landing-base/src/data/images.ts`

Video map:
`content/landing-base/src/data/videos.ts`

Commerce:
`content/landing-base/src/lib/shopify/`

Payments:
`content/landing-base/src/lib/sumup/`

Redis:
`content/landing-base/src/lib/kv.ts`

API:
`content/landing-base/src/pages/api/`

Existing scraper:
`scraper/scrape.js`

# 12. 🤖 Automated Content Agent

The admin dashboard may execute the Content Agent automatically.

The current implementation uses:
```
Gemini API
gemini-2.5-flash
plain fetch
```
No SDK is required.

The generated content must pass the same validation contract used by the
manual generation path.

The automated generation may use a correction loop, but every result must
still pass the Content Agent schema and Product Consistency Validator.

# 13. 🔁 Canonical Execution Order

The complete execution order is:
```
1. Product Extraction Pipeline
2. Product Normalizer
3. Content Agent
4. Product Consistency Validator
5. Design & Layout Agent
6. Landing Renderer / Code Agent
7. QA Agent
```

# 14. 🚦 Failure Handling

A failed stage MUST stop the pipeline.

Examples:
```
Scraper failed
    ↓
STOP

Normalizer failed
    ↓
STOP

Content validation failed
    ↓
REPAIR CONTENT
    ↓
VALIDATE AGAIN

Product Consistency failed
    ↓
REPAIR RESPONSIBLE ARTIFACT
    ↓
VALIDATE AGAIN

Unsupported design variant
    ↓
STOP
    ↓
Report missing design-system capability

Build failed
    ↓
STOP
    ↓
Repair implementation

QA failed
    ↓
STOP
    ↓
Repair and run QA again
```
Agents must not silently continue after a failed validation.

# 15. 🎯 Core Principle

This system is NOT a system where an LLM generates an entire website from
scratch.

It is a controlled AI-powered rendering system.

The AI decides:

* what the product should communicate
* how the product should be positioned
* which copy should be used
* which visual family fits the product
* which registered sections should be used
* which registered section variants should be used
* how those registered sections should be ordered
* which design tokens should be used

Deterministic code decides:

* how AliExpress is scraped
* how assets are downloaded
* how product data is normalized
* how schemas are validated
* how components work
* how the page is rendered
* how checkout works
* how Shopify works
* how SumUp works
* how Redis works
* how tracking works
* how the project is built

The LLM MUST NOT replace deterministic functionality with generated code
when an existing implementation already performs that task.
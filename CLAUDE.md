# 🤖 Claude Agent — AI Dropshipping Landing Generator

## Goal

Generate production-ready dropshipping landing pages from the immutable
Astro + React + TypeScript template located at:

`content/landing-base/`

The system uses AI to transform product data into:

1. Product data
2. Marketing copy
3. Validated product-specific content
4. Design and layout configuration
5. A rendered landing page
6. A final QA-checked project

The system is TEMPLATE-BASED, not free-form code generation.

The AI may make controlled design decisions, but it must never invent
arbitrary components, business logic, checkout logic, or dependencies.

---

# 1. Core Architecture

The generation pipeline is:
```text
Scraping Agent
    ↓
product.json
    ↓
Content Agent
    ↓
copy.json
    ↓
Product Consistency Validator
    ↓
Design & Layout Agent
    ↓
design.json
    ↓
Landing Renderer / Code Agent
    ↓
Generated Landing
    ↓
QA Agent
    ↓
PASS → final output
FAIL → targeted repair
```
Every generation MUST have a unique `productId`.

All generated artifacts MUST belong to exactly one `productId`.

No generated landing may read content, images, configuration, or generated
files belonging to another product.

---

# 2. Immutable Template

`content/landing-base/` is the canonical source template.

The base template MUST be treated as read-only during product generation.

Never generate one product by modifying another generated product.

Never use another generated landing as a source of content or assets.

Every output must start from the canonical template:

`content/landing-base/`

and produce:

`outputs/{slug}/`

---

# 3. Separation of Responsibilities

The system has strict ownership boundaries.

## Scraping Agent

Responsible only for extracting factual source data.

It may extract:

- title
- description
- brand
- rating
- review count
- variants
- specifications
- images
- videos
- reviews
- source metadata

It MUST NOT write marketing copy.

---

## Content Agent

Responsible for marketing copy.

It may create:

- brand
- product name
- tagline
- subtagline
- benefits
- hero copy
- feature descriptions
- FAQ
- testimonials
- CTA copy
- guarantees
- shipping copy
- comparison copy
- other fields explicitly marked as agent-writable

It MUST use the Scraping Agent output as factual reference material.

It MUST NOT invent:

- prices
- Shopify handles
- product variants not present in source data
- technical specifications not supported by source data
- guarantees not supported by the product/business rules
- fake factual claims

---

## Product Consistency Validator

Responsible for verifying that all generated content and assets refer
to the SAME product.

It must validate:

- product identity
- product name
- product type
- specifications
- variants
- reviews
- images
- videos
- comparison claims
- benefits
- technical claims
- CTA/product references
- brand references
- asset ownership

It must detect contamination from previous products.

Examples of failures:

- image belongs to another product
- old product name remains in copy
- old brand remains in FAQ
- comparison mentions another product
- old testimonial/product reference remains
- product specifications conflict with scraped data
- image filename or asset mapping belongs to another product

If validation fails, the landing MUST NOT proceed to rendering.

---

## Design & Layout Agent

Responsible for controlled visual variation.

It may decide:

- design family
- visual style
- color palette
- typography
- spacing density
- border radius
- shadows
- section order within permitted boundaries
- section variants
- hero variant
- gallery variant
- benefits variant
- reviews variant
- CTA variant
- visual hierarchy
- content density

It MUST NOT:

- create arbitrary components
- invent components that do not exist
- modify checkout
- modify business logic
- modify analytics
- modify API routes
- modify Shopify/SumUp/Redis logic
- introduce dependencies

The Design & Layout Agent outputs configuration, not arbitrary source code.

---

## Landing Renderer / Code Agent

Responsible for rendering the validated product data and design configuration
using the existing Astro + React component system.

The renderer may modify:

- agent-writable content data
- design tokens
- asset mappings
- allowed section configuration
- allowed component variants
- generated product assets
- generated product configuration

It MUST NOT modify:

- checkout logic
- Shopify integration
- SumUp integration
- Redis
- API routes
- analytics
- tracking
- hooks unrelated to presentation
- business logic
- dependencies
- core component behavior

The renderer MUST use existing registered components and variants.

It MUST NOT create arbitrary UI components during product generation.

---

## QA Agent

Responsible for validating the final rendered landing.

It must verify:

- project compiles
- no TypeScript errors
- no broken imports
- no missing assets
- no old product content
- no old product images
- no old brand names
- no old reviews
- no old comparison data
- correct product data
- correct image mappings
- correct responsive behavior
- checkout still works
- CartDrawer still works
- Shopify integration remains untouched
- SumUp integration remains untouched
- Redis integration remains untouched
- analytics remain functional

The landing must not be considered complete until QA passes.

---

# 4. Input Contract

The generation input is:

```json
{
  "productId": "",
  "sourceUrl": "",
  "product_name": "",
  "niche": "",
  "target_audience": "",
  "pain_points": [],
  "benefits": [],
  "style": "",
  "color_scheme": "",
  "language": "es | en"
}
```
productId is mandatory and must be unique per generation.

# 5. Output Contract

Each generated product MUST be isolated:

```text
outputs/
└── {slug}/
    ├── product.json
    ├── copy.json
    ├── design.json
    ├── assets/
    └── landing/
```
The exact filesystem may follow the existing project structure,
but logical isolation is mandatory.

Every generated artifact must contain or be associated with the same
productId.

# 6. Design System

The landing system uses a controlled design system.

AI may select from registered:

* section components
* section variants
* design tokens
* typography options
* color tokens
* spacing tokens
* radius tokens
* shadow tokens
* layout patterns

AI may NOT create arbitrary visual primitives during generation.

If a desired design cannot be represented by the existing design system,
the correct action is to report the missing capability rather than invent
new implementation during product generation.

# 7. Layout Rules

The following boundaries are mandatory:

```text
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
The flexible content area may change section ordering and permitted section
variants.

The following elements must always remain:

* UtilityBar
* SiteHeader
* Hero
* SiteFooter
* StickyBar
* CartDrawer

Commerce and tracking behavior must remain untouched.

# 8. Design Configuration

The Design & Layout Agent must produce a structured configuration.

```json
{
  "productId": "prd_123",
  "design": {
    "family": "premium",
    "theme": "warm-luxury",
    "density": "spacious"
  },
  "theme": {
    "colors": {},
    "fonts": {},
    "text": {},
    "radius": {},
    "shadow": {}
  },
  "sections": [
    {
      "type": "hero",
      "variant": "split"
    },
    {
      "type": "gallery",
      "variant": "editorial"
    },
    {
      "type": "benefits",
      "variant": "cards"
    },
    {
      "type": "reviews",
      "variant": "carousel"
    },
    {
      "type": "faq",
      "variant": "accordion"
    }
  ]
}
```
Only registered section types and variants are valid.

# 9. Commerce Protection

There is one shared commerce backend:

* ONE Shopify store
* ONE SumUp merchant account
* ONE Upstash Redis instance

Never create a new commerce backend for a landing.
Never generate:

* Shopify handles
* prices
* variant prices
* checkout identifiers
* payment identifiers
* Redis keys outside the established system
* fabricated commerce data

Commerce data is fetched from the existing commerce layer.
The following must remain protected:

* src/lib/shopify/*
* src/lib/sumup/*
* src/lib/kv.ts
* src/pages/api/**

Redis is load-bearing and MUST NOT be treated as disposable cache data.

# 10. Asset Isolation
Every product must have isolated assets.

Never use a global unqualified asset such as:

product.jpg

when generating multiple products.

Use product-scoped assets:
```text
products/
└── {productId}/
    ├── main.webp
    ├── 01.webp
    ├── 02.webp
    └── 03.webp
```

Asset references MUST be explicitly associated with the current productId.

Before rendering, verify that every referenced asset belongs to the current product.

# 11. Existing Functionality Is Sacred

Never break:

* checkout
* cart
* Shopify
* SumUp
* Redis
* analytics
* tracking
* responsive behavior
* API routes
* existing production behavior

Design variation must happen ABOVE the business-logic layer.

# 12. Do not introduce new dependencies during product generation.

If the design system requires a capability that does not exist,
stop and report it instead of installing a new package automatically.

# 13. Validation

Before considering a generation complete:

1. Validate product data.
2. Validate content.
3. Validate product consistency.
4. Validate design configuration.
5. Render the landing.
6. Run build/type checks.
7. Run QA.
8. Confirm no previous-product contamination.
9. Confirm commerce code was not modified.

A failed validation must block the next stage.

# 14. Important Principle

The AI decides:

WHAT the landing should say.

HOW the landing should look.

WHICH registered components should be used.

WHICH registered variants should be used.

The codebase decides:

HOW those components actually work.

The AI must never replace deterministic application logic with generated code
when an existing component, renderer, or configuration can perform the task.

# 15.  Repository Mapping

Template:

```text 
content/landing-base/

Generated output:

outputs/{slug}/

Content:

content/landing-base/src/data/

Design tokens:

content/landing-base/src/styles/global.css

Sections:

content/landing-base/src/components/sections/

Page entry:

content/landing-base/src/pages/index.astro

Types:

content/landing-base/src/types/

Commerce:

content/landing-base/src/lib/shopify/

Payments:

content/landing-base/src/lib/sumup/

Redis:

content/landing-base/src/lib/kv.ts

API:

content/landing-base/src/pages/api/
```

# 16. Execution Order

The canonical execution order is:

1. Scraping Agent
2. Content Agent
3. Product Consistency Validator
4. Design & Layout Agent
5. Landing Renderer / Code Agent
6. QA Agent

No stage may be skipped.

A failed stage blocks the following stage.


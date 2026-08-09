# 🧠 Agents System - Landing Generator (SDD)

This system generates high-converting landing pages based on a base Astro + React + TypeScript template.

Each agent has a strict responsibility and communicates via JSON.

---

# 1. 🧾 Content Agent

## Goal
Generate ALL textual content for the landing page.

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
{
  "hero": {
    "title": "",
    "subtitle": "",
    "cta": ""
  },
  "problem": {
    "title": "",
    "description": ""
  },
  "benefits": [
    { "title": "", "description": "" }
  ],
  "reviews": [
    { "name": "", "text": "", "rating": 5 }
  ],
  "faq": [
    { "question": "", "answer": "" }
  ],
  "cta": {
    "text": ""
  }
}

## Rules
- Use persuasive, conversion-focused copy
- Short sentences
- Focus on pain → solution
- NO lorem ipsum or generic text
- Match language input

---

# 2. 🎨 Design Agent

## Goal
Generate visual design tokens compatible with Tailwind CSS.

## Input
- product_name
- niche
- style

## Output
{
  "colors": {
    "primary": "#000000",
    "secondary": "#ffffff",
    "accent": "#ff0000",
    "background": "#f5f5f5"
  },
  "ui": {
    "border_radius": "md | lg | xl",
    "shadow": "soft | strong | none",
    "buttons": "rounded | square"
  },
  "fonts": {
    "heading": "Inter",
    "body": "Inter"
  }
}

## Rules
- Must be Tailwind-compatible
- High contrast for readability
- Style must match niche:
  - tech → minimal
  - beauty → soft
  - fitness → aggressive

---

# 3. 🧩 Layout Agent

## Goal
Define section order and structure.

## Input
- niche
- product type

## Output
{
  "sections_order": [
    "hero",
    "problem",
    "benefits",
    "reviews",
    "faq",
    "cta"
  ],
  "variations": {
    "hero": "centered | split | image-left",
    "cta": "sticky | inline"
  }
}

## Rules
- ALWAYS start with hero
- ALWAYS end with CTA
- Optimize for conversion
- Do NOT remove required sections

---

# 4. 🛠️ Code Agent

## Goal
Generate a fully working landing project.

## Input
- content.json (from Content Agent)
- design.json (from Design Agent)
- layout.json (from Layout Agent)

## Steps

1. Copy `/base-template` → `/outputs/{slug}`
2. Inject content into:
   - `/src/data/content.json`
3. Inject design into:
   - `/tailwind.config.ts`
   - global styles
4. Apply layout:
   - reorder sections in Astro pages
5. Replace images:
   - `/public/images`

## Output
- Fully functional Astro project

## STRICT Rules

- DO NOT modify:
  - business logic
  - hooks
  - scripts
  - analytics
- ONLY modify:
  - content
  - styles
  - assets
- Keep folder structure identical
- Must compile without errors

---

# 🔒 Global Constraints

- All outputs MUST be valid JSON
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
Extract product data from a given URL.

## Input
{
  "url": ""
}

## Output
{
  "title": "",
  "description": "",
  "features": [],
  "reviews": []
}

## Rules
- Extract raw data only
- DO NOT rewrite
- DO NOT invent data
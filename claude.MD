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
   - section ordering (if needed)

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

- Create new folder: `/outputs/{product-slug}`
- Copy base-template into new folder
- Replace:
  - `/src/data/content.json`
  - `/public/images`
  - Tailwind config (colors, fonts)
  - text inside components (via JSON only)

---

## Transformation Rules

### Copywriting
- Use high-conversion dropshipping structure:
  - Hero (hook + CTA)
  - Problem
  - Solution
  - Benefits
  - Social proof
  - FAQ
  - CTA repeated

### Design changes
- Modify:
  - primary color
  - font pairing
  - spacing density
  - button style

### Layout changes
- Can reorder sections based on conversion logic
- Must always:
  - start with HERO
  - end with CTA

---

## Constraints

- DO NOT break responsive behavior
- DO NOT remove required sections
- DO NOT modify component logic
- DO NOT introduce new dependencies

---

## Execution Flow

1. Receive product spec JSON
2. Trigger Content Agent → generate content.json
3. Trigger Design Agent → generate design.json
4. Trigger Layout Agent → generate layout.json
5. Trigger Code Agent → generate final project

---

## File Mapping

- Content → `/src/data/content.json`
- Design → `/tailwind.config.ts` + global styles
- Layout → Astro page structure
- Images → `/public/images`

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

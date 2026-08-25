// The ONE accessor for product/Benefits, shared by every variant.
//
// Unlike faq-items.ts or ugc-items.ts, this one is NOT thin: it carries real
// semantics that must never diverge between compositions.
//
// WHY A GLYPH RESOLVER EXISTS AT ALL. Nothing in this template had ever
// resolved an icon from DATA before. Every existing consumer reaches for one
// STATICALLY — `ICONS.shield` in 12-guarantee.astro and in
// ProductGuarantee/Default.astro, `ICONS.check` / `ICONS.cross` behind the
// named accessors in comparison-rows.ts. `benefit.icon` is the first icon id
// that arrives as content, which means it is the first one that can be wrong.
//
// AND IT ALREADY IS, ON REAL DATA. `ICONS` is typed
// `Record<Exclude<IconName, 'star'>, IconDef>` — the star glyph lives apart, as
// STAR_PATH/STAR_VIEWBOX, because ui/Stars.astro and islands/parts/Stars.tsx
// share it. But `IconName` DOES include 'star', and both real catalogues use it
// for a benefit: AstraVibe's "Luz nocturna estrellada" and NubeCalma's "Memory
// foam de alta densidad". A naive `ICONS[benefit.icon]` returns undefined for
// one benefit in four and emits <path d="undefined"> — a blank square, shipped
// green. That gap is the whole justification for this module; it is real logic,
// not symmetry.
//
// FAIL-CLOSED, MATCHING THE HOUSE RULE RATHER THAN INVENTING ONE. There is no
// existing fallback behaviour to respect here, because there is no existing
// dynamic lookup. So this follows what the rest of the system does with an
// unresolvable reference — index.astro throws on an unregistered capability,
// comparison-rows throws on empty data — and throws. A placeholder glyph would
// be a NEW silent fallback, which is exactly what this codebase forbids.
import { ICONS, STAR_PATH, STAR_VIEWBOX } from '@/lib/icons';
import { product } from '@/data/product';
import type { BenefitItem, IconName } from '@/types/content';

/** Section framing. Declared once so both variants are provably identical here. */
export const BENEFITS_EYEBROW = 'Por qué funciona';
export const BENEFITS_HEADING = 'Lo que hace la diferencia';

export interface Glyph {
  viewBox: string;
  path: string;
}

/**
 * Every IconName, including the one `ICONS` deliberately excludes. Built here
 * rather than in lib/icons.ts on purpose: ICONS' `Exclude<IconName, 'star'>`
 * shape is load-bearing for its .astro/.tsx twins, and widening it to please
 * one consumer would be the tail wagging the dog.
 */
const GLYPHS: Record<IconName, Glyph> = {
  ...ICONS,
  star: { viewBox: STAR_VIEWBOX, path: STAR_PATH },
};

/** `benefit.icon` -> real glyph, or a hard failure naming the offender. */
export function benefitGlyph(icon: IconName, composedBy: string): Glyph {
  const glyph = GLYPHS[icon];
  if (!glyph) {
    throw new Error(
      `Benefits (variant "${composedBy}") has a benefit whose icon is "${icon}", which is not ` +
        'a glyph this template can draw.\n' +
        `KNOWN ICONS: ${Object.keys(GLYPHS).sort().join(', ')}.\n` +
        'FIX: correct the `icon` field in src/data/product.ts. Do NOT add a placeholder ' +
        'glyph here — a benefit drawn with the wrong symbol is worse than a failed build, ' +
        'and this is the only place that would notice.',
    );
  }
  return glyph;
}

/**
 * The benefits this landing should show, or a hard failure.
 *
 * The guard is justified the same way Faq's is and the hero's is NOT: with an
 * empty array this section renders a heading over nothing — chrome around a
 * hole. The hero has no such failure mode, which is why hero-gallery.ts
 * deliberately carries no guard.
 */
export function benefitItems(composedBy: string): BenefitItem[] {
  // WIDENED ON PURPOSE: src/data/product.ts is `as const satisfies Product`
  // in the template, but a generated landing rewrites it and that array can be
  // empty even where the template's own literal never is.
  const items: BenefitItem[] = [...product.benefits];

  if (items.length === 0) {
    throw new Error(
      `Benefits (variant "${composedBy}") was composed into this landing, but ` +
        '`benefits` in src/data/product.ts is empty — the section would render a heading ' +
        'with nothing under it.\n' +
        'FIX ONE OF THESE:\n' +
        '  - add at least one entry to `benefits` in src/data/product.ts, or\n' +
        '  - remove the product/Benefits section from src/data/design.ts.\n' +
        'This should have been caught upstream: the capability declares ' +
        'requiresData: ["product.benefits"] at BOTH variants, and checkDesignSupport() ' +
        'rejects the pairing at design time and again at generation time. Reaching this ' +
        'throw means a DesignSpec bypassed both gates.',
    );
  }

  return items;
}

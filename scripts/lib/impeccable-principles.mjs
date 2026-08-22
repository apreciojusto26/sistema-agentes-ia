// Impeccable as a source of VISUAL CRITERION for the Design Agent.
// Reference: https://github.com/pbakaus/impeccable
//
// ─── WHAT THIS MODULE IS, AND WHAT IT DELIBERATELY IS NOT ──────────────────
//
// Impeccable ships a skill, 23 slash commands, a browser extension and a CLI
// detector with 59 deterministic rules that scan built HTML/CSS. NONE of that
// runs here, on purpose:
//
//   - its commands EDIT source. This pipeline forbids an agent touching the
//     landing after render, and `src/components/**` is a protected path.
//   - its detector reads built HTML. By the time HTML exists the DesignSpec is
//     already frozen, so a finding could not influence any decision — only
//     provoke an edit, which is exactly what is not allowed.
//   - adding it as a dependency would violate the "no new dependency during
//     product generation" rule (CLAUDE.md §12).
//
// So its PRINCIPLES are re-expressed here in THIS system's vocabulary — theme
// tokens and registry capabilities — where they can shape the DesignSpec
// before anything is rendered. Nothing here restates the registry's
// vocabulary (families, densities, capability triples, token names): that
// remains the registry's alone. This module only judges the QUALITY of values
// the contract has already declared legal, which is why it cannot become a
// second source of truth.
//
// ─── AUTHORITY ORDER (binding) ─────────────────────────────────────────────
//
//   SDD contracts / DesignSpec  >  Design Agent rules  >  Impeccable  >  model
//
// Consequence, implemented in generate-design.mjs: a contract violation is
// FATAL and can never be rendered. An Impeccable finding is ADVISORY — it
// buys a correction turn, and if the model still disagrees after its attempts
// the contract-valid spec ships with the findings emitted as warnings. Letting
// taste block a structurally valid generation would put Impeccable ABOVE the
// contracts, inverting the order above.

/** Prompt text. Kept declarative — these are criteria, not extra vocabulary. */
export const IMPECCABLE_PROMPT = [
  'CRITERIO VISUAL (principios Impeccable — https://github.com/pbakaus/impeccable).',
  'Aplicalos SIEMPRE que no contradigan el contrato ni el vocabulario permitido.',
  'Si un principio choca con el contrato, MANDA EL CONTRATO.',
  '',
  'Jerarquía visual: una sola idea dominante por pantalla. El hero manda; el resto lo apoya.',
  '  Escaleras de tamaño claras — si dos cosas tienen casi el mismo tamaño, ninguna destaca.',
  'Tipografía: evitá defaults genéricos. Arial, Helvetica, Inter o system-ui como fuente de',
  '  display gritan "hecho por IA". Si tocás fonts, elegí una stack con carácter.',
  'Color y contraste: nunca gris sobre color. Evitá negro puro (#000) y blanco puro sobre',
  '  fondos amplios: usá neutros TEÑIDOS hacia el acento. El texto sobre su fondo debe superar',
  '  WCAG AA (4.5:1). Un acento, no tres.',
  'Spacing y ritmo: el espacio es jerarquía. Agrupá lo relacionado, separá lo distinto.',
  '  Elegí "density" a conciencia: compact para catálogos densos, airy para producto premium.',
  'Composición: variá el ritmo de secciones. Tres bloques seguidos de la misma categoría',
  '  aplanan la página.',
  'Consistencia: repetí radios y sombras; no mezcles cinco radios distintos.',
  '',
  'ANTI-PATTERNS a evitar (marcas de frontend generado por IA):',
  '  - gradiente violeta→azul como acento;',
  '  - abuso de cards: todo metido en una tarjeta con borde y sombra;',
  '  - icon tiles: cuadraditos redondeados con un ícono adentro, repetidos en grilla;',
  '  - sombras infladas en todo;',
  '  - tipografías genéricas por defecto;',
  '  - repetir la misma prueba social tres veces seguidas.',
].join('\n');

// ─── deterministic checks over the DesignSpec ──────────────────────────────

const GENERIC_DISPLAY_FONTS = ['arial', 'helvetica', 'inter', 'system-ui', 'roboto', 'segoe ui', 'sans-serif'];

/** #RGB / #RRGGBB → {r,g,b}, else null. Only hex is inspected: the other
 * colour functions the contract accepts are not worth a parser here. */
export function parseHex(value) {
  if (typeof value !== 'string') return null;
  const m = value.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}

const channel = (c) => {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

/** WCAG 2.1 relative luminance. */
export function luminance({ r, g, b }) {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio between two hex colours, or null if either is unparseable. */
export function contrastRatio(hexA, hexB) {
  const a = parseHex(hexA);
  const b = parseHex(hexB);
  if (!a || !b) return null;
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Hue in degrees, for the purple→blue "AI tell" band. */
export function hue({ r, g, b }) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  if (d === 0) return null;
  let h;
  if (max === rn) h = ((gn - bn) / d) % 6;
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}

/**
 * Judges a CONTRACT-VALID DesignSpec against the principles above.
 * Returns advisory findings — never contract errors. An empty array means
 * "nothing to say", not "certified beautiful".
 */
export function collectImpeccableFindings(spec) {
  const findings = [];
  const theme = spec?.theme ?? {};
  const colors = theme.colors ?? {};
  const fonts = theme.fonts ?? {};
  const sections = Array.isArray(spec?.sections) ? spec.sections : [];

  // --- typography: generic display font -----------------------------------
  if (typeof fonts.display === 'string') {
    // Normalise before comparing: a live run returned `"Inter Variable"`,
    // which an exact-match check waved through even though Impeccable names
    // Inter explicitly. Foundry suffixes (Variable/VF/Tight/Display) are
    // dropped so the family itself is what gets judged.
    const first = fonts.display
      .split(',')[0]
      .replace(/["']/g, '')
      .replace(/\b(variable|vf|tight|display|text|pro)\b/gi, '')
      .trim()
      .toLowerCase();
    if (GENERIC_DISPLAY_FONTS.includes(first)) {
      findings.push({
        rule: 'generic-display-font',
        message: `fonts.display arranca con "${first}", una tipografía genérica que lee como frontend generado por IA. Elegí una stack con carácter o no toques fonts.`,
      });
    }
  }

  // --- colour: pure neutrals used as the accent ---------------------------
  for (const key of ['rust', 'gold']) {
    const rgb = parseHex(colors[key]);
    if (rgb && rgb.r === rgb.g && rgb.g === rgb.b) {
      findings.push({
        rule: 'untinted-accent',
        message: `colors.${key} = ${colors[key]} es un gris puro. Un acento sin tinte no acentúa nada; teñilo hacia el color de marca.`,
      });
    }
  }

  // --- colour: the purple→blue AI tell ------------------------------------
  const accentHues = ['rust', 'gold']
    .map((k) => parseHex(colors[k]))
    .filter(Boolean)
    .map(hue)
    .filter((h) => h !== null);
  // Band bounds measured, not guessed: the two canonical "AI gradient" hues
  // are #2563EB (blue-600) at ~221° and #7C3AED (violet-600) at ~262°. A band
  // starting at 230° would have missed the blue end entirely.
  if (accentHues.length === 2 && accentHues.every((h) => h >= 215 && h <= 295)) {
    findings.push({
      rule: 'purple-blue-gradient-tell',
      message: 'Los dos acentos caen en la banda azul→violeta (215°–295°), la marca registrada del frontend generado por IA. Diferenciá al menos uno.',
    });
  }

  // --- colour: body contrast ----------------------------------------------
  if (colors.bone && colors.graphite) {
    const ratio = contrastRatio(colors.bone, colors.graphite);
    if (ratio !== null && ratio < 4.5) {
      findings.push({
        rule: 'insufficient-contrast',
        message: `El contraste texto/fondo (graphite ${colors.graphite} sobre bone ${colors.bone}) es ${ratio.toFixed(2)}:1, por debajo de WCAG AA 4.5:1.`,
      });
    }
  }

  // --- composition: rhythm -------------------------------------------------
  const ordered = [...sections].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  let run = 1;
  for (let i = 1; i < ordered.length; i++) {
    if (ordered[i].category === ordered[i - 1].category) {
      run++;
      if (run === 3) {
        findings.push({
          rule: 'flat-section-rhythm',
          message: `Tres secciones seguidas de categoría "${ordered[i].category}" aplanan la página. Intercalá otra categoría.`,
        });
        break;
      }
    } else {
      run = 1;
    }
  }

  // --- composition: the page must still sell ------------------------------
  const categories = new Set(ordered.map((s) => s.category));
  if (!categories.has('conversion')) {
    findings.push({
      rule: 'missing-conversion',
      message: 'La composición no incluye ninguna sección de conversión. Una landing de producto sin cierre no convierte.',
    });
  }
  if (!categories.has('socialProof')) {
    findings.push({
      rule: 'missing-social-proof',
      message: 'La composición no incluye prueba social. Sin ella el producto no tiene credibilidad.',
    });
  }

  // --- consistency: radius soup -------------------------------------------
  const radii = Object.values(theme.radius ?? {}).filter((v) => typeof v === 'string');
  if (new Set(radii).size >= 4) {
    findings.push({
      rule: 'inconsistent-radius',
      message: `Definís ${new Set(radii).size} radios distintos. Repetir pocos valores lee como sistema; muchos leen como accidente.`,
    });
  }

  return findings;
}

/** One-line-per-finding text used as the correction turn sent back to the model. */
export function describeFindings(findings) {
  return findings.map((f) => `[${f.rule}] ${f.message}`).join('\n');
}

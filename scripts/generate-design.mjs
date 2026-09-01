#!/usr/bin/env node
// Design & Layout Agent (agents.MD §5) — Fase 3.
//
// Reads a CanonicalProduct + the generated content.json and produces a
// DesignSpec that `generate-landing.mjs --design` can consume.
//
// Usage:
//   node scripts/generate-design.mjs --product <canonical-product.json> \
//     --content <content.json> --out <design.json> \
//     [--attempts-dir <dir>] [--model <model>]
//
// DELIBERATE REUSE, NOT DUPLICATION: the Gemini transport, the failure
// taxonomy, the correction-feedback turn and the secret redactor are IMPORTED
// from generate-content.mjs, which already exports them and carries a
// no-tools guarantee (admin/test/no-gemini-tools.test.ts). This module adds
// only what is genuinely design-specific: the prompt, the validation loop
// against the Fase 1 design contract, and the writer.
//
// The vocabulary the model is allowed to use is DERIVED FROM THE REGISTRY at
// runtime — never restated here. A hardcoded capability list would be a
// second source of truth and would drift the moment the registry changes,
// which is exactly what the Fase 1/2 anti-drift doctrine forbids.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  buildRequestBody,
  callGemini,
  diagnose,
  extractText,
  feedbackTurn,
  geminiKey,
  redact,
  stripFence,
  wrapScrapedData,
} from './generate-content.mjs';
import { collectDesignErrors, checkDesignSupport, DESIGN_SPEC_SCHEMA } from './lib/design-contract.mjs';
import {
  REGISTRY,
  DESIGN_FAMILIES,
  DESIGN_DENSITIES,
  THEME_TOKENS,
  THEME_TEXT_FIELDS,
  capabilityKey,
} from './lib/design-registry.mjs';
import {
  IMPECCABLE_PROMPT,
  collectImpeccableFindings,
  describeFindings,
} from './lib/impeccable-principles.mjs';
import { SECTION_WIDTHS, SECTION_RHYTHMS } from './lib/design-contract.mjs';
import events from './lib/events.cjs';

const GEMINI_REQUEST_TIMEOUT_MS = 120_000;
const MAX_ATTEMPTS = 3;

// --- structured progress protocol (same shape as the other two agents) ----
const emit = process.env.LG_EVENTS === '1' ? events.createEmitter('design') : () => {};

let currentStage = null;

function stageStart(stage) {
  currentStage = stage;
  emit('stage.start', stage);
}

function stageEnd(stage, ms) {
  emit('stage.end', stage, { ms: ms ?? null });
  currentStage = null;
}

function fail(msg, code) {
  emit('error', currentStage, { message: msg, code });
  console.error(`✗ ${msg}`);
  process.exit(1);
}

// --- CLI ------------------------------------------------------------------

export function parseArgs(argv) {
  const args = { model: 'gemini-2.5-flash' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--product') args.productPath = argv[++i];
    else if (a === '--content') args.contentPath = argv[++i];
    else if (a === '--out') args.outPath = argv[++i];
    else if (a === '--attempts-dir') args.attemptsDir = argv[++i];
    else if (a === '--model') args.model = argv[++i];
    else if (a === '--product-id') args.productId = argv[++i];
  }
  if (!args.productPath) fail('Missing --product <path>', 'design-argument-missing');
  if (!args.contentPath) fail('Missing --content <path>', 'design-argument-missing');
  if (!args.outPath) fail('Missing --out <path>', 'design-argument-missing');
  return args;
}

// --- prompt ---------------------------------------------------------------

/** The catalogue the agent may compose from, derived from the live registry.
 * Shell capabilities are absent by construction — they are not in REGISTRY. */
export function buildCapabilityCatalogue(registry = REGISTRY) {
  return registry.map((entry) => {
    const props = Object.entries(entry.propsSchema ?? {}).map(
      ([name, rule]) => `${name}: ${JSON.stringify(rule.enum ?? rule.type)}`,
    );
    return {
      key: capabilityKey(entry.category, entry.type, entry.variant),
      category: entry.category,
      type: entry.type,
      variant: entry.variant,
      props: props.length ? props.join(', ') : 'ninguna',
      // Only the axes this capability actually implements. A block that reads
      // neither shows nothing, so the agent is never offered a decision that
      // would be rejected.
      layout: (entry.layoutAxes ?? []).length
        ? `, layout: ${(entry.layoutAxes ?? []).join(' + ')}`
        : '',
      // Surfaced in the prompt so the model can avoid an unfeedable capability
      // on the FIRST attempt. The contract still rejects it either way — this
      // just stops a correction turn being spent on something knowable upfront.
      requiresData: entry.requiresData ?? [],
    };
  });
}

export function buildSystemInstruction() {
  const catalogue = buildCapabilityCatalogue()
    .map((c) => {
      const needs = c.requiresData.length ? `, necesita datos: ${c.requiresData.join(' + ')}` : '';
      return `- ${c.key}  (props: ${c.props}${needs}${c.layout})`;
    })
    .join('\n');

  const tokens = Object.entries(THEME_TOKENS)
    .map(([group, keys]) => `  ${group}: ${keys.join(', ')}`)
    .join('\n');

  return [
    'Sos el Design & Layout Agent de un generador de landings de producto.',
    'Decidís CÓMO se ve y cómo se compone la landing. NO escribís textos ni inventás datos del producto.',
    '',
    'Devolvés EXCLUSIVAMENTE un objeto JSON (un DesignSpec), sin markdown ni comentarios, con esta forma:',
    `{"schema": ${DESIGN_SPEC_SCHEMA}, "design": {"family": "...", "density": "..."}, "theme": {...}, "sections": [...]}`,
    'NO incluyas "productId": la identidad del producto la pone el sistema, no vos.',
    '',
    `"design.family" DEBE ser uno de: ${DESIGN_FAMILIES.join(', ')}.`,
    `"design.density" DEBE ser uno de: ${DESIGN_DENSITIES.join(', ')}.`,
    'Elegí family y density según el producto y su público: no elijas siempre lo mismo.',
    '',
    '"theme" es OPCIONAL. Si lo incluís, sólo puede tener estos grupos y estas claves exactas:',
    tokens,
    `Cada entrada de "text" puede tener: ${THEME_TEXT_FIELDS.join(', ')}.`,
    'Los colores deben ser hex (#RRGGBB). No inventes claves nuevas: una clave desconocida hace fallar la generación.',
    '',
    'CRÍTICO — los VALORES son CSS real, nunca el nombre de otro token:',
    '  radius.* → una longitud CSS: "0.5rem", "1.5rem", "999px". NUNCA "pill" ni "card".',
    '  shadow.* → una sombra CSS completa: "0 2px 10px -3px rgb(30 33 36 / 0.10)" o "none". NUNCA "lift" ni "card".',
    '  fonts.*  → una font stack: \'"Inter Variable", ui-sans-serif, system-ui, sans-serif\'.',
    '  text.*.size/lineHeight/letterSpacing → longitudes: "2.5rem", "1.05", "-0.02em".',
    'Un valor como "pill" en radius produce CSS inválido que el navegador descarta en silencio.',
    'Si no estás seguro de un valor, OMITÍ ese grupo entero: "theme" es opcional y el template ya trae valores buenos.',
    '',
    '"sections" es la lista ORDENADA del área de contenido flexible. Cada elemento:',
    '{"category": "...", "type": "...", "variant": "...", "order": N, "props": {...}}',
    '"order" arranca en 0 y es consecutivo. "props" sólo si la capacidad declara props.',
    '',
    'SOLO podés usar estas capacidades registradas (category/type/variant):',
    catalogue,
    '',
    'Reglas duras:',
    '- No inventes capacidades, variantes ni props que no estén en la lista. Se rechaza y falla.',
    '- Si una capacidad dice "necesita datos", MIRÁ el contenido de arriba antes de usarla. Por ejemplo',
    '  socialProof/ReviewsReel necesita testimonials con variant "reel": si no hay ninguno, esa',
    '  sección se renderiza vacía y la generación se rechaza. Elegí otra o no la incluyas.',
    '- No incluyas el shell (header, footer, barra sticky, carrito): lo renderiza el sistema.',
    '- Incluí siempre al menos una sección de conversión y una de prueba social.',
    '- Ordená pensando en la conversión: enganchar, mostrar, convencer, resolver dudas, cerrar.',
    '- No repitas la misma capacidad dos veces.',
    '',
    // Criterion layer. Sits BELOW the contract and the hard rules above and
    // ABOVE the model's free preference — see impeccable-principles.mjs.
    // LAYOUT VOCABULARY. Derived from the contract, never hardcoded here — the
    // enums the prompt offers and the enums the validator accepts are the same
    // arrays, so the two cannot drift.
    //
    // Deliberately NOT taught as "editorial means spacious". The agent chooses
    // per section from context; the FAMILY decides what the words are worth in
    // CSS, so the same choice reads differently in editorial and ecommerce.
    '',
    'Algunas capabilities aceptan un "layout" opcional con la composición de ESA instancia.',
    'El catálogo de arriba dice cuáles: sólo las que muestran "layout:" lo soportan.',
    'Ponerlo en una que no lo declara INVALIDA el spec — no es un no-op, es un error.',
    `  layout.width: ${SECTION_WIDTHS.map((w) => `"${w}"`).join(' | ')}`,
    `  layout.rhythm: ${SECTION_RHYTHMS.map((r) => `"${r}"`).join(' | ')}`,
    'No es un prop del bloque: un Faq es el mismo Faq contained o wide. Es dónde vive esa',
    'sección en la página.',
    'Omitir "layout" deja la sección como está hoy — es una decisión válida, no un olvido.',
    'USALO PARA CREAR RITMO, no para decorar: si todas las secciones llevan el mismo rhythm,',
    'la página vuelve a leerse como una plantilla. Alterná respiración según lo que cada',
    'sección pide — una galería puede querer amplitud, un FAQ no.',
    'NUNCA escribas CSS ni clases Tailwind acá: sólo estas palabras.',
    IMPECCABLE_PROMPT,
  ].join('\n');
}

export function buildFirstUserTurn({ product, content }) {
  return [
    'Producto normalizado (datos factuales, NO los cambies):',
    wrapScrapedData(product),
    '',
    'Contenido ya generado para esta landing (te sirve para entender tono y volumen):',
    wrapScrapedData(content),
    '',
    'Devolvé el DesignSpec JSON.',
  ].join('\n');
}

// --- validation loop ------------------------------------------------------

/** Contract issues, rendered as the correction feedback the model receives. */
function describeIssues(issues) {
  return issues.map((i) => `${i.code}${i.at ? ` (${i.at})` : ''}: ${i.message}`).join(' | ');
}

function persistAttempt(attemptsDir, attempt, payload) {
  if (!attemptsDir) return;
  mkdirSync(attemptsDir, { recursive: true });
  writeFileSync(
    path.join(attemptsDir, `design-attempt-${attempt}.json`),
    JSON.stringify(payload, null, 2),
  );
}

export async function runDesignLoop({ model, key, contents, systemInstruction, attemptsDir, productId, content = null }) {
  let attempt = 1;
  let lastIssues = 'sin detalle';

  while (attempt <= MAX_ATTEMPTS) {
    emit('progress', 'generate', {
      done: attempt,
      total: MAX_ATTEMPTS,
      label: `intento ${attempt} de ${MAX_ATTEMPTS}`,
    });

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), GEMINI_REQUEST_TIMEOUT_MS);
    let httpStatus;
    let json;
    try {
      ({ httpStatus, json } = await callGemini(buildRequestBody({ systemInstruction, contents }), ac.signal, {
        model,
        key,
      }));
    } catch (cause) {
      clearTimeout(timer);
      return { ok: false, code: 'design-transport', message: `Transporte Gemini: ${cause?.message ?? cause}` };
    }
    clearTimeout(timer);

    // REUSE WITH A DELIBERATE NARROWING. `diagnose()` bundles two things: the
    // transport/quota/refusal taxonomy (provider-level, agent-agnostic) and a
    // `collectContentErrors()` verdict (content-specific). Only the first half
    // applies here — a DesignSpec would ALWAYS come back `kind:'invalid'` from
    // the content contract, which says nothing about whether it is a valid
    // DesignSpec. So: honour every FATAL outcome and the unparseable case,
    // then take `diagnosis.parsed` and judge it with the DESIGN contract.
    // Reimplementing the transport taxonomy here instead would have been a
    // second source of truth for provider failures.
    const diagnosis = diagnose(httpStatus, json);

    if (diagnosis.fatal) {
      persistAttempt(attemptsDir, attempt, { httpStatus, diagnosis });
      return { ok: false, code: `design-${diagnosis.kind}`, message: diagnosis.message };
    }

    if (diagnosis.kind === 'unparseable') {
      lastIssues = diagnosis.message;
      persistAttempt(attemptsDir, attempt, { httpStatus, diagnosis });
      contents = [...contents, feedbackTurn(diagnosis)];
      attempt++;
      continue;
    }

    const parsed = diagnosis.parsed ?? JSON.parse(stripFence(extractText(json) ?? ''));

    // IDENTITY IS NOT THE AGENT'S TO DECIDE (same doctrine as the Content
    // Agent, which strips identity/provenance before the model ever sees it).
    // The contract requires a well-formed productId, so it is stamped by the
    // PIPELINE here, before validation. Left to itself the model invents one
    // — the first live run produced `prd_kr37v57m6-4q9y2x1z`, which is not a
    // real product id and would have failed generate-landing's ownership gate
    // anyway. Overwriting unconditionally means a model-invented value can
    // never survive, not even by accident.
    if (productId) parsed.productId = productId;

    // Fase 1 contract — shape first, then capability support. Both must pass:
    // an unsupported capability is NOT a warning, it aborts (agents.MD §6.3).
    const errors = collectDesignErrors(parsed);
    if (errors.length > 0) {
      lastIssues = describeIssues(errors);
      persistAttempt(attemptsDir, attempt, { httpStatus, parsed, issues: errors });
      emit('warn', 'generate', { message: `intento ${attempt}: ${lastIssues}` });
      contents = [...contents, { role: 'model', parts: [{ text: JSON.stringify(parsed) }] }, {
        role: 'user',
        parts: [{ text: `El DesignSpec no pasó el contrato. Corregí EXACTAMENTE esto y devolvé el JSON completo: ${lastIssues}` }],
      }];
      attempt++;
      continue;
    }

    // Belt-and-braces, mirroring generate-landing.mjs's own two-step gate.
    // NOTE the contract's vocabulary: the success value is 'pass', NOT 'ok'
    // (design-contract.mjs:590), and `missingCapability` is a single
    // capability key string, never an array.
    //
    // `content` makes this DATA-AWARE: a capability the registry declares but
    // this content.json cannot feed comes back as `unsatisfied_data` and buys
    // a correction turn, exactly like an unknown capability. This is the
    // PRIMARY gate — the renderer must never be the first layer to discover
    // that a section had nothing to draw.
    const support = checkDesignSupport(parsed, undefined, content);
    if (support.status !== 'pass') {
      lastIssues = `${support.status}: ${support.missingCapability ?? describeIssues(support.issues ?? [])}`;
      persistAttempt(attemptsDir, attempt, { httpStatus, parsed, issues: support });
      emit('warn', 'generate', { message: `intento ${attempt}: ${lastIssues}` });

      // Two different failures deserve two different instructions. Telling the
      // model "esa capacidad no existe" when it picked a real one that simply
      // lacks data teaches it the wrong lesson and it will avoid a perfectly
      // good section on the next product.
      const correction =
        support.status === 'unsatisfied_data'
          ? 'Elegiste secciones para las que NO hay contenido disponible, así que se renderizarían vacías: ' +
            `${support.unsatisfied.map((u) => `${u.capability} necesita "${u.requirement}"`).join('; ')}. ` +
            'Reemplazalas por capacidades que el contenido SÍ pueda alimentar, o sacalas. ' +
            'Devolvé el JSON completo con "order" consecutivo desde 0.'
          : `Usaste capacidades que NO existen: ${lastIssues}. Usá sólo las de la lista permitida.`;

      contents = [...contents, { role: 'model', parts: [{ text: JSON.stringify(parsed) }] }, {
        role: 'user',
        parts: [{ text: correction }],
      }];
      attempt++;
      continue;
    }

    // ── Impeccable: ADVISORY tier, never fatal ───────────────────────────
    // The spec is already contract-valid at this point, so it COULD ship.
    // A finding buys one correction turn; if attempts run out the spec ships
    // anyway with the findings emitted as warnings. Blocking here would put
    // taste above the contracts and invert the authority order.
    const findings = collectImpeccableFindings(parsed);
    if (findings.length > 0 && attempt < MAX_ATTEMPTS) {
      persistAttempt(attemptsDir, attempt, { httpStatus, parsed, impeccable: findings });
      emit('warn', 'generate', { message: `intento ${attempt} — criterio visual: ${findings.map((f) => f.rule).join(', ')}` });
      contents = [
        ...contents,
        { role: 'model', parts: [{ text: JSON.stringify(parsed) }] },
        {
          role: 'user',
          parts: [{
            text:
              'El DesignSpec es contractualmente válido, pero incumple el criterio visual. ' +
              `Corregí SOLO esto y devolvé el JSON completo:\n${describeFindings(findings)}`,
          }],
        },
      ];
      attempt++;
      continue;
    }

    persistAttempt(attemptsDir, attempt, { httpStatus, parsed, accepted: true, impeccable: findings });
    return { ok: true, spec: parsed, attempts: attempt, findings };
  }

  return {
    ok: false,
    code: 'design-invalid',
    message: `No se pudo generar un DesignSpec válido en ${MAX_ATTEMPTS} intentos: ${lastIssues}`,
  };
}

// --- main -----------------------------------------------------------------

async function main() {
  const t0 = Date.now();
  const args = parseArgs(process.argv.slice(2));

  stageStart('prepare');
  if (!existsSync(args.productPath)) fail(`Product file not found: ${args.productPath}`, 'design-input-missing');
  if (!existsSync(args.contentPath)) fail(`Content file not found: ${args.contentPath}`, 'design-input-missing');
  const product = JSON.parse(readFileSync(args.productPath, 'utf8'));
  const content = JSON.parse(readFileSync(args.contentPath, 'utf8'));
  const key = geminiKey();
  stageEnd('prepare', Date.now() - t0);

  const productId = args.productId ?? product?.identity?.productId ?? null;
  if (!productId) {
    fail('No productId: pasá --product-id o usá un producto canónico con identity.productId', 'design-product-id-missing');
  }

  stageStart('generate');
  const tGen = Date.now();
  const outcome = await runDesignLoop({
    model: args.model,
    key,
    systemInstruction: buildSystemInstruction(),
    contents: [{ role: 'user', parts: [{ text: buildFirstUserTurn({ product, content }) }] }],
    attemptsDir: args.attemptsDir,
    productId,
    content,
  });

  if (!outcome.ok) {
    emit('error', 'generate', { message: redact(outcome.message, key), code: outcome.code });
    console.error(`✗ ${redact(outcome.message, key)}`);
    process.exit(1);
  }
  stageEnd('generate', Date.now() - tGen);

  stageStart('save');
  const tSave = Date.now();
  // Identity was already stamped inside the loop, BEFORE validation, so the
  // written spec is exactly the document the contract accepted.
  const spec = outcome.spec;

  mkdirSync(path.dirname(path.resolve(args.outPath)), { recursive: true });
  writeFileSync(args.outPath, `${JSON.stringify(spec, null, 2)}\n`);
  stageEnd('save', Date.now() - tSave);

  console.log(`✓ DesignSpec escrito en ${args.outPath}`);
  console.log(`  family=${spec.design.family} density=${spec.design.density} sections=${spec.sections.length}`);

  // Surfaced, never swallowed: a spec that shipped WITH findings is a spec the
  // model refused to fix within its attempts, and the operator should know.
  const residual = outcome.findings ?? [];
  if (residual.length > 0) {
    console.warn(`  ! criterio visual sin resolver (${residual.length}):`);
    for (const f of residual) console.warn(`    - [${f.rule}] ${f.message}`);
  } else {
    console.log('  ✓ criterio visual Impeccable: sin observaciones');
  }

  emit('result', null, {
    outPath: args.outPath,
    productId,
    family: spec.design.family,
    density: spec.design.density,
    sections: spec.sections.length,
    attempts: outcome.attempts,
    impeccableFindings: residual.map((f) => f.rule),
  });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    const message = err instanceof Error ? err.message : String(err);
    emit('error', currentStage, { message: redact(message, process.env.GEMINI_API_KEY) });
    console.error(`✗ ${message}`);
    process.exitCode = 1;
  });
}

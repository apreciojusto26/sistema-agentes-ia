// Pure label derivation for ContentStageState (spec "Content/Design Stage —
// Honest Warmth Copy"; design §3.3). Split into two exhaustive functions —
// `contentStageLabelShort` for the sidebar (must fit one narrow line) and
// `contentStageLabelLong` for the panel body (full sentence) — so the
// sidebar chip and ManualArtifactPanel never drift apart without either
// component importing the other. Framing is "te toca a vos" (waiting on the
// user), never "en progreso"/"generando" (D4) — this stage never runs a
// child process, so implying agent activity here would be dishonest.
import type { ContentStageState } from '../../shared/content-stage';
import { assertNever } from '../../shared/assert-never';

export function contentStageLabelShort(state: ContentStageState): string {
  switch (state.kind) {
    case 'idle':
      return 'te toca a vos';
    case 'received':
      return 'revisando';
    case 'unparseable':
      return 'el archivo no es JSON válido';
    case 'invalid':
      return state.issues.length === 1 ? '1 error' : `${state.issues.length} errores`;
    case 'validated':
      return 'listo';
    default:
      return assertNever(state);
  }
}

export function contentStageLabelLong(state: ContentStageState): string {
  switch (state.kind) {
    case 'idle':
      return 'Te toca a vos: pegá acá abajo el content.json con los textos y el diseño.';
    case 'received':
      return 'Recibí el archivo y lo estoy revisando.';
    case 'unparseable':
      return `El archivo no es un JSON válido: ${state.parseError}`;
    case 'invalid':
      return state.issues.length === 1 ? 'Hay 1 error para corregir' : `Hay ${state.issues.length} errores para corregir`;
    case 'validated': {
      const { productFields, faqCount, testimonialCount, hasDesign } = state.summary;
      return `Listo — ${productFields} campos del producto, ${faqCount} preguntas frecuentes, ${testimonialCount} testimonios${
        hasDesign ? ', incluye colores y tipografías' : ''
      }`;
    }
    default:
      return assertNever(state);
  }
}

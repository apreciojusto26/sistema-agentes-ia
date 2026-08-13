// Pure label derivation for ContentStageState (spec R7's three-state wording:
// "waiting for content.json" -> artifact-received -> "validated |
// invalid (n errors)"). Shared between AgentSidebarItem's manual chip and
// ManualArtifactPanel so the two never drift apart, without either
// component importing the other.
import type { ContentStageState } from '../../shared/content-stage';
import { assertNever } from '../../shared/assert-never';

export function contentStageLabel(state: ContentStageState): string {
  switch (state.kind) {
    case 'idle':
      return 'waiting for content.json';
    case 'received':
      return 'artifact received';
    case 'unparseable':
      return 'unparseable JSON';
    case 'invalid':
      return `invalid (${state.issues.length} error${state.issues.length === 1 ? '' : 's'})`;
    case 'validated':
      return 'validated';
    default:
      return assertNever(state);
  }
}

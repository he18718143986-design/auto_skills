import { renderDecisionPauseBar } from './DecisionPauseBar';
import { preparePauseBarShell, type PauseBarUiState } from './PauseBarShell';
import { renderStandardPauseBar } from './StandardPauseBar';

export function renderPauseBar(stageId: string, uiState: PauseBarUiState): void {
  const ctx = preparePauseBarShell(stageId, uiState);
  if (ctx.decision) {
    renderDecisionPauseBar(ctx);
    return;
  }
  renderStandardPauseBar(ctx);
}

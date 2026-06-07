import type { PauseUiState } from '../../../WebviewPauseUiState';
import { execStore } from '../stores';

const maps = execStore.stageMaps;
import { resetPauseBarShell } from '../view-exec-output-panel';

/** pause-bar 渲染所需字段（不含 showPauseBar 可见性开关）。 */
export type PauseBarUiState = Omit<PauseUiState, 'showPauseBar'>;

export interface PauseBarShellContext {
  scroll: HTMLElement;
  dock: HTMLElement;
  stageId: string;
  uiState: PauseBarUiState;
  outputText: string;
  decision: boolean;
}

export function preparePauseBarShell(stageId: string, uiState: PauseBarUiState): PauseBarShellContext {
  const { scroll, dock } = resetPauseBarShell();
  const outputText = maps.stageOutputs[stageId] ?? document.getElementById('output')!.textContent ?? '';
  const decision = uiState.mode === 'decision';
  return { scroll, dock, stageId, uiState, outputText, decision };
}

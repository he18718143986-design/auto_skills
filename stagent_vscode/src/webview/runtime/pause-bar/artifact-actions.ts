import { wMsg } from '../../l10n/wMsg';
import {
  FRONTEND_MSG_OPEN_ARTIFACT_DIFF,
  FRONTEND_MSG_OPEN_ARTIFACT_FILE,
} from '../../../workflow/FrontendMessageTypes';
import { confirmStore, execStore } from '../stores';

const maps = execStore.stageMaps;
import { vscode } from '../vscode-api';

export function collectArtifactHintsForStage(stageId: string) {
  const hints = (maps.stageArtifacts[stageId] || []).slice();
  const st = confirmStore.workflowDef?.stages?.find((s: { id: string }) => s.id === stageId);
  if (st) {
    const rel = getStageArtifactPath(st as Record<string, unknown>);
    if (rel && !hints.some((h: { filePath: string }) => h.filePath === rel || h.filePath.endsWith('/' + rel))) {
      hints.push({ filePath: rel, canDiff: false });
    }
  }
  return hints;
}

export function appendStageArtifactActions(bar: HTMLElement, stageId: string) {
  const hints = collectArtifactHintsForStage(stageId);
  if (!hints.length) return;
  const row = document.createElement('div');
  row.className = 'artifact-row';
  const label = document.createElement('span');
  label.className = 'muted';
  label.textContent = wMsg('stagent.webview.pause.artifactLabel');
  row.appendChild(label);
  hints.forEach((h: { filePath: string; canDiff?: boolean; state?: string }) => {
    const base = h.filePath.split('/').pop() || h.filePath;
    const viewBtn = document.createElement('button');
    viewBtn.className = 'secondary';
    viewBtn.textContent = wMsg('stagent.webview.pause.viewArtifact', base);
    viewBtn.onclick = () => vscode.postMessage({ type: FRONTEND_MSG_OPEN_ARTIFACT_FILE, stageId, filePath: h.filePath });
    row.appendChild(viewBtn);
    if (h.canDiff) {
      const diffBtn = document.createElement('button');
      diffBtn.className = 'secondary';
      diffBtn.textContent = wMsg('stagent.webview.pause.diffArtifact');
      diffBtn.onclick = () => vscode.postMessage({ type: FRONTEND_MSG_OPEN_ARTIFACT_DIFF, stageId, filePath: h.filePath });
      row.appendChild(diffBtn);
    }
    if (h.state) {
      const badge = document.createElement('span');
      badge.className = 'muted';
      badge.textContent = '[' + h.state + ']';
      row.appendChild(badge);
    }
  });
  bar.appendChild(row);
}

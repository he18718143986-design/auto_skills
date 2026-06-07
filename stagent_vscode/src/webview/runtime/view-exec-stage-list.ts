import { wMsg } from '../l10n/wMsg';
import { confirmStore, execStore } from './stores';

const maps = execStore.stageMaps;
import {
  getExecViewStageId,
  pinExecOutputStage,
} from './view-exec-output-panel';
import { renderExecDagGraph } from './view-exec-dag-graph';

export {
  formatConfidenceBar,
  confidenceWarn,
  confidenceLabel,
  type StageConfidenceView,
} from '../shared/execTimelineConfidence';

export function renderDownstreamResetPanel(msg: {
  resetStageTitles?: string[];
  rolledBackFiles?: string[];
  rollbackFailed?: Array<{ filePath: string; error: string }>;
  titleMessageKey?: string;
}) {
  const el = document.getElementById('downstream-reset-panel')!;
  el.style.display = 'block';
  el.innerHTML = '';
  el.className = 'downstream-reset-panel';
  const details = document.createElement('details');
  details.open = true;
  const summary = document.createElement('summary');
  summary.textContent = wMsg(msg.titleMessageKey || 'stagent.webview.exec.downstreamResetTitle');
  details.appendChild(summary);
  const stageList = document.createElement('ul');
  (msg.resetStageTitles || []).forEach((t) => {
    const li = document.createElement('li');
    li.textContent = t;
    stageList.appendChild(li);
  });
  details.appendChild(stageList);
  if (msg.rolledBackFiles && msg.rolledBackFiles.length) {
    const rolledTitle = document.createElement('div');
    rolledTitle.textContent = wMsg('stagent.webview.exec.rolledBackFiles');
    rolledTitle.style.marginTop = '8px';
    details.appendChild(rolledTitle);
    const fileList = document.createElement('ul');
    msg.rolledBackFiles.forEach((f) => {
      const li = document.createElement('li');
      li.textContent = f;
      fileList.appendChild(li);
    });
    details.appendChild(fileList);
  }
  if (msg.rollbackFailed && msg.rollbackFailed.length) {
    const err = document.createElement('div');
    err.className = 'error';
    err.textContent =
      wMsg('stagent.webview.exec.rollbackFailed', msg.rollbackFailed.map((x) => x.filePath + ': ' + x.error).join('；'));
    err.style.marginTop = '8px';
    details.appendChild(err);
  }
  el.appendChild(details);
}

export function renderExecTimeline() {
  const ul = document.getElementById('timeline-exec')!;
  if (!confirmStore.workflowDef || !confirmStore.workflowDef.stages) {
    ul.innerHTML = '';
    return;
  }
  const viewId = getExecViewStageId();
  const stages = (confirmStore.workflowDef.stages as Array<{ id: string; title: string; isDecisionStage?: boolean }>).map(
    (st) => ({
      id: st.id,
      title: st.title,
      status: maps.stageStatus[st.id] ?? 'pending',
      isDecisionStage: st.isDecisionStage,
      selected: st.id === viewId,
    }),
  );
  mountStageTimeline(ul, {
    stages,
    viewStageId: viewId,
    onSelect: (sid) => selectExecTimelineStage(sid),
  });
  renderExecDagGraph(selectExecTimelineStage);
}

export function selectExecTimelineStage(stageId: string) {
  pinExecOutputStage(stageId);
  renderExecTimeline();
}

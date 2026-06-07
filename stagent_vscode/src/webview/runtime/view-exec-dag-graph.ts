import { confirmStore, execStore } from './stores';

const maps = execStore.stageMaps;
import { escapeHtml } from './shell';

function mapExecStatusToDagVisual(status: string | undefined): string {
  if (!status || status === 'pending') {
    return 'pending';
  }
  if (status === 'running' || status === 'retrying') {
    return 'active';
  }
  if (status === 'paused' || status === 'waiting-questions') {
    return 'paused';
  }
  if (status === 'done') {
    return 'done';
  }
  if (status === 'skipped') {
    return 'skipped';
  }
  if (status === 'error') {
    return 'error';
  }
  return 'pending';
}

export function renderExecDagGraph(onNodeClick: (stageId: string) => void) {
  const panel = document.getElementById('exec-dag-panel');
  const el = document.getElementById('exec-dag-graph');
  if (!panel || !el || !confirmStore.workflowDef || !confirmStore.workflowDef.stages) {
    if (panel) {
      panel.hidden = true;
    }
    return;
  }
  const statusByStageId: Record<string, string> = {};
  for (const st of confirmStore.workflowDef.stages as Array<{ id: string }>) {
    statusByStageId[st.id] = mapExecStatusToDagVisual(maps.stageStatus[st.id]);
  }
  const highlight = [
    ...execStore.dagWaveActiveStageIds,
    execStore.currentRunStageId,
    execStore.currentPausedStageId,
    execStore.execOutputPinnedStageId,
  ].filter(Boolean) as string[];
  const html = buildWorkflowDagGraphHtml(confirmStore.workflowDef.stages, confirmStore.workflowDef.globalConfig, escapeHtml, {
    statusByStageId,
    highlightStageIds: highlight,
    onNodeClickStageId: true,
  });
  if (!html) {
    panel.hidden = true;
    el.innerHTML = '';
    return;
  }
  el.innerHTML = html;
  panel.hidden = false;
  el.querySelectorAll('.dag-node-clickable').forEach((node) => {
    const sid = node.getAttribute('data-stage-id');
    if (!sid) {
      return;
    }
    node.addEventListener('click', () => onNodeClick(sid));
  });
}

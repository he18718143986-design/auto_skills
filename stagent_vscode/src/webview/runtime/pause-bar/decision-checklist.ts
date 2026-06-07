import { DECISION_RECORD_SOFT_MAX_CHARS } from '../../../workflow/DecisionContentLimits';

export function renderDecisionChecklist(container: HTMLElement, decisionText: string) {
  const panel = document.createElement('div');
  panel.className = 'q-panel';
  panel.innerHTML = '<strong>' + wMsg('stagent.webview.pause.qualityPanelTitle') + '</strong>';

  const scenarioCount = (decisionText.match(/场景\s*[0-9一二三四五六七八九十]/g) || []).length;
  const hasConflictCheck = /已检查：|潜在冲突：/.test(decisionText);
  const checks = [
    /而非|备选|不选/.test(decisionText),
    scenarioCount >= 2,
    /AI 无法验证的假设/.test(decisionText),
    decisionText.length <= DECISION_RECORD_SOFT_MAX_CHARS,
    !/function\s|class\s|const\s|let\s|var\s|=>/.test(decisionText),
    hasConflictCheck,
  ];
  const labels = [
    wMsg('stagent.webview.pause.checklistAlt'),
    wMsg('stagent.webview.pause.checklistStress'),
    wMsg('stagent.webview.pause.checklistAssumptions'),
    wMsg('stagent.webview.pause.checklistLength'),
    wMsg('stagent.webview.pause.checklistNoCode'),
    wMsg('stagent.webview.pause.checklistConflict'),
  ];

  labels.forEach((label, i) => {
    const row = document.createElement('label');
    row.className = 'q-item';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = checks[i];
    cb.onclick = (e) => e.stopPropagation();
    const text = document.createElement('span');
    text.textContent = label;
    row.appendChild(cb);
    row.appendChild(text);
    panel.appendChild(row);
  });
  container.appendChild(panel);
}

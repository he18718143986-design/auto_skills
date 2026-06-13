import type { QualityReportPayload } from '../../quality-report/QualityReportTypes';
import { wMsg } from '../l10n/wMsg';
import { execStore } from './stores';

export function setQualityReport(report: QualityReportPayload | null | undefined): void {
  execStore.qualityReport = report ?? null;
}

export function renderQualityReport(): void {
  const panel = document.getElementById('quality-report-panel');
  const execBody = document.getElementById('exec-cockpit-body');
  const doneBanner = document.getElementById('done-banner');
  if (!panel) {
    return;
  }

  const report = execStore.qualityReport;
  if (!report) {
    panel.hidden = true;
    panel.style.display = 'none';
    if (execBody) {
      execBody.style.display = '';
    }
    return;
  }

  panel.hidden = false;
  panel.style.display = 'block';
  if (execBody) {
    execBody.style.display = 'none';
  }
  if (doneBanner) {
    doneBanner.style.display = 'none';
  }

  panel.innerHTML = '';
  const title = document.createElement('h2');
  title.className = 'quality-report-title';
  title.textContent = wMsg('stagent.webview.cockpit.qualityReportTitle');
  panel.appendChild(title);

  const verdict = document.createElement('div');
  verdict.className = report.afk.passed ? 'quality-verdict pass' : 'quality-verdict fail';
  verdict.textContent = report.afk.passed
    ? wMsg('stagent.webview.cockpit.afkPass')
    : wMsg('stagent.webview.cockpit.afkFail');
  panel.appendChild(verdict);

  const stats = document.createElement('div');
  stats.className = 'quality-report-stats';
  const statItems = [
    wMsg(
      'stagent.webview.cockpit.statStableVerify',
      String(report.afk.stableVerificationPasses),
      String(report.afk.verificationStages),
    ),
    wMsg('stagent.webview.cockpit.statHuman', String(report.afk.humanInterventions)),
    wMsg('stagent.webview.cockpit.statReplan', String(report.afk.runtimeReplanCount)),
    wMsg(
      'stagent.webview.cockpit.statDod',
      String(report.afk.dodDeliverablesSatisfied),
      String(report.afk.dodDeliverablesTotal),
    ),
  ];
  for (const line of statItems) {
    const s = document.createElement('div');
    s.className = 'quality-stat';
    s.textContent = line;
    stats.appendChild(s);
  }
  panel.appendChild(stats);

  if (report.verificationRows.length > 0) {
    const aTrack = document.createElement('div');
    aTrack.className = 'quality-track';
    const aHead = document.createElement('strong');
    aHead.textContent = wMsg('stagent.webview.cockpit.aTrackTitle');
    aTrack.appendChild(aHead);
    const table = document.createElement('table');
    table.className = 'quality-table';
    const thead = document.createElement('thead');
    thead.innerHTML = `<tr><th>${wMsg('stagent.webview.cockpit.colStage')}</th><th>${wMsg('stagent.webview.cockpit.colRuns')}</th><th>${wMsg('stagent.webview.cockpit.colResult')}</th></tr>`;
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    for (const row of report.verificationRows) {
      const tr = document.createElement('tr');
      const result = row.flaky
        ? wMsg('stagent.webview.cockpit.resultFlaky')
        : row.stable
          ? wMsg('stagent.webview.cockpit.resultStable')
          : wMsg('stagent.webview.cockpit.resultUnstable');
      tr.innerHTML = `<td><code>${row.stageId}</code></td><td>${row.passCount}/${row.totalRuns}</td><td>${result}</td>`;
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    aTrack.appendChild(table);
    panel.appendChild(aTrack);
  }

  const bTrack = document.createElement('div');
  bTrack.className = 'quality-track';
  const bHead = document.createElement('strong');
  bHead.textContent = wMsg('stagent.webview.cockpit.bTrackTitle');
  bTrack.appendChild(bHead);
  const bBody = document.createElement('div');
  bBody.className = 'muted quality-track-body';
  bBody.textContent = wMsg(
    'stagent.webview.cockpit.charterCoverage',
    String(Math.round(report.afk.charterCoverageRate * 100)),
  );
  bTrack.appendChild(bBody);
  panel.appendChild(bTrack);

  const engine = document.createElement('div');
  engine.className = 'quality-track';
  const eHead = document.createElement('strong');
  eHead.textContent = wMsg('stagent.webview.cockpit.engineSummaryTitle');
  engine.appendChild(eHead);
  const eBody = document.createElement('div');
  eBody.className = 'muted quality-track-body';
  eBody.textContent = report.engineSummary;
  engine.appendChild(eBody);
  panel.appendChild(engine);

  if (!report.afk.passed && report.afk.reasons.length > 0) {
    const reasons = document.createElement('ul');
    reasons.className = 'quality-reasons';
    for (const r of report.afk.reasons) {
      const li = document.createElement('li');
      li.textContent = r;
      reasons.appendChild(li);
    }
    panel.appendChild(reasons);
  }
}

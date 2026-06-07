import type { WorkflowExperience } from './WorkflowExperienceStore';
import { FAILURE_PATTERN_REPORT_MAX } from './UiListLimits';
import {
  buildFailureAnalysisReport,
  type ActionableFailurePattern,
  type FailureAnalysisReport,
} from './failure-patterns/classifyFailurePatterns';

export type { ActionablePatternKind } from './failure-patterns/types';
export type { ActionableFailurePattern, FailureAnalysisReport };

export function analyzeFailurePatterns(experiences: WorkflowExperience[]): FailureAnalysisReport {
  return buildFailureAnalysisReport(experiences);
}

export function formatFailureAnalysisMarkdown(report: FailureAnalysisReport): string {
  const lines: string[] = [
    '# Stagent Experience Analysis',
    '',
    `- Total experiences: ${report.totalExperiences}`,
    `- Failed runs: ${report.failedCount}`,
    `- Actionable pattern kinds: ${new Set(report.patterns.map((p) => p.kind)).size}`,
    '',
    '## Top failure stages',
  ];
  for (const row of report.topFailureStages) {
    lines.push(`- ${row.stageId}: ${row.count}`);
  }
  lines.push('', '## Actionable patterns');
  for (const p of report.patterns.slice(0, FAILURE_PATTERN_REPORT_MAX)) {
    lines.push(`### ${p.kind} (${p.frequency}x)`);
    lines.push(`- patternId: ${p.patternId}`);
    lines.push(`- errorType: ${p.errorType}`);
    lines.push(`- recommendation: ${p.recommendation}`);
  }
  return lines.join('\n');
}

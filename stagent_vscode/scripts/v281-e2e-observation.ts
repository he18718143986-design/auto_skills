/**
 * v2.8.1 / M20 前置：对 fixture 工作流批量跑 verifyRule20，模拟 E2E 观测通过率。
 * 用法：npm run observe:v281
 */
import * as fs from 'fs';
import * as path from 'path';
import { verifyRule20 } from '../src/Rule20Verify';
import type { WorkflowDefinition } from '../src/WorkflowDefinition';

interface FixtureExpectation {
  file: string;
  expectPass: boolean;
  label: string;
}

/** pass-* / warn-* / workflow-theme-* / workflow-warning-* → 无 violations；fail-* → 应阻断 */
function expectNoViolations(name: string): boolean {
  if (name.startsWith('fail-')) {
    return false;
  }
  if (
    name.startsWith('pass-') ||
    name.startsWith('warn-') ||
    name.startsWith('workflow-theme-') ||
    name.startsWith('workflow-warning-')
  ) {
    return true;
  }
  return true;
}

const FIXTURE_SETS: Array<{ dir: string; expectations: (name: string) => FixtureExpectation }> = [
  {
    dir: 'scripts/fixtures/runtime-rule20',
    expectations: (name) => ({
      file: name,
      expectPass: expectNoViolations(name),
      label: `runtime-rule20/${name}`,
    }),
  },
  {
    dir: 'scripts/fixtures/rule20',
    expectations: (name) => ({
      file: name,
      expectPass: expectNoViolations(name),
      label: `rule20/${name}`,
    }),
  },
  {
    dir: 'scripts/fixtures/to-issues-audit',
    expectations: (name) => ({
      file: name,
      expectPass: expectNoViolations(name),
      label: `to-issues-audit/${name}`,
    }),
  },
];

function loadWorkflow(fixturePath: string): WorkflowDefinition {
  const raw = fs.readFileSync(fixturePath, 'utf8');
  return JSON.parse(raw) as WorkflowDefinition;
}

function main(): void {
  const root = path.resolve(__dirname, '..');
  const samples: Array<{ label: string; passed: boolean; violations: number; warnings: number }> = [];

  for (const set of FIXTURE_SETS) {
    const absDir = path.join(root, set.dir);
    if (!fs.existsSync(absDir)) {
      continue;
    }
    for (const name of fs.readdirSync(absDir).filter((f) => f.endsWith('.json'))) {
      const exp = set.expectations(name);
      const wf = loadWorkflow(path.join(absDir, name));
      const result = verifyRule20(wf);
      const wouldBlock = result.violations.length > 0;
      const expectBlock = !exp.expectPass;
      const passed = wouldBlock === expectBlock;
      samples.push({
        label: exp.label,
        passed,
        violations: result.violations.length,
        warnings: result.warnings.length,
      });
    }
  }

  const total = samples.length;
  const passCount = samples.filter((s) => s.passed).length;
  const rate = total > 0 ? passCount / total : 0;
  const threshold = 0.9;
  const gateOk = rate >= threshold;

  const lines: string[] = [
    '# v2.8.1 E2E 观测报告（fixture 代理）',
    '',
    `生成时间：${new Date().toISOString()}`,
    '',
    '## 摘要',
    '',
    `- 样本数：**${total}**`,
    `- 符合预期：**${passCount}/${total}**（${(rate * 100).toFixed(1)}%）`,
    `- M20.2 门槛（≥ 90%）：**${gateOk ? '通过 ✓' : '未通过 ✗'}**`,
    '',
    '> 说明：本报告用 CI fixture 代理真实 `generateWorkflow` 观测；人工 E2E 仍见 docs/e2e-runbooks/m14-todo-extension-runbook.md。',
    '',
    '## 明细',
    '',
    '| Fixture | 预期 | 实际 violations | 结果 |',
    '|---------|------|-----------------|------|',
  ];

  for (const s of samples) {
    const expectLabel = s.passed ? 'OK' : 'MISMATCH';
    lines.push(
      `| ${s.label} | ${expectLabel} | ${s.violations} (warn ${s.warnings}) | ${s.passed ? '✓' : '✗'} |`,
    );
  }

  lines.push('');
  lines.push('## M20.2 决策');
  lines.push('');
  if (gateOk) {
    lines.push('- **M20.2.1** Rule20 runtime violations → `workflowFailed`：已在本分支实现');
    lines.push('- **M20.2.2** 决策内容 lint default ON：已在本分支实现');
  } else {
    lines.push('- 通过率未达 90%，应继续观测或修正 prompt/fixture，暂缓升 HARD（当前代码已落地，需人工确认）');
  }

  const outPath = path.join(root, 'docs/e2e-runbooks/v281-observation-report.md');
  fs.writeFileSync(outPath, lines.join('\n'), 'utf8');

  console.log(`v2.8.1 observation: ${passCount}/${total} (${(rate * 100).toFixed(1)}%)`);
  console.log(`Report: ${outPath}`);
  if (!gateOk) {
    process.exitCode = 1;
  }
}

main();

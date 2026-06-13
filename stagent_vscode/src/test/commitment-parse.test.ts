import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseCommitmentsFromDecisionRecord } from '../commitment/parseCommitments';

const SAMPLE_RECORD = `### 职责边界

- 仅实现 calculator 模块
- 不实现 CLI

### 关键设计决策

- 落盘 \`calculator.py\`，导出 \`calculate(a, b)\`
- 使用 Firebase Web SDK（\`firebase/app\`）

### 假设

- Python 3.11+ 可用
`;

test('parseCommitmentsFromDecisionRecord extracts boundary, file_path, api_signature, sdk_family', () => {
  const { commitments, warnings } = parseCommitmentsFromDecisionRecord(SAMPLE_RECORD, 'stage_decide_calc');
  assert.equal(warnings.length, 0);
  assert.ok(commitments.some((c) => c.kind === 'boundary' && c.subject.includes('calculator')));
  assert.ok(commitments.some((c) => c.kind === 'file_path' && c.subject === 'calculator.py'));
  assert.ok(commitments.some((c) => c.kind === 'api_signature' && c.subject.includes('calculate')));
  assert.ok(commitments.some((c) => c.kind === 'sdk_family' && c.subject === 'firebase-web'));
});

import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { resolveModuleExports, sanitizeModuleExports } from '../commitment/decisionArtifactsSchema';
import {
  extractModuleExportsFromDecisionRecord,
  pruneExportNoise,
  synthesizeSliceDecisionArtifacts,
} from '../commitment/decisionRecordExports';

const RUN19_RECORD = `### 关键设计决策
2. **每项指标独立导出函数**：compute_ma, compute_boll, compute_vol, compute_macd, compute_cci 各司其职，信号模块按需调用。
`;

test('extractModuleExportsFromDecisionRecord reads T4 Run #19 prose exports', () => {
  const exports = extractModuleExportsFromDecisionRecord('indicators', RUN19_RECORD);
  assert.deepEqual(exports, [
    'compute_boll',
    'compute_cci',
    'compute_ma',
    'compute_macd',
    'compute_vol',
  ]);
});

test('resolveModuleExports prefers decisionRecord over global coarse exports', () => {
  const global = {
    version: 1 as const,
    files: [],
    modules: [{ name: 'indicators', exports: ['compute'] }],
  };
  const exports = resolveModuleExports('indicators', { version: 1, files: [], modules: [] }, global, RUN19_RECORD);
  assert.ok(exports?.includes('compute_ma'));
  assert.ok(!exports?.includes('compute') || exports.length > 1);
});

test('synthesizeSliceDecisionArtifacts builds modules[] when sidecar missing', () => {
  const artifacts = synthesizeSliceDecisionArtifacts('indicators', RUN19_RECORD, null);
  assert.equal(artifacts?.modules?.length, 1);
  assert.deepEqual(artifacts?.modules?.[0]?.name, 'indicators');
  assert.ok(artifacts?.modules?.[0]?.exports.includes('compute_ma'));
});

test('extractModuleExportsFromDecisionRecord ignores int(0~3) type noise (Run #21 signals)', () => {
  const record = [
    '主方法 `generate` 组合结果。',
    "strength':int(0~3), timestamp:str",
    '采用统一字典 `SignalInput`',
  ].join('\n');
  const exports = extractModuleExportsFromDecisionRecord('signals', record);
  assert.ok(exports?.includes('generate'));
  assert.ok(!exports?.includes('int'));
  assert.ok(!exports?.includes('str'));
  assert.ok(!exports?.includes('SignalInput'));
});

const RUN44_INDICATORS_RECORD = `五个公开函数为 \`calculate_ma\`, \`calculate_boll\`, \`calculate_vol\`, \`calculate_macd\`, \`calculate_cci\`，内部辅助函数不得被外部导入。
- **纯函数返回新列而非原地修改**：由调用方选择 \`df.assign()\` 或 \`pd.concat\`。
- 引发 \`ValueError\` 或返回空 DataFrame。
- 抛出 \`KeyError\`。
- 均线用 \`rolling().mean()\`，布林带用 \`rolling().std()\`。
- 函数按指标独立拆分，而非合并为 \`compute_all\`。
`;

test('extractModuleExportsFromDecisionRecord prefers explicit 五个公开函数 list (Run #44)', () => {
  const exports = extractModuleExportsFromDecisionRecord('indicators', RUN44_INDICATORS_RECORD);
  assert.deepEqual(exports, [
    'calculate_boll',
    'calculate_cci',
    'calculate_ma',
    'calculate_macd',
    'calculate_vol',
  ]);
});

test('pruneExportNoise strips index_sh/index_sz market globals（Run #51）', () => {
  const cleaned = pruneExportNoise([
    'generate_long_signal',
    'generate_short_signal',
    'index_sh',
    'index_sz',
  ]);
  assert.deepEqual(cleaned, ['generate_long_signal', 'generate_short_signal']);
});

test('pruneExportNoise strips KeyError/assign from polluted artifacts list', () => {
  const cleaned = pruneExportNoise([
    'assign',
    'calculate_ma',
    'KeyError',
    'rolling',
    'calculate_boll',
  ]);
  assert.deepEqual(cleaned, ['calculate_boll', 'calculate_ma']);
});

test('sanitizeModuleExports prunes noise from stored sidecar exports', () => {
  const cleaned = sanitizeModuleExports('indicators', [
    'assign',
    'calculate_ma',
    'KeyError',
    'calculate_boll',
  ]);
  assert.deepEqual(cleaned, ['calculate_boll', 'calculate_ma']);
});

test('synthesizeSliceDecisionArtifacts replaces weak int-only exports', () => {
  const record = '主方法 `generate` 组合结果。';
  const artifacts = synthesizeSliceDecisionArtifacts('signals', record, {
    version: 1,
    files: [],
    modules: [{ name: 'signals', exports: ['int'] }],
  });
  assert.deepEqual(artifacts?.modules?.[0]?.exports, ['generate']);
});

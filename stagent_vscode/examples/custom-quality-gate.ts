/**
 * 示例：在 fork 的 extension activate() 中注册自定义 QualityGate。
 * 本文件不参与扩展编译；仅作贡献参考。见 docs/quality-gates.md。
 */
import type { QualityGate } from '../src/QualityGate';

export const exampleEslintGate: QualityGate = {
  id: 'example-eslint-workspace',
  label: 'Example ESLint',
  phase: 'post-stage',
  priority: 200,
  tags: ['eslint', 'example'],
  enabled: (ctx) => ctx.stage?.tool === 'code-runner',
  async evaluate(ctx) {
    void ctx;
    // 在此运行 eslint --format json，解析后返回 warn/block
    return null;
  },
};

// activate(context) {
//   registerBuiltinQualityGates();
//   registerQualityGate(exampleEslintGate);
// }

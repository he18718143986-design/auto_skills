import type { TestRunFailureRule } from './rules';

export const importRules: TestRunFailureRule[] = [
  {
    code: 'jest-module-not-found',
    match: (blob) =>
      /Cannot find module ['"]/i.test(blob) && /\b(jest|vitest|test suite failed to run)/i.test(blob),
    build: (blob) => {
      const modMatch = /Cannot find module ['"]([^'"]+)['"]/.exec(blob);
      const mod = modMatch?.[1] ?? '（未知模块）';
      return {
        code: 'jest-module-not-found',
        title: `Jest 找不到模块：${mod}`,
        summary: '可能是依赖未安装、路径 alias 未配置，或 impl/test 引用路径不一致。',
        steps: [
          '确认 npm install 已在独立阶段完成且 exitCode=0',
          '检查 jest.config.js 的 moduleNameMapper / roots',
          '对比 impl 与 test 的 import 路径是否与 DecisionRecord 一致',
        ],
      };
    },
  },
  {
    code: 'firebase-sdk-mismatch',
    match: (blob) =>
      /Cannot find module ['"]@react-native-firebase|Cannot find module ['"]firebase\/app['"]|Cannot find module ['"]@firebase/i.test(
        blob,
      ),
    build: () => ({
      code: 'firebase-sdk-mismatch',
      title: 'Firebase / RN SDK 与测试 mock 不一致',
      summary:
        'Web Firebase SDK（firebase/app）与 React Native（@react-native-firebase）不可混用；DecisionRecord 选型须与 impl/test mock 一致（M39.2 sdkPathContractLint 可提前检出）。',
      steps: [
        '核对 DecisionRecord 中的 SDK 选型',
        '测试 mock 路径与 impl import 对齐（同一 SDK 族）',
        '必要时在 jest.config.js 增加 moduleNameMapper',
      ],
    }),
  },
  {
    code: 'pytest-import-error',
    match: (blob, input) =>
      /\bpytest\b/i.test(input.command) && /ModuleNotFoundError|ImportError|No module named/i.test(blob),
    build: (blob) => {
      const modMatch = /No module named ['"]?([^'"\s]+)/i.exec(blob);
      return {
        code: 'pytest-import-error',
        title: `pytest 导入失败${modMatch?.[1] ? `：${modMatch[1]}` : ''}`,
        summary: 'Python 测试无法 import 被测模块或依赖。',
        steps: [
          '确认 pip install / venv 已在独立阶段完成',
          'PYTHONPATH 或包结构是否与 impl 布局一致',
          '本地复现：cd 到相同目录运行同一条 pytest 命令',
        ],
      };
    },
  },
];

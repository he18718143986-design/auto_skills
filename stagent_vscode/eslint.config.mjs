import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['out/**', 'node_modules/**', 'scripts/**', '**/*.js', '**/*.mjs', '**/*.cjs'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'module',
    },
    rules: {
      // 真实 bug 守卫
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
      'no-constant-condition': ['error', { checkLoops: false }],
      'no-fallthrough': 'error',
      'no-self-assign': 'error',
      // ESLint 10 新增的错误链风格规则；本项目大量 catch 会转换为用户可读信息，不强制 cause 链
      'preserve-caught-error': 'off',
      // 大型既有库的务实放宽（后续可逐步收紧）
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/ban-ts-comment': 'warn',
    },
  },
  {
    // 测试与 DOM harness 使用较多动态结构
    files: ['src/test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
  {
    // 引擎路径禁止散落 console.warn；统一经 WorkflowEngineDiagnostics.degraded/warn。
    ignores: ['src/WorkflowEngineDiagnostics.ts'],
    files: [
      'src/engine-wiring/**/*.ts',
      'src/engine-host/**/*.ts',
      'src/execution-bindings/**/*.ts',
      'src/executor-loop/**/*.ts',
      'src/stage-runners/**/*.ts',
      'src/generation/**/*.ts',
      'src/hitl/**/*.ts',
      'src/instance/**/*.ts',
      'src/resume/**/*.ts',
      'src/sandbox/**/*.ts',
      'src/errors/**/*.ts',
      'src/Workflow*.ts',
      'src/Engine*.ts',
      'src/Adr*.ts',
      'src/Codebase*.ts',
      'src/Llm*.ts',
      'src/Runtime*.ts',
      'src/Sandbox*.ts',
      'src/Impl*.ts',
      'src/InputTruncationPolicy.ts',
      'src/MetricsCollector.ts',
      'src/SessionDebugLog.ts',
      'src/SessionLogEvents.ts',
      'src/DebugLogEvents.ts',
      'src/non-llm-runners/**/*.ts',
    ],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.object.name='console'][callee.property.name='warn']",
          message:
            'Use WorkflowEngineDiagnostics.degraded() or .warn() instead of console.warn in engine modules.',
        },
      ],
    },
  },
  {
    files: ['src/WorkflowEngine.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['./WorkflowExecutorLoop', './WorkflowGenerationRunner', './WorkflowStageStep'],
              message: 'WorkflowEngine 应经 Coordinator/Host 访问执行与生成运行器。',
            },
          ],
        },
      ],
    },
  },
);

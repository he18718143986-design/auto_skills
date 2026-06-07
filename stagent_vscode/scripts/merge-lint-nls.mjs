#!/usr/bin/env node
import fs from 'fs';

const enPath = 'package.nls.json';
const zhPath = 'package.nls.zh-cn.json';
const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));
const zh = JSON.parse(fs.readFileSync(zhPath, 'utf8'));

const lintEn = {
  'stagent.lint.dangerous-rm-rf-root': 'Detected `rm -rf /` or similar root deletion; blocked.',
  'stagent.lint.dangerous-curl-pipe-shell': 'Detected curl/wget piped to shell; remote code execution risk.',
  'stagent.lint.dangerous-fork-bomb': 'Detected fork bomb pattern; blocked.',
  'stagent.lint.tsc-noemit-vs-out-dependency':
    'Command mixes `tsc --noEmit` with require/node ./out/...; --noEmit produces no .js. Fix: (a) drop --noEmit and compile; (b) use npx ts-node; (c) use npm test scripts.',
  'stagent.lint.tsc-without-npx':
    'Bare `tsc` detected; use `npx tsc` / pnpm exec / yarn dlx or node_modules/.bin/.',
  'stagent.lint.bare-tsc-without-project':
    '`tsc` without -p/--project/-b; use e.g. `npx tsc -p tsconfig.json`.',
  'stagent.lint.missing-npm-install-before-tsc':
    'Command has `tsc` but no prior npm install/ci in linear order and none in this command; install deps first.',
  'stagent.lint.import-meta-url-with-commonjs':
    'tsconfig module is CommonJS-like ({0}) but workspace/src uses import.meta; switch to ESM or remove import.meta.',
  'stagent.lint.python-c-import-not-in-artifacts': '{0}',
  'stagent.lint.python-script-not-in-artifacts': '{0}',
  'stagent.lint.config-key-not-found':
    "{0} reads config key '{1}' but {2} does not define it (existing keys: {3}). Align naming in config or script.",
  'stagent.lint.decision-impl-sdk-mismatch': '{0}',
  'stagent.lint.decision-test-sdk-mismatch': '{0}',
  'stagent.lint.impl-test-sdk-mismatch': '{0}',
  'stagent.lint.test-import-path-not-in-plan': '{0}',
  'stagent.lint.codeRunnerIssuePrefix': 'Tool config error: stage {0} (code-runner) [{1}] {2}',
  'stagent.planCompleteness.missingVerificationStage':
    'Plan missing executable verification (code-runner / stage_test_run_*): multi-file builds without verification can report hollow success.',
  'stagent.planCompleteness.missingMainAssembly':
    'Plan missing main/entry assembly: ≥3 code modules but no entry to run them (main.py, index.ts, App.tsx, npm start, etc.).',
  'stagent.planCompleteness.missingTestInfrastructure':
    'Before first stage_test_run_*, plan must land jest/babel/tsconfig (or config stages); otherwise Jest cannot parse TypeScript.',
  'stagent.planCompleteness.missingTestInfrastructureExpo':
    'Before first stage_test_run_*, plan must land jest-expo + babel config stages; otherwise Jest cannot parse TS in Expo/RN.',
  'stagent.decisionLint.missingSection': 'Decision record missing required section: 「### {0}」',
  'stagent.decisionLint.insufficientStressTests':
    '「Stress test」 section has too few scenarios (current {0}, need at least 2)',
  'stagent.decisionLint.insufficientAssumptions':
    '「Unverifiable assumptions」 section has too few items (current {0}, need at least 1)',
  'stagent.hitl.decisionLintRejected':
    'Decision record validation failed: {0}. Complete the record in the reviewer before approving.',
  'stagent.contract.crossFileKeyNotInVocabulary': "Key '{0}' is not in CONTEXT.md vocabulary",
  'stagent.contract.crossFileKeyMismatch':
    "Consumed key '{0}' may not match produced key '{1}' in {2}",
  'stagent.contract.crossFileKeyNonCanonical': "Key '{0}' drifts from CONTEXT.md term '{1}'",
  'stagent.contract.sampleHeaderUnmapped':
    "Sample header '{0}' not exactly mapped by reader (nearest '{1}'; reader exact match will fail required columns)",
  'stagent.contract.testNoAssertion': 'Test has no assertions (assert/expect)',
  'stagent.contract.testTautologicalAssertion': 'Tautological assertion (e.g. assert True)',
  'stagent.contract.testTestsImplementation': 'Only asserts existence/import, not behavior',
  'stagent.contract.weakIntegrationAssertion': '{0}',
  'stagent.lint.pythonImportFileCollision':
    'Python -c references module "{0}" which collides with a registered non-.py file{1}. Use open()/yaml instead, or add {0}.py stage. Registered:{2}',
  'stagent.lint.pythonImportMissing':
    'Python -c imports undeclared module "{0}"{1}. Only import generated .py or add requirements.txt. Registered:{2}',
  'stagent.lint.pythonScriptMissing':
    'code-runner script "{0}" is not in workflow artifacts{1}. Add writeOutputToFile or fix the path.',
  'stagent.lint.sdkDecisionImplMismatch':
    'DecisionRecord SDK families [{0}] vs impl [{1}] (e.g. firebase/app vs @react-native-firebase/*). Align DecisionRecord, impl, and tests.',
  'stagent.lint.sdkDecisionTestMismatch':
    'DecisionRecord SDK families [{0}] vs test [{1}]. Test mocks must match DecisionRecord.',
  'stagent.lint.sdkImplTestMismatch':
    'impl SDK families [{0}] vs test [{1}] — mocks/imports may pass Jest but fail at runtime.',
  'stagent.lint.testImportPathNotInPlan':
    'Test {0} imports `{1}` but artifact registry has no matching output path.',
};

const lintZh = {
  'stagent.lint.dangerous-rm-rf-root': '检测到 `rm -rf /` 或类似根目录删除；已拦截。',
  'stagent.lint.dangerous-curl-pipe-shell': '检测到 curl/wget 管道到 shell；存在远程代码执行风险。',
  'stagent.lint.dangerous-fork-bomb': '检测到 fork bomb 模式；已拦截。',
  'stagent.lint.tsc-noemit-vs-out-dependency':
    "command 同时含 `tsc --noEmit` 与 `require/node ./out/...`；--noEmit 不产出 .js，必然报 Cannot find module './out/...'。任选一种修复：(a) 去掉 --noEmit 让 tsc 真正产出（`npx tsc -p tsconfig.json && node ./out/...`）；(b) 改用 `npx ts-node src/...` 直接跑 .ts 源码；(c) 固化为 `npm test`，让 package.json scripts 串接编译与执行。",
  'stagent.lint.tsc-without-npx':
    '检测到裸 `tsc`（未通过 `npx tsc` / `pnpm exec tsc` / `yarn dlx tsc` 或 `node_modules/.bin/` 路径调用）。请在 command 中改为 `npx tsc ...`，避免依赖全局安装的旧版 TypeScript。',
  'stagent.lint.bare-tsc-without-project':
    '检测到 `tsc` 但未使用 `-p` / `--project` 或 `-b` 指定工程。请改为例如 `npx tsc -p tsconfig.json ...`，避免隐式目录/版本漂移。',
  'stagent.lint.missing-npm-install-before-tsc':
    'command 含 `tsc`，但此前线性顺序中未见 `npm install` / `npm ci` / `pnpm install` / `yarn` 等依赖安装类 code-runner，且本条 command 内也未串联 install。若子项目尚未装依赖，请先 `npm ci` 或 `npm install` 再编译。',
  'stagent.lint.import-meta-url-with-commonjs':
    'tsconfig compilerOptions.module 为 CommonJS 系（当前解析为 {0}），但 workspace/src 下存在使用 import.meta 的源码；请改为 ESModule（如 "module":"NodeNext" + package.json "type":"module"）或移除 import.meta。',
  'stagent.lint.python-c-import-not-in-artifacts': '{0}',
  'stagent.lint.python-script-not-in-artifacts': '{0}',
  'stagent.lint.config-key-not-found':
    "{0} reads config key '{1}' but {2} does not define it (existing keys: {3}). Align naming in config or script.",
  'stagent.lint.decision-impl-sdk-mismatch': '{0}',
  'stagent.lint.decision-test-sdk-mismatch': '{0}',
  'stagent.lint.impl-test-sdk-mismatch': '{0}',
  'stagent.lint.test-import-path-not-in-plan': '{0}',
  'stagent.lint.codeRunnerIssuePrefix': '工具配置错误：阶段 {0} (code-runner) [{1}] {2}',
  'stagent.planCompleteness.missingVerificationStage':
    '计划缺少可执行验证阶段（code-runner / stage_test_run_*）：多文件构建若无验证阶段，会出现「跑通即完成」但从未真正运行的空心成功。请补充至少一个运行并断言结果的验证阶段。',
  'stagent.planCompleteness.missingMainAssembly':
    '计划缺少 main/入口装配阶段：检测到 ≥3 个代码模块但无入口把它们拼装运行（如 main.py、index.ts、App.tsx 入口 impl、npm start / npx expo start 的 code-runner）。仅有 jest/npm test 集成测试不能替代入口装配。请补充入口装配 + 集成运行阶段。',
  'stagent.planCompleteness.missingTestInfrastructure':
    '计划在首个 stage_test_run_* 之前缺少 JS/TS 测试基础设施：须先落盘 jest.config.*、babel.config.* 或 tsconfig.json（或对应配置阶段）。仅有 test_run 而无配置会导致 Jest 解析 .ts 失败或 npm test 空转。',
  'stagent.planCompleteness.missingTestInfrastructureExpo':
    '计划在首个 stage_test_run_* 之前缺少 Expo/TS 测试基础设施：须先落盘 jest.config.*（含 jest-expo 预设）与 babel.config.*（或对应 stage_impl_jest_config / stage_impl_babel_config）。否则运行期 Jest 无法解析 TypeScript。',
  'stagent.decisionLint.missingSection': '决策清单缺少必要章节：「### {0}」',
  'stagent.decisionLint.insufficientStressTests': '「边界压力测试」节场景数不足（当前 {0}，至少 2）',
  'stagent.decisionLint.insufficientAssumptions': '「AI 无法验证的假设」节条目数不足（当前 {0}，至少 1）',
  'stagent.hitl.decisionLintRejected': '决策清单内容校验失败：{0}。请在审核器中补全后再批准。',
  'stagent.contract.crossFileKeyNotInVocabulary': "键 '{0}' 不在 CONTEXT.md 权威词汇表中",
  'stagent.contract.crossFileKeyMismatch': "消费键 '{0}' 与 {2} 产出键 '{1}' 疑似不一致",
  'stagent.contract.crossFileKeyNonCanonical': "键 '{0}' 偏离 CONTEXT.md 权威术语 '{1}'",
  'stagent.contract.sampleHeaderUnmapped':
    "样例表头 '{0}' 未被 reader 列名映射精确识别（最接近 '{1}'，reader 用精确匹配将判定「缺必需列」并整体失败）",
  'stagent.contract.testNoAssertion': '测试函数缺少任何断言（assert/expect），无法验证行为',
  'stagent.contract.testTautologicalAssertion': '存在恒真断言（如 assert True / 1==1），等于没测',
  'stagent.contract.testTestsImplementation': '仅断言对象/模块存在（is not None），未验证真实行为或输出',
  'stagent.contract.weakIntegrationAssertion': '{0}',
  'stagent.lint.pythonImportFileCollision':
    'Python -c 引用的模块「{0}」与已登记的非 .py 文件同名{1}（如 config.yaml）。请改用 open()/yaml.safe_load()；若确需 {0} 模块，请增加 writeOutputToFile: {0}.py 阶段。已登记 artifact：{2}',
  'stagent.lint.pythonImportMissing':
    'Python -c 引用了既未在 writeOutputToFile/file-write 声明、也未在 requirements.txt 声明的模块「{0}」{1}。请仅 import 已生成 .py；若为第三方包，请新增 requirements.txt 阶段。已登记 artifact：{2}',
  'stagent.lint.pythonScriptMissing':
    'code-runner 执行脚本「{0}」未出现在工作流 artifact 登记中{1}。请确保存在对应 writeOutputToFile 阶段或修正 command 路径。',
  'stagent.lint.sdkDecisionImplMismatch':
    'DecisionRecord 声明 SDK 族 [{0}]，但 impl 源码检测到 [{1}]（常见：Firebase Web `firebase/app` vs RN `@react-native-firebase/*`）。请统一选型。',
  'stagent.lint.sdkDecisionTestMismatch':
    'DecisionRecord 声明 SDK 族 [{0}]，但 test 源码/mock 检测到 [{1}]。测试 mock 须与 DecisionRecord 一致。',
  'stagent.lint.sdkImplTestMismatch':
    'impl 使用 SDK 族 [{0}]，test 使用 [{1}] — mock/import 与实现不一致，Jest 可能通过但运行时失败。',
  'stagent.lint.testImportPathNotInPlan':
    '测试文件 {0} 引用相对路径 `{1}`，但工作流 artifact registry 中未见对应落盘路径。请核对 writeOutputToFile 或修正 test import/mock 路径。',
};

Object.assign(en, lintEn);
Object.assign(zh, lintZh);
fs.writeFileSync(enPath, JSON.stringify(en, null, 2) + '\n');
fs.writeFileSync(zhPath, JSON.stringify(zh, null, 2) + '\n');
console.log('lint nls', Object.keys(lintEn).length);

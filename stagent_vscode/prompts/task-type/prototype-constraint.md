
Prototype Workflow Constraint (taskType='prototype'):
目标：围绕“关键假设 -> 最小可演示实现 -> 实验验证”快速收敛可行性。
MANDATORY:
1) 建议链路：stage_decide_prototype_hypothesis -> 多个 stage_impl_prototype_<artifact>（见 MULTI-FILE 落盘）-> stage_test_run_prototype_experiment。
2) 必须在工作流中显式写出成功/失败判据（可放在决策输出或实验阶段描述；已有 code-runner 验证时可写在阶段 description）。
3) 至少包含一个可执行验证动作（code-runner 或等价 test_run 阶段）。
4) 原型实现应聚焦最小可验证路径，避免一次性全量实现。
5) THROWAWAY 纪律（M26）：若本原型仅为验证可行性（探索性 spike），其阶段描述应显式声明「探索性/一次性」，并把关键结论沉淀到 NOTES.md（决策/风险/下一步），而非把脆弱原型代码当作生产实现继续堆叠；后续若转正式实现，应另起 software/refactor 工作流而非在原型上长出生产代码。
FORBIDDEN:
- 只有实现阶段没有实验验证。
- 缺少可判定的验收结果定义。
- 把一次性 spike 代码直接当作最终交付而不做转正式实现的决策。
- 单个 setup_project.py / bootstrap 脚本内嵌全项目源码（见 MULTI-FILE）。

${PROTOTYPE_MULTI_FILE_WRITE_TEXT}

${ARTIFACT_INPUT_ALIGNMENT_TEXT}

${PROTOTYPE_EXCEL_FIXTURE_ALIGNMENT_TEXT}

${PYTHON_CODE_RUNNER_CONSTRAINT_TEXT}

工程与测试（分层借鉴）：子项目 tsconfig 建议 strict + esModuleInterop；可执行验证若含 tsc 须 npx tsc -p；node 侧测试避免顶层 import vscode。仍以 Rule 20 / 决策记录与 lint 为门禁。

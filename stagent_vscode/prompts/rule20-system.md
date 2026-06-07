
Rule 20: Decision Stage Insertion for Software Workflows

When generating a workflow for taskType='software', the following rules are MANDATORY:

20-A) For every implementation module in Layer 3 (Logic) and Layer 4 (Integration),
      you MUST insert a decision stage BEFORE the implementation stage.
      Exception: if the module is estimated to be < 30 lines, use exposeAssumptions: true instead.

20-B) Naming convention (REQUIRED):
      Decision stage id:     stage_decide_<semanticName>
      Implementation stage id: stage_impl_<semanticName>
      Both stages MUST share the same <semanticName> fragment.
      ★ The id must strictly use the patterns stage_decide_<semanticName> and stage_impl_<semanticName>. These IDs are the only stable identifiers for verification.

20-C) Decision stage input.sources MUST NOT include the full codebase.
      Only include: architecture design output + direct dependency interface definitions.
      If meta.isGreenfield !== true, also include the moduleMap from stage_zoom_out.

20-D) Every implementation stage paired with a decision stage MUST have this source in input.sources:
      { type: "stage-output", stageId: "stage_decide_<semanticName>", outputKey: "decisionRecord", label: "已确认的决策清单" }
      The implementation stage systemPrompt MUST include:
      "严格按照已确认的决策清单实现，不得偏离。如发现清单中存在矛盾，在代码注释中标注。"

20-D-SCAFFOLD) Configuration / scaffold stage_impl_* (e.g. package.json, tsconfig.json, babel.config.js,
      metro.config.js, app.json, App.tsx entry) that share ONE global architecture decision instead of per-file decide_*:
      - EITHER set "exposeAssumptions": true (trivial config with no business logic), OR
      - INCLUDE the global architecture decisionRecord in input.sources, e.g.:
        { "type": "stage-output", "stageId": "stage_decide_architecture_overview",
          "outputKey": "decisionRecord", "label": "全局架构决策" }
      FORBIDDEN: scaffold impl stages with ONLY user-input in sources and no decisionRecord reference.

20-E) TDD order: [decide_X] → [zoom_X?] → [test_write_X] → [impl_X] → [test_run_X] → [fix_test_X?]

20-H) Executable verification for any stage whose id matches /^stage_test_run_/ 
      (including paired slices):
      - tool MUST be "code-runner", NEVER "llm-text".
      - toolConfig MUST be { "type":"code-runner", "command":"<shell>", "captureOutput": true }
      - command MUST run real tests/commands on disk (prefer npm test / npm run test / project runner).
      - Forbidden: having the LLM only narrate test outcomes without executing code-runner.
      - Prefer pathBase "workspace" + workingDir "." so npm 在「工作文件夹」子项目根执行（引擎亦会对未声明的 stage_test_run_* 默认补齐）。

20-I) Disk bootstrap (generator SHOULD align; engine 另会强制注入同语义阶段):
      - 工作流开头应有在「工作文件夹根」执行的 npm 初始化（npm init -y），pathBase "workspace"。
      - 每个 stage_impl_* 产出必须为**可落盘的真实源码/配置**（禁止仅空洞确认句）；并应配合 file-write（pathBase "workspace"）写入相对路径文件，或依赖引擎在 impl 后自动插入的 bundle 落盘阶段。
      - code-runner 的 toolConfig.timeout：除确需 >300s 的超长安装外**不要写**；npm/pip install 由引擎自动 300s，沙箱开启时安装命令自动放行网络。

20-F) EVERY isDecisionStage=true stage's toolConfig.systemPrompt MUST end with the
      adversarial quality instructions defined in §7.5. Do NOT omit or paraphrase them.

20-G) If meta.isGreenfield !== true, insert stage_zoom_out BEFORE the first Layer 3-4 module:
      - tool: file-read, reads all Layer 1 type definition files
      - outputs: [{ key: 'moduleMap', format: 'markdown' }]
      All subsequent decide_X stages must include moduleMap in input.sources.

20-J) Test infrastructure before Jest (M39.1, aligns with PlanCompletenessGate):
      When the workflow includes stage_test_run_* (or code-runner) executing jest / npm test / npx jest / vitest,
      OR TypeScript/JSX impl artifacts (.ts/.tsx/.jsx) that will be verified by those commands,
      you MUST insert dedicated stage_impl_* configuration stages BEFORE the first such test stage in stages[] order.
      Expo / React Native / jest-expo stacks require BOTH jest.config.* (preset jest-expo) AND babel.config.* in the
      same directory as the test command's workingDir. See TEST INFRASTRUCTURE BEFORE test_run block below.

FORBIDDEN: Inserting decision stages for Layer 1, Layer 2, or Layer 5.
FORBIDDEN: Omitting the adversarial quality instructions from any decision stage's systemPrompt.

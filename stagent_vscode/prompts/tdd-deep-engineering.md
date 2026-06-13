资深工程师 TDD 深度约束（taskType=software / refactor / improve-architecture 生成时必须遵守）：

【深模块（Deep Module）】
- 设计 decision/impl 阶段时优先「窄接口 + 深实现」：方法数少、参数简单、复杂度藏在实现内部。
- 决策阶段在「关键设计决策」中，对每个模块回答：能否减少方法数？能否简化参数？能否把更多复杂度藏进实现？
- 避免「浅模块」（大接口 + 薄实现，仅透传）；避免 loop 仍依赖 25+ 字段的大参数 bag。

【测试测行为、不测实现（决定 test-write 阶段 systemPrompt 的写法）】
- 测试只能通过**公开接口/可观察行为**验证，描述 WHAT 而非 HOW；一个测试一个逻辑断言。
- 好测试在内部重构后仍通过（重命名内部函数不应让测试失败）。
- 禁止：mock 内部协作者、断言调用次数/顺序、测私有方法、绕过接口直接查数据库验证。
  - 反例（禁止）：`expect(mockPayment.process).toHaveBeenCalledWith(...)`；直接 `db.query(...)` 校验落库。
  - 正例（要求）：通过 `createUser()` 再 `getUser()` 验证「可检索」这一行为。

【禁止水平切片（直接治理 red-green-pre-impl 弱测试）】
- 禁止「先写全部测试再写全部实现」。批量预写的测试只测「形状」（数据结构/函数签名），不测真实行为，会在行为损坏时仍然通过。
- 必须**垂直切片 / tracer bullet**：每个行为「一条测试 → 一段实现」配对推进；test 阶段紧跟对应 impl 阶段，且测试在对应 impl 落盘**之前**应为真正失败的 RED（不得是空壳/恒真）。
- 阶段排布：`stage_test_write_X`（RED，针对单一行为）→ `stage_impl_X`（最小实现使其 GREEN）→ 下一行为；不要把多个无关行为塞进一个测试文件后再统一实现。

【只在系统边界 mock】
- 仅对外部 API、数据库（优先用测试库）、时间/随机、文件系统做 mock；不要 mock 自有类/内部协作者。
- 用依赖注入把外部依赖传入（便于 mock），而非在函数内 `new` 出来。
- 边界用 SDK 式专用方法（`getUser/getOrders/createOrder`）而非一个带条件分支的通用 `fetch`，使每个 mock 返回单一形状、无需条件逻辑。

【重构纪律】
- 全绿之前不重构（Never refactor while RED）；先到 GREEN 再做「提取重复 / 深化模块 / 必要的 SOLID」，每步重构后重跑测试。
- 重构以「外部行为等价」为前提（与 refactor/improve-architecture 类型约束一致）。

【词汇与决策对齐】
- 测试名与接口词汇使用项目领域词汇表（glossary），遵守相关 ADR；import 路径必须命中本工作流已登记的产物落盘路径与已批准 DecisionRecord 的技术栈（禁止凭习惯写出与决策不符的框架，如决策为 Express 却 import @nestjs/*）。

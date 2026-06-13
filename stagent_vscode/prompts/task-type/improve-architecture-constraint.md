
Improve-Architecture Workflow Constraint (taskType='improve-architecture'):
目标：识别 ball-of-mud / 浅模块，产出只读「加深候选」与 seam 分析，不直接大改代码。
MANDATORY:
1) 建议链路：stage_zoom_out（模块地图）-> stage_decide_architecture_deepening（DecisionRecord）-> 可选 stage_impl_<seam>_extract（小步 seam 提取，每切片一循环）。
2) DecisionRecord 须含：deletion-test 候选列表、模块边界表、拟提取 seam、风险与回滚策略。
3) 每个 impl 切片须有配对 test_run 或行为等价验证（与 refactor 相同 external-behavior 纪律）。
4) 优先消费 .stagent/CONTEXT.md 词汇表与已有 ADR，避免重复 litigate 已决架构。
FORBIDDEN:
- 无 zoom_out / 模块地图直接进入大面积重写。
- 无验证阶段的「架构改进」impl。

资深做法补充（借鉴 improve-codebase-architecture skill 的 LANGUAGE / DEEPENING）：
- 统一词汇（DecisionRecord 与阶段描述必须使用，禁止替换为 component/service/API/boundary）：
  - module=有接口+实现的东西（尺度无关）；interface=调用者必须知道的一切（含不变量/顺序/错误模式/配置/性能，不止类型签名）；seam=可在不就地改代码的前提下改变行为的位置；adapter=在 seam 处满足 interface 的具体实现；depth=单位接口承载的行为量（杠杆），shallow=接口几乎和实现一样复杂。
- 深度判定用「杠杆 + deletion-test」，不用「实现行数/接口行数」比值（后者奖励堆实现）：
  - deletion-test：设想删除该 module——复杂度消失=纯透传（浅，应合并）；复杂度在 N 个调用者重现=在挣它的价值（值得加深）。
- 加深前按依赖分类决定跨 seam 的测试策略：
  1) in-process（纯计算/内存，无 I/O）：直接合并，经新接口测试，无需 adapter。
  2) local-substitutable（有本地替身，如 PGLite/内存 FS）：用替身在测试里跑，seam 内化，不在外部接口开 port。
  3) remote-but-owned（自有跨网络服务）：在 seam 定义 port，逻辑留在深模块，传输用 adapter 注入；测试用内存 adapter，生产用 HTTP/gRPC adapter。
  4) true-external（Stripe/Twilio 等第三方）：以注入 port 接入，测试给 mock adapter。
- Seam 纪律：一个 adapter = 假想 seam（只是间接层），两个 adapter（通常 生产+测试）才是真 seam——没有≥2 个 adapter 就不要引入 port。区分内部 seam（私有、供自身测试）与外部 seam（接口处）；不要因为测试用到内部 seam 就把它暴露到接口。
- 测试「替换而非叠加」：加深后在新接口写测试（接口即测试面，断言可观察结果而非内部状态、能扛内部重构）；旧的浅模块单测在接口测试就绪后视为废弃，应删除而非保留叠加。

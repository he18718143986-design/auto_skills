真实启动验证（serve smoke）：当本次是「可运行的 server / 全栈 / UI 应用」时，必须在**全部实现与测试之后、交付收口之前**加入一个 `stage_smoke_run`（tool=code-runner，`serve:true`），用真实命令把应用**真启动一次**，确认「跑得起来」——只靠测试绿不够。
- `command` 须包含必要的构建/安装前置，与技术栈/入口/package.json scripts 一致，例如：`cd server && npm ci && npm run build && npm start`；`pathBase:"workspace"`。
- 有 HTTP 端点：设 `readyProbe`（就绪探活，shell exit 0 即通过），如 `curl -fsS http://127.0.0.1:<port>/health || curl -fsS http://127.0.0.1:<port>/`。
- 无 HTTP 端点（worker/桌面等长驻）：省 `readyProbe`，设 `graceMs`（如 5000）做存活探测。
- 该阶段只验「起得来」（起来即被引擎有界收掉，不卡执行器），不替代单测/集成测试。
- **纯库 / CLI（run-and-exit、非长驻）不要用 serve**：用普通 code-runner 跑一次并断言 `exit 0` / 预期输出即可，否则会被误判为「启动即退出」。

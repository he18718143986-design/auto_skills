# 沙箱跨平台能力边界

本文档集中说明 Stagent `code-runner` 在各平台上的沙箱保证边界。实现 SSOT 见 `src/sandbox/SandboxCapabilityMatrix.ts`。

## 能力矩阵

| 平台 | 内核隔离 | `sandboxEnforced` | 说明 |
|------|----------|-------------------|------|
| **macOS (darwin)** | `sandbox-exec`（若 PATH 可执行） | `true` | 写隔离 + 可选断网；无 `sandbox-exec` 时降级为软约束 |
| **Linux** | 无（`ulimit` + 代理环境变量） | `false` | 软约束，**非安全边界**；子进程可绕过 |
| **Windows (win32)** | 无 | `false` | 软约束，**非安全边界** |

## Linux / Windows 产品预期

- **`stagent.sandbox.enabled` 默认为 `false`**。仅在理解风险后手动开启。
- 开启后首次 code-runner 会弹出**一次性**软约束确认；Sidebar「环境状态」显示「软约束 / 非安全边界」徽章。
- 这些平台的「沙箱」**不能**用于运行不可信或恶意代码；仅降低误操作风险（内存/超时/常见 HTTP 代理阻断）。

## 设置 `stagent.sandbox.enabled`

- **macOS 且 `sandbox-exec` 可用**：命令在内核级沙箱中执行（fail-closed 基准）。
- **其他平台或无 `sandbox-exec`**：扩展会弹出**一次性**提示，说明当前仅软约束、非安全边界；用户可选择：
  - **以软约束继续**：本会话内后续 `code-runner` 以软约束运行（`ulimit` / 代理等），并记录 `sandbox_soft_constraint_ack sandbox_mode=soft-constraint` 观测日志；
  - **取消**：阶段失败，错误类型为 `tool-execution-failed`。

未提供 UI 确认回调的环境（如部分 headless 测试）视为取消，保持 fail-closed。

## 软约束包含什么

- 内存 / 超时限制（`ulimit` 等，平台相关）
- `networkAllowed=false` 时通过 `HTTP_PROXY`/`HTTPS_PROXY` 指向无效端口阻断常见 HTTP 客户端
- **不包含**：文件系统强隔离、进程 namespace、防绕过网络

## 外部严格隔离（容器 / CI）

当需要在 Linux/Windows 上隔离不可信 code-runner 时，**不要**依赖 `sandbox.enabled` 软约束；改用外部环境：

```bash
# 示例：在只读挂载的工作区中运行单次命令（按项目调整镜像与挂载）
docker run --rm \
  -v "$TASK_WORKSPACE:/work:rw" \
  -w /work \
  node:20-bookworm \
  bash -lc 'npm test'
```

- Stagent 扩展宿主仍运行在 IDE 内；上述命令在**外部** CI/容器跑 code-runner 等价步骤。
- macOS 开发机上可继续用 `sandbox-exec`；Linux CI 建议容器或无 sandbox.enabled + 人工审查。

## CI 平台矩阵

| Runner | 内核沙箱单测 | 说明 |
|--------|--------------|------|
| `ubuntu-latest` | skip（platform） | 覆盖 soft-constraint / fail-closed（`sandbox-capability.test.ts`） |
| `macos-latest`（可选） | darwin + sandbox-exec | 未来 job 可仅跑内核沙箱回归 |

## 相关代码

- 能力探测：`resolveSandboxCapability()` / `assertSandboxEnforcementAvailable()`
- 执行入口：`WorkflowCodeRunnerHost.runCodeRunnerCommand`
- 用户确认：`adapters/showSandboxSoftConstraintPrompt.ts`
- 执行实现：`SandboxExecutor.runInSandbox`
- 设置校验：`settings/validators/execValidators.ts`
- Sidebar 徽章：`sidebar/AiControlsFactory.ts`

## 产品预期

启用沙箱时，用户应理解：

1. **macOS** 是唯一提供内核级写隔离的生产路径。
2. **Linux / Windows** 的「沙箱」仅为降低误操作风险的软约束，不可用于不可信代码。
3. 需要严格隔离时，请在 macOS 上运行，或在外部 CI/容器环境中执行 `code-runner` 命令。

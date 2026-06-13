# LLM Smoke：Software Greenfield

## 输入（示例）

```
创建一个最小 REST API：GET /health 返回 ok，含 package.json、单测与 README。
```

任务类型：**software**；工作区：空文件夹或新目录（greenfield）。

## 步骤

1. 选择/创建 task workspace 文件夹。
2. 生成工作流；确认页应含 decision stage 与 code-runner（npm init / test）阶段。
3. 开始执行；观察 code-runner stage：
   - macOS + `sandbox.enabled`：内核沙箱或软约束提示。
   - Linux/Windows：应出现软约束一次性确认（若启用 sandbox）。
4. 执行至首个 code-runner 完成或明确失败（记录 stderr）。

## 通过标准

- 工作流结构通过 Rule 20 / 确认页可渲染。
- code-runner 在 workspace 内产生预期文件或测试输出。
- 沙箱行为与 [`docs/SANDBOX_PLATFORMS.md`](../SANDBOX_PLATFORMS.md) 文档一致。

## 非目标

- 不要求一次生成完美生产代码。
- 本 runbook 不替代 `npm run test:benchmark` 性能回归。

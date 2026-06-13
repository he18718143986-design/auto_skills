# E2E Runbooks（人工）

本目录描述**真实 LLM** 与 Extension Development Host 下的冒烟流程。这些步骤**不进入 CI**（需 API 密钥，且存在 flaky 风险）。

## 前置

1. 配置 LLM API（`stagent.*` 模型相关设置，见 VS Code Settings）。
2. `npm run compile` 后按 F5 启动 **Extension Development Host**。
3. 打开 Stagent 面板，确认 sidebar AI Controls 无配置告警。

## Runbook 索引

| 文档 | 场景 |
|------|------|
| [llm-smoke-debug.md](./llm-smoke-debug.md) | Debug 任务：生成 → 首 stage → 暂停/恢复 |
| [llm-smoke-software-greenfield.md](./llm-smoke-software-greenfield.md) | Greenfield 软件任务 + code-runner |
| [observability-checklist.md](./observability-checklist.md) | Session log、Metrics、timeline seq 检查 |

## Headless 基准（CI 可选）

与真实 LLM E2E 互补，可在本地/CI 运行：

```bash
npm run test:benchmark
npm run benchmark:dag
npm run benchmark:context -- --files 1000
```

见 [`scripts/benchmark/`](../scripts/benchmark/) 与 [`ARCHITECTURE_ANALYSIS.md`](../ARCHITECTURE_ANALYSIS.md) 性能条目。

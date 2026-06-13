# Observability Checklist（E2E / 恢复）

执行或恢复实例后，逐项核对：

## Session / Debug

- [ ] Session log 含 `run_resume` 或等价恢复事件（恢复路径）。
- [ ] 任务结束时有 `purpose=metrics` 快照（`MetricsCollector` 字段：llmCalls、stageErrors 等）。

## Webview 消息完整性

- [ ] Backend 消息带递增 `seq`（DevTools 或 copy debug log）。
- [ ] Resync / resume 后 `uiEpoch` 递增；旧 epoch 的 live 更新不应覆盖新快照。
- [ ] `instanceKey` 与 sidebar 活跃任务一致；切换实例时 stale 消息被丢弃。

## UI

- [ ] 时间线 stage 状态与引擎 `stageRuntimes` 一致。
- [ ] Webview 重载 → `webviewReady` → 面板恢复，无需手动切任务。

## 基准脚本（无 LLM）

```bash
npm run test:benchmark
```

用于 DAG 并行 speedup 与千文件 context 扫描耗时回归。

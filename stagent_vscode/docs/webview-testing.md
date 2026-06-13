# Webview 测试约定

> 操作向约定见 [`QUICK_REFERENCE.md`](../QUICK_REFERENCE.md) § Webview 开发约定。

---

## Webview 时间线测试策略

时间线组件（StageTimeline）测试走 Mini DOM polyfill 路径（`src/test/mountStageTimelineMiniDom.ts`），不做 props-only mock。

**原因：** `exec-timeline-auto-fold.test.ts` 断言真实 DOM 结构（`details.open`、折叠 summary 文案），仅验 props 无法覆盖。

**新增时间线相关测试：** 在 harness（`src/test/webview-script-test-harness.ts`）注入 stub 后复用同一 polyfill，不要重新引入 vanilla 分支。

### harness 注入点

`setupWebviewScriptRuntime()` 在 bundle 加载完成后，将全局 `mountStageTimeline` 替换为 `createMountStageTimelineMiniDom(...)`。该 stub 与生产 Preact 路径共用 `buildExecTimelineNodes` / `shouldExpandSegmentFold`，并读取 `execStore.timelineFold`（通过 `bootstrap` 在 `__STAGENT_WEBVIEW_TEST__` 下暴露 `__stagentExecStore`）。

### 相关测试文件

| 文件 | 覆盖 |
|------|------|
| `src/test/exec-timeline-auto-fold.test.ts` | 折叠 segment、决策阶段顶层、running 时自动展开 |
| `src/test/stage-timeline-confidence.test.ts` | confidence 纯函数 + `renderExecTimeline` 源码回归 |
| `src/test/webview-script-test-harness.ts` | 集成测 Mini DOM + message handler |

### 运行

```bash
npm run build:webview
npm run test:compile
node -e "require('fs').mkdirSync('out/l10n',{recursive:true}); require('fs').cpSync('src/l10n/webview-ui-strings.json','out/l10n/webview-ui-strings.json')"
node --import ./out/test/install-vscode-stub.js --import ./out/test/install-webview-l10n-stub.js --test \
  ./out/test/exec-timeline-auto-fold.test.js \
  ./out/test/stage-timeline-confidence.test.js
```

---

## Out-of-order / resync 场景测试模板

验证 Webview 三层门禁时，优先直接测 gate 模块（无需完整 bundle）：

| 场景 | 测试文件 | 断言要点 |
|------|----------|----------|
| seq 乱序 | `webview-stage-status-seq.test.ts` | `patchStageStatus` stale seq 不覆盖 |
| uiEpoch stale | `webview-ui-epoch-gate.test.ts` | resync 后 epoch N-1 的 live 消息丢弃 |
| uiEpoch 过渡期 | 同上 | `UI_EPOCH_GATE_STRICT=false` 时缺 epoch 仍放行 |
| instanceKey | `webview-instance-message-gate.test.ts` | 非 active 实例运行期消息丢弃 |
| recovery 去重 | `workflow-recovery-view-model.test.ts` | 快照已含 status 时不 replay `stageStatusUpdate` |
| Bridge 串行 | `workflow-ui-bridge.test.ts` | 异步 postMessage 仍按调用顺序投递；`beginUiResync` 不等待 backlog |

集成测 `webview-message-integrity-p3.test.ts` 含 handler 审计表，新增 seq/uiEpoch 门禁时同步扩展审计行。

# LLM Smoke：Debug 链

## 输入（固定）

```
定位并修复启动阶段偶发超时，要求先复现、再给出根因假设、最后回归验证。
```

任务类型：**debug**。

## 步骤

1. 输入页粘贴上述文本，生成工作流。
2. 确认页检查：含 `stage_reproduce_debug_case` 或等价复现阶段；Rule 20 无红色 block。
3. 点击「开始执行」，观察 exec 时间线首 stage 进入 `running`。
4. 若 pauseAfter：在 pause bar 完成审批/问答，继续下一阶段。
5. Webview 重载（Cmd+R / 关闭再开 panel），确认 `instanceResumed` 恢复时间线状态。

## 通过标准

- 生成 JSON 可被引擎接受并进入 confirm。
- 至少一个 stage 完成 LLM 调用（Output 面板有内容）。
- 重载后 stage 状态与重载前一致（无全 pending 闪烁）。

## 失败时收集

- Output Channel「Stagent」最近日志。
- Session log（pause bar / copy session log）。
- `stageStatus` seq / `uiEpoch` 是否单调（见 [observability-checklist.md](./observability-checklist.md)）。

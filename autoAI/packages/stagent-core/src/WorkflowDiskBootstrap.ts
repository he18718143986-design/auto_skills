import * as fs from 'fs';
import * as path from 'path';
import type { Stage, WorkflowDefinition } from './WorkflowDefinition';

/** 与生成侧注入一致；模型若自行加入同 id 则跳过重复注入 */
export const STAGE_INIT_NPM_WORKSPACE_ID = 'stage_init_npm_workspace';

/**
 * `npm init -y` 默认写入的 `scripts.test` 会故意 exit 1，导致后续 `stage_test_run_*` 误失败。
 * 在 init 成功之后由引擎调用：仅当 test 脚本仍为该默认形态时，替换为占位 `node -e "process.exit(0)"`；
 * 已有真实测试脚本时不修改。
 */
export function patchNpmDefaultTestScriptAfterInit(workspaceRoot: string): boolean {
  const pkgPath = path.join(workspaceRoot, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    return false;
  }
  let raw: string;
  try {
    raw = fs.readFileSync(pkgPath, 'utf-8');
  } catch {
    return false;
  }
  let j: { scripts?: Record<string, string> };
  try {
    j = JSON.parse(raw) as { scripts?: Record<string, string> };
  } catch {
    return false;
  }
  const t = j.scripts?.test;
  if (typeof t !== 'string' || !t.includes('no test specified')) {
    return false;
  }
  j.scripts = j.scripts ?? {};
  j.scripts.test = 'node -e "process.exit(0)"';
  fs.writeFileSync(pkgPath, JSON.stringify(j, null, 2) + '\n', 'utf-8');
  return true;
}

function createInitNpmStage(): Stage {
  return {
    id: STAGE_INIT_NPM_WORKSPACE_ID,
    title: '初始化 npm 子项目（工作区根）',
    description:
      '在用户填写的工作文件夹根目录执行 npm init -y；若生成 npm 默认的失败型 test 脚本，引擎会随后自动替换为占位通过，避免后续 npm test 阶段误失败。建议工作文件夹指向已建好的子目录（如 task/qr-app/），避免在无关仓库根目录执行。',
    tool: 'code-runner',
    toolConfig: {
      type: 'code-runner',
      command: 'npm init -y',
      captureOutput: true,
      pathBase: 'workspace',
      workingDir: '.',
    },
    input: {
      sources: [{ type: 'user-input', label: '用户任务' }],
      mergeStrategy: 'concat',
    },
    outputs: [{ key: 'npmInitLog', format: 'text' }],
    pauseAfter: false,
  };
}

/** 在每个 llm-text 的 stage_impl_* 后插入 file-write，把工作区根下 `.stagent/generated/<implId>.md` 写入实现阶段主输出，便于审阅与后续扩展为真实源码树 */
export function injectFileWriteAfterImplStages(stages: Stage[]): Stage[] {
  const out: Stage[] = [];
  for (const s of stages) {
    out.push(s);
    if (s.tool !== 'llm-text' || !/^stage_impl_/.test(s.id)) {
      continue;
    }
    const bundleId = `${s.id}_stagent_bundle_write`;
    if (stages.some((x) => x.id === bundleId) || out.some((x) => x.id === bundleId)) {
      continue;
    }
    const outKey = s.outputs[0]?.key ?? 'text';
    const w: Stage = {
      id: bundleId,
      title: `落盘：${s.title}`,
      description: '将上一实现阶段主输出写入工作区根下 .stagent/generated/，便于查看与 npm test 前人工核对。',
      tool: 'file-write',
      dependsOn: [s.id],
      toolConfig: {
        type: 'file-write',
        filePath: `.stagent/generated/${s.id}.md`,
        sourceOutputKey: outKey,
        sourceStageId: s.id,
        pathBase: 'workspace',
      },
      input: {
        sources: [{ type: 'stage-output', stageId: s.id, outputKey: outKey, label: '实现输出' }],
        mergeStrategy: 'concat',
      },
      outputs: [{ key: 'writtenPath', format: 'file-path' }],
      pauseAfter: false,
    };
    out.push(w);
  }
  return out;
}

export function injectInitNpmWorkspaceStage(stages: Stage[]): Stage[] {
  if (stages.some((s) => s.id === STAGE_INIT_NPM_WORKSPACE_ID)) {
    return stages;
  }
  return [createInitNpmStage(), ...stages];
}

/** 未显式 pathBase 的 stage_test_run_* + code-runner 默认改为工作区根，使 npm test 针对子项目而非 .stagent/instances/… */
function augmentTestRunToWorkspaceRoot(stages: Stage[]): void {
  for (const s of stages) {
    if (!/^stage_test_run_/.test(s.id) || s.tool !== 'code-runner') {
      continue;
    }
    const tc = s.toolConfig as { type: string; pathBase?: string; workingDir?: string };
    if (tc.type !== 'code-runner') {
      continue;
    }
    if (!tc.pathBase) {
      tc.pathBase = 'workspace';
      tc.workingDir = tc.workingDir ?? '.';
    }
  }
}

export function applySoftwareDiskPipeline(wf: WorkflowDefinition): WorkflowDefinition {
  const stages = Array.isArray(wf.stages) ? [...wf.stages] : [];
  const nextStages = injectInitNpmWorkspaceStage(stages);
  const withBundles = injectFileWriteAfterImplStages(nextStages);
  augmentTestRunToWorkspaceRoot(withBundles);
  return { ...wf, stages: withBundles };
}

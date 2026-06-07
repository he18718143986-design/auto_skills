/**
 * WorkflowEngine 集成测试 harness — mock vscode.lm / ExtensionContext / WebviewPanel。
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import Module from 'node:module';
import type { BackendMessage } from '../WorkflowDefinition';
import { TRACE_STAGE_WORKFLOW_GEN } from '../generation/GenerationTraceStageIds';

export type LlmHandler = (
  traceStageId: string,
  systemPrompt: string,
  userContent: string,
) => Promise<string>;

export interface EngineTestEnv {
  workspaceDir: string;
  posted: BackendMessage[];
  setLlmHandler: (handler: LlmHandler) => void;
  createEngine: () => Promise<import('../WorkflowEngine').WorkflowEngine>;
  mockPanel: () => import('vscode').WebviewPanel;
  cleanup: () => void;
}

export type EngineTestGatesProfile = 'minimal' | 'strict';

const DEFAULT_TEST_CONFIG: Record<string, unknown> = {
  'plan.requireCompleteness': false,
  'enableRuntimeRule20Verify': false,
  'debug.requireFeedbackLoop': 'off',
  'tdd.redGreenGate': 'off',
  'staticAnalysis.enabled': false,
  'memory.enableExperienceStore': false,
  'codebaseContext.enabled': false,
  'experience.injectOnGenerate': false,
  'promptVersions.enabled': false,
  'glossary.enabled': false,
  'llmApiKey': '',
  'llmBaseUrl': 'https://api.example.com/v1',
  'llmModel': 'gpt-4o',
};

/** 接近生产的门禁子集（仍 mock LLM，无网络）。 */
const STRICT_TEST_CONFIG: Record<string, unknown> = {
  'enableRuntimeRule20Verify': true,
  'plan.requireCompleteness': false,
  'staticAnalysis.enabled': true,
};

export function createEngineTestEnv(
  configOverrides: Record<string, unknown> = {},
  options?: { gatesProfile?: EngineTestGatesProfile },
): EngineTestEnv {
  const baseDir = path.join(process.cwd(), '.test-tmp', 'engine');
  fs.mkdirSync(baseDir, { recursive: true });
  const workspaceDir = fs.mkdtempSync(path.join(baseDir, 'run-'));
  const globalStorageDir = path.join(workspaceDir, '.stagent-global');
  const extensionDir = path.join(workspaceDir, '.stagent-ext');
  fs.mkdirSync(globalStorageDir, { recursive: true });
  fs.mkdirSync(extensionDir, { recursive: true });

  const posted: BackendMessage[] = [];
  const baseConfig =
    options?.gatesProfile === 'strict'
      ? { ...DEFAULT_TEST_CONFIG, ...STRICT_TEST_CONFIG }
      : DEFAULT_TEST_CONFIG;
  const configValues = { ...baseConfig, ...configOverrides };
  const globalState = new Map<string, unknown>();
  let llmHandler: LlmHandler = async (traceStageId) => `mock-llm-output:${traceStageId}`;

  function makeMockModel() {
    return {
      family: 'test-model',
      name: 'Test Model',
      vendor: 'test',
      sendRequest: async (messages: { content?: string }[]) => {
        const prompt = messages.map((m) => m.content ?? '').join('\n');
        const traceStageId = prompt.includes('用户任务：') ? TRACE_STAGE_WORKFLOW_GEN : inferStageIdFromPrompt(prompt);
        const text = await llmHandler(traceStageId, prompt, prompt);
        return {
          text: (async function* () {
            yield text;
          })(),
        };
      },
    };
  }

  function inferStageIdFromPrompt(prompt: string): string {
    if (prompt.includes('Write a short outline')) {
      return 'stage_writing_outline';
    }
    if (prompt.includes('Write a short draft')) {
      return 'stage_writing_draft';
    }
    return 'stage-llm';
  }

  const vscodeStub = {
    workspace: {
      workspaceFolders: [{ uri: { fsPath: workspaceDir }, name: 'engine-test', index: 0 }],
      getConfiguration: (_section?: string) => ({
        get: <T>(key: string, defaultValue?: T): T | undefined => {
          if (Object.prototype.hasOwnProperty.call(configValues, key)) {
            return configValues[key] as T;
          }
          return defaultValue;
        },
      }),
    },
    window: {
      createOutputChannel: () => ({
        appendLine: () => {},
        clear: () => {},
        dispose: () => {},
      }),
      showErrorMessage: async () => undefined,
      showWarningMessage: async () => undefined,
      showInformationMessage: async () => undefined,
    },
    Uri: { file: (p: string) => ({ fsPath: p }) },
    lm: {
      selectChatModels: async () => [makeMockModel()],
    },
    LanguageModelChatMessage: {
      User: (content: string) => ({ role: 'user', content }),
    },
    CancellationTokenSource: class {
      token = {
        isCancellationRequested: false,
        onCancellationRequested: () => ({ dispose: () => {} }),
      };
      cancel(): void {
        this.token.isCancellationRequested = true;
      }
      dispose(): void {}
    },
  };

  const moduleAny = Module as unknown as {
    _load: (request: string, parent: unknown, isMain: boolean) => unknown;
  };
  const originalLoad = moduleAny._load;
  moduleAny._load = (request, parent, isMain) =>
    request === 'vscode' ? vscodeStub : originalLoad.call(Module, request, parent, isMain);

  const context = {
    globalStorageUri: { fsPath: globalStorageDir },
    extensionUri: { fsPath: extensionDir },
    globalState: {
      get: <T>(key: string, defaultValue?: T) => (globalState.get(key) as T | undefined) ?? defaultValue,
      update: async (key: string, value: unknown) => {
        if (value === undefined) {
          globalState.delete(key);
        } else {
          globalState.set(key, value);
        }
      },
      keys: () => [...globalState.keys()],
    },
    subscriptions: { push: () => {} },
  } as never;

  let WorkflowEngineCtor: typeof import('../WorkflowEngine').WorkflowEngine | undefined;

  async function createEngine(): Promise<import('../WorkflowEngine').WorkflowEngine> {
    if (!WorkflowEngineCtor) {
      WorkflowEngineCtor = (await import('../WorkflowEngine')).WorkflowEngine;
    }
    return new WorkflowEngineCtor(context);
  }

  function mockPanel(): import('vscode').WebviewPanel {
    return {
      webview: {
        postMessage: (msg: BackendMessage) => {
          posted.push(msg);
        },
      },
    } as never;
  }

  return {
    workspaceDir,
    posted,
    setLlmHandler: (handler: LlmHandler) => {
      llmHandler = handler;
    },
    createEngine,
    mockPanel,
    cleanup: () => {
      moduleAny._load = originalLoad;
      fs.rmSync(workspaceDir, { recursive: true, force: true });
    },
  };
}

export function wrapWorkflowJson(rawJson: string): string {
  return `\`\`\`json\n${rawJson}\n\`\`\``;
}

/** 读取仓库内 JSON 夹具（相对 cwd，通常在仓库根执行测试）。 */
export function loadEngineFixtureJson(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

export function messagesOfType<T extends BackendMessage['type']>(
  posted: BackendMessage[],
  type: T,
): Extract<BackendMessage, { type: T }>[] {
  return posted.filter((m): m is Extract<BackendMessage, { type: T }> => m.type === type);
}

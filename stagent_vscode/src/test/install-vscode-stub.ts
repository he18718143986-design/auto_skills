/**
 * node --test 无 VS Code 运行时：在 require('vscode') 前注入轻量桩。
 * 需在依赖 vscode 的模块之前 import（作为测试文件首行 import）。
 */
import Module from 'node:module';

const vscodeStub = {
  workspace: {
    getConfiguration: () => ({
      get: (_key: string, defaultValue?: unknown) => defaultValue,
    }),
  },
  // 默认 no-op window；测试可就地改写其方法（通过 __importStar 的 live getter，
  // 各模块共享同一 window 引用，故方法改写对处理器可见）。
  window: {
    showErrorMessage: async (..._args: unknown[]) => undefined,
    showWarningMessage: async (..._args: unknown[]) => undefined,
    showInformationMessage: async (..._args: unknown[]) => undefined,
    showOpenDialog: async (..._args: unknown[]) => undefined,
    createOutputChannel: () => ({
      appendLine: () => {},
      append: () => {},
      clear: () => {},
      show: () => {},
      hide: () => {},
      dispose: () => {},
    }),
  },
  Uri: {
    file: (p: string) => ({ fsPath: p }),
  },
  lm: {
    selectChatModels: async () => [] as unknown[],
  },
};

type LoadFn = (request: string, parent: unknown, isMain: boolean) => unknown;
const moduleAny = Module as unknown as {
  _load: LoadFn & { __stagentVscodeStub?: boolean };
};

if (!moduleAny._load.__stagentVscodeStub) {
  const originalLoad = moduleAny._load;
  moduleAny._load = function stagentVscodeStubLoad(request, parent, isMain) {
    return request === 'vscode' ? vscodeStub : originalLoad.call(Module, request, parent, isMain);
  };
  moduleAny._load.__stagentVscodeStub = true;
}

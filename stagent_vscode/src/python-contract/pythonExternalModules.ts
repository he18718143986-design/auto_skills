import externalRoots from '../../scripts/python-external-module-roots.json';

/**
 * Python 绝对 import 的顶层包名：标准库 + 常见第三方（非 workflow artifact）。
 * SdkPathContract / verify-python-test-imports 仅校验「项目内被测模块」import。
 * SSOT：scripts/python-external-module-roots.json
 */
const EXTERNAL_PYTHON_MODULE_ROOTS = new Set(
  (externalRoots as string[]).map((r) => r.toLowerCase()),
);

export function isExternalPythonModuleRoot(name: string): boolean {
  const root = name.split('.')[0]!.toLowerCase();
  return EXTERNAL_PYTHON_MODULE_ROOTS.has(root);
}

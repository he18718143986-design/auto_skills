import * as fs from 'fs';
import * as path from 'path';

/**
 * 执行期「配置键契约」lint：在 code-runner 运行 Python 脚本前，读取磁盘上已生成的 config.*.yaml 与被调用脚本，
 * 检测脚本读取的 config 键是否真的在配置文件中存在。专治「不同 llm-text 阶段各自给 config 起名」导致的
 * 跨阶段契约漂移（例：config.yaml 写 input_file，slice2_pipeline.py 读 paths.input_excel → 运行期才崩）。
 *
 * 设计取舍：
 * - 只在「脚本确实加载了 YAML 配置（出现 yaml.safe_load/load）」时才检查，避免对无关 dict 误报。
 * - 键集合按「任意嵌套层级出现过的键名」取并集，宽松匹配，宁可漏报也尽量不误报、不误阻断。
 * - 仅追踪「被污染（config 衍生）」的变量上的 .get('k') / ['k'] 访问，避免把 record['ASIN'] 之类业务字典误判为配置访问。
 */
export interface ConfigContractIssue {
  code: 'config-key-not-found';
  message: string;
}

/** config 根变量的常见命名；这些名字上的 .get/[] 访问会被视为配置访问（前提是脚本确实加载了 YAML）。 */
const CONFIG_ROOT_VAR_NAMES = ['config', 'cfg', 'conf', 'settings', 'configuration'];

const YAML_LOAD_RE = /yaml\.(?:safe_load|full_load|load)\s*\(/;

/** 从 YAML 文本抽取所有出现过的键名（任意嵌套层级）。最小实现，不依赖 YAML 解析库。 */
export function extractYamlKeyNames(yamlText: string): Set<string> {
  const keys = new Set<string>();
  for (const rawLine of yamlText.split(/\r?\n/)) {
    // 去掉行内注释（键已在 ':' 之前，安全）。
    const line = rawLine.replace(/#.*$/, '');
    // 跳过列表项（'- ' 开头）；匹配 `  key:` 形式的映射键。
    const m = /^\s*([A-Za-z_][\w.-]*)\s*:(?:\s|$)/.exec(line);
    if (m) {
      keys.add(m[1]);
    }
  }
  return keys;
}

/** 抽取脚本中「对 config 派生变量」的键访问（.get('k') 与 ['k']）。 */
export function extractConfigKeyAccesses(pyText: string): string[] {
  const tainted = new Set<string>(CONFIG_ROOT_VAR_NAMES);
  // 1) 直接由 yaml.load 赋值的变量。
  const assignYaml = /(\b[A-Za-z_]\w*)\s*=\s*yaml\.(?:safe_load|full_load|load)\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = assignYaml.exec(pyText))) {
    tainted.add(m[1]);
  }
  // 2) 由已污染变量经 .get('k') / ['k'] 派生出的子变量（迭代到不动点，封顶几轮防极端）。
  const reSub =
    /(\b[A-Za-z_]\w*)\s*=\s*([A-Za-z_]\w*)\s*(?:\.get\(\s*['"][^'"]+['"]|\[\s*['"][^'"]+['"]\s*\])/g;
  for (let i = 0; i < 4; i++) {
    const before = tainted.size;
    reSub.lastIndex = 0;
    while ((m = reSub.exec(pyText))) {
      if (tainted.has(m[2])) {
        tainted.add(m[1]);
      }
    }
    if (tainted.size === before) {
      break;
    }
  }
  // 2.5) 收集被成员测试守卫的「可选键」：`'k' in config` / `"k" not in cfg`。
  //      Python 里 `if 'k' in config:` 是可选键的标准写法，缺失合法，不应算必需键引用（否则误阻断）。
  const guarded = extractMembershipGuardedKeys(pyText, tainted);
  // 3) 收集所有污染变量上的键访问（排除被守卫的可选键）。
  const keys = new Set<string>();
  for (const v of tainted) {
    const reGet = new RegExp(`\\b${v}\\s*\\.get\\(\\s*['"]([^'"]+)['"]`, 'g');
    const reIdx = new RegExp(`\\b${v}\\s*\\[\\s*['"]([^'"]+)['"]\\s*\\]`, 'g');
    let g: RegExpExecArray | null;
    while ((g = reGet.exec(pyText))) {
      keys.add(g[1]);
    }
    while ((g = reIdx.exec(pyText))) {
      keys.add(g[1]);
    }
  }
  for (const k of guarded) {
    keys.delete(k);
  }
  return [...keys];
}

/** 收集被 `'k' in <configvar>` / `'k' not in <configvar>` 成员测试守卫的键名（视为可选键）。 */
export function extractMembershipGuardedKeys(pyText: string, taintedVars: Set<string>): Set<string> {
  const guarded = new Set<string>();
  const re = /['"]([^'"]+)['"]\s+(?:not\s+)?in\s+([A-Za-z_]\w*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(pyText))) {
    if (taintedVars.has(m[2])) {
      guarded.add(m[1]);
    }
  }
  return guarded;
}

/** 从 code-runner 命令里抽取被直接调用的 .py 脚本名（如 `.venv/bin/python slice2_pipeline.py`）。 */
export function extractInvokedScriptNames(command: string): string[] {
  const names = new Set<string>();
  const re = /([\w./-]+\.py)\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(command))) {
    // 仅保留 basename，配合工作目录读取。
    names.add(path.basename(m[1]));
  }
  return [...names];
}

/** 纯函数核心：给定命令、配置文件内容、脚本内容，返回配置键契约问题。 */
export function detectConfigContractIssues(input: {
  command: string;
  configFiles: { name: string; content: string }[];
  scripts: { name: string; content: string }[];
}): ConfigContractIssue[] {
  const keyUnion = new Set<string>();
  for (const cf of input.configFiles) {
    for (const k of extractYamlKeyNames(cf.content)) {
      keyUnion.add(k);
    }
  }
  if (keyUnion.size === 0) {
    return [];
  }
  const configLabel = input.configFiles.map((c) => c.name).join(' / ');
  const existing = [...keyUnion].sort().join(', ');
  const issues: ConfigContractIssue[] = [];
  const reported = new Set<string>();
  for (const s of input.scripts) {
    if (!YAML_LOAD_RE.test(s.content)) {
      continue;
    }
    for (const key of extractConfigKeyAccesses(s.content)) {
      if (keyUnion.has(key)) {
        continue;
      }
      const dedup = `${s.name}:${key}`;
      if (reported.has(dedup)) {
        continue;
      }
      reported.add(dedup);
      issues.push({
        code: 'config-key-not-found',
        message:
          `${s.name} 读取配置键 '${key}'，但 ${configLabel} 未定义该键` +
          `（现有键：${existing}）。请统一命名：在配置中补充该键，或改脚本使用现有键名。`,
      });
    }
  }
  return issues;
}

function safeRead(filePath: string): string | undefined {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return undefined;
  }
}

/**
 * 磁盘侧封装：读取工作目录下的 *.yaml/*.yml 与命令中被调用的脚本，执行配置键契约检查。
 * 任何异常一律吞掉返回空数组——lint 自身绝不阻断正常执行。
 */
export function collectConfigContractIssuesOnDisk(command: string, workspaceDir: string): ConfigContractIssue[] {
  try {
    if (!workspaceDir || !fs.existsSync(workspaceDir)) {
      return [];
    }
    const entries = fs.readdirSync(workspaceDir, { withFileTypes: true });
    const configFiles = entries
      .filter((e) => e.isFile() && /\.ya?ml$/i.test(e.name))
      .map((e) => ({ name: e.name, content: safeRead(path.join(workspaceDir, e.name)) }))
      .filter((c): c is { name: string; content: string } => typeof c.content === 'string');
    if (configFiles.length === 0) {
      return [];
    }
    const scripts = extractInvokedScriptNames(command)
      .map((name) => ({ name, content: safeRead(path.join(workspaceDir, name)) }))
      .filter((c): c is { name: string; content: string } => typeof c.content === 'string');
    if (scripts.length === 0) {
      return [];
    }
    return detectConfigContractIssues({ command, configFiles, scripts });
  } catch {
    return [];
  }
}

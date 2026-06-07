import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  detectConfigContractIssues,
  extractYamlKeyNames,
  extractConfigKeyAccesses,
  extractInvokedScriptNames,
  extractMembershipGuardedKeys,
} from '../ConfigContractLint';

const FLAT_CONFIG_YAML = `# config
mock: true
price_diff_threshold_pct: 10.0
# 文件路径
input_file: "input.xlsx"
output_dir: "./output"
log_file: "diff.log"
`;

const SLICE2_READS_NESTED = `
import yaml
def load_config(p):
    with open(p) as f:
        return yaml.safe_load(f)

def main():
    config = load_config('config.yaml')
    paths = config.get('paths', {})
    input_excel = paths.get('input_excel')
    output_dir = paths.get('output_dir')
    output_csv = paths.get('output_csv')
`;

test('extractYamlKeyNames 收集任意层级键名', () => {
  const keys = extractYamlKeyNames(FLAT_CONFIG_YAML);
  assert.ok(keys.has('mock'));
  assert.ok(keys.has('input_file'));
  assert.ok(keys.has('output_dir'));
  assert.ok(!keys.has('input_excel'));
});

test('extractConfigKeyAccesses 跟踪 config 及其派生子变量的键访问', () => {
  const keys = extractConfigKeyAccesses(SLICE2_READS_NESTED);
  assert.ok(keys.includes('paths'));
  assert.ok(keys.includes('input_excel'));
  assert.ok(keys.includes('output_csv'));
});

test('extractInvokedScriptNames 抽取命令中的 .py basename', () => {
  const names = extractInvokedScriptNames('.venv/bin/python slice2_pipeline.py && python -c "x"');
  assert.deepEqual(names, ['slice2_pipeline.py']);
});

test('detectConfigContractIssues 命中跨阶段 config 键漂移（input_file vs paths.input_excel）', () => {
  const issues = detectConfigContractIssues({
    command: '.venv/bin/python slice2_pipeline.py',
    configFiles: [{ name: 'config.yaml', content: FLAT_CONFIG_YAML }],
    scripts: [{ name: 'slice2_pipeline.py', content: SLICE2_READS_NESTED }],
  });
  const keys = issues.map((i) => i.message);
  assert.ok(issues.length >= 2, '至少应报告 paths / input_excel 缺失');
  assert.ok(keys.some((m) => m.includes("'input_excel'")));
  assert.ok(keys.some((m) => m.includes("'paths'")));
  // output_dir 是顶层已有键 → 不应误报
  assert.ok(!keys.some((m) => m.includes("'output_dir'")));
  assert.ok(issues.every((i) => i.code === 'config-key-not-found'));
});

test('detectConfigContractIssues 键齐全时无问题（对齐后的 config）', () => {
  const aligned =
    FLAT_CONFIG_YAML +
    `
paths:
  input_excel: "input.xlsx"
  output_dir: "./output"
  output_csv: "./output/diff.csv"
`;
  const issues = detectConfigContractIssues({
    command: '.venv/bin/python slice2_pipeline.py',
    configFiles: [{ name: 'config.yaml', content: aligned }],
    scripts: [{ name: 'slice2_pipeline.py', content: SLICE2_READS_NESTED }],
  });
  assert.equal(issues.length, 0);
});

const MAIN_OPTIONAL_KEY_GUARDED = `
import yaml, os
def main():
    with open("config.yaml") as f:
        config = yaml.safe_load(f)
    # 可选键：仅在存在时读取（缺失合法）
    if "api_key_env" in config:
        env_var = config["api_key_env"]
        config["api_key"] = os.environ.get(env_var)
    mode = config.get("mode")
    input_excel = config["input_excel"]
`;

test('extractMembershipGuardedKeys 识别 "k" in config 守卫的可选键', () => {
  const guarded = extractMembershipGuardedKeys(MAIN_OPTIONAL_KEY_GUARDED, new Set(['config']));
  assert.ok(guarded.has('api_key_env'));
});

test('被 "k" in config 守卫的可选键不报缺失（修复误阻断）', () => {
  // 复现 03/main.py：config["api_key_env"] 被 if "api_key_env" in config 守卫，config.yaml 无该键 → 不应报错
  const yamlText = `mode: mock\napi_key: "x"\ninput_excel: "input.xlsx"\n`;
  const issues = detectConfigContractIssues({
    command: '.venv/bin/python main.py',
    configFiles: [{ name: 'config.yaml', content: yamlText }],
    scripts: [{ name: 'main.py', content: MAIN_OPTIONAL_KEY_GUARDED }],
  });
  assert.equal(issues.length, 0);
  // 但无守卫的必需键漂移仍应被捕获
  const accesses = extractConfigKeyAccesses(MAIN_OPTIONAL_KEY_GUARDED);
  assert.ok(!accesses.includes('api_key_env'));
  assert.ok(accesses.includes('input_excel'));
});

test('detectConfigContractIssues 不检查未加载 YAML 的脚本（避免对业务 dict 误报）', () => {
  const businessScript = `
def f(record):
    return record['ASIN'] + record.get('TK SKU', '')
config = {'foo': 1}
print(config.get('input_excel'))
`;
  const issues = detectConfigContractIssues({
    command: '.venv/bin/python differ.py',
    configFiles: [{ name: 'config.yaml', content: FLAT_CONFIG_YAML }],
    scripts: [{ name: 'differ.py', content: businessScript }],
  });
  assert.equal(issues.length, 0);
});

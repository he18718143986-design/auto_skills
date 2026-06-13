/**
 * M25：深模块评分（借鉴 skills `improve-codebase-architecture` / Ousterhout「深模块」）。
 *
 * 深模块 = 窄接口 + 大杠杆（小接口背后藏了大量行为，调用者用极少接口换大量能力）；
 * 浅模块 = 接口面 ≈ 行为量（薄包装/透传，徒增认知成本）。
 *
 * 深度评分采用 **depth-as-leverage**（杠杆语义），而非 LANGUAGE.md 明确拒绝的
 * 「实现行数 / 接口行数」比值——后者会奖励「往实现里灌水」。
 * leverage = 行为单元数(behaviorUnits) / 接口成本(interfaceCost)；
 * 行为单元只数「真正做事的语句/分支」，透传/平凡 return/结构性行不计，灌水不再加深。
 * 同时提供 deletion-test 直觉：纯透传（无行为单元）即「删了不丢复杂度」的浅模块。
 *
 * 纯函数；默认仅告警；`stagent.architecture.depthScoring` 开启后接入质量分。
 */

import { CONFIDENCE_LEVEL_MEDIUM_MIN } from './ConfidenceBands';
import type { QualityScore } from './OutputQualityScorer';

export type ModuleDepthClass = 'deep' | 'moderate' | 'shallow';

export interface ModuleDepthMetrics {
  publicSymbolCount: number;
  implementationLines: number;
  /** depth-as-leverage：真正做事的语句/分支数（透传/平凡 return/结构行不计）。 */
  behaviorUnits?: number;
  /** 接口成本：调用者必须学习的量（符号数 + 参数复杂度）。缺省时按 publicSymbolCount。 */
  interfaceCost?: number;
}

export interface ModuleDepthResult {
  ratio: number;
  classification: ModuleDepthClass;
  /** 0–1，越深越高 */
  score: number;
  /** depth-as-leverage：behaviorUnits / interfaceCost（杠杆越大越深）。 */
  leverage?: number;
}

/** 至少要有这么多实现行才有资格评深度（太小的模块不评，避免噪声）。 */
export const MIN_IMPL_LINES_FOR_DEPTH = 12;
const SHALLOW_RATIO = 4; // 实现/接口 < 4 视为浅（接口面相对实现过大）
const DEEP_RATIO = 10; // ≥ 10 视为深

/** depth-as-leverage 阈值：杠杆 = 行为/接口。 */
export const LEVERAGE_DEEP = 6; // 单位接口承载 ≥6 行为单元 → 深
export const LEVERAGE_SHALLOW = 2.5; // < 2.5 → 浅（薄包装/透传）

export function classifyDepthRatio(ratio: number): ModuleDepthClass {
  if (ratio >= DEEP_RATIO) {
    return 'deep';
  }
  if (ratio >= SHALLOW_RATIO) {
    return 'moderate';
  }
  return 'shallow';
}

export function classifyLeverage(leverage: number): ModuleDepthClass {
  if (leverage >= LEVERAGE_DEEP) {
    return 'deep';
  }
  if (leverage >= LEVERAGE_SHALLOW) {
    return 'moderate';
  }
  return 'shallow';
}

/** 向后兼容：仅给「接口符号 + 实现行」时，按旧的实现/接口比值评分。 */
export function scoreModuleDepth(metrics: ModuleDepthMetrics): ModuleDepthResult {
  const impl = Math.max(0, metrics.implementationLines);
  const iface = Math.max(1, metrics.publicSymbolCount);
  if (impl < MIN_IMPL_LINES_FOR_DEPTH) {
    // 体量过小，不判浅，给中性分
    return { ratio: impl / iface, classification: 'moderate', score: 0.6 };
  }
  const ratio = impl / iface;
  const classification = classifyDepthRatio(ratio);
  const score = classification === 'deep' ? 1 : classification === 'moderate' ? 0.6 : 0.3;
  return { ratio, classification, score };
}

/**
 * depth-as-leverage 评分：以「行为单元 / 接口成本」衡量杠杆，灌水不加深。
 * 当 behaviorUnits 缺省时回退到 scoreModuleDepth（比值法）以保持兼容。
 */
export function scoreModuleDepthByLeverage(metrics: ModuleDepthMetrics): ModuleDepthResult {
  if (metrics.behaviorUnits === undefined) {
    return scoreModuleDepth(metrics);
  }
  const impl = Math.max(0, metrics.implementationLines);
  const iface = Math.max(1, metrics.publicSymbolCount);
  const interfaceCost = Math.max(1, metrics.interfaceCost ?? iface);
  const behaviour = Math.max(0, metrics.behaviorUnits);
  const ratio = impl / iface;
  const leverage = behaviour / interfaceCost;
  if (impl < MIN_IMPL_LINES_FOR_DEPTH) {
    return { ratio, leverage, classification: 'moderate', score: 0.6 };
  }
  const classification = classifyLeverage(leverage);
  const score = classification === 'deep' ? 1 : classification === 'moderate' ? 0.6 : 0.3;
  return { ratio, leverage, classification, score };
}

/** 浅模块的质量分惩罚（0–1，越浅惩罚越大）；非浅返回 0。 */
export function moduleDepthPenalty(result: ModuleDepthResult): number {
  return result.classification === 'shallow' ? 0.3 : 0;
}

const PY_PUBLIC_DEF = /^(?:async\s+)?(?:def|class)\s+(?!_)[A-Za-z]/;
const PY_DEF_OR_CLASS = /^(?:async\s+)?(?:def|class)\s+/;
const PY_DECORATOR = /^@/;
const PY_CONTROL_FLOW = /^(?:if|elif|else|for|while|try|except|finally|with|match|case|raise|assert)\b/;
/** 平凡 return：单标识符 / 字面量 / 单次调用透传（return f(x)），不视为行为。 */
const PY_TRIVIAL_RETURN =
  /^return(?:\s+(?:[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*(?:\([^()]*\))?|-?\d[\w.]*|"[^"]*"|'[^']*'|True|False|None|\[\]|\{\}|\(\)))?$/;

/** 该实现行是否「真正做事」（行为单元）：透传/平凡 return/结构性行/纯赋值常量不计。 */
function isPythonBehaviorLine(trimmed: string): boolean {
  if (PY_DEF_OR_CLASS.test(trimmed) || PY_DECORATOR.test(trimmed)) {
    return false; // 接口/结构，不算行为
  }
  if (trimmed === 'pass' || trimmed === '...' || trimmed === 'return' || trimmed === 'return None') {
    return false;
  }
  if (PY_TRIVIAL_RETURN.test(trimmed)) {
    return false; // 透传/平凡 return（薄包装的典型形态）
  }
  if (PY_CONTROL_FLOW.test(trimmed)) {
    return true; // 分支/循环/异常 = 行为
  }
  // 赋值、调用、表达式语句等 = 行为
  return true;
}

/** 估算单个 def 的参数个数（用于接口成本：参数越多，调用者要学的越多）。 */
function pythonParamCount(defLine: string): number {
  const m = defLine.match(/\(([^)]*)\)/);
  if (!m || !m[1].trim()) {
    return 0;
  }
  return m[1]
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p && p !== 'self' && p !== 'cls').length;
}

/**
 * 粗粒度分析 Python 模块（depth-as-leverage）：
 * - 接口成本 = 顶层公共 def/class 数 + 参数复杂度（每参数 +0.25）。
 * - 行为单元 = 真正做事的语句/分支（透传/平凡 return/结构行不计），灌水不加深。
 * - leverage = 行为 / 接口成本 → 分类。
 */
export function analyzePythonModuleDepth(content: string): ModuleDepthResult {
  const lines = content.split(/\r?\n/);
  let publicSymbols = 0;
  let interfaceCost = 0;
  let implLines = 0;
  let behaviorUnits = 0;
  for (const raw of lines) {
    const line = raw.replace(/\t/g, '    ');
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith('#')) {
      continue;
    }
    // 顶层（无缩进）的公共 def/class 计接口（含参数复杂度）
    if (!/^\s/.test(line) && PY_PUBLIC_DEF.test(trimmed)) {
      publicSymbols += 1;
      interfaceCost += 1 + pythonParamCount(trimmed) * 0.25;
    }
    if (/^(?:import|from)\s/.test(trimmed)) {
      continue;
    }
    implLines += 1;
    if (isPythonBehaviorLine(trimmed)) {
      behaviorUnits += 1;
    }
  }
  return scoreModuleDepthByLeverage({
    publicSymbolCount: publicSymbols,
    implementationLines: implLines,
    behaviorUnits,
    interfaceCost: interfaceCost || publicSymbols,
  });
}

/** 浅模块告警行（warning-only，前缀与 contract:* 风格一致，便于显示层归类）。 */
export function formatModuleDepthWarning(filePath: string, result: ModuleDepthResult): string | undefined {
  if (result.classification !== 'shallow') {
    return undefined;
  }
  const lev = result.leverage !== undefined ? `杠杆 ${result.leverage.toFixed(1)}` : `深度比 ${result.ratio.toFixed(1)}`;
  return `architecture:shallow-module:${filePath} 接口面相对行为过大（${lev}），疑似薄包装/透传（deletion-test：删了不丢复杂度），建议合并或把复杂度下沉到更窄的接口后`;
}

/** M34 / #14：对已落盘 artifact 批量产 shallow-module warnings（run_end / test_run 兜底）。 */
export function collectModuleDepthWarnings(
  files: Array<{ path: string; content: string }>,
): string[] {
  const warnings: string[] = [];
  for (const f of files) {
    if (!/\.py$/i.test(f.path)) {
      continue;
    }
    if (/(^|\/)(test_|tests?\/).*\.py$|_test\.py$/i.test(f.path)) {
      continue;
    }
    const w = formatModuleDepthWarning(f.path, analyzePythonModuleDepth(f.content));
    if (w) {
      warnings.push(w);
    }
  }
  return warnings;
}

/** M34 / #14：`stagent.architecture.depthScoring` 开启时，对 impl 产出降 quality.overall。 */
export function applyModuleDepthPenaltyToQualityScore(
  quality: QualityScore,
  pythonSource: string,
): QualityScore {
  const result = analyzePythonModuleDepth(pythonSource);
  const penalty = moduleDepthPenalty(result);
  if (penalty <= 0) {
    return quality;
  }
  const overall = Math.max(0, Math.round((quality.overall - penalty) * 1000) / 1000);
  let recommendation = quality.recommendation;
  if (overall < CONFIDENCE_LEVEL_MEDIUM_MIN && recommendation === 'approve') {
    recommendation = 'review';
  } else if (overall < 0.5 && recommendation !== 'retry') {
    recommendation = 'review';
  }
  const shallowMsg = formatModuleDepthWarning('impl-output', result);
  return {
    ...quality,
    overall,
    recommendation,
    issues: shallowMsg
      ? [
          ...quality.issues,
          { severity: 'warning' as const, code: 'architecture:shallow-module', message: shallowMsg },
        ]
      : quality.issues,
  };
}

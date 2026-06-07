/**
 * M21.1b：跨文件键名一致性 lint（运行期，test_run 前）。
 *
 * 背景：reader.py 产出 dict 键 `tk_sku`/`stock`，analyzer.py 却 `row.get('sku')`/`row.get('expected_stock')`；
 * fetcher mock 读 `availability`/`delivery_date`，而 mock_data.json 写 `stock_status`/`estimated_delivery_date`。
 * 这类「产出键 vs 消费键 近似但不一致」的契约漂移，流程能跑通但结果全错（空心成功）。
 *
 * 本模块为纯函数：输入若干已落盘文件内容（.py / .json / .yaml），抽取「产出键集合」与「消费键集合」，
 * 检测跨文件的 near-miss（编辑距离 ≤ 2 或 token 子集关系），输出 warning。warning-only，不阻断执行。
 */

import { contractWarningMsg } from './l10n/lintMsg';
import { formatContractWarningColon } from './lint/ContractWarningFormat';
import { isNearMissKeyPair, levenshtein } from './KeyNameMatching';

export { isNearMissKeyPair, levenshtein };

export interface ProjectFile {
  path: string;
  content: string;
}

export interface KeyMismatch {
  consumedKey: string;
  consumedIn: string;
  /** 最相近的已产出键 */
  nearestProducedKey: string;
  producedIn: string;
  distance: number;
}

export interface CrossFileKeyLintResult {
  warnings: string[];
  mismatches: KeyMismatch[];
}

const PY_OR_JSON_LIKE = /\.(py|json|ya?ml)$/i;

/** 字符串字面量中作为 dict 键 / JSON 键出现的标识符（产出侧） */
const PRODUCED_KEY_PATTERNS: RegExp[] = [
  // python dict literal:  'asin': ...   "tk_sku": ...
  /['"]([a-zA-Z_][a-zA-Z0-9_]{1,40})['"]\s*:/g,
];

/** 消费侧：.get('key') / ['key'] / .get("key", ...) */
const CONSUMED_KEY_PATTERNS: RegExp[] = [
  /\.get\(\s*['"]([a-zA-Z_][a-zA-Z0-9_]{1,40})['"]/g,
  /\[\s*['"]([a-zA-Z_][a-zA-Z0-9_]{1,40})['"]\s*\]/g,
];

/** 太通用、跨文件天然共享、误报率高的键名（跳过） */
const STOPWORD_KEYS = new Set([
  'type',
  'name',
  'id',
  'key',
  'value',
  'data',
  'error',
  'message',
  'status',
  'result',
  'results',
  'path',
  'mode',
  'config',
  'url',
  'method',
  'headers',
  'timeout',
  'level',
  'detail',
  'details',
  'items',
  'list',
  'count',
  'total',
  'index',
  'label',
  'title',
  'text',
  'format',
  'encoding',
  'default',
  'self',
  'cls',
  'args',
  'kwargs',
]);

function collectKeys(content: string, patterns: RegExp[]): Set<string> {
  const out = new Set<string>();
  for (const pat of patterns) {
    pat.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pat.exec(content)) !== null) {
      const key = m[1];
      if (key && !STOPWORD_KEYS.has(key) && key.length >= 3) {
        out.add(key);
      }
    }
  }
  return out;
}

function collectNearMissMismatches(
  relevant: ProjectFile[],
  allProduced: Map<string, string>,
  seen: Set<string>,
  options?: { canonSet?: Set<string> },
): KeyMismatch[] {
  const out: KeyMismatch[] = [];
  const canonSet = options?.canonSet;

  for (const f of relevant) {
    const consumed = collectKeys(f.content, CONSUMED_KEY_PATTERNS);
    for (const ck of consumed) {
      if (canonSet) {
        if (!canonSet.has(ck) && !allProduced.has(ck)) {
          continue;
        }
      } else if (allProduced.has(ck)) {
        continue;
      }

      let best: { key: string; file: string; distance: number } | undefined;
      for (const [pk, pfile] of allProduced) {
        if (pfile === f.path) {
          continue;
        }
        if (canonSet && pk === ck) {
          continue;
        }
        const { near, distance } = isNearMissKeyPair(ck, pk);
        if (near && (best === undefined || distance < best.distance)) {
          best = { key: pk, file: pfile, distance };
        }
      }
      if (!best) {
        continue;
      }
      const dedupe = `${ck}@${f.path}->${best.key}@${best.file}`;
      if (seen.has(dedupe)) {
        continue;
      }
      seen.add(dedupe);
      out.push({
        consumedKey: ck,
        consumedIn: f.path,
        nearestProducedKey: best.key,
        producedIn: best.file,
        distance: best.distance,
      });
    }
  }
  return out;
}

function collectAllKeysFromFile(f: ProjectFile): Set<string> {
  return new Set<string>([
    ...collectKeys(f.content, PRODUCED_KEY_PATTERNS),
    ...collectKeys(f.content, CONSUMED_KEY_PATTERNS),
  ]);
}

/** CONTEXT 为唯一权威：文件中出现的非 canonical 键各发一条 warning。 */
function warnKeysNotInVocabulary(relevant: ProjectFile[], canonSet: Set<string>): string[] {
  const warnings: string[] = [];
  for (const f of relevant) {
    for (const k of collectAllKeysFromFile(f)) {
      if (canonSet.has(k)) {
        continue;
      }
      warnings.push(
        formatContractWarningColon(
          'non-canonical-key',
          f.path,
          contractWarningMsg('crossFileKeyNotInVocabulary', k),
        ),
      );
    }
  }
  return warnings;
}

/** 有词汇表但未 sole authority：键与 canonical near-miss 时告警。 */
function warnNonCanonicalNearMissToCanon(
  relevant: ProjectFile[],
  canonicalKeys: string[],
  canonSet: Set<string>,
): string[] {
  const warnings: string[] = [];
  const flagged = new Set<string>();
  for (const f of relevant) {
    for (const k of collectAllKeysFromFile(f)) {
      if (canonSet.has(k) || flagged.has(k)) {
        continue;
      }
      for (const canon of canonicalKeys) {
        if (isNearMissKeyPair(k, canon).near) {
          flagged.add(k);
          warnings.push(
            formatContractWarningColon(
              'non-canonical-key',
              f.path,
              contractWarningMsg('crossFileKeyNonCanonical', k, canon),
            ),
          );
          break;
        }
      }
    }
  }
  return warnings;
}

function crossFileMismatchWarnings(mismatches: KeyMismatch[]): string[] {
  return mismatches.map((m) =>
    formatContractWarningColon(
      'cross-file-key-mismatch',
      m.consumedIn,
      contractWarningMsg('crossFileKeyMismatch', m.consumedKey, m.nearestProducedKey, m.producedIn),
    ),
  );
}

/**
 * 跨文件检测：某文件「消费」的键，在另一文件「产出」的键里没有精确匹配，
 * 却存在一个 near-miss 的已产出键 → 高度疑似契约漂移。
 */
export function lintCrossFileKeyContract(
  files: ProjectFile[],
  canonicalKeys?: string[],
  options?: { contextAsSoleAuthority?: boolean },
): CrossFileKeyLintResult {
  const relevant = files.filter((f) => PY_OR_JSON_LIKE.test(f.path) && f.content.trim().length > 0);
  const useContextAuthority =
    options?.contextAsSoleAuthority === true ||
    ((canonicalKeys?.length ?? 0) > 0 && options?.contextAsSoleAuthority !== false);

  const producedByFile = new Map<string, Set<string>>();
  const allProduced = new Map<string, string>();
  for (const f of relevant) {
    const produced = collectKeys(f.content, PRODUCED_KEY_PATTERNS);
    producedByFile.set(f.path, produced);
    for (const k of produced) {
      if (!allProduced.has(k)) {
        allProduced.set(k, f.path);
      }
    }
  }

  const mismatches: KeyMismatch[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();

  // M24-F1：CONTEXT.md 为唯一权威时，偏离 canonical 即 warning；near-miss 仅作补充
  if (useContextAuthority && canonicalKeys && canonicalKeys.length > 0) {
    const canonSet = new Set(canonicalKeys);
    warnings.push(...warnKeysNotInVocabulary(relevant, canonSet));
    mismatches.push(...collectNearMissMismatches(relevant, allProduced, seen, { canonSet }));
    warnings.push(...crossFileMismatchWarnings(mismatches));
    return { warnings, mismatches };
  }

  mismatches.push(...collectNearMissMismatches(relevant, allProduced, seen));
  warnings.push(...crossFileMismatchWarnings(mismatches));

  // 无 CONTEXT 权威时：near-miss 启发式为主；有词汇表但未启用 sole authority 时作 near-miss 补充
  if (canonicalKeys && canonicalKeys.length > 0 && !useContextAuthority) {
    warnings.push(
      ...warnNonCanonicalNearMissToCanon(relevant, canonicalKeys, new Set(canonicalKeys)),
    );
  }

  return { warnings, mismatches };
}

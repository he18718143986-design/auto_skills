import * as fs from 'fs';
import * as path from 'path';
import { CODE_EXPLORE_LINE_PREVIEW_CHARS } from './LogPreviewLimits';
import { GRILL_CODE_EXPLORE_KEYWORDS_PREVIEW_MAX } from './UiListLimits';
import type { Question } from './WorkflowDefinition';

/**
 * M23-F2：受限 code-explore（file-read / grep）——决策 grill 自答优先。
 * 只读工作区源码，不执行命令；找不到可答证据时返回 undefined，由引擎回落为用户追问。
 */

const MAX_DEPTH = 4;
const MAX_FILES = 12;
const MAX_MATCHES = 6;
const MAX_FILE_BYTES = 48_000;
const SOURCE_EXT = /\.(ts|tsx|js|jsx|py|json|ya?ml|md)$/i;

export interface CodeExploreHit {
  relativePath: string;
  lineNo: number;
  line: string;
}

function extractKeywords(blob: string): string[] {
  const tokens = blob
    .replace(/[^\p{L}\p{N}_\s-]/gu, ' ')
    .split(/\s+/)
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length >= 3 && t.length <= 40);
  const stop = new Set([
    'the',
    'and',
    'for',
    'with',
    'from',
    'this',
    'that',
    'what',
    'which',
    'where',
    'existing',
    'current',
    'code',
    'implementation',
    'project',
    '是否',
    '已经',
    '存在',
    '当前',
    '代码',
    '实现',
    '项目',
    '哪些',
    '用了',
  ]);
  const uniq: string[] = [];
  for (const t of tokens) {
    if (stop.has(t)) {
      continue;
    }
    if (!uniq.includes(t)) {
      uniq.push(t);
    }
    if (uniq.length >= 8) {
      break;
    }
  }
  return uniq;
}

function walkSourceFiles(
  dir: string,
  root: string,
  depth: number,
  out: string[],
): void {
  if (out.length >= MAX_FILES || depth > MAX_DEPTH) {
    return;
  }
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    if (out.length >= MAX_FILES) {
      return;
    }
    if (ent.name.startsWith('.') || ent.name === 'node_modules' || ent.name === 'out' || ent.name === 'dist') {
      continue;
    }
    const abs = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      walkSourceFiles(abs, root, depth + 1, out);
    } else if (ent.isFile() && SOURCE_EXT.test(ent.name)) {
      try {
        const stat = fs.statSync(abs);
        if (stat.size <= MAX_FILE_BYTES) {
          out.push(abs);
        }
      } catch {
        // skip
      }
    }
  }
}

function grepFile(absPath: string, root: string, keywords: string[]): CodeExploreHit[] {
  let raw: string;
  try {
    raw = fs.readFileSync(absPath, 'utf-8');
  } catch {
    return [];
  }
  const rel = path.relative(root, absPath).replace(/\\/g, '/');
  const lines = raw.split(/\r?\n/);
  const hits: CodeExploreHit[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const lower = line.toLowerCase();
    if (keywords.some((k) => lower.includes(k))) {
      hits.push({
        relativePath: rel,
        lineNo: i + 1,
        line: line.slice(0, CODE_EXPLORE_LINE_PREVIEW_CHARS),
      });
      if (hits.length >= MAX_MATCHES) {
        break;
      }
    }
  }
  return hits;
}

/** 尝试用工作区只读检索回答 fact 类问题；无法确定则 undefined。 */
export function tryAnswerFromCodeExplore(
  question: Pick<Question, 'text' | 'hint'>,
  workspaceRoot: string | undefined,
): string | undefined {
  if (!workspaceRoot?.trim() || !fs.existsSync(workspaceRoot)) {
    return undefined;
  }
  const keywords = extractKeywords(`${question.text ?? ''} ${question.hint ?? ''}`);
  if (keywords.length === 0) {
    return undefined;
  }
  const files: string[] = [];
  walkSourceFiles(workspaceRoot, workspaceRoot, 0, files);
  const allHits: CodeExploreHit[] = [];
  for (const f of files) {
    allHits.push(...grepFile(f, workspaceRoot, keywords));
    if (allHits.length >= MAX_MATCHES) {
      break;
    }
  }
  if (allHits.length === 0) {
    return undefined;
  }
  const body = allHits
    .slice(0, MAX_MATCHES)
    .map((h) => `- ${h.relativePath}:${h.lineNo} ${h.line.trim()}`)
    .join('\n');
  return `（code-explore 自答）在工作区检索「${keywords.slice(0, GRILL_CODE_EXPLORE_KEYWORDS_PREVIEW_MAX).join(' / ')}」命中：\n${body}`;
}

import * as path from 'path';
import { writeOutputMsg } from './l10n/gateMsg';
import { extractJsonObject } from './JsonExtract';
import { applyDcloudVue3VitePinsIfUniAppScaffold } from './uniappPackagePins';
import {
  stripOuterMarkdownFences,
  extractFencedCodeBlockForPath,
  truncateAtOrphanFenceLine,
} from './markdown/MarkdownFenceUtils';
import { normalizeRequirementsTxtContent } from './RequirementsTxtNormalize';
import { stripForbiddenPypiImports } from './PypiSymbolHints';
import {
  isWorkspaceTsconfigBasename,
  WORKSPACE_PACKAGE_JSON,
  WORKSPACE_PACKAGE_LOCK_JSON,
} from './workspace/WorkspaceRootFilenames';

const REQUIREMENTS_TXT_BASENAME = 'requirements.txt';

/** 首行形如 `src/foo.ts` / `README.md`（模型常加的“文件名标题”），与真实路径 basename 一致或可接受时剥掉 */
function stripLeadingFilenameEchoLine(s: string, relPath: string): string {
  const base = path.basename(relPath);
  const first = s.split(/\r?\n/, 1)[0]?.trim() ?? '';
  if (!first) {
    return s;
  }
  // 完全匹配 basename，或仅路径分隔差异（模型写 src/x.ts 而 relPath 为 x.ts）
  if (first === base || first.endsWith(`/${base}`) || first.endsWith(`\\${base}`)) {
    return s.replace(/^[^\r\n]+\r?\n(?:\r?\n)*/, '');
  }
  return s;
}

/**
 * 将 llm-text 输出整理为可写入磁盘的内容。
 * 对 `package.json` 等 JSON 目标：必须从输出中提取合法 JSON（避免模型把 Markdown 决策清单写进 package.json 导致 npm EJSONPARSE）。
 */
export function normalizeLlmOutputForWritePath(
  relPath: string,
  raw: string,
): { ok: true; content: string } | { ok: false; reason: string } {
  let stripped = raw.trim();
  stripped = stripLeadingFilenameEchoLine(stripped, relPath);
  stripped = stripOuterMarkdownFences(stripped);

  const base = path.basename(relPath).toLowerCase();
  const tsconfigLenient = isWorkspaceTsconfigBasename(base);

  if (tsconfigLenient) {
    const candidate = extractJsonObject(stripped) ?? stripped;
    try {
      const o = JSON.parse(candidate);
      return { ok: true, content: JSON.stringify(o, null, 2) + '\n' };
    } catch {
      return { ok: true, content: stripped };
    }
  }

  const looksJson =
    base === WORKSPACE_PACKAGE_JSON ||
    base === WORKSPACE_PACKAGE_LOCK_JSON ||
    relPath.toLowerCase().endsWith('.json');

  if (!looksJson) {
    if (base === REQUIREMENTS_TXT_BASENAME) {
      const { content } = normalizeRequirementsTxtContent(stripped);
      return { ok: true, content };
    }
    // 非 markdown 代码文件：清理「中文说明 + ```lang + 代码 + ``` + 表格」或「代码 + 孤立 ``` + 表格」两种混排。
    const ext = path.extname(relPath).toLowerCase();
    const isMarkdown = ext === '.md' || ext === '.markdown';
    if (!isMarkdown) {
      let body = stripped;
      const inner = extractFencedCodeBlockForPath(relPath, stripped);
      if (inner !== null) {
        body = inner;
      } else {
        const truncated = truncateAtOrphanFenceLine(stripped);
        if (truncated !== stripped) {
          body = truncated;
        }
      }
      if (ext === '.py') {
        const { content: pyContent } = stripForbiddenPypiImports(body);
        return { ok: true, content: pyContent };
      }
      return { ok: true, content: body };
    }
    return { ok: true, content: stripped };
  }

  const candidate = (extractJsonObject(stripped) ?? stripped).trim();
  try {
    const o = JSON.parse(candidate);
    if (base === WORKSPACE_PACKAGE_JSON && (typeof o !== 'object' || o === null || Array.isArray(o))) {
      return { ok: false, reason: writeOutputMsg('packageJsonNotObject') };
    }
    if (base === WORKSPACE_PACKAGE_JSON && typeof o === 'object' && o !== null && !Array.isArray(o)) {
      applyDcloudVue3VitePinsIfUniAppScaffold(o as Record<string, unknown>);
    }
    return { ok: true, content: JSON.stringify(o, null, 2) + '\n' };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      reason: writeOutputMsg('jsonParseFailed', msg),
    };
  }
}

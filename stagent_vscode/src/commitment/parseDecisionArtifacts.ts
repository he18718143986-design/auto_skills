import { extractJsonObject } from '../JsonExtract';
import {
  type DecisionArtifactsV1,
  isDecisionArtifactsV1,
} from './decisionArtifactsSchema';

const ARTIFACTS_MARKER_RE = /<!--\s*decisionArtifacts:json\s*-->/i;

export const DECISION_ARTIFACTS_PROMPT_SUFFIX = `

【决策机读 sidecar（decisionArtifacts）】
在 DecisionRecord Markdown 正文之后，另起一行输出标记行：
<!-- decisionArtifacts:json -->
随后输出**唯一**一个 JSON 对象（不要用 markdown 围栏），结构：
{"version":1,"files":[{"key":"configContent","path":"config.yaml","format":"yaml","content":"..."}],"testStack":"pytest"}
- files[].key 供下游 file-write 的 sourceOutputKey 引用；content 为完整文件正文。
- 若无额外落盘文件，files 可为 []。
- DecisionRecord 正文仍禁止代码块；JSON sidecar 不受此限。`;

/**
 * 从决策阶段 LLM 输出提取 decisionArtifacts JSON（marker 后或文末 JSON 对象）。
 */
export function parseDecisionArtifactsFromText(text: string): {
  artifacts: DecisionArtifactsV1 | null;
  markdownBody: string;
  warnings: string[];
} {
  const warnings: string[] = [];
  const trimmed = text.trim();
  if (!trimmed) {
    return { artifacts: null, markdownBody: '', warnings: ['empty decision output'] };
  }

  const markerIdx = trimmed.search(ARTIFACTS_MARKER_RE);
  let markdownBody = trimmed;
  let jsonCandidate = '';

  if (markerIdx >= 0) {
    markdownBody = trimmed.slice(0, markerIdx).trim();
    jsonCandidate = trimmed.slice(markerIdx).replace(ARTIFACTS_MARKER_RE, '').trim();
  } else {
    const extracted = extractJsonObject(trimmed);
    if (extracted) {
      const jsonStart = trimmed.indexOf(extracted);
      if (jsonStart > 0) {
        markdownBody = trimmed.slice(0, jsonStart).trim();
        jsonCandidate = extracted;
      }
    }
  }

  if (!jsonCandidate) {
    return { artifacts: null, markdownBody, warnings };
  }

  try {
    const parsed = JSON.parse(jsonCandidate) as unknown;
    if (!isDecisionArtifactsV1(parsed)) {
      warnings.push('decisionArtifacts JSON 结构无效');
      return { artifacts: null, markdownBody, warnings };
    }
    return { artifacts: parsed, markdownBody, warnings };
  } catch (e) {
    warnings.push(`decisionArtifacts JSON 解析失败: ${e instanceof Error ? e.message : String(e)}`);
    return { artifacts: null, markdownBody, warnings };
  }
}

import * as fs from 'fs';
import * as path from 'path';
import {
  DEP_GRAPH_CYCLE_NODES_MAX,
  DEP_GRAPH_IMPORTS_PREVIEW_MAX,
  DEP_GRAPH_TOP_NODES_MAX,
} from './UiListLimits';
import { resolveExistingImportPath } from './ImportPathResolve';
import { extractAllImportSpecs } from './ImportExtract';
import { listSourceFiles } from './workspace/listSourceFiles';
import { WORKSPACE_SRC_DIR } from './workspace/WorkspaceRootFilenames';

export type DependencyLayer = 1 | 2 | 3 | 4 | 5;

export interface DependencyNode {
  id: string;
  imports: string[];
  importedBy: string[];
  layer: DependencyLayer;
}

export interface DependencyGraph {
  nodes: Map<string, DependencyNode>;
  cycleDetected: boolean;
  cycleNodes?: string[];
}

function resolveImport(fromFile: string, spec: string, srcRoot: string): string | undefined {
  if (spec.startsWith('.') || spec.startsWith('/')) {
    const resolved = resolveExistingImportPath(path.dirname(fromFile), spec);
    if (resolved) {
      return path.relative(srcRoot, resolved).replace(/\\/g, '/');
    }
    return undefined;
  }
  return undefined;
}

function extractImports(filePath: string): string[] {
  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch {
    return [];
  }
  const specs = new Set(extractAllImportSpecs(content));
  return [...specs];
}

function detectCycle(nodeIds: string[], edges: Map<string, string[]>): string[] | undefined {
  const inDegree = new Map<string, number>();
  for (const id of nodeIds) {
    inDegree.set(id, 0);
  }
  for (const targets of edges.values()) {
    for (const t of targets) {
      inDegree.set(t, (inDegree.get(t) ?? 0) + 1);
    }
  }
  const queue = nodeIds.filter((id) => (inDegree.get(id) ?? 0) === 0);
  let processed = 0;
  while (queue.length > 0) {
    const id = queue.shift()!;
    processed += 1;
    for (const next of edges.get(id) ?? []) {
      const deg = (inDegree.get(next) ?? 0) - 1;
      inDegree.set(next, deg);
      if (deg === 0) {
        queue.push(next);
      }
    }
  }
  if (processed === nodeIds.length) {
    return undefined;
  }
  return nodeIds.filter((id) => (inDegree.get(id) ?? 0) > 0).slice(0, DEP_GRAPH_TOP_NODES_MAX);
}

function classifyLayerByDependencyDepth(
  node: DependencyNode,
  _graph: DependencyGraph,
): DependencyLayer {
  const fanIn = node.importedBy.length;
  const fanOut = node.imports.length;
  if (fanIn >= 3) {
    return 3;
  }
  if (fanOut >= 4) {
    return 2;
  }
  if (fanIn === 0 && fanOut > 0) {
    return 1;
  }
  if (fanIn >= 1 && fanOut >= 1) {
    return 4;
  }
  return 5;
}

/** 同步构建 `src/` 目录 import 依赖图（纯函数 + 磁盘 IO）。 */
export function buildDependencyGraph(srcDir: string): DependencyGraph {
  const abs = path.resolve(srcDir);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) {
    return { nodes: new Map(), cycleDetected: false };
  }

  const files = listSourceFiles(abs);
  const idSet = new Set(files.map((f) => path.relative(abs, f).replace(/\\/g, '/')));
  const edges = new Map<string, string[]>();

  for (const file of files) {
    const relId = path.relative(abs, file).replace(/\\/g, '/');
    const specs = extractImports(file);
    const resolved: string[] = [];
    for (const spec of specs) {
      const target = resolveImport(file, spec, abs);
      if (target && idSet.has(target)) {
        resolved.push(target);
      }
    }
    edges.set(relId, [...new Set(resolved)]);
  }

  const nodes = new Map<string, DependencyNode>();
  for (const id of idSet) {
    const imports = edges.get(id) ?? [];
    const importedBy: string[] = [];
    for (const [from, targets] of edges.entries()) {
      if (targets.includes(id)) {
        importedBy.push(from);
      }
    }
    const node: DependencyNode = { id, imports, importedBy, layer: 5 };
    node.layer = classifyLayerByDependencyDepth(node, { nodes, cycleDetected: false });
    nodes.set(id, node);
  }

  const cycleNodes = detectCycle([...idSet], edges);
  return {
    nodes,
    cycleDetected: Boolean(cycleNodes?.length),
    cycleNodes,
  };
}

/** 供 generateWorkflow 注入：现有代码 import 拓扑摘要（warning-only 之外的 prompt 块）。 */
export function formatDependencyGraphForPrompt(graph: DependencyGraph, maxNodes = 24): string {
  if (graph.nodes.size === 0) {
    return '';
  }
  const lines: string[] = ['【工作区 import 依赖图摘要（仅供参考）】'];
  if (graph.cycleDetected && graph.cycleNodes?.length) {
    lines.push(`- 检测到 import 环：${graph.cycleNodes.slice(0, DEP_GRAPH_TOP_NODES_MAX).join(' → ')}`);
  }
  const sorted = [...graph.nodes.values()]
    .sort((a, b) => a.layer - b.layer || a.id.localeCompare(b.id))
    .slice(0, maxNodes);
  for (const node of sorted) {
    const imp = node.imports.length
      ? node.imports.slice(0, DEP_GRAPH_IMPORTS_PREVIEW_MAX).join(', ')
      : '(无相对 import)';
    lines.push(`- L${node.layer} ${node.id} ← ${imp}`);
  }
  if (graph.nodes.size > maxNodes) {
    lines.push(`- … 另有 ${graph.nodes.size - maxNodes} 个模块未列出`);
  }
  return lines.join('\n');
}

/** Rule20 / generateWorkflow 用 warning-only 拓扑 hint（不阻断）。 */
export function dependencyGraphToWarningLines(graph: DependencyGraph): string[] {
  const warnings: string[] = [];
  if (graph.nodes.size === 0) {
    return warnings;
  }
  if (graph.cycleDetected && graph.cycleNodes?.length) {
    warnings.push(
      `dependency-graph:import-cycle:${graph.cycleNodes.slice(0, DEP_GRAPH_CYCLE_NODES_MAX).join(',')}`,
    );
  }
  const hubNodes = [...graph.nodes.values()]
    .filter((n) => n.importedBy.length >= 3)
    .slice(0, DEP_GRAPH_TOP_NODES_MAX)
    .map((n) => n.id);
  if (hubNodes.length > 0) {
    warnings.push(`dependency-graph:layer3-hub:${hubNodes.join(',')}`);
  }
  return warnings;
}

export function resolveSrcDirForWorkspace(workspaceRoot: string): string {
  const src = path.join(workspaceRoot, WORKSPACE_SRC_DIR);
  return fs.existsSync(src) && fs.statSync(src).isDirectory() ? src : workspaceRoot;
}

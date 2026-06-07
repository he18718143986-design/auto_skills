import {
  normalizeArtifactRelativePath,
  type WorkflowArtifactRegistry,
} from '../WorkflowArtifactRegistry';

export function resolveRelativeImportCandidates(importPath: string): string[] {
  const norm = importPath.replace(/\\/g, '/');
  const bases = [norm, `${norm}.ts`, `${norm}.tsx`, `${norm}.js`, `${norm}.jsx`];
  const withIndex = [`${norm}/index.ts`, `${norm}/index.tsx`, `${norm}/index.js`];
  return [...bases, ...withIndex].map(normalizeArtifactRelativePath);
}

/** M39.2 / M39.3：相对 import spec 是否被工作流 artifact registry 覆盖。 */
export function importPathCoveredByArtifacts(
  importPath: string,
  registry: WorkflowArtifactRegistry,
): boolean {
  if (!importPath.startsWith('.')) {
    return true;
  }
  const candidates = resolveRelativeImportCandidates(importPath);
  if (candidates.some((c) => registry.pathSet.has(c))) {
    return true;
  }
  const tail = importPath.replace(/^(\.\.\/)+/, '').replace(/^\.\//, '');
  for (const p of registry.pathSet) {
    if (
      p === tail ||
      p.endsWith(`/${tail}`) ||
      p.endsWith(`/${tail}.ts`) ||
      p.endsWith(`/${tail}.tsx`)
    ) {
      return true;
    }
  }
  return false;
}

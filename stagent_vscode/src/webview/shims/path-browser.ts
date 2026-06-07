/** 浏览器 webview bundle 用的极简 `path` 子集（替代 Node `path`，供 ArtifactUiHints 等模块 tree-shake 后仍可能引用的路径工具）。 */
export function basename(p: string): string {
  const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
  return i >= 0 ? p.slice(i + 1) : p;
}

export function normalize(p: string): string {
  return p.replace(/\\/g, '/').replace(/\/+/g, '/');
}

export function isAbsolute(p: string): boolean {
  return p.startsWith('/') || /^[A-Za-z]:[/\\]/.test(p);
}

export function join(...parts: string[]): string {
  return normalize(parts.filter(Boolean).join('/'));
}

#!/usr/bin/env node
/**
 * 消息类型清单提取（供 gen-message-schema / check-message-handlers 共用）。
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** 主 Webview 不处理、但协议/Guards 仍保留的类型 */
export const BACKEND_HANDLER_ALLOWLIST = new Set([]);

export function readUtf8(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

export function extractFrontendTypes() {
  const src = readUtf8('src/workflow/FrontendMessageTypes.ts');
  const types = [...src.matchAll(/export const FRONTEND_MSG_\w+ = '([^']+)'/g)].map((m) => m[1]);
  if (types.length === 0) {
    throw new Error('no FRONTEND_MSG_* constants in FrontendMessageTypes.ts');
  }
  return types.sort();
}

export function extractBackendTypesFromMessageTypes() {
  const src = readUtf8('src/workflow-types/MessageTypes.ts');
  const start = src.indexOf('type BackendMessageInner =');
  const end = src.indexOf('export type BackendMessage =');
  if (start < 0 || end < 0) {
    throw new Error('BackendMessageInner block not found in MessageTypes.ts');
  }
  const block = src.slice(start, end);
  const types = [...block.matchAll(/type: '([^']+)'/g)].map((m) => m[1]);
  return [...new Set(types)].sort();
}

/** 从 RuntimeTypes.ts 的 `*_VALUES` 常量数组读取 enum（供 schema 生成，避免 regex 解析 union）。 */
export function extractRuntimeTypeEnums() {
  const src = readUtf8('src/workflow-types/RuntimeTypes.ts');
  /** @type {Record<string, string[]>} */
  const enums = {};
  const arrayToType = {
    ERROR_TYPE: 'ErrorType',
    STAGE_STATUS: 'StageStatus',
    WORKFLOW_STATUS: 'WorkflowStatus',
  };
  for (const m of src.matchAll(/export const (\w+)_VALUES = \[([\s\S]*?)\] as const;/g)) {
    const typeName = arrayToType[m[1]];
    if (!typeName) {
      continue;
    }
    enums[typeName] = [...m[2].matchAll(/'([^']+)'/g)].map((x) => x[1]);
  }
  if (!enums.StageStatus?.length) {
    throw new Error('STAGE_STATUS_VALUES not found in RuntimeTypes.ts');
  }
  return enums;
}

function tsTypeToJsonSchema(rawType, runtimeEnums) {
  const t = rawType.trim().replace(/\s+/g, ' ');
  if (t === 'string') return { type: 'string' };
  if (t === 'number') return { type: 'number' };
  if (t === 'boolean') return { type: 'boolean' };
  if (runtimeEnums[t]) return { enum: [...runtimeEnums[t]] };
  const literalEnum = [...t.matchAll(/'([^']+)'/g)].map((x) => x[1]);
  if (literalEnum.length > 0 && t.includes('|')) {
    return { enum: literalEnum };
  }
  if (t.endsWith('[]')) {
    const inner = t.slice(0, -2);
    return { type: 'array', items: tsTypeToJsonSchema(inner, runtimeEnums) };
  }
  if (t.startsWith('Array<') && t.endsWith('>')) {
    const inner = t.slice(6, -1);
    return { type: 'array', items: tsTypeToJsonSchema(inner, runtimeEnums) };
  }
  if (t.startsWith('Record<')) {
    return { type: 'object', additionalProperties: true };
  }
  return { description: t };
}

const COMMON_BACKEND_FIELDS = {
  seq: { type: 'number', description: 'Monotonic backend message sequence assigned by WorkflowUiBridge' },
  uiEpoch: {
    type: 'number',
    description: 'UI resync generation; incremented by WorkflowUiBridge.beginUiResync',
  },
  instanceKey: {
    type: 'string',
    description: 'Workflow instance key; injected by WorkflowUiBridge for execution-scoped messages',
  },
  sessionId: { type: 'string', description: 'M44 session pointer (same value as instanceKey when bound)' },
};

/** 解析 BackendMessageInner 各 variant 的字段级 schema 草稿。 */
export function extractBackendMessageVariants() {
  const src = readUtf8('src/workflow-types/MessageTypes.ts');
  const start = src.indexOf('type BackendMessageInner =');
  const end = src.indexOf('export type BackendMessage =');
  if (start < 0 || end < 0) {
    throw new Error('BackendMessageInner block not found in MessageTypes.ts');
  }
  const block = src.slice(start, end);
  const runtimeEnums = extractRuntimeTypeEnums();
  /** @type {Array<{ type: string, required: string[], properties: Record<string, unknown> }>} */
  const variants = [];

  for (const raw of block.split(/\|\s*\{/).slice(1)) {
    const body = raw.replace(/\}\s*$/, '').trim();
    const typeMatch = body.match(/type:\s*'([^']+)'/);
    if (!typeMatch) continue;
    const msgType = typeMatch[1];
    /** @type {Record<string, unknown>} */
    const properties = { type: { const: msgType }, ...COMMON_BACKEND_FIELDS };
    /** @type {string[]} */
    const required = ['type'];
    for (const fm of body.matchAll(/^\s+(\w+)(\?)?:\s*([^;]+);/gm)) {
      const name = fm[1];
      if (name === 'type') continue;
      const optional = !!fm[2];
      properties[name] = tsTypeToJsonSchema(fm[3], runtimeEnums);
      if (!optional) {
        required.push(name);
      }
    }
    variants.push({ type: msgType, required, properties });
  }

  return variants.sort((a, b) => a.type.localeCompare(b.type));
}

export function extractGuardBackendTypes() {
  const generated = path.join(ROOT, 'src/generated/backendMessageTypes.ts');
  if (fs.existsSync(generated)) {
    const src = fs.readFileSync(generated, 'utf8');
    const m = src.match(/BACKEND_MESSAGE_TYPES = \[([\s\S]*?)\] as const/);
    if (m) {
      return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]).sort();
    }
  }
  const src = readUtf8('src/WebviewMessageGuards.ts');
  const m = src.match(/BACKEND_MESSAGE_TYPES(?:_SET)?[^[]*\[([\s\S]*?)\]/);
  if (!m) {
    throw new Error('BACKEND_MESSAGE_TYPES not found in generated file or WebviewMessageGuards.ts');
  }
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]).sort();
}

/** 从 `export const fooHandlers` 对象字面量提取一级 key */
export function extractHandlerMapKeys(tsSource) {
  const keys = new Set();
  for (const m of tsSource.matchAll(
    /^\s+([a-zA-Z][a-zA-Z0-9_]*):\s*(?:\(|async\s*\(|async\s+function|handle[A-Z])/gm,
  )) {
    keys.add(m[1]);
  }
  return keys;
}

export function extractPanelHandlerKeys() {
  const files = [
    'src/panel-handlers/workspace.ts',
    'src/panel-handlers/generation.ts',
    'src/panel-handlers/execution-hitl.ts',
    'src/panel-handlers/execution-upstream-fix.ts',
    'src/panel-handlers/artifacts.ts',
  ];
  const keys = new Set();
  for (const f of files) {
    for (const k of extractHandlerMapKeys(readUtf8(f))) {
      keys.add(k);
    }
  }
  return [...keys].sort();
}

export function extractWebviewBackendHandlerKeys() {
  const dir = path.join(ROOT, 'src/webview/runtime/backend-handlers');
  const keys = new Set();
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.ts') || name === 'types.ts' || name === 'registry.ts') {
      continue;
    }
    for (const k of extractHandlerMapKeys(fs.readFileSync(path.join(dir, name), 'utf8'))) {
      keys.add(k);
    }
  }
  return [...keys].sort();
}

export function diffSets(label, expected, actual) {
  const exp = new Set(expected);
  const act = new Set(actual);
  const missing = [...exp].filter((x) => !act.has(x));
  const orphan = [...act].filter((x) => !exp.has(x));
  if (missing.length === 0 && orphan.length === 0) {
    return null;
  }
  return { label, missing, orphan };
}

#!/usr/bin/env node
/**
 * 校验 MessageTypes 的 backend 类型均被 WebviewMessageGuards 注册。
 */
import {
  extractBackendTypesFromMessageTypes,
  extractGuardBackendTypes,
} from './message-type-registry.mjs';

const backendTypes = extractBackendTypesFromMessageTypes();
const guardSet = new Set(extractGuardBackendTypes());

let failed = false;
for (const t of backendTypes) {
  if (!guardSet.has(t)) {
    console.error(`[check-message-schema] missing in WebviewMessageGuards: ${t}`);
    failed = true;
  }
}

const backendSet = new Set(backendTypes);
for (const t of guardSet) {
  if (!backendSet.has(t)) {
    console.error(`[check-message-schema] orphan in WebviewMessageGuards (not in MessageTypes): ${t}`);
    failed = true;
  }
}

if (failed) {
  process.exit(1);
}
console.log(`[check-message-schema] ${backendTypes.length} backend types OK`);

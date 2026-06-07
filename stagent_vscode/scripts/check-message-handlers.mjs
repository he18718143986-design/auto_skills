#!/usr/bin/env node
/**
 * 校验 Frontend/Backend 消息类型与 panel-handlers / webview backend-handlers 穷举一致。
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BACKEND_HANDLER_ALLOWLIST,
  diffSets,
  extractBackendTypesFromMessageTypes,
  extractFrontendTypes,
  extractGuardBackendTypes,
  extractPanelHandlerKeys,
  extractWebviewBackendHandlerKeys,
} from './message-type-registry.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let failed = false;

function fail(msg) {
  console.error(`[check-message-handlers] ${msg}`);
  failed = true;
}

function reportDiff(kind, d) {
  if (!d) {
    return;
  }
  fail(`${kind} ${d.label}`);
  if (d.missing.length) {
    console.error(`  missing: ${d.missing.join(', ')}`);
  }
  if (d.orphan.length) {
    console.error(`  orphan: ${d.orphan.join(', ')}`);
  }
}

const frontendTypes = extractFrontendTypes();
const panelKeys = extractPanelHandlerKeys();
const backendTypes = extractBackendTypesFromMessageTypes();
const webviewKeys = extractWebviewBackendHandlerKeys();
const guardTypes = extractGuardBackendTypes();

reportDiff('missing_handler', diffSets('frontend ↔ panel-handlers', frontendTypes, panelKeys));
reportDiff('orphan_handler', diffSets('panel-handlers ↔ frontend', frontendTypes, panelKeys));

const backendNeedHandler = backendTypes.filter((t) => !BACKEND_HANDLER_ALLOWLIST.has(t));
reportDiff(
  'missing_handler',
  diffSets('backend ↔ webview-handlers', backendNeedHandler, webviewKeys),
);
reportDiff(
  'orphan_handler',
  diffSets('webview-handlers ↔ backend', backendNeedHandler, webviewKeys),
);

const guardDiff = diffSets('MessageTypes ↔ WebviewMessageGuards', backendTypes, guardTypes);
if (guardDiff) {
  fail('schema_drift MessageTypes vs WebviewMessageGuards');
  if (guardDiff.missing.length) {
    console.error(`  in MessageTypes but not Guards: ${guardDiff.missing.join(', ')}`);
  }
  if (guardDiff.orphan.length) {
    console.error(`  in Guards but not MessageTypes: ${guardDiff.orphan.join(', ')}`);
  }
}

const schemaPath = path.join(ROOT, 'schemas/messages.schema.json');
if (!fs.existsSync(schemaPath)) {
  fail('missing schemas/messages.schema.json — run gen:message-schema first');
} else {
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  const schemaFrontend = schema.definitions?.frontendMessage?.properties?.type?.enum ?? [];
  const schemaBackendFromEnum = schema.definitions?.backendMessage?.properties?.type?.enum ?? [];
  const schemaBackendFromOneOf = (schema.definitions?.backendMessage?.oneOf ?? [])
    .map((v) => v?.properties?.type?.const)
    .filter(Boolean);
  const schemaBackend =
    schemaBackendFromOneOf.length > 0 ? schemaBackendFromOneOf.sort() : schemaBackendFromEnum;
  const feDrift = diffSets('schema frontend', frontendTypes, schemaFrontend);
  const beDrift = diffSets('schema backend', backendTypes, schemaBackend);
  if (feDrift || beDrift) {
    fail('schema_drift messages.schema.json is stale — run gen:message-schema');
    if (feDrift?.missing.length) {
      console.error(`  schema missing frontend: ${feDrift.missing.join(', ')}`);
    }
    if (beDrift?.missing.length) {
      console.error(`  schema missing backend: ${beDrift.missing.join(', ')}`);
    }
  }
}

if (failed) {
  process.exit(1);
}

console.log(
  `[check-message-handlers] OK (${frontendTypes.length} frontend, ${backendTypes.length} backend, ${BACKEND_HANDLER_ALLOWLIST.size} allowlisted)`,
);

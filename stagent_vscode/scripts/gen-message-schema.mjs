#!/usr/bin/env node
/**
 * 从 FrontendMessageTypes + MessageTypes 生成 JSON Schema 草稿与 Guards 类型清单。
 * 输出：
 * - schemas/messages.schema.json
 * - src/generated/backendMessageTypes.ts
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  extractBackendMessageVariants,
  extractBackendTypesFromMessageTypes,
  extractFrontendTypes,
} from './message-type-registry.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(ROOT, 'schemas');
const outFile = path.join(outDir, 'messages.schema.json');
const generatedDir = path.join(ROOT, 'src/generated');
const generatedTypesFile = path.join(generatedDir, 'backendMessageTypes.ts');

const frontendTypes = extractFrontendTypes();
const backendTypes = extractBackendTypesFromMessageTypes();
const backendVariants = extractBackendMessageVariants();

const backendVariantSchemas = backendVariants.map((v) => ({
  type: 'object',
  required: v.required,
  properties: v.properties,
  additionalProperties: true,
}));

const schema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'StagentWebviewMessages',
  description: 'Generated from FrontendMessageTypes.ts and workflow-types/MessageTypes.ts',
  definitions: {
    backendMessageCommon: {
      type: 'object',
      properties: {
        seq: { type: 'number' },
        instanceKey: { type: 'string' },
        sessionId: { type: 'string' },
      },
    },
    backendMessageVariant: {
      oneOf: backendVariantSchemas,
    },
    backendMessage: {
      oneOf: backendVariantSchemas,
    },
    frontendMessage: {
      type: 'object',
      required: ['type'],
      properties: {
        type: { enum: frontendTypes },
      },
      additionalProperties: true,
    },
  },
  oneOf: [{ $ref: '#/definitions/backendMessage' }, { $ref: '#/definitions/frontendMessage' }],
};

const generatedTs = `/** AUTO-GENERATED — do not edit. Run: npm run gen:message-schema */
export const BACKEND_MESSAGE_TYPES = [
${backendTypes.map((t) => `  '${t}',`).join('\n')}
] as const;

export type GeneratedBackendMessageType = (typeof BACKEND_MESSAGE_TYPES)[number];
`;

fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(generatedDir, { recursive: true });
fs.writeFileSync(outFile, `${JSON.stringify(schema, null, 2)}\n`, 'utf8');
fs.writeFileSync(generatedTypesFile, generatedTs, 'utf8');
console.log(
  `[gen-message-schema] wrote ${outFile} (${frontendTypes.length} frontend, ${backendTypes.length} backend variants)`,
);
console.log(`[gen-message-schema] wrote ${generatedTypesFile}`);

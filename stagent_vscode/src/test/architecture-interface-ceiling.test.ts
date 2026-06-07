import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import ts from 'typescript';

const ROOT = path.resolve(__dirname, '..', '..');
const MAX_MEMBERS = 25;

interface InterfaceSpec {
  file: string;
  name: string;
}

const CONSUMED_INTERFACES: InterfaceSpec[] = [
  { file: 'src/execution-bindings/executor-loop-types.ts', name: 'ExecutionInstanceSlice' },
  { file: 'src/execution-bindings/executor-loop-types.ts', name: 'ExecutionMessagingSlice' },
  { file: 'src/execution-bindings/executor-loop-types.ts', name: 'ExecutionLlmSlice' },
  { file: 'src/execution-bindings/executor-loop-types.ts', name: 'ExecutionPathSlice' },
  { file: 'src/execution-bindings/executor-loop-types.ts', name: 'ExecutionControlSlice' },
  { file: 'src/execution-bindings/executor-loop-types.ts', name: 'ExecutionQualitySlice' },
  { file: 'src/engine-host/MessagingHostDeps.ts', name: 'MessagingHostDeps' },
  { file: 'src/engine-host/PersistenceHostDeps.ts', name: 'PersistenceHostDeps' },
  { file: 'src/engine-host/GenerationHostDeps.ts', name: 'GenerationHostDeps' },
  { file: 'src/engine-host/ExecutionHostDeps.ts', name: 'ExecutionHostDeps' },
];

function countInterfaceMembers(filePath: string, interfaceName: string): number {
  const abs = path.join(ROOT, filePath);
  const sourceText = fs.readFileSync(abs, 'utf8');
  const source = ts.createSourceFile(abs, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let count = -1;

  const visit = (node: ts.Node): void => {
    if (ts.isInterfaceDeclaration(node) && node.name.text === interfaceName) {
      count = node.members.length;
    }
    ts.forEachChild(node, visit);
  };
  visit(source);

  assert.notEqual(count, -1, `interface ${interfaceName} not found in ${filePath}`);
  return count;
}

for (const spec of CONSUMED_INTERFACES) {
  test(`${spec.name} has at most ${MAX_MEMBERS} members`, () => {
    const members = countInterfaceMembers(spec.file, spec.name);
    assert.ok(
      members <= MAX_MEMBERS,
      `${spec.name} has ${members} members (limit ${MAX_MEMBERS}) in ${spec.file}`,
    );
  });
}

import assert from 'node:assert/strict';
import test from 'node:test';
import { lintPypiForbiddenImports, stripForbiddenPypiImports } from '../PypiSymbolHints';

test('lintPypiForbiddenImports flags MdApi', () => {
  const src = 'from ctpbee import MdApi, create_md_api\n';
  const issues = lintPypiForbiddenImports(src);
  assert.equal(issues.length, 2);
  assert.equal(issues[0]!.symbol, 'MdApi');
});

test('stripForbiddenPypiImports removes forbidden names', () => {
  const src = 'from ctpbee import MdApi, CtpBee\n';
  const { content, stripped } = stripForbiddenPypiImports(src);
  assert.equal(stripped.length, 1);
  assert.match(content, /CtpBee/);
  assert.doesNotMatch(content, /MdApi/);
});

import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { isRequirementClearEnough } from '../pregen/RequirementClarity';

test('isRequirementClearEnough rejects short vague drafts', () => {
  assert.equal(isRequirementClearEnough('做一个 todo MVP'), false);
  assert.equal(isRequirementClearEnough('帮忙写个脚本'), false);
});

test('isRequirementClearEnough accepts structured delivery requirements', () => {
  assert.equal(
    isRequirementClearEnough('空目录 Python 单文件 greet 函数，pytest 单切片验收，目标是最小可运行交付'),
    true,
  );
  assert.equal(
    isRequirementClearEnough('重构 auth 模块：目标是把 JWT 校验抽到 middleware，验收为现有测试全绿'),
    true,
  );
});

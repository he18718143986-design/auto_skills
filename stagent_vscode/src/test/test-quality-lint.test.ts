import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { lintTestQuality, testQualityIssuesToWarnings } from '../TestQualityLint';

test('无断言的测试函数 → test-no-assertion', () => {
  const code = `def test_runs():
    result = process(data)
    print(result)
`;
  const issues = lintTestQuality(code);
  assert.ok(issues.some((i) => i.type === 'test-no-assertion'));
});

test('恒真断言 → test-tautological-assertion', () => {
  const code = `def test_ok():
    assert True
`;
  const issues = lintTestQuality(code);
  assert.ok(issues.some((i) => i.type === 'test-tautological-assertion'));
});

test('仅断言对象存在 → test-tests-implementation', () => {
  const code = `import mymod

def test_imports():
    assert mymod is not None
`;
  const issues = lintTestQuality(code);
  assert.ok(issues.some((i) => i.type === 'test-tests-implementation'));
});

test('断言私有实现细节 → test-tests-implementation', () => {
  const code = `def test_internal():
    obj = Service()
    assert obj._cache == {}
    assert obj.public_result() == 42
`;
  const issues = lintTestQuality(code);
  assert.ok(issues.some((i) => i.type === 'test-tests-implementation'));
});

test('测真实行为的健康测试 → 无坏味', () => {
  const code = `def test_diff_marks_price_increase():
    out = run_diff(old=10, new=12)
    assert out.status == "success"
    assert out.alert == "价格上涨"
`;
  const issues = lintTestQuality(code);
  assert.deepEqual(issues, []);
});

test('非测试代码不误报无断言', () => {
  const code = `def helper(x):
    return x + 1
`;
  assert.deepEqual(lintTestQuality(code), []);
});

test('testQualityIssuesToWarnings 生成 contract:test-* 行', () => {
  const issues = lintTestQuality('def test_x():\n    assert True\n');
  const warnings = testQualityIssuesToWarnings('test_x.py', issues);
  assert.ok(warnings.every((w) => w.startsWith('contract:test-')));
});

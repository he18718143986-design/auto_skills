/**
 * M26：测试质量 lint（借鉴 skills `tdd/tests.md`：测行为而非结构/实现）。
 *
 * 检测「假绿」测试坏味：无断言、恒真断言、只断言导入成功/对象存在、断言私有实现细节。
 * 这类测试即使全过也没验证真实行为，是空心成功的温床。
 *
 * 纯函数，warning-only（`contract:test-*` 前缀，与既有契约告警同通道显示）。
 */

import { contractWarningMsg } from './l10n/lintMsg';
import { pushTypedDetailIssue } from './lint/CodedLintIssue';
import { formatContractWarningAt } from './lint/ContractWarningFormat';

export type TestQualityWarningType =
  | 'test-no-assertion'
  | 'test-tautological-assertion'
  | 'test-tests-implementation';

export interface TestQualityIssue {
  type: TestQualityWarningType;
  detail: string;
}

const ASSERT_LINE = /\b(assert\b|assertEqual|assertTrue|assertIsNotNone|assertIs|expect\()/;

// 恒真：assert True / assert 1 == 1 / assertTrue(True) / assert "x" / expect(true)
const TAUTOLOGY =
  /\bassert\s+(True|true|1\s*==\s*1|['"][^'"]*['"])\s*(?:,|$)|assertTrue\(\s*True\s*\)|expect\(\s*true\s*\)\.toBe\(\s*true\s*\)/;

// 只验证「导入成功 / 对象存在」：assert module is not None / assert x is not None（无其他行为断言）
const EXISTENCE_ONLY = /\bassert\s+\w+\s+is\s+not\s+None\s*(?:,|$)|assertIsNotNone\(/;

// 断言私有实现细节：assert obj._private ... / patch 内部 _helper
const IMPLEMENTATION_DETAIL = /\bassert\s+[\w.]*\._[A-Za-z]/;

function hasAnyAssertion(code: string): boolean {
  return code.split(/\r?\n/).some((l) => ASSERT_LINE.test(l));
}

function looksLikeTest(code: string): boolean {
  return /\bdef\s+test_|\bclass\s+Test|\bit\(|\btest\(|unittest|pytest/.test(code);
}

/** 对单段测试代码做质量 lint。 */
export function lintTestQuality(testCode: string): TestQualityIssue[] {
  const issues: TestQualityIssue[] = [];
  const code = testCode ?? '';
  if (!code.trim()) {
    return issues;
  }

  if (looksLikeTest(code) && !hasAnyAssertion(code)) {
    pushTypedDetailIssue(issues, 'test-no-assertion', contractWarningMsg('testNoAssertion'));
  }

  if (TAUTOLOGY.test(code)) {
    pushTypedDetailIssue(issues, 'test-tautological-assertion', contractWarningMsg('testTautologicalAssertion'));
  }

  // 只断言「存在/导入成功」且没有任何其它实质断言 → 仅冒烟，不算测行为
  const assertionLines = code.split(/\r?\n/).filter((l) => ASSERT_LINE.test(l));
  const existenceOnly =
    assertionLines.length > 0 && assertionLines.every((l) => EXISTENCE_ONLY.test(l));
  if (existenceOnly) {
    pushTypedDetailIssue(issues, 'test-tests-implementation', contractWarningMsg('testTestsImplementation'));
  } else if (IMPLEMENTATION_DETAIL.test(code)) {
    pushTypedDetailIssue(issues, 'test-tests-implementation', contractWarningMsg('testTestsImplementation'));
  }

  return issues;
}

export function testQualityIssuesToWarnings(filePath: string, issues: TestQualityIssue[]): string[] {
  return issues.map((i) => formatContractWarningAt(i.type, filePath, i.detail));
}

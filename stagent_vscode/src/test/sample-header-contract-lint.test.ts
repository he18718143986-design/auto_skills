import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  extractExcelHeaderRow,
  extractRecognizedColumnKeys,
  isHeaderNearMiss,
  lintSampleReaderHeaderContract,
} from '../SampleHeaderContractLint';
import type { ProjectFile } from '../CrossFileKeyContractLint';

// 复刻真实失败：create_sample 写 ["ASIN","TK SKU","目标价","库存"]，reader 只认 TK_SKU/目标价格
const CREATE_SAMPLE = `import openpyxl
from openpyxl import Workbook
def main():
    wb = Workbook(); ws = wb.active
    headers = ["ASIN", "TK SKU", "目标价", "库存"]
    ws.append(headers)
    data = [["B0EX1","TK-001",19.99,100]]
    for row in data: ws.append(row)
    wb.save("input/asin_list.xlsx")
`;

const READER = `COLUMN_MAPPING = {
    'ASIN': 'asin',
    'TK_SKU': 'tk_sku',
    'Tk Sku': 'tk_sku',
    'SKU': 'tk_sku',
    '目标价格': 'target_price',
    'Target Price': 'target_price',
    '库存': 'stock',
}
REQUIRED_KEYS = ['asin', 'tk_sku', 'target_price', 'stock']
`;

test('extractExcelHeaderRow 抽取中文/带空格表头', () => {
  assert.deepEqual(extractExcelHeaderRow(CREATE_SAMPLE), ['ASIN', 'TK SKU', '目标价', '库存']);
});

test('extractRecognizedColumnKeys 抽取含空格/中文的 dict 键', () => {
  const keys = extractRecognizedColumnKeys(READER);
  assert.ok(keys.has('TK_SKU'));
  assert.ok(keys.has('Tk Sku'));
  assert.ok(keys.has('目标价格'));
  assert.ok(!keys.has('TK SKU'));
  assert.ok(!keys.has('目标价'));
});

test('isHeaderNearMiss：TK SKU↔TK_SKU（空格/下划线归一相等）、目标价↔目标价格（子串）', () => {
  assert.equal(isHeaderNearMiss('TK SKU', 'TK_SKU'), true);
  assert.equal(isHeaderNearMiss('目标价', '目标价格'), true);
  assert.equal(isHeaderNearMiss('ASIN', 'ASIN'), false, '精确相等不算 miss');
  assert.equal(isHeaderNearMiss('库存', 'asin'), false, '无关不算 miss');
});

test('lintSampleReaderHeaderContract 命中两处漂移（TK SKU / 目标价）', () => {
  const files: ProjectFile[] = [
    { path: 'create_sample.py', content: CREATE_SAMPLE },
    { path: 'reader.py', content: READER },
  ];
  const w = lintSampleReaderHeaderContract(files);
  assert.equal(w.length, 2);
  assert.ok(w.some((x) => /'TK SKU'/.test(x) && /sample-header-unmapped/.test(x)));
  assert.ok(w.some((x) => /'目标价'/.test(x)));
});

test('reader 映射完整（含 TK SKU/目标价）→ 无告警', () => {
  const readerFixed = READER.replace("'TK_SKU': 'tk_sku',", "'TK_SKU': 'tk_sku',\n    'TK SKU': 'tk_sku',").replace(
    "'目标价格': 'target_price',",
    "'目标价格': 'target_price',\n    '目标价': 'target_price',",
  );
  const files: ProjectFile[] = [
    { path: 'create_sample.py', content: CREATE_SAMPLE },
    { path: 'reader.py', content: readerFixed },
  ];
  assert.deepEqual(lintSampleReaderHeaderContract(files), []);
});

test('缺 create_sample 或 reader → 不适用（空）', () => {
  assert.deepEqual(lintSampleReaderHeaderContract([{ path: 'reader.py', content: READER }]), []);
});

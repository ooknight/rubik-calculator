import Decimal from 'decimal.js';
import {
  Cell,
  ComputeOutput,
  Group,
  GroupResult,
  Operator,
  RowResult,
} from './types';

Decimal.set({ precision: 30, rounding: Decimal.ROUND_HALF_UP });

/** 把字符串解析为 Cell；空串 -> empty，非数字 -> error */
function parseOperand(raw: string): Cell {
  if (raw.trim() === '') return { kind: 'empty' };
  let d: Decimal;
  try {
    d = new Decimal(raw.trim());
  } catch {
    // 字母、非法字符等无法解析为数字，标记为错误而非抛出
    return { kind: 'error', message: '非数字' };
  }
  if (!d.isFinite()) return { kind: 'error', message: '非数字' };
  return { kind: 'number', value: d.toString() };
}

function applyOp(a: Decimal, b: Decimal, op: Operator): Decimal {
  switch (op) {
    case '+':
      return a.plus(b);
    case '-':
      return a.minus(b);
    case '*':
      return a.times(b);
    case '/':
      if (b.isZero()) throw new Error('除零');
      return a.div(b);
  }
}

/**
 * 计算单行。支持链式下游跳过：
 * 一旦某组结果为空或错误，其后所有组 skipped=true，result=empty。
 * 注意：链式 param1 的派生（前组结果填充）由 store 层完成，
 * 引擎接收的 group.param1 已是最终值。
 */
function computeRow(groups: Group[]): RowResult {
  const results: GroupResult[] = [];
  let blocked = false; // 上游是否已出现空/错误，导致后续跳过
  let lastValid: Cell = { kind: 'empty' };

  for (let gi = 0; gi < groups.length; gi++) {
    const g = groups[gi];
    const p1 = parseOperand(g.param1);

    // 第 0 组为裸项：结果直接等于参数1，不参与运算
    if (g.isItem) {
      if (p1.kind !== 'number') {
        const message = p1.kind === 'error' ? p1.message : '缺操作数';
        results.push({
          param1: p1,
          param2: { kind: 'empty' },
          result: { kind: 'error', message },
          skipped: false,
        });
        blocked = true;
        continue;
      }
      results.push({ param1: p1, param2: { kind: 'empty' }, result: p1, skipped: false });
      lastValid = p1;
      continue;
    }

    const p2 = parseOperand(g.param2);

    if (blocked) {
      results.push({ param1: p1, param2: p2, result: { kind: 'empty' }, skipped: true });
      continue;
    }

    if (p1.kind !== 'number' || p2.kind !== 'number') {
      // 空或非数字 -> 本组无有效结果，并阻断下游
      const message =
        p1.kind === 'error' ? p1.message : p2.kind === 'error' ? p2.message : '缺操作数';
      results.push({ param1: p1, param2: p2, result: { kind: 'error', message }, skipped: false });
      blocked = true;
      continue;
    }

    try {
      const out = applyOp(new Decimal(p1.value), new Decimal(p2.value), g.operator);
      if (!out.isFinite()) {
        results.push({
          param1: p1,
          param2: p2,
          result: { kind: 'error', message: '结果溢出' },
          skipped: false,
        });
        blocked = true;
        continue;
      }
      const result: Cell = { kind: 'number', value: out.toString() };
      results.push({ param1: p1, param2: p2, result, skipped: false });
      lastValid = result;
    } catch (e) {
      const message = e instanceof Error ? e.message : '错误';
      results.push({ param1: p1, param2: p2, result: { kind: 'error', message }, skipped: false });
      blocked = true;
    }
  }

  return { groups: results, rowResult: lastValid };
}

function cellToDecimal(c: Cell): Decimal | null {
  return c.kind === 'number' ? new Decimal(c.value) : null;
}

function decimalToCell(d: Decimal | null): Cell {
  if (d === null) return { kind: 'empty' };
  return { kind: 'number', value: d.toString() };
}

/**
 * 计算整个网格。传入的 rows 中每个 group.param1 已是最终值
 * （链式组的 param1 由 store 填充为前组结果）。
 */
export function computeGrid(rows: Group[][]): ComputeOutput {
  const rowResults = rows.map(computeRow);
  const groupCount = rows.length > 0 ? rows[0].length : 0;

  // 列合计：按组 g 聚合所有行的同组结果，无效单元格跳过
  const columnTotals: Cell[] = [];
  // 操作数合计：按组 g 聚合参数1 / 参数2 列，无效单元格跳过
  const param1Totals: Cell[] = [];
  const param2Totals: Cell[] = [];

  for (let g = 0; g < groupCount; g++) {
    let resAcc: Decimal | null = null;
    let p1Acc: Decimal | null = null;
    let p2Acc: Decimal | null = null;
    for (const rr of rowResults) {
      const gr = rr.groups[g];
      if (!gr || gr.skipped) continue;
      const rd = cellToDecimal(gr.result);
      if (rd !== null) resAcc = resAcc === null ? rd : resAcc.plus(rd);
      const p1d = cellToDecimal(gr.param1);
      if (p1d !== null) p1Acc = p1Acc === null ? p1d : p1Acc.plus(p1d);
      const p2d = cellToDecimal(gr.param2);
      if (p2d !== null) p2Acc = p2Acc === null ? p2d : p2Acc.plus(p2d);
    }
    columnTotals.push(decimalToCell(resAcc));
    param1Totals.push(decimalToCell(p1Acc));
    param2Totals.push(decimalToCell(p2Acc));
  }

  return { rows: rowResults, columnTotals, param1Totals, param2Totals };
}

export { parseOperand, applyOp };

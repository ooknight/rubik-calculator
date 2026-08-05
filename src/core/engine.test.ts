import { describe, it, expect } from 'vitest';
import { computeGrid, parseOperand } from './engine';
import { Group, Operator } from './types';

// isItem=false 表示运算项（与前值运算）；true 表示裸项（结果=param1）
function G(param1: string, op: Operator, param2: string, isItem = false): Group {
  return { param1, operator: op, param2, isItem };
}

describe('精度：decimal.js 避免浮点误差', () => {
  it('0.1 + 0.2 === 0.3 而非 0.30000000000000004', () => {
    const out = computeGrid([[G('0.1', '+', '0.2')]]);
    const r = out.rows[0].groups[0].result;
    expect(r).toEqual({ kind: 'number', value: '0.3' });
  });

  it('0.3 - 0.1 === 0.2', () => {
    const out = computeGrid([[G('0.3', '-', '0.1')]]);
    expect(out.rows[0].groups[0].result).toEqual({ kind: 'number', value: '0.2' });
  });
});

describe('解析：空与非数字', () => {
  it('空串 -> empty', () => {
    expect(parseOperand('')).toEqual({ kind: 'empty' });
  });
  it('非数字 -> error', () => {
    expect(parseOperand('abc').kind).toBe('error');
  });
});

describe('裸项（第 0 组 isItem=true）：结果直接等于参数1，不参与运算', () => {
  it('裸项结果 = param1', () => {
    const out = computeGrid([[G('123', '+', '999', true)]]);
    expect(out.rows[0].groups[0].result).toEqual({ kind: 'number', value: '123' });
  });
  it('裸项缺操作数 -> error 并阻断下游', () => {
    const out = computeGrid([[G('', '+', '', true), G('5', '*', '2', false)]]);
    expect(out.rows[0].groups[0].result.kind).toBe('error');
    expect(out.rows[0].groups[1].skipped).toBe(true);
  });
});

describe('除零与错误', () => {
  it('除零 -> error', () => {
    const out = computeGrid([[G('10', '/', '0')]]);
    expect(out.rows[0].groups[0].result.kind).toBe('error');
  });
});

describe('链式下游跳过', () => {
  it('上游错误 -> 下游全部 skipped 且结果为空', () => {
    // 组0 除零错误，组1、组2 应被跳过
    const out = computeGrid([
      [G('1', '/', '0'), G('1', '+', '2'), G('3', '*', '4')],
    ]);
    const groups = out.rows[0].groups;
    expect(groups[0].result.kind).toBe('error');
    expect(groups[1].skipped).toBe(true);
    expect(groups[1].result).toEqual({ kind: 'empty' });
    expect(groups[2].skipped).toBe(true);
  });

  it('上游空 -> 下游跳过', () => {
    const out = computeGrid([[G('', '+', '1'), G('5', '*', '2')]]);
    expect(out.rows[0].groups[0].result.kind).toBe('error'); // 缺操作数
    expect(out.rows[0].groups[1].skipped).toBe(true);
  });
});

describe('行结果取链式最终值', () => {
  it('多组有效时取最后一组结果', () => {
    // 10+5=15 -> 15*2=30，行结果应为 30（非 15+30=45）
    const out = computeGrid([[G('10', '+', '5'), G('15', '*', '2')]]);
    expect(out.rows[0].rowResult).toEqual({ kind: 'number', value: '30' });
  });

  it('全空行 -> 行结果为空', () => {
    const out = computeGrid([[G('', '+', ''), G('', '*', '')]]);
    expect(out.rows[0].rowResult).toEqual({ kind: 'empty' });
  });
});

describe('列合计（行间独立相加，跳过无效）', () => {
  it('同组各有效结果相加', () => {
    const out = computeGrid([
      [G('10', '+', '5')], // 15
      [G('20', '+', '5')], // 25
      [G('1', '/', '0')], // error -> 跳过
    ]);
    expect(out.columnTotals[0]).toEqual({ kind: 'number', value: '40' }); // 15+25
  });
});

describe('操作数合计（参数1 / 参数2 列）', () => {
  it('分别聚合每组的参数1与参数2，跳过无效', () => {
    const out = computeGrid([
      [G('10', '+', '5')], // p1=10, p2=5
      [G('20', '+', '5')], // p1=20, p2=5
      [G('1', '/', '0')], // p1=1(error值仍参与p1合计? 见下方说明), p2=0
    ]);
    // 参数1 合计：10 + 20 + 1 = 31（错误组的参数1 是数值 1，仍参与操作数合计）
    expect(out.param1Totals[0]).toEqual({ kind: 'number', value: '31' });
    // 参数2 合计：5 + 5 + 0 = 10
    expect(out.param2Totals[0]).toEqual({ kind: 'number', value: '10' });
  });

  it('链式组的参数1（派生值）也参与操作数合计', () => {
    // 行内链式：组0 10+5=15，组1 参数1=15(派生) * 2 = 30
    const out = computeGrid([[G('10', '+', '5'), G('15', '*', '2')]]);
    // 参数1 合计 = 10(组0手写) + 15(组1派生) = 25
    expect(out.param1Totals[0]).toEqual({ kind: 'number', value: '10' });
    expect(out.param1Totals[1]).toEqual({ kind: 'number', value: '15' });
  });
});

import Decimal from 'decimal.js';
import { Cell, Group, Operator } from '../core/types';
import { StoredRow } from './store';
import { parseOperand } from '../core/engine';

Decimal.set({ precision: 30, rounding: Decimal.ROUND_HALF_UP });

/** 计算单组结果（用于链式回填 param1） */
export function evalSingle(p1: string, op: Operator, p2: string): Cell {
  if (p1.trim() === '' || p2.trim() === '') return { kind: 'empty' };
  try {
    const a = new Decimal(p1.trim());
    const b = new Decimal(p2.trim());
    let r: Decimal;
    switch (op) {
      case '+':
        r = a.plus(b);
        break;
      case '-':
        r = a.minus(b);
        break;
      case '*':
        r = a.times(b);
        break;
      case '/':
        if (b.isZero()) return { kind: 'error', message: '除零' };
        r = a.div(b);
        break;
    }
    return r.isFinite() ? { kind: 'number', value: r.toString() } : { kind: 'error', message: '溢出' };
  } catch {
    return { kind: 'error', message: '非数字' };
  }
}

/** 链式派生：第 0 组为裸项（结果=param1）；第 g>0 组 param1 = 第 g-1 组结果，与其 operator/param2 运算 */
export function deriveForCompute(rows: StoredRow[]): Group[][] {
  return rows.map((r) => {
    const out: Group[] = [];
    let prev: Cell = { kind: 'empty' };
    for (let gi = 0; gi < r.groups.length; gi++) {
      const sg = r.groups[gi];
      if (gi === 0) {
        // 裸项：结果直接等于 param1，无运算；prev 记为裸项结果供后续组链式使用
        const param1 = sg.param1 ?? '';
        out.push({ param1, operator: '+', param2: '', isItem: true });
        prev = parseOperand(param1);
      } else {
        const param1 = prev.kind === 'number' ? prev.value : '';
        out.push({ param1, operator: sg.operator, param2: sg.param2, isItem: false });
        prev = evalSingle(param1, sg.operator, sg.param2);
      }
    }
    return out;
  });
}

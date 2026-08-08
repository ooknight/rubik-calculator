import Decimal from 'decimal.js';
import { Cell, Group, Operator } from '../core/types';
import { StoredRow, ConstDef, constByKey } from './store';
import { applyOp, parseOperand } from '../core/engine';

/** 计算单组结果（用于链式回填 param1），复用引擎的 applyOp 保证运算规则一致 */
export function evalSingle(p1: string, op: Operator, p2: string): Cell {
  const a = parseOperand(p1);
  const b = parseOperand(p2);
  if (a.kind !== 'number' || b.kind !== 'number') return { kind: 'empty' };
  try {
    const r = applyOp(new Decimal(a.value), new Decimal(b.value), op);
    return r.isFinite() ? { kind: 'number', value: r.toString() } : { kind: 'error', message: '溢出' };
  } catch {
    return { kind: 'error', message: '非数字' };
  }
}

/** 链式派生：第 0 组为裸项（结果=param1）；第 g>0 组 param1 = 第 g-1 组结果，与其 operator/param2 运算 */
export function deriveForCompute(rows: StoredRow[], constants: ConstDef[]): Group[][] {
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
        let param2 = sg.param2;
        if (sg.isConst && sg.constKey) {
          const c = constByKey(constants, sg.constKey);
          if (c) {
            // 常量列：param2 固定为常量值，不读用户输入
            param2 = String(c.value);
          }
        }
        out.push({ param1, operator: sg.operator, param2, isItem: false });
        prev = evalSingle(param1, sg.operator, param2);
      }
    }
    return out;
  });
}

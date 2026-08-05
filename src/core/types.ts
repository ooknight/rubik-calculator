// 领域模型类型：纯数据，零 React / Tauri 依赖，可被引擎与 UI 共享。

export type Operator = '+' | '-' | '*' | '/';

export const OPERATORS: Operator[] = ['+', '-', '*', '/'];

/** 运算符映射为标准数学图标符号（加减乘除） */
export const OP_SYMBOLS: Record<Operator, string> = {
  '+': '＋',
  '-': '－',
  '*': '×',
  '/': '÷',
};

/** 单元格三态：空 / 错误 / 数值 */
export type Cell =
  | { kind: 'empty' }
  | { kind: 'error'; message: string }
  | { kind: 'number'; value: string }; // 以 Decimal 字符串保存，避免 toNumber 精度丢失且不出现科学计数法

/** 单个表达式组（逻辑列）
 * 第 0 组为「裸项」：只有 param1，无运算符/param2，结果直接等于该项；
 * 其余组为「运算项」：operator + param2，与前一组结果做运算。 */
export interface Group {
  /** 参数1：手写输入（仅第 0 组可编辑；第 g>0 组由链式派生，见 store 层处理） */
  param1: string;
  operator: Operator;
  param2: string;
  /** 是否裸项（第 0 组）。裸项无运算符、无 param2，结果=param1 */
  isItem: boolean;
}

/** 一组表达式的计算结果 */
export interface GroupResult {
  /** 实际参与运算的参数1（链式组已被 store 填为前组结果） */
  param1: Cell;
  param2: Cell;
  result: Cell;
  /** 是否被上游跳过（下游传播） */
  skipped: boolean;
}

export interface RowResult {
  groups: GroupResult[];
  /** 行结果 = 最后一组有效结果（链式最终值），无有效结果则为 empty */
  rowResult: Cell;
}

export interface ComputeOutput {
  rows: RowResult[];
  /** 每组（列）的结果合计，行间相互独立相加；无效单元格跳过 */
  columnTotals: Cell[];
  /** 每组「参数1」列的操作数合计，无效单元格跳过 */
  param1Totals: Cell[];
  /** 每组「参数2」列的操作数合计，无效单元格跳过 */
  param2Totals: Cell[];
}

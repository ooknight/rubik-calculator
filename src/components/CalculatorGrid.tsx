import { KeyboardEvent, useEffect, useLayoutEffect, useRef } from 'react';
import Decimal from 'decimal.js';
import { useGridStore } from '../store/store';
import { ComputeOutput, Cell, Operator, OPERATORS, OP_SYMBOLS } from '../core/types';

// 用离屏 canvas 测量文本在指定字体下的像素宽度，驱动输入框自适应宽度
let measureCtx: CanvasRenderingContext2D | null = null;
function measureTextWidth(text: string, font: string): number {
  if (!measureCtx) {
    const canvas = document.createElement('canvas');
    measureCtx = canvas.getContext('2d');
  }
  if (!measureCtx) return text.length * 8;
  measureCtx.font = font;
  return measureCtx.measureText(text).width;
}

const INPUT_FONT =
  '14px -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';

// 根据输入值动态设置 input 宽度，跟随文字大小自动调整；minWidth 用于多行统一为最大值
function useAutoSize(value: string, font: string = INPUT_FONT, minWidth: number = 0) {
  const ref = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const padding = 16; // 左右 padding 合计
    const base = 24; // 至少显示一个字符的宽度余地
    const w = Math.max(base, minWidth, measureTextWidth(value || '', font) + padding);
    el.style.width = `${w}px`;
  }, [value, font, minWidth]);
  return ref;
}

interface Props {
  output: ComputeOutput;
}

// 按当前小数位格式化数值文本；非数字（空/文本）原样返回；使用 Decimal 避免科学计数法
function formatNumberText(v: string, places: number): string {
  const t = v.trim();
  if (t === '') return v;
  let d: Decimal;
  try {
    d = new Decimal(t);
  } catch {
    return v;
  }
  if (!d.isFinite()) return v;
  return d.toFixed(places);
}

// 结果格绿色背景：多个结果时按序号逐渐加深
// 结果格绿色背景：多个结果时按序号逐渐加深；filled 时更深一点
function resultGreen(index: number, count: number, filled: boolean): string {
  const t = count <= 1 ? 0 : index / (count - 1);
  const light = (filled ? 88 : 94) - t * 30; // 填充:88->58 / 空:94->64
  const sat = (filled ? 50 : 42) + t * 22; // 填充:50->72 / 空:42->64
  return `hsl(146 ${sat}% ${light}%)`;
}

function cellText(c: Cell, places = 2): string {
  if (c.kind === 'number') {
    // 统一按小数位格式化：整数补零、保留固定位数，保证列内对齐
    return places === 0
      ? new Decimal(c.value).toFixed(0)
      : new Decimal(c.value).toFixed(places);
  }
  if (c.kind === 'error') {
    // 错误不显示符号，仅以红色样式（cell--error）表示，具体原因见 title 悬浮提示
    return '';
  }
  return '';
}

// 五个运算符的 SVG 图标（加 减 乘 除 等于），圆形徽章风格
function OperatorIcon({ op, size = 18 }: { op: Operator | '='; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2.4,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  switch (op) {
    case '+':
      return (
        <svg {...common} aria-label="加">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.4" opacity="0.35" />
          <line x1="12" y1="7" x2="12" y2="17" />
          <line x1="7" y1="12" x2="17" y2="12" />
        </svg>
      );
    case '-':
      return (
        <svg {...common} aria-label="减">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.4" opacity="0.35" />
          <line x1="7" y1="12" x2="17" y2="12" />
        </svg>
      );
    case '*':
      return (
        <svg {...common} aria-label="乘">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.4" opacity="0.35" />
          <line x1="8" y1="8" x2="16" y2="16" />
          <line x1="16" y1="8" x2="8" y2="16" />
        </svg>
      );
    case '/':
      return (
        <svg {...common} aria-label="除">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.4" opacity="0.35" />
          {/* 标准除法符号：一条水平短线，上下各一个点 */}
          <line x1="8" y1="12" x2="16" y2="12" />
          <circle cx="12" cy="7.5" r="1" fill="currentColor" stroke="none" />
          <circle cx="12" cy="16.5" r="1" fill="currentColor" stroke="none" />
        </svg>
      );
    case '=':
      return (
        <svg {...common} aria-label="等于">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.4" opacity="0.35" />
          <line x1="7.5" y1="9.5" x2="16.5" y2="9.5" />
          <line x1="7.5" y1="14.5" x2="16.5" y2="14.5" />
        </svg>
      );
  }
}

export function CalculatorGrid({ output }: Props) {
  const rows = useGridStore((s) => s.rows);
  const headers = useGridStore((s) => s.headers);
  const setHeader = useGridStore((s) => s.setHeader);
  const attributeHeaders = useGridStore((s) => s.attributeHeaders);
  const setAttributeHeader = useGridStore((s) => s.setAttributeHeader);
  const setAttribute = useGridStore((s) => s.setAttribute);
  const decimalPlaces = useGridStore((s) => s.decimalPlaces);
  const setParam1 = useGridStore((s) => s.setParam1);
  const setParam2 = useGridStore((s) => s.setParam2);
  const setColumnOperator = useGridStore((s) => s.setColumnOperator);

  // 绑定小数位的小数显示格式
  const fmt = (c: Cell) => cellText(c, decimalPlaces);

  const groupCount = rows[0]?.groups.length ?? 0;
  const attrCount = rows[0]?.attributes.length ?? 0;
  // 第 0 组（数字1）不单独带结果列；结果列由运算项组（group>0）承担，无运算项时即无结果列
  const group0HasResult = false;
  // 所有带结果列的组索引（用于结果列渲染与绿色渐变）
  const resultGroups = Array.from({ length: groupCount }, (_, g) => g).filter((g) =>
    g === 0 ? group0HasResult : true
  );
  // 分组统计维度：无运算项时（仅一列数字）以第 0 组数值作为统计列；有运算项时按结果列分组
  const statsGroups = groupCount <= 1 ? [0] : resultGroups;
  // 每个运算项组（g>=1）在所有行（含表头）中的最大文字宽度，使多行运算项统一宽度
  const opMaxWidths: number[] = [];
  for (let g = 1; g < groupCount; g++) {
    let max = 0;
    const consider = (t: string) => {
      const w = measureTextWidth(t || '', INPUT_FONT) + 16;
      if (w > max) max = w;
    };
    rows.forEach((row) => consider(row.groups[g]?.param2 ?? ''));
    consider(headers[g]?.param2 ?? '');
    opMaxWidths[g] = max;
  }
  const gridRef = useRef<HTMLDivElement>(null);
  // 第 0 组为裸项：项(auto) [+ 结果(auto，仅当无运算项时)]
  // 分组属性列：auto（插在裸项之后、运算项之前）
  // 其余组：运算符(52) + 项(auto) + =(52) + 结果(auto，按内容自适应)
  const itemCols = group0HasResult ? 'auto auto' : 'auto';
  const opCols = '52px auto 52px auto';
  const opGroupTemplate =
    groupCount > 1 ? Array.from({ length: groupCount - 1 }, () => opCols).join(' ') : '';
  const attrTemplate = attrCount > 0 ? Array.from({ length: attrCount }, () => 'auto').join(' ') : '';
  const parts = ['48px'];
  if (attrTemplate) parts.push(attrTemplate);
  parts.push(itemCols);
  if (opGroupTemplate) parts.push(opGroupTemplate);
  const gridTemplateColumns = parts.join(' ');

  // 通过 data 属性定位焦点：data-r / data-g / data-f(ield)
  const focusField = (r: number, g: number, field: string) => {
    const el = gridRef.current?.querySelector<HTMLInputElement | HTMLSelectElement>(
      `[data-r="${r}"][data-g="${g}"][data-f="${field}"]`
    );
    el?.focus();
  };

  // 默认焦点固定在第一个输入框（第0行第0组参数1）
  useEffect(() => {
    focusField(0, 0, 'param1');
  }, []);

  const onParam1KeyDown = (
    e: KeyboardEvent<HTMLInputElement>,
    r: number,
    _g: number
  ) => {
    const key = e.key;
    // 第 0 组为裸项，无运算符；g>0 组的运算符切换在表头，这里忽略
    if (key === 'Enter') {
      e.preventDefault();
      // 裸项回车：若有运算项则跳到第一项 param2，否则跳下一行裸项
      const hasOp = groupCount > 1;
      if (hasOp) focusField(r, 1, 'param2');
      else focusField(r + 1 < rows.length ? r + 1 : 0, 0, 'param1');
    }
  };

  const onParam2KeyDown = (e: KeyboardEvent<HTMLInputElement>, r: number, g: number) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      // 运算项回车：跳下一行同组项；若无下一行则回到首行同组
      focusField(r + 1 < rows.length ? r + 1 : 0, g, 'param2');
    }
  };

  return (
    <div className="grid-wrap">
      <div className="grid" ref={gridRef} style={{ gridTemplateColumns }}>
        {/* 表头：列名行（属性列；第 0 组裸项只有列名；其余组含运算符列） */}
        <div className="grid__corner grid__corner--sub" />
        {/* 分组属性列名（可编辑，位于项1之前） */}
        {Array.from({ length: attrCount }).map((_, a) => (
          <input
            key={`ah-${a}`}
            className="cell cell--header-input attr-header"
            value={attributeHeaders[a] ?? ''}
            placeholder={`分组${a + 1}`}
            onChange={(e) => setAttributeHeader(a, e.target.value)}
          />
        ))}
        {/* 第 0 组列名：项1 [+ 结果] */}
        <div className="grid__colhead" style={{ gridColumn: `span ${group0HasResult ? 2 : 1}`, display: 'contents' }}>
          <input
            className="cell cell--header-input"
            value={headers[0]?.param1 ?? ''}
            placeholder="项1"
            onChange={(e) => setHeader(0, 'param1', e.target.value)}
          />
          {group0HasResult && (
            <input
              className="cell cell--header-input grid__subhead grid__subhead--result"
              value={headers[0]?.result ?? ''}
              placeholder="结果"
              onChange={(e) => setHeader(0, 'result', e.target.value)}
            />
          )}
        </div>
        {/* 运算项组列名：运算符 / 项 / = / 结果 */}
        {Array.from({ length: groupCount }).map((_, g) =>
          g === 0 ? null : (
            <div className="grid__colhead" key={`ch-${g}`} style={{ gridColumn: 'span 4', display: 'contents' }}>
              <div className="grid__subhead grid__subhead--op subhead--opcol">
                <OperatorButton
                  g={g}
                  op={rows[0]?.groups[g]?.operator ?? '+'}
                  setColumnOperator={setColumnOperator}
                />
              </div>
              <input
                className="cell cell--header-input op-header"
                style={opMaxWidths[g] ? { width: `${opMaxWidths[g]}px` } : undefined}
                value={headers[g]?.param2 ?? ''}
                placeholder="项"
                onChange={(e) => setHeader(g, 'param2', e.target.value)}
              />
              <div className="grid__subhead subhead--opcol">
                <OperatorIcon op="=" size={24} />
              </div>
              <input
                className="cell cell--header-input grid__subhead grid__subhead--result subhead--opcol"
                style={opMaxWidths[g] ? { width: `${opMaxWidths[g]}px` } : undefined}
                value={headers[g]?.result ?? ''}
                placeholder="结果"
                onChange={(e) => setHeader(g, 'result', e.target.value)}
              />
            </div>
          )
        )}

        {/* 数据行 */}
        {rows.map((row, r) => (
          <RowView
            key={row.id}
            r={r}
            row={row}
            result={output.rows[r]}
            fmt={fmt}
            attrCount={attrCount}
            group0HasResult={group0HasResult}
            resultGroups={resultGroups}
            opMaxWidths={opMaxWidths}
            decimalPlaces={decimalPlaces}
            setAttribute={setAttribute}
            setParam1={setParam1}
            setParam2={setParam2}
            onParam1KeyDown={onParam1KeyDown}
            onParam2KeyDown={onParam2KeyDown}
          />
        )        )}
      </div>

      {/* 分组统计：每个结果列单独成表，表内按每个属性列分组汇总 */}
      {attrCount > 0 && (
        <div className="group-stats">
          <div className="group-stats__title">分组统计</div>
          <div className="group-stats__tables">
            {statsGroups.map((g) => {
              const title = g === 0 ? (headers[g]?.param1 || '数字1') : (headers[g]?.result || '结果');
              return (
                <div className="group-stats__table" key={`gt-${g}`}>
                  <div
                    className="group-stats__tabletitle"
                    style={{ backgroundColor: resultGreen(statsGroups.indexOf(g), statsGroups.length, true) }}
                  >
                    {title}
                  </div>
                  <div className="group-stats__cols">
                    {Array.from({ length: attrCount }).map((_, a) => {
                      const byVal = new Map<string, { total: Decimal; count: number }>();
                      rows.forEach((row, i) => {
                        const v = (row.attributes[a] ?? '').trim();
                        if (!v) return;
                        const rr = output.rows[i]?.groups[g]?.result;
                        if (rr && rr.kind === 'number') {
                          const cur = byVal.get(v) ?? { total: new Decimal(0), count: 0 };
                          cur.total = cur.total.plus(rr.value);
                          cur.count += 1;
                          byVal.set(v, cur);
                        }
                      });
                      return (
                        <div className="group-stats__col" key={`gs-${g}-${a}`}>
                          <div className="group-stats__coltitle">
                            {attributeHeaders[a] || `分组${a + 1}`}
                          </div>
                          {[...byVal.entries()].map(([v, s]) => (
                            <div className="group-stats__row" key={v}>
                              <span className="group-stats__val">{v}</span>
                              <div className="group-stats__sums">
                                <div className="group-stats__sumitem">
                                  <span className="group-stats__sum">
                                    {fmt({ kind: 'number', value: s.total.toString() })}
                                  </span>
                                  <span className="group-stats__count">
                                    （{s.count}）
                                  </span>
                                </div>
                              </div>
                            </div>
                          ))}
                          {byVal.size === 0 && (
                            <div className="group-stats__empty">暂无分组数据</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

interface RowProps {
  r: number;
  row: ReturnType<typeof useGridStore.getState>['rows'][number];
  result: ComputeOutput['rows'][number];
  fmt: (c: Cell) => string;
  attrCount: number;
  group0HasResult: boolean;
  resultGroups: number[];
  opMaxWidths: number[];
  decimalPlaces: number;
  setAttribute: (r: number, a: number, v: string) => void;
  setParam1: (r: number, v: string) => void;
  setParam2: (r: number, g: number, v: string) => void;
  onParam1KeyDown: (e: KeyboardEvent<HTMLInputElement>, r: number, g: number) => void;
  onParam2KeyDown: (e: KeyboardEvent<HTMLInputElement>, r: number, g: number) => void;
}

function RowView({
  r,
  row,
  result,
  fmt,
  attrCount,
  group0HasResult,
  resultGroups,
  opMaxWidths,
  decimalPlaces,
  setAttribute,
  setParam1,
  setParam2,
  onParam1KeyDown,
  onParam2KeyDown,
}: RowProps) {
  return (
    <>
      {/* 行号列（最左） */}
      <div className="grid__rownum">{r + 1}</div>
      {/* 分组属性列：插在行号之后、项1之前 */}
      {Array.from({ length: attrCount }).map((_, a) => (
        <AttrInput
          key={`at-${a}`}
          r={r}
          a={a}
          value={row.attributes[a] ?? ''}
          setAttribute={setAttribute}
        />
      ))}
      {row.groups.map((sg, g) => {
        const gr = result.groups[g];
        return (
          <div className="group" key={`${row.id}-${g}`} style={{ display: 'contents' }}>
            {/* 第 0 组：裸项（仅项1，结果=项1） */}
            {g === 0 ? (
              <>
                <Param1Input
                  r={r}
                  g={g}
                  value={sg.param1 ?? ''}
                  decimalPlaces={decimalPlaces}
                  setParam1={setParam1}
                  onParam1KeyDown={onParam1KeyDown}
                />
                {group0HasResult && (
                  <div
                    className={
                      'cell cell--result' +
                      (gr.result.kind === 'number' ? ' is-filled' : '') +
                      (gr.result.kind === 'error' ? ' cell--error' : '') +
                      (gr.skipped ? ' cell--skipped' : '')
                    }
                    style={
                      gr.result.kind === 'error'
                        ? undefined
                        : { backgroundColor: resultGreen(resultGroups.indexOf(g), resultGroups.length, gr.result.kind === 'number') }
                    }
                    title={gr.result.kind === 'error' ? gr.result.message : ''}
                  >
                    {fmt(gr.result)}
                  </div>
                )}
              </>
            ) : (
              <>
                {/* 运算符：只读图标展示（切换交互已上移到表头） */}
                <OperatorDisplay op={sg.operator} className="cell--opcol" />
                {/* 项（param2）：可编辑 */}
                <Param2Input
                  r={r}
                  g={g}
                  value={sg.param2}
                  fillWidth={opMaxWidths[g] || 0}
                  decimalPlaces={decimalPlaces}
                  setParam2={setParam2}
                  onParam2KeyDown={onParam2KeyDown}
                />
                {/* 等号 */}
                <div className="cell cell--eq cell--opcol">
                  <OperatorIcon op="=" size={24} />
                </div>
                {/* 结果 */}
                <div
                  className={
                    'cell cell--result cell--opcol' +
                    (gr.result.kind === 'number' ? ' is-filled' : '') +
                    (gr.result.kind === 'error' ? ' cell--error' : '') +
                    (gr.skipped ? ' cell--skipped' : '')
                  }
                  style={
                    gr.result.kind === 'error'
                      ? undefined
                      : { backgroundColor: resultGreen(resultGroups.indexOf(g), resultGroups.length, gr.result.kind === 'number') }
                  }
                  title={gr.skipped ? '上游为空/错误，已跳过' : gr.result.kind === 'error' ? gr.result.message : ''}
                >
                  {fmt(gr.result)}
                </div>
              </>
            )}
          </div>
        );
      })}
    </>
  );
}

/** 运算符图标按钮（表头用）：点击循环切换 加减乘除，整列统一 */
function OperatorButton({
  g,
  op,
  setColumnOperator,
}: {
  g: number;
  op: Operator;
  setColumnOperator: (groupIdx: number, op: Operator) => void;
}) {
  const cycle = () => {
    const idx = OPERATORS.indexOf(op);
    const next = OPERATORS[(idx + 1) % OPERATORS.length];
    // 点击切换时整列（所有行的该组）统一为同一运算符
    setColumnOperator(g, next);
  };
  return (
    <button
      type="button"
      className="cell cell--op cell--op-btn"
      data-g={g}
      data-f="operator"
      onClick={cycle}
      title="表头点击切换运算符（加 减 乘 除），整列统一"
      aria-label={`运算符：${OP_SYMBOLS[op]}`}
    >
      <OperatorIcon op={op} size={24} />
    </button>
  );
}

/** 运算符只读展示（数据行用）：纯图标，不可点击切换 */
function OperatorDisplay({ op, className = '' }: { op: Operator; className?: string }) {
  return (
    <div className={`cell cell--op cell--op-static ${className}`} title={`运算符：${OP_SYMBOLS[op]}`}>
      <OperatorIcon op={op} size={24} />
    </div>
  );
}

/** 第0组参数1：可编辑，宽度随输入文字自适应；失焦时按小数位重写 */
function Param1Input({
  r,
  g,
  value,
  decimalPlaces,
  setParam1,
  onParam1KeyDown,
}: {
  r: number;
  g: number;
  value: string;
  decimalPlaces: number;
  setParam1: (r: number, v: string) => void;
  onParam1KeyDown: (e: KeyboardEvent<HTMLInputElement>, r: number, g: number) => void;
}) {
  const ref = useAutoSize(value);
  return (
    <input
      ref={ref}
      className="cell cell--autosize"
      data-r={r}
      data-g={g}
      data-f="param1"
      value={value}
      inputMode="decimal"
      onChange={(e) => setParam1(r, e.target.value)}
      onBlur={() => setParam1(r, formatNumberText(value, decimalPlaces))}
      onKeyDown={(e) => onParam1KeyDown(e, r, g)}
    />
  );
}

/** 链式组参数1：已移除（新模型中运算项的项1隐藏，仅显示运算符+项） */

/** 分组属性列：可编辑文本，宽度随输入文字自适应 */
function AttrInput({
  r,
  a,
  value,
  setAttribute,
}: {
  r: number;
  a: number;
  value: string;
  setAttribute: (r: number, a: number, v: string) => void;
}) {
  const ref = useAutoSize(value);
  return (
    <input
      ref={ref}
      className="cell cell--autosize cell--attr"
      data-r={r}
      data-g={-1}
      data-f={`attr${a}`}
      value={value}
      placeholder="分组"
      onChange={(e) => setAttribute(r, a, e.target.value)}
    />
  );
}

/** 参数2：可编辑，宽度随输入文字自适应；失焦时按小数位重写 */
function Param2Input({
  r,
  g,
  value,
  fillWidth,
  decimalPlaces,
  setParam2,
  onParam2KeyDown,
}: {
  r: number;
  g: number;
  value: string;
  fillWidth: number;
  decimalPlaces: number;
  setParam2: (r: number, g: number, v: string) => void;
  onParam2KeyDown: (e: KeyboardEvent<HTMLInputElement>, r: number, g: number) => void;
}) {
  const ref = useAutoSize(value, INPUT_FONT, fillWidth);
  return (
    <input
      ref={ref}
      className="cell cell--autosize cell--opitem"
      data-r={r}
      data-g={g}
      data-f="param2"
      value={value}
      inputMode="decimal"
      onChange={(e) => setParam2(r, g, e.target.value)}
      onBlur={() => setParam2(r, g, formatNumberText(value, decimalPlaces))}
      onKeyDown={(e) => onParam2KeyDown(e, r, g)}
    />
  );
}

/** 合计行已在 JSX 中按裸项/运算项分别渲染，无需 TotalGroup 组件 */

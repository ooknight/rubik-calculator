import { Fragment, KeyboardEvent, useEffect, useLayoutEffect, useRef } from 'react';
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

const MONO_FONT = "Consolas, 'SFMono-Regular', 'Courier New', monospace";
const INPUT_FONT = `14px ${MONO_FONT}`;

// 列索引映射（1-based grid 列号），去掉 display:contents 后每个单元格用 gridColumn 显式定位，
// 直接作为 .grid 容器的子元素参与对齐：
//   1                行号
//   2 .. 1+attrCount 分组属性列
//   2+attrCount      第0组项1
//   之后每组(g>=1)：  op / param2 / eq / result 占 4 列
interface ColMap {
  C_ROWNUM: number;
  colItem1: number;
  colOp: (g: number) => number;
  colParam2: (g: number) => number;
  colEq: (g: number) => number;
  colResult: (g: number) => number;
}
function makeColMap(attrCount: number): ColMap {
  const C_ROWNUM = 1;
  const colItem1 = 2 + attrCount;
  const groupStart = (g: number) => (g === 0 ? colItem1 : colItem1 + 1 + (g - 1) * 4);
  return {
    C_ROWNUM,
    colItem1,
    colOp: (g) => groupStart(g),
    colParam2: (g) => groupStart(g) + 1,
    colEq: (g) => groupStart(g) + 2,
    colResult: (g) => groupStart(g) + 3,
  };
}

// 根据输入值动态设置元素宽度，跟随文字大小自动调整；minWidth 用于多行统一为最大值
// 同时支持 input 与 div（结果格为 div），保证结果列与数字列采用同一套自适应机制
function useAutoSize<T extends HTMLElement>(value: string, _font: string = INPUT_FONT, minWidth: number = 0) {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const base = measureTextWidth('0000', INPUT_FONT); // 默认至少 4 个字符宽度
    // 直接按当前显示文本测量（传入的 value 已是格式化后的显示值，含强制的小数点/尾零），
    // 不再 strip 尾零，避免结果列/数字列显示 "123.00" 时宽度偏小导致溢出。
    const w = Math.max(base, minWidth, measureTextWidth(value, INPUT_FONT) + 16);
    el.style.width = `${w}px`;
  }, [value, minWidth]);
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
  const addGroup = useGridStore((s) => s.addGroup);
  const addRow = useGridStore((s) => s.addRow);

  // 绑定小数位的小数显示格式
  const fmt = (c: Cell) => cellText(c, decimalPlaces);

  const groupCount = rows[0]?.groups.length ?? 0;
  const attrCount = rows[0]?.attributes.length ?? 0;

  // 列索引映射：每个单元格用 gridColumn 显式定位（方案 B：扁平结构，无 display:contents）
  const { C_ROWNUM, colItem1, colOp, colParam2, colEq, colResult } = makeColMap(attrCount);
  // 第 0 组（数字）不单独带结果列；结果列由运算项组（group>=1）承担。
  // 所有带结果列的组索引（用于结果列渲染与绿色渐变）
  const resultGroups = Array.from({ length: groupCount }, (_, g) => g);
  // 分组统计维度：无运算项时（仅一列数字）以第 0 组数值作为统计列；有运算项时按结果列分组
  const statsGroups = groupCount <= 1 ? [0] : resultGroups;
  // 每个运算项组（g>=1）在所有行（含表头）中的最大文字宽度，使多行运算项统一宽度
  // 数字列/属性列宽度计算：必须基于显示值（失焦后 formatNumberText 强制加上的
  // 小数点与尾零，如 123 -> "123.00"），否则列宽按原始输入字符串测量会少算小数点位置，
  // 导致失焦格式化后文本超出单元格（溢出）。因此统一用 formatNumberText 格式化后再测量。
  const cellWidthOf = (t: string) => measureTextWidth(formatNumberText(t, decimalPlaces), INPUT_FONT) + 20; // padding 16px + 4px 安全余量（canvas 测量与浏览器渲染存在亚像素差异）
  const opMaxWidths: number[] = [];
  for (let g = 1; g < groupCount; g++) {
    let max = 0;
    const consider = (t: string) => {
      const w = cellWidthOf(t);
      if (w > max) max = w;
    };
    rows.forEach((row) => consider(row.groups[g]?.param2 ?? ''));
    consider(headers[g]?.param2 ?? '');
    opMaxWidths[g] = max;
  }
    // 第 0 组项1（数字1）在所有行（含表头）中的最大文字宽度，使该列统一宽度；至少 4 字符宽
  const baseWidth = measureTextWidth('0000', INPUT_FONT) + 16;
  let itemMaxWidth = baseWidth;
  {
    const consider = (t: string) => {
      const w = cellWidthOf(t);
      if (w > itemMaxWidth) itemMaxWidth = w;
    };
    rows.forEach((row) => consider(row.groups[0]?.param1 ?? ''));
    consider(headers[0]?.param1 ?? '');
  }
  // 分组属性列：每列在所有行（含表头）中的最大文字宽度，使各属性列统一宽度
  const attrMaxWidths: number[] = [];
  for (let a = 0; a < attrCount; a++) {
    let max = 0;
    const consider = (t: string) => {
      const w = cellWidthOf(t);
      if (w > max) max = w;
    };
    rows.forEach((row) => consider(row.attributes[a] ?? ''));
    consider(attributeHeaders[a] ?? '');
    attrMaxWidths[a] = Math.max(max, measureTextWidth('0000', INPUT_FONT) + 16);
  }
  // 结果列：与数字列一样，整列统一到该列所有结果文本的最大宽度（至少 baseWidth），
  // 使结果列像数字列那样对齐整齐，同时内容变长时整列自动变宽。
  // 注意：结果格渲染的是 cellText() 格式化后的文本（如 "1235.00"，含尾零），
  // 所以宽度计算必须直接用渲染文本测量，不能用 stripForWidth（会去掉 .00 导致偏小溢出）。
  const resultColMaxWidth: number[] = [];
  for (let g = 0; g < groupCount; g++) {
    let max = baseWidth;
    const considerRaw = (t: string) => {
      const w = measureTextWidth(t, INPUT_FONT) + 16;
      if (w > max) max = w;
    };
    considerRaw(headers[g]?.result ?? '');
    rows.forEach((_row, r) => {
      const gr = output.rows[r]?.groups[g];
      if (gr && gr.result.kind !== 'error') considerRaw(cellText(gr.result, decimalPlaces));
    });
    resultColMaxWidth[g] = max;
  }
  const gridRef = useRef<HTMLDivElement>(null);
  // 显式列宽数组（1-based 索引 = grid 列号），同时驱动 gridTemplateColumns 与每个单元格宽度，
  // 保证表头与数据行严格等宽对齐（不再依赖 auto 轨道的不确定性）
  const COL_ROWNUM_W = 48;
  const COL_OP_W = 28;   // 运算符按钮实际宽约 24px，留 4px 呼吸
  const COL_EQ_W = 28;   // 等号按钮实际宽约 24px，留 4px 呼吸
  const colWidths: number[] = [];
  colWidths[C_ROWNUM - 1] = COL_ROWNUM_W;
  for (let a = 0; a < attrCount; a++) colWidths[(2 + a) - 1] = (attrMaxWidths[a] ?? baseWidth) + 8; // 轨道加 8px，使分组列与数字列之间留出间距
  colWidths[colItem1 - 1] = itemMaxWidth;
  for (let g = 1; g < groupCount; g++) {
    colWidths[colOp(g) - 1] = COL_OP_W;
    colWidths[colParam2(g) - 1] = opMaxWidths[g] ?? baseWidth;
    colWidths[colEq(g) - 1] = COL_EQ_W;
    colWidths[colResult(g) - 1] = resultColMaxWidth[g];
  }
  const gridTemplateColumns = colWidths.map((w) => `${w}px`).join(' ');

  // 通过 data 属性定位焦点：data-r / data-g / data-f(ield)。
  // 当目标元素由 addGroup/addRow 异步渲染（下一帧才出现）时，用 rAF 重试，确保焦点落到新生成的输入框。
  const focusField = (r: number, g: number, field: string) => {
    const tryFocus = (attempt: number) => {
      const el = gridRef.current?.querySelector<HTMLInputElement | HTMLSelectElement>(
        `[data-r="${r}"][data-g="${g}"][data-f="${field}"]`
      );
      if (el) {
        el.focus();
        return;
      }
      if (attempt < 3) requestAnimationFrame(() => tryFocus(attempt + 1));
    };
    tryFocus(0);
  };

  // 默认焦点固定在第一个输入框（第0行第0组参数1）
  useEffect(() => {
    focusField(0, 0, 'param1');
  }, []);

  const OP_KEYS = ['+', '-', '*', '/'];
  const onParam1KeyDown = (
    e: KeyboardEvent<HTMLInputElement>,
    r: number,
    _g: number
  ) => {
    const key = e.key;
    if (key === 'Enter' || OP_KEYS.includes(key)) {
      e.preventDefault();
      // 第 0 组为裸项，无运算符；输入运算符时作用于紧随其后的第 1 组运算项。
      if (OP_KEYS.includes(key)) {
        if (groupCount <= 1) {
          // 尚无运算项：先新增一项，再将其运算符设为输入值
          addGroup();
          setColumnOperator(1, key as Operator);
        } else {
          setColumnOperator(1, key as Operator);
        }
        focusField(r, 1, 'param2');
        return;
      }
      // 回车：若有运算项则跳到第一项 param2，否则跳下一行裸项
      const hasOp = groupCount > 1;
      if (hasOp) focusField(r, 1, 'param2');
      else focusField(r + 1 < rows.length ? r + 1 : 0, 0, 'param1');
    }
  };

  const onParam2KeyDown = (e: KeyboardEvent<HTMLInputElement>, r: number, g: number) => {
    const key = e.key;
    if (key === 'Enter' || OP_KEYS.includes(key)) {
      e.preventDefault();
      if (OP_KEYS.includes(key)) {
        // 修改当前组运算符
        setColumnOperator(g, key as Operator);
        if (g + 1 < groupCount) {
          // 仍有下一个运算项：跳到下一组的 param2（如 4+5+ 跳到第三个输入框）
          focusField(r, g + 1, 'param2');
        } else {
          // 已是最后一个运算项：在当前行新增一个运算项组（列），跳到新项的 param2
          addGroup();
          const newG = groupCount;
          focusField(r, newG, 'param2');
        }
        return;
      }
      // 回车：新增一行，焦点跳到新行第一个输入框（第0组 param1）
      addRow();
      focusField(rows.length, 0, 'param1');
    }
  };

  return (
    <div className="grid-wrap">
      <div
        className="grid"
        ref={gridRef}
        style={{ gridTemplateColumns, '--base-width': `${baseWidth}px` } as React.CSSProperties}
      >
        {/* 表头：列名行（属性列；第 0 组裸项只有列名；其余组含运算符列） */}
        <div className="grid__corner grid__corner--sub" style={{ gridColumn: String(C_ROWNUM) }} />
        {/* 分组属性列名（可编辑，位于项1之前） */}
        {Array.from({ length: attrCount }).map((_, a) => (
          <input
            key={`ah-${a}`}
            className="cell cell--header-input attr-header"
            style={{ gridColumn: String(2 + a), ...(attrMaxWidths[a] ? { width: `${attrMaxWidths[a]}px` } : {}) }}
            value={attributeHeaders[a] ?? ''}
            onChange={(e) => setAttributeHeader(a, e.target.value)}
          />
        ))}
        {/* 第 0 组列名：项1 [+ 结果] */}
        <input
          className="cell cell--header-input"
          style={{ gridColumn: String(colItem1), width: `${itemMaxWidth}px` }}
          value={headers[0]?.param1 ?? ''}
          onChange={(e) => setHeader(0, 'param1', e.target.value)}
        />
        {/* 运算项组列名：运算符 / 项 / = / 结果 */}
        {Array.from({ length: groupCount }).map((_, g) =>
          g === 0 ? null : (
            <Fragment key={`ch-${g}`}>
              <div
                className="grid__subhead grid__subhead--op subhead--opcol"
                style={{ gridColumn: String(colOp(g)) }}
              >
                <OperatorButton
                  g={g}
                  op={rows[0]?.groups[g]?.operator ?? '+'}
                  setColumnOperator={setColumnOperator}
                />
              </div>
              <input
                className="cell cell--header-input op-header"
                style={{ gridColumn: String(colParam2(g)), ...(opMaxWidths[g] ? { width: `${opMaxWidths[g]}px` } : {}) }}
                value={headers[g]?.param2 ?? ''}
                onChange={(e) => setHeader(g, 'param2', e.target.value)}
              />
              <div
                className="grid__subhead subhead--opcol subhead--eq"
                style={{ gridColumn: String(colEq(g)) }}
              >
                <OperatorIcon op="=" size={24} />
              </div>
              <HeaderResultInput
                index={g}
                value={headers[g]?.result ?? ''}
                minWidth={resultColMaxWidth[g]}
                onChange={(v) => setHeader(g, 'result', v)}
                style={{ gridColumn: String(colResult(g)), backgroundColor: resultGreen(resultGroups.indexOf(g), resultGroups.length, false) }}
              />
            </Fragment>
          )
        )}

        {/* 标题行与数据区域之间的分割线 */}
        <div className="grid__divider" />

        {/* 数据行 */}
        {rows.map((row, r) => (
          <RowView
            key={row.id}
            r={r}
            row={row}
            result={output.rows[r]}
            fmt={fmt}
            attrCount={attrCount}
            resultGroups={resultGroups}
            itemMaxWidth={itemMaxWidth}
            opMaxWidths={opMaxWidths}
            attrMaxWidths={attrMaxWidths}
            baseWidth={baseWidth}
            resultColMaxWidth={resultColMaxWidth}
            colMap={{ C_ROWNUM, colItem1, colOp, colParam2, colEq, colResult }}
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
              const title = g === 0 ? (headers[g]?.param1 || '数字') : (headers[g]?.result || '结果');
              return (
                <div className="group-stats__table" key={`gt-${g}`}>
                  <div
                    className="group-stats__tabletitle"
                    style={
                      g >= 1
                        ? { backgroundColor: resultGreen(resultGroups.indexOf(g), resultGroups.length, false) }
                        : undefined
                    }
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
                            {attributeHeaders[a] || `分组`}
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
  resultGroups: number[];
  itemMaxWidth: number;
  opMaxWidths: number[];
  attrMaxWidths: number[];
  baseWidth: number;
  resultColMaxWidth: number[];
  colMap: ColMap;
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
  resultGroups,
  itemMaxWidth,
  opMaxWidths,
  attrMaxWidths,
  baseWidth,
  resultColMaxWidth,
  colMap,
  decimalPlaces,
  setAttribute,
  setParam1,
  setParam2,
  onParam1KeyDown,
  onParam2KeyDown,
}: RowProps) {
  const { C_ROWNUM, colItem1, colOp, colParam2, colEq, colResult } = colMap;
  return (
    <>
      {/* 行号列（最左） */}
      <div className="grid__rownum" style={{ gridColumn: String(C_ROWNUM) }}>
        {r + 1}
      </div>
      {/* 分组属性列：插在行号之后、项1之前 */}
      {Array.from({ length: attrCount }).map((_, a) => (
        <AttrInput
          key={`at-${a}`}
          r={r}
          a={a}
          value={row.attributes[a] ?? ''}
          width={attrMaxWidths[a] ?? baseWidth}
          setAttribute={setAttribute}
          style={{ gridColumn: String(2 + a) }}
        />
      ))}
      {row.groups.map((sg, g) => {
        const gr = result.groups[g];
        return g === 0 ? (
          <Fragment key={`${row.id}-${g}`}>
            <Param1Input
              r={r}
              g={g}
              value={sg.param1 ?? ''}
              width={itemMaxWidth}
              decimalPlaces={decimalPlaces}
              setParam1={setParam1}
              onParam1KeyDown={onParam1KeyDown}
              style={{ gridColumn: String(colItem1) }}
            />
          </Fragment>
        ) : (
          <Fragment key={`${row.id}-${g}`}>
            {/* 运算符：只读图标展示（切换交互已上移到表头） */}
            <OperatorDisplay
              op={sg.operator}
              className="cell--opcol"
              style={{ gridColumn: String(colOp(g)) }}
            />
            {/* 项（param2）：可编辑 */}
            <Param2Input
              r={r}
              g={g}
              value={sg.param2}
              width={opMaxWidths[g] ?? baseWidth}
              decimalPlaces={decimalPlaces}
              setParam2={setParam2}
              onParam2KeyDown={onParam2KeyDown}
              style={{ gridColumn: String(colParam2(g)) }}
            />
            {/* 等号 */}
            <div className="cell cell--eq cell--opcol" style={{ gridColumn: String(colEq(g)) }}>
              <OperatorIcon op="=" size={24} />
            </div>
            {/* 结果 */}
            <ResultCell
              className={
                'cell cell--result cell--opcol' +
                (gr.result.kind === 'number' ? ' is-filled' : '') +
                (gr.result.kind === 'error' ? ' cell--error' : '') +
                (gr.skipped ? ' cell--skipped' : '')
              }
              style={{
                gridColumn: String(colResult(g)),
                ...(gr.result.kind === 'error'
                  ? {}
                  : { backgroundColor: resultGreen(resultGroups.indexOf(g), resultGroups.length, gr.result.kind === 'number') }),
              }}
              title={gr.skipped ? '上游为空/错误，已跳过' : gr.result.kind === 'error' ? gr.result.message : ''}
              text={fmt(gr.result)}
              minWidth={resultColMaxWidth[g]}
            />
          </Fragment>
        );
      })}
    </>
  );
}

/** 数据行结果格：宽度随内容自适应（与数字列同一套机制），默认宽度与数字列一致 */
function ResultCell({
  className,
  style,
  title,
  text,
  minWidth,
}: {
  className: string;
  style?: React.CSSProperties;
  title?: string;
  text: string;
  minWidth: number;
}) {
  // 结果列默认宽度 = 整列统一最小值（resultColMaxWidth），内容更长时自动撑开不溢出。
  // 用 min-width 而非固定 width，避免 canvas 测量误差导致截断。
  return (
    <div className={className} style={{ ...style, width: `${minWidth}px` }} title={title}>
      {text}
    </div>
  );
}

/** 表头结果列名输入框：可编辑，宽度随内容自适应，默认宽度与数字列一致 */
function HeaderResultInput({
  index,
  value,
  minWidth,
  onChange,
  style,
}: {
  index: number;
  value: string;
  minWidth: number;
  onChange: (v: string) => void;
  style?: React.CSSProperties;
}) {
  const ref = useAutoSize<HTMLInputElement>(value, INPUT_FONT, minWidth);
  return (
    <input
      ref={ref}
      className="cell cell--header-input grid__subhead grid__subhead--result subhead--opcol"
      data-g={index}
      data-f="result"
      style={style}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
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
function OperatorDisplay({ op, className = '', style }: { op: Operator; className?: string; style?: React.CSSProperties }) {
  return (
    <div className={`cell cell--op cell--op-static ${className}`} style={style} title={`运算符：${OP_SYMBOLS[op]}`}>
      <OperatorIcon op={op} size={24} />
    </div>
  );
}

/** 第0组参数1：可编辑，宽度=整列统一列宽（与表头一致，整列严格对齐） */
function Param1Input({
  r,
  g,
  value,
  width,
  decimalPlaces,
  setParam1,
  onParam1KeyDown,
  style,
}: {
  r: number;
  g: number;
  value: string;
  width: number;
  decimalPlaces: number;
  setParam1: (r: number, v: string) => void;
  onParam1KeyDown: (e: KeyboardEvent<HTMLInputElement>, r: number, g: number) => void;
  style?: React.CSSProperties;
}) {
  return (
    <input
      className="cell cell--autosize"
      data-r={r}
      data-g={g}
      data-f="param1"
      style={{ ...style, width: `${width}px` }}
      value={value}
      inputMode="decimal"
      onChange={(e) => setParam1(r, e.target.value)}
      onBlur={() => setParam1(r, formatNumberText(value, decimalPlaces))}
      onKeyDown={(e) => onParam1KeyDown(e, r, g)}
    />
  );
}

/** 分组属性列：可编辑文本，宽度=整列统一列宽（与表头一致，整列严格对齐） */
function AttrInput({
  r,
  a,
  value,
  width,
  setAttribute,
  style,
}: {
  r: number;
  a: number;
  value: string;
  width: number;
  setAttribute: (r: number, a: number, v: string) => void;
  style?: React.CSSProperties;
}) {
  return (
    <input
      className="cell cell--autosize cell--attr"
      data-r={r}
      data-g={-1}
      data-f={`attr${a}`}
      style={{ ...style, width: `${width}px` }}
      value={value}
      onChange={(e) => setAttribute(r, a, e.target.value)}
    />
  );
}

/** 参数2：可编辑，宽度=整列统一列宽（与表头一致，整列严格对齐） */
function Param2Input({
  r,
  g,
  value,
  width,
  decimalPlaces,
  setParam2,
  onParam2KeyDown,
  style,
}: {
  r: number;
  g: number;
  value: string;
  width: number;
  decimalPlaces: number;
  setParam2: (r: number, g: number, v: string) => void;
  onParam2KeyDown: (e: KeyboardEvent<HTMLInputElement>, r: number, g: number) => void;
  style?: React.CSSProperties;
}) {
  return (
    <input
      className="cell cell--autosize cell--opitem"
      data-r={r}
      data-g={g}
      data-f="param2"
      style={{ ...style, width: `${width}px` }}
      value={value}
      inputMode="decimal"
      onChange={(e) => setParam2(r, g, e.target.value)}
      onBlur={() => setParam2(r, g, formatNumberText(value, decimalPlaces))}
      onKeyDown={(e) => onParam2KeyDown(e, r, g)}
    />
  );
}

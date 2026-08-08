import { Fragment, useEffect, useRef, useState } from 'react';
import Decimal from 'decimal.js';
import { useGridStore } from '../store/store';
import { constByKey, constKeys } from '../store/store';
import type { StoredRow } from '../store/store';
import type { ConstDef } from '../store/store';
import { ComputeOutput, Cell, Operator, OPERATORS, OP_SYMBOLS } from '../core/types';

interface Props {
  output: ComputeOutput;
}

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

function cellText(c: Cell, places = 2): string {
  if (c.kind === 'number') {
    return places === 0 ? new Decimal(c.value).toFixed(0) : new Decimal(c.value).toFixed(places);
  }
  return '';
}

function resultGreen(index: number, count: number, filled: boolean): string {
  const t = count <= 1 ? 0 : index / (count - 1);
  const light = (filled ? 88 : 94) - t * 30;
  const sat = (filled ? 50 : 42) + t * 22;
  return `hsl(146 ${sat}% ${light}%)`;
}

// 运算符 SVG 徽章（与旧版视觉一致）
function OperatorIcon({ op, size = 24 }: { op: Operator; size?: number }) {
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
  if (op === '+') {
    return (
      <svg {...common} aria-label="加">
        <circle cx="12" cy="12" r="9" strokeWidth={1.4} opacity={0.35} />
        <line x1="12" y1="7" x2="12" y2="17" />
        <line x1="7" y1="12" x2="17" y2="12" />
      </svg>
    );
  }
  if (op === '-') {
    return (
      <svg {...common} aria-label="减">
        <circle cx="12" cy="12" r="9" strokeWidth={1.4} opacity={0.35} />
        <line x1="7" y1="12" x2="17" y2="12" />
      </svg>
    );
  }
  if (op === '*') {
    return (
      <svg {...common} aria-label="乘">
        <circle cx="12" cy="12" r="9" strokeWidth={1.4} opacity={0.35} />
        <path d="M8 8 L16 16 M16 8 L8 16" />
      </svg>
    );
  }
  return (
    <svg {...common} aria-label="除">
      <circle cx="12" cy="12" r="9" strokeWidth={1.4} opacity={0.35} />
      <line x1="7.5" y1="12" x2="16.5" y2="12" />
      <circle cx="12" cy="8.5" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="12" cy="15.5" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

// 等号 SVG 徽章
function EqualsIcon({ size = 24 }: { size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2.4,
    strokeLinecap: 'round' as const,
  };
  return (
    <svg {...common} aria-label="等于">
      <line x1="7" y1="9.5" x2="17" y2="9.5" />
      <line x1="7" y1="14.5" x2="17" y2="14.5" />
    </svg>
  );
}

// 变量 / 常量 切换图标：正方形边框（与运算符同风格，无圆角）+ 大写 A（常量）/ 小写 a（变量）
function VarConstIcon({ isConst, size = 24 }: { isConst: boolean; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2.4,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'miter' as const,
  };
  return (
    <svg {...common} aria-label={isConst ? '常量列' : '变量列'}>
      <rect x="3" y="3" width="18" height="18" rx="0" strokeWidth={1.4} />
      <text
        x="12"
        y="12"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="12"
        fontWeight="700"
        fill="currentColor"
        stroke="none"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
      >
        {isConst ? 'A' : 'a'}
      </text>
    </svg>
  );
}

// 循环切换运算符：+ → - → * → ÷ → +
function cycleOperator(op: Operator): Operator {
  const i = OPERATORS.indexOf(op);
  return OPERATORS[(i + 1) % OPERATORS.length];
}

// 列「变量 / 常量」切换器：点击在变量列与常量列之间切换；常量列弹出常量选择
const ConstToggle = ({
  g,
  rows,
  constants,
  setColumnConst,
}: {
  g: number;
  rows: StoredRow[];
  constants: ConstDef[];
  setColumnConst: (g: number, key: string | null) => void;
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const colIsConst = rows[0]?.groups[g]?.isConst ?? false;
  const colConstKey = rows[0]?.groups[g]?.constKey ?? '';
  const keys = constKeys(constants);
  const canConst = keys.length > 0;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const toggle = () => {
    if (colIsConst) {
      setColumnConst(g, null); // 切回变量列
      return;
    }
    if (!canConst) return;
    if (keys.length === 1) {
      setColumnConst(g, keys[0]); // 仅一个常量：直接切换
    } else {
      setOpen((v) => !v); // 多个常量：弹出选择
    }
  };

  return (
    <button
      type="button"
      ref={ref}
      className={`const-toggle__btn${colIsConst ? ' is-const' : ''}`}
      title={colIsConst ? '当前为常量列，点击切回变量（数字）列' : '切换为常量列（变量 ⇄ 常量）'}
      aria-pressed={colIsConst}
      disabled={!canConst && !colIsConst}
      onClick={toggle}
    >
      <VarConstIcon isConst={colIsConst} />
      {open && canConst && (
        <span className="const-toggle__menu" role="menu">
          {keys.map((k) => {
            const c = constByKey(constants, k);
            return (
              <button
                key={k}
                type="button"
                className={`const-toggle__item${k === colConstKey ? ' is-active' : ''}`}
                onClick={() => {
                  setColumnConst(g, k);
                  setOpen(false);
                }}
              >
                <span className="const-toggle__item-key">{k}</span>
                <span className="const-toggle__item-name">{c?.name ?? k}</span>
                <span className="const-toggle__item-val">{c ? String(c.value) : ''}</span>
              </button>
            );
          })}
          <button
            type="button"
            className="const-toggle__item const-toggle__item--var"
            onClick={() => {
              setColumnConst(g, null);
              setOpen(false);
            }}
          >
            ⇄ 切回变量列
          </button>
        </span>
      )}
    </button>
  );
};

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
  const addConstGroup = useGridStore((s) => s.addConstGroup);
  const setColumnConst = useGridStore((s) => s.setColumnConst);
  const constants = useGridStore((s) => s.constants);
  const addRow = useGridStore((s) => s.addRow);

  const groupCount = rows[0]?.groups.length ?? 0;
  const attrCount = rows[0]?.attributes.length ?? 0;
  const resultGroups = Array.from({ length: Math.max(0, groupCount - 1) }, (_, i) => i + 1);
  const statsGroups = groupCount <= 1 ? [0] : resultGroups;
  const fmt = (c: Cell) => cellText(c, decimalPlaces);

  // 可编辑单元格：原生 <input>，回车/失焦时提交（类 Handsontable 行为）
  const EditableCell = ({
    value,
    onCommit,
    tdClassName,
    title,
    onKeyDown,
    inputTitle,
    dataR,
    dataG,
    dataF,
  }: {
    value: string;
    onCommit: (text: string) => void;
    tdClassName?: string;
    title?: string;
    onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
    inputTitle?: string;
    dataR?: number;
    dataG?: number;
    dataF?: string;
  }) => {
    return (
      <td
        className={`calc-td ${tdClassName ?? ''}`}
        title={title}
        data-r={dataR}
        data-g={dataG}
        data-f={dataF}
      >
        <input
          className="cell-input"
          defaultValue={value}
          key={value}
          title={inputTitle}
          data-r={dataR}
          data-g={dataG}
          data-f={dataF}
          onBlur={(e) => onCommit(formatNumberText(e.target.value, decimalPlaces))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              (e.target as HTMLInputElement).blur();
              onKeyDown?.(e); // 交给父级处理导航（如跳到下一行）
              return;
            }
            onKeyDown?.(e);
          }}
        />
      </td>
    );
  };

  // 通过 data-r/data-g/data-f 定位并聚焦目标单元格（键盘导航）
  const focusCell = (r: number, g: number, f: string) => {
    const sel = `input[data-r="${r}"][data-g="${g}"][data-f="${f}"]`;
    // 延迟到 React 提交重渲染之后，避免目标输入框被 remount 而丢失焦点
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLInputElement>(sel);
      if (el) el.focus();
      });
      };

      // 跳到下一行对应格；若已是最后一行则先新增一行（新行会自动对齐当前组数）
      const goNextRowOrAdd = (r: number, g: number, f: string) => {
        if (r + 1 >= rows.length) {
          addRow();
        }
        focusCell(r + 1, g, f);
      };

  const OP_KEYS = ['+', '-', '*', '/'];
  const onParam1KeyDown = (e: React.KeyboardEvent<HTMLInputElement>, r: number) => {
    const key = e.key;
    if (key === 'Enter') {
      e.preventDefault();
      goNextRowOrAdd(r, 0, 'param1');
      return;
    }
    if (OP_KEYS.includes(key)) {
      e.preventDefault();
      // 先提交当前数字，避免 remount 丢失（blur 不会在 remount 时触发）
      const cur = (e.target as HTMLInputElement).value;
      if ((cur ?? '').trim() !== '') setParam1(r, formatNumberText(cur, decimalPlaces));
      if (groupCount <= 1) {
        addGroup();
        setColumnOperator(1, key as Operator);
      } else {
        setColumnOperator(1, key as Operator);
      }
      // 重渲染会使输入框 remount，焦点跳到新生成的运算组（g=1）的 param2
      focusCell(r, 1, 'param2');
    }
  };
  const onParam2KeyDown = (e: React.KeyboardEvent<HTMLInputElement>, r: number, g: number) => {
    const key = e.key;
    if (key === 'Enter') {
      e.preventDefault();
      goNextRowOrAdd(r, g, 'param2');
      return;
    }
    if (OP_KEYS.includes(key)) {
      e.preventDefault();
      // 先提交当前格的数字，再新增一个运算组并跳到其 param2
      const cur = (e.target as HTMLInputElement).value;
      if ((cur ?? '').trim() !== '') setParam2(r, g, formatNumberText(cur, decimalPlaces));
      const newG = groupCount; // 新增前的组数即新组索引
      addGroup();
      setColumnOperator(newG, key as Operator);
      focusCell(r, newG, 'param2');
      return;
    }
    if (constKeys(constants).includes(key)) {
      e.preventDefault();
      const grp = rows[r]?.groups[g];
      if (!grp || grp.isItem) return;
      if ((grp.param2 ?? '').trim() !== '') {
        addConstGroup(key);
        const newG = groupCount;
        setColumnConst(newG, key);
      } else {
        setColumnConst(g, key);
      }
      return;
    }
    if (key === 'c') {
      e.preventDefault();
      const grp = rows[r]?.groups[g];
      if (grp && !grp.isItem) {
        const toVar = grp.isConst;
        setColumnConst(g, toVar ? null : constKeys(constants)[0]);
        if (toVar) focusCell(r, g, 'param2'); // 切回变量列后还原焦点
      }
      return;
    }
  };

  return (
    <div className="grid-wrap">
      <table className="calc-table">
        <thead>
          <tr>
            <th className="calc-th rownum-col">#</th>
            {Array.from({ length: attrCount }).map((_, a) => (
              <th key={`ah-${a}`} className="calc-th attr-col">
                <input
                  className="calc-head-input"
                  value={attributeHeaders[a] ?? ''}
                  onChange={(e) => setAttributeHeader(a, e.target.value)}
                />
              </th>
            ))}
            <th className="calc-th">
              <input
                className="calc-head-input"
                value={headers[0]?.param1 ?? ''}
                onChange={(e) => setHeader(0, 'param1', e.target.value)}
              />
            </th>
            {Array.from({ length: groupCount }).map((_, g) =>
              g === 0 ? null : (
                <Fragment key={`ch-${g}`}>
                  <th className="calc-th op-col">
                    <div className="op-col__head">
                      <button
                        type="button"
                        className="calc-op-btn"
                        data-g={g}
                        data-f="operator"
                        title="点击切换运算符（加 减 乘 除），整列统一"
                        aria-label={`运算符：${OP_SYMBOLS[rows[0]?.groups[g]?.operator ?? '+']}`}
                        onClick={() => {
                          const cur = rows[0]?.groups[g]?.operator ?? '+';
                          setColumnOperator(g, cycleOperator(cur));
                        }}
                      >
                        <OperatorIcon op={rows[0]?.groups[g]?.operator ?? '+'} />
                      </button>
                      <ConstToggle g={g} rows={rows} constants={constants} setColumnConst={setColumnConst} />
                    </div>
                  </th>
                  <th className="calc-th">
                    <input
                      className="calc-head-input"
                      value={
                        rows[0]?.groups[g]?.isConst
                          ? constByKey(constants, rows[0]?.groups[g]?.constKey ?? '')?.name ?? ''
                          : headers[g]?.param2 ?? ''
                      }
                      disabled={rows[0]?.groups[g]?.isConst ?? false}
                      onChange={(e) => setHeader(g, 'param2', e.target.value)}
                    />
                  </th>
                  <th className="calc-th eq-col"><EqualsIcon /></th>
                  <th className="calc-th result-col">
                    <input
                      className="calc-head-input"
                      value={headers[g]?.result ?? ''}
                      onChange={(e) => setHeader(g, 'result', e.target.value)}
                    />
                  </th>
                </Fragment>
              )
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={row.id}>
              <td className="calc-td rownum-col">{r + 1}</td>
              {Array.from({ length: attrCount }).map((_, a) => (
                <EditableCell
                  key={`attr-${a}`}
                  value={row.attributes[a] ?? ''}
                  onCommit={(t) => setAttribute(r, a, t)}
                  tdClassName="attr-col attr-edit"
                  dataR={r}
                  dataG={a}
                  dataF="attr"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      goNextRowOrAdd(r, a, 'attr');
                    }
                  }}
                />
              ))}
              {row.groups.map((sg, g) => {
                const gr = output.rows[r]?.groups[g];
                return g === 0 ? (
                  <EditableCell
                    key={`${row.id}-${g}`}
                    value={sg.param1 ?? ''}
                    onCommit={(t) => setParam1(r, t)}
                    tdClassName="item-col num-edit"
                    inputTitle="点击编辑，输入运算符可加列"
                    onKeyDown={(e) => onParam1KeyDown(e, r)}
                    dataR={r}
                    dataG={0}
                    dataF="param1"
                  />
                ) : (
                  <Fragment key={`${row.id}-${g}`}>
                    <td className="calc-td op-col">
                      <span className="op-display"><OperatorIcon op={sg.operator} /></span>
                    </td>
                    {sg.isConst ? (
                      <td
                        className="calc-td opitem-col"
                        tabIndex={0}
                        data-r={r}
                        data-g={g}
                        data-f="param2"
                        title={`常量：${constByKey(constants, sg.constKey ?? '')?.name ?? ''}（${constByKey(constants, sg.constKey ?? '')?.value ?? ''}）；输入 c 切回变量列`}
                        onKeyDown={(e) => {
                          if (e.key === 'c') {
                            e.preventDefault();
                            setColumnConst(g, null);
                            focusCell(r, g, 'param2');
                          }
                        }}
                      >
                        <span className="const-display">
                          {constByKey(constants, sg.constKey ?? '')?.value ?? ''}
                        </span>
                      </td>
                    ) : (
                      <EditableCell
                        value={sg.param2}
                        onCommit={(t) => setParam2(r, g, t)}
                        tdClassName="opitem-col num-edit"
                        inputTitle="点击编辑；输入常量快捷键转常量列"
                        onKeyDown={(e) => onParam2KeyDown(e, r, g)}
                        dataR={r}
                        dataG={g}
                        dataF="param2"
                      />
                    )}
                    <td className="calc-td eq-col"><EqualsIcon /></td>
                    <td
                      className={
                        'calc-td result-col' +
                        (gr.result.kind === 'number' ? ' is-filled' : '') +
                        (gr.result.kind === 'error' ? ' cell-error' : '')
                      }
                      style={
                        gr.result.kind === 'error'
                          ? {}
                          : { backgroundColor: resultGreen(resultGroups.indexOf(g), resultGroups.length, gr.result.kind === 'number') }
                      }
                      title={gr.skipped ? '上游为空/错误，已跳过' : gr.result.kind === 'error' ? gr.result.message : ''}
                    >
                      {fmt(gr.result)}
                    </td>
                  </Fragment>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {attrCount > 0 && (
        <div className="group-stats">
          <div className="group-stats__title">分组统计</div>
          <div className="group-stats__tables">
            {statsGroups.map((g) => {
              const title = g === 0 ? headers[g]?.param1 || '数字' : headers[g]?.result || '结果';
              return (
                <div className="group-stats__table" key={`gt-${g}`}>
                  <div
                    className="group-stats__tabletitle"
                    style={g >= 1 ? { backgroundColor: resultGreen(resultGroups.indexOf(g), resultGroups.length, false) } : undefined}
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
                          <div className="group-stats__coltitle">{attributeHeaders[a] || '分组'}</div>
                          {[...byVal.entries()].map(([v, s]) => (
                            <div className="group-stats__row" key={v}>
                              <span className="group-stats__val">{v}</span>
                              <div className="group-stats__sums">
                                <div className="group-stats__sumitem">
                                  <span className="group-stats__sum">{fmt({ kind: 'number', value: s.total.toString() })}</span>
                                  <span className="group-stats__count">（{s.count}）</span>
                                </div>
                              </div>
                            </div>
                          ))}
                          {byVal.size === 0 && <div className="group-stats__empty">暂无分组数据</div>}
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

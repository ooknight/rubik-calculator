import { useState } from 'react';
import { useGridStore } from '../store/store';

export function Toolbar() {
  const addRow = useGridStore((s) => s.addRow);
  const removeRow = useGridStore((s) => s.removeRow);
  const addGroup = useGridStore((s) => s.addGroup);
  const removeGroup = useGridStore((s) => s.removeGroup);
  const addAttribute = useGridStore((s) => s.addAttribute);
  const removeAttribute = useGridStore((s) => s.removeAttribute);
  const decimalPlaces = useGridStore((s) => s.decimalPlaces);
  const setDecimalPlaces = useGridStore((s) => s.setDecimalPlaces);
  const constants = useGridStore((s) => s.constants);
  const addConst = useGridStore((s) => s.addConst);
  const updateConst = useGridStore((s) => s.updateConst);
  const removeConst = useGridStore((s) => s.removeConst);
  const rowCount = useGridStore((s) => s.rows.length);
  const groupCount = useGridStore((s) => s.rows[0]?.groups.length ?? 1);
  const attrCount = useGridStore((s) => s.rows[0]?.attributes.length ?? 0);

  const [showConst, setShowConst] = useState(false);

  const placesOptions = [
    { value: 0, label: '整数' },
    { value: 1, label: '1 位小数' },
    { value: 2, label: '2 位小数' },
    { value: 3, label: '3 位小数' },
    { value: 4, label: '4 位小数' },
  ];

  const handleAddConst = () => {
    // 快捷键取列表中第一个未占用的小写字母
    const used = new Set(constants.map((c) => c.key));
    let key = '';
    for (const ch of 'abcdefghijklmnopqrstuvwxyz') {
      if (!used.has(ch)) {
        key = ch;
        break;
      }
    }
    if (!key) return;
    addConst({ key, name: '新常量', value: 0 });
  };

  return (
    <div className="toolbar">
      <div className="toolbar__group">
        <button onClick={addRow} title="增加一行">＋ 行</button>
        <button onClick={removeRow} disabled={rowCount <= 1} title="删除最后一行">－ 行</button>
      </div>
      <div className="toolbar__group">
        <button onClick={addGroup} title="增加一项（运算符 + 项）">＋ 项</button>
        <button onClick={removeGroup} disabled={groupCount <= 1} title="删除最后一项">－ 项</button>
      </div>
      <div className="toolbar__group">
        <button onClick={addAttribute} title="增加一列分组（插在运算项之前）">＋ 分组</button>
        <button onClick={removeAttribute} disabled={attrCount <= 0} title="删除最后一列分组">－ 分组</button>
      </div>
      <div className="toolbar__group">
        <button onClick={() => setShowConst((v) => !v)} title="管理自定义常量（名称 / 值 / 快捷键）">
          常量{showConst ? ' ▲' : ' ▼'}
        </button>
      </div>
      <div className="toolbar__group toolbar__places">
        <label htmlFor="places">小数位</label>
        <select
          id="places"
          className="toolbar__select"
          value={decimalPlaces}
          onChange={(e) => setDecimalPlaces(Number(e.target.value))}
        >
          {placesOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {showConst && (
        <div className="const-panel">
          <div className="const-panel__head">
            <span>常量</span>
            <button className="const-panel__add" onClick={handleAddConst}>＋ 新增</button>
          </div>
          <div className="const-panel__list">
            {constants.length === 0 && <div className="const-panel__empty">暂无常量</div>}
            {constants.map((c) => (
              <div className="const-panel__row" key={c.key}>
                <input
                  className="const-panel__key"
                  value={c.key}
                  maxLength={1}
                  title="快捷键（单个字符，运算时在数字列按此键插入该常量）"
                  onChange={(e) => {
                    const v = e.target.value.trim().toLowerCase().slice(0, 1);
                    if (!v) return;
                    if (v !== c.key && constants.some((x) => x.key === v)) return; // 快捷键冲突忽略
                    updateConst(c.key, {}, v); // 仅重命名快捷键（newKey）
                  }}
                />
                <input
                  className="const-panel__name"
                  value={c.name}
                  placeholder="名称"
                  onChange={(e) => updateConst(c.key, { name: e.target.value })}
                />
                <input
                  className="const-panel__value"
                  type="number"
                  value={Number.isFinite(c.value) ? c.value : 0}
                  onChange={(e) => updateConst(c.key, { value: Number(e.target.value) })}
                />
                <button className="const-panel__del" title="删除该常量" onClick={() => removeConst(c.key)}>
                  删除
                </button>
              </div>
            ))}
          </div>
          <div className="const-panel__hint">
            用法：在数字列按运算符（* / 等）后，按常量快捷键即可插入该常量列；再按 <b>c</b> 可在数字列与常量列间切换。
          </div>
        </div>
      )}
    </div>
  );
}

import { useGridStore } from '../store/store';

export function Toolbar() {
  const addRow = useGridStore((s) => s.addRow);
  const removeRow = useGridStore((s) => s.removeRow);
  const addGroup = useGridStore((s) => s.addGroup);
  const removeGroup = useGridStore((s) => s.removeGroup);
  const addAttribute = useGridStore((s) => s.addAttribute);
  const removeAttribute = useGridStore((s) => s.removeAttribute);
  const rowCount = useGridStore((s) => s.rows.length);
  const groupCount = useGridStore((s) => s.rows[0]?.groups.length ?? 1);
  const attrCount = useGridStore((s) => s.rows[0]?.attributes.length ?? 0);
  const decimalPlaces = useGridStore((s) => s.decimalPlaces);
  const setDecimalPlaces = useGridStore((s) => s.setDecimalPlaces);

  const placesOptions = [
    { value: 0, label: '整数' },
    { value: 1, label: '1 位小数' },
    { value: 2, label: '2 位小数' },
    { value: 3, label: '3 位小数' },
    { value: 4, label: '4 位小数' },
  ];

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
    </div>
  );
}

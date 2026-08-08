import { useMemo } from 'react';
import { useGridStore } from './store/store';
import { computeGrid } from './core/engine';
import { deriveForCompute } from './store/derive';
import { Toolbar } from './components/Toolbar';
import { CalculatorGrid } from './components/CalculatorGrid';

export function App() {
  const rows = useGridStore((s) => s.rows);
  const constants = useGridStore((s) => s.constants);
  // 派生：把链式 param1 回填后做全量计算。结果随 rows / 常量变化重算。
  const output = useMemo(() => computeGrid(deriveForCompute(rows, constants)), [rows, constants]);

  return (
    <div className="app">
      <header className="app__header">
        <Toolbar />
      </header>
      <CalculatorGrid output={output} />
    </div>
  );
}

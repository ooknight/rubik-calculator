import { create } from 'zustand';
import { computeGrid } from '../core/engine';
import { ComputeOutput, Operator } from '../core/types';
import { deriveForCompute } from './derive';

const DEFAULT_ROWS = 1;
const DEFAULT_GROUPS = 1;

/** 存储单元：第 0 组为裸项（仅 param1），其余组为运算项（operator + param2） */
export interface StoredGroup {
  param1?: string; // 仅第 0 组（裸项）使用
  operator: Operator; // 仅第 g>0 组使用，默认 +
  param2: string; // 仅第 g>0 组使用
  isItem: boolean; // true 表示裸项（第 0 组）
}
export interface StoredRow {
  id: string;
  groups: StoredGroup[];
  attributes: string[]; // 分组属性列的值（每行一个，顺序排列在运算项之前）
}

let rowSeq = 0;
const rid = () => `r${++rowSeq}`;
const itemGroup = (): StoredGroup => ({ param1: '', operator: '+', param2: '', isItem: true });
const opGroup = (): StoredGroup => ({ operator: '+', param2: '', isItem: false });

function makeRow(groups: number, attrCount: number): StoredRow {
  return {
    id: rid(),
    groups: Array.from({ length: groups }, (_, i) => (i === 0 ? itemGroup() : opGroup())),
    attributes: Array.from({ length: attrCount }, () => ''),
  };
}

interface GridState {
  rows: StoredRow[];
  headers: GroupHeader[]; // 每组参数列名（参数1、参数2）
  attributeHeaders: string[]; // 分组属性列名（列级）
  decimalPlaces: number; // 结果显示小数位数：0=整数,1~4
  setHeader: (groupIdx: number, field: 'param1' | 'param2' | 'result', value: string) => void;
  setAttributeHeader: (attrIdx: number, value: string) => void;
  setDecimalPlaces: (places: number) => void;
  setOperator: (rowIdx: number, groupIdx: number, op: Operator) => void;
  setColumnOperator: (groupIdx: number, op: Operator) => void; // 整列（所有行同组）统一运算符
  setParam1: (rowIdx: number, value: string) => void;
  setParam2: (rowIdx: number, groupIdx: number, value: string) => void;
  setAttribute: (rowIdx: number, attrIdx: number, value: string) => void;
  addRow: () => void;
  removeRow: () => void;
  addGroup: () => void;
  removeGroup: () => void;
  addAttribute: () => void; // 在运算项前增加一列分组属性
  removeAttribute: () => void; // 删除最后一列分组属性
  compute: () => ComputeOutput;
}

export interface GroupHeader {
  param1: string;
  param2: string;
  result: string; // 结果列名（每组一列，可编辑）
}

const defaultHeader = (): GroupHeader => ({ param1: '数字1', param2: '数字2', result: '结果' });
const defaultAttrHeader = (idx: number): string => `分组${idx + 1}`;

export const useGridStore = create<GridState>((set, get) => ({
  rows: Array.from({ length: DEFAULT_ROWS }, () => makeRow(DEFAULT_GROUPS, 0)),
  headers: Array.from({ length: DEFAULT_GROUPS }, defaultHeader),
  attributeHeaders: [],
  decimalPlaces: 2,

  setHeader: (groupIdx, field, value) =>
    set((s) => ({
      headers: s.headers.map((h, i) => (i === groupIdx ? { ...h, [field]: value } : h)),
    })),

  setAttributeHeader: (attrIdx, value) =>
    set((s) => ({
      attributeHeaders: s.attributeHeaders.map((h, i) => (i === attrIdx ? value : h)),
    })),

  setDecimalPlaces: (places) => set({ decimalPlaces: places }),

  setOperator: (rowIdx, groupIdx, op) =>
    set((s) => {
      const rows = s.rows.map((r) => ({ ...r, groups: [...r.groups] }));
      rows[rowIdx].groups[groupIdx] = { ...rows[rowIdx].groups[groupIdx], operator: op };
      return { rows };
    }),

  // 整列（所有行的同一运算项组）统一设置运算符；裸项组（g=0）忽略
  setColumnOperator: (groupIdx, op) =>
    set((s) => ({
      rows: s.rows.map((r) => ({
        ...r,
        groups: r.groups.map((grp, j) =>
          j === groupIdx && !grp.isItem ? { ...grp, operator: op } : grp
        ),
      })),
    })),

  setParam1: (rowIdx, value) =>
    set((s) => {
      const rows = s.rows.map((r) => ({ ...r, groups: [...r.groups] }));
      const g0 = rows[rowIdx].groups[0];
      rows[rowIdx].groups[0] = { ...g0, param1: value };
      return { rows };
    }),

  setParam2: (rowIdx, groupIdx, value) =>
    set((s) => {
      const rows = s.rows.map((r) => ({ ...r, groups: [...r.groups] }));
      const grp = rows[rowIdx].groups[groupIdx];
      if (grp.isItem) return s; // 裸项无 param2
      rows[rowIdx].groups[groupIdx] = { ...grp, param2: value };
      return { rows };
    }),

  setAttribute: (rowIdx, attrIdx, value) =>
    set((s) => {
      const rows = s.rows.map((r) => ({ ...r, attributes: [...r.attributes] }));
      rows[rowIdx].attributes[attrIdx] = value;
      return { rows };
    }),

  addRow: () =>
    set((s) => {
      const count = s.rows[0]?.groups.length ?? DEFAULT_GROUPS;
      const attrs = s.rows[0]?.attributes.length ?? 0;
      return { rows: [...s.rows, makeRow(count, attrs)] };
    }),

  removeRow: () => set((s) => (s.rows.length > 1 ? { rows: s.rows.slice(0, -1) } : s)),

  addGroup: () =>
    set((s) => ({
      rows: s.rows.map((r) => ({ ...r, groups: [...r.groups, opGroup()] })),
      headers: [...s.headers, defaultHeader()],
    })),

  removeGroup: () =>
    set((s) => {
      // 至少保留一个裸项（第 0 组）
      if ((s.rows[0]?.groups.length ?? 0) <= 1) return s;
      const rows = s.rows.map((r) => ({ ...r, groups: r.groups.slice(0, -1) }));
      const headers = s.headers.slice(0, -1);
      return { rows, headers };
    }),

  // 分组属性列插在行号之后、项1之前（最左计算列）
  addAttribute: () =>
    set((s) => ({
      rows: s.rows.map((r) => ({ ...r, attributes: [...r.attributes, ''] })),
      attributeHeaders: [...s.attributeHeaders, defaultAttrHeader(s.attributeHeaders.length)],
    })),

  removeAttribute: () =>
    set((s) => {
      if ((s.attributeHeaders.length ?? 0) <= 0) return s;
      const rows = s.rows.map((r) => ({ ...r, attributes: r.attributes.slice(0, -1) }));
      const attributeHeaders = s.attributeHeaders.slice(0, -1);
      return { rows, attributeHeaders };
    }),

  compute: () => computeGrid(deriveForCompute(get().rows)),
}));

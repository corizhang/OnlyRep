import { useMemo } from 'react';
import { useRankStore } from '../store/useRankStore';
import { getVal, type CleanRow } from '../parser/clean';
import type { CellRaw, ColumnMeta } from '../types';

const TYPE_LABEL: Record<ColumnMeta['type'], string> = {
  number: '数值',
  percent: '百分比',
  date: '日期',
  text: '文本',
};

function cellText(c: CellRaw): string {
  if (c === null) return '';
  if (c instanceof Date) {
    return `${c.getFullYear()}-${String(c.getMonth() + 1).padStart(2, '0')}-${String(
      c.getDate(),
    ).padStart(2, '0')}`;
  }
  return String(c);
}

/**
 * 数据预览（R1-04/05/06/07/08）：表头行调整、排除行勾选、合计行开关、
 * 前 20 行预览 + 类型标注 + 脏数据黄色标注 + 清洗前后对照 + 统计。
 */
export default function DataPreview() {
  const rawTable = useRankStore((s) => s.rawTable);
  const cleaned = useRankStore((s) => s.cleaned);
  const excludedRowIdx = useRankStore((s) => s.excludedRowIdx);
  const excludeTotalKeywords = useRankStore((s) => s.excludeTotalKeywords);
  const setHeaderRow = useRankStore((s) => s.setHeaderRow);
  const toggleExcludeRow = useRankStore((s) => s.toggleExcludeRow);
  const setExcludeTotalKeywords = useRankStore((s) => s.setExcludeTotalKeywords);

  const dirtySet = useMemo(() => {
    const m = new Set<string>();
    if (!cleaned) return m;
    for (const [key, list] of Object.entries(cleaned.dirtyCells)) {
      for (const d of list) m.add(`${key}:${d.rowIdx}`);
    }
    return m;
  }, [cleaned]);

  const cleanedRowMap = useMemo(() => {
    const m = new Map<number, CleanRow>();
    if (!cleaned) return m;
    for (const r of cleaned.rows) m.set(r.__idx, r);
    return m;
  }, [cleaned]);

  if (!rawTable || !cleaned) return null;

  const h = rawTable.headerRowIndex;
  const header = rawTable.cells[h] ?? [];
  const dataRows = rawTable.cells.slice(h + 1, h + 21); // 前 20 行

  return (
    <div className="space-y-2 text-xs">
      {/* 表头行调整（R1-04） */}
      <div className="flex items-center gap-2 text-slate-600">
        <span>表头所在行</span>
        <input
          type="number"
          min={1}
          max={rawTable.cells.length}
          value={h + 1}
          onChange={(e) => {
            const v = Math.round(Number(e.target.value));
            if (Number.isFinite(v) && v >= 1 && v <= rawTable.cells.length) {
              setHeaderRow(v - 1);
            }
          }}
          className="w-16 rounded border border-slate-300 px-2 py-1"
        />
        <span className="text-slate-400">（第 N 行）</span>
      </div>

      {/* 合计行开关（R1-05） */}
      <label className="flex cursor-pointer items-center gap-2 text-slate-600">
        <input
          type="checkbox"
          checked={excludeTotalKeywords}
          onChange={(e) => setExcludeTotalKeywords(e.target.checked)}
        />
        排除「合计 / 总计 / 小计」行
      </label>

      {/* 统计（R1-08） */}
      <div className="rounded bg-slate-50 px-2 py-1 text-slate-500">
        总行数 {cleaned.totalRows} ｜ 有效行数 {cleaned.rows.length} ｜ 已排除 {cleaned.excludedCount} 行
      </div>

      {/* E2：有效行数为 0 */}
      {cleaned.rows.length === 0 && (
        <div className="rounded border border-red-300 bg-red-50 p-2 text-red-700">
          <div className="font-medium">未找到有效数据行，请检查排除规则</div>
          <div className="mt-0.5 text-red-600">有效行数为 0，可能误排除了全部数据</div>
          <button
            type="button"
            onClick={() => setExcludeTotalKeywords(false)}
            className="mt-1 rounded bg-red-600 px-2 py-1 font-medium text-white hover:bg-red-700"
          >
            放宽排除规则
          </button>
        </div>
      )}

      {/* 预览表格 */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr>
              <th className="w-8 border-b border-slate-200 px-1 py-1 font-normal text-slate-400">排</th>
              {rawTable.columns.map((col) => (
                <th
                  key={col.key}
                  className="border-b border-slate-200 px-1 py-1 font-medium text-slate-600"
                >
                  <div className="truncate" title={col.rawName}>
                    {col.rawName}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1 font-normal">
                    <span
                      className={`rounded px-1 ${
                        col.typeConfidence < 0.7
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {TYPE_LABEL[col.type]}
                      {col.typeConfidence < 0.7 ? '（疑似）' : ''}
                    </span>
                    {col.dirtyCount > 0 && (
                      <span
                        className="cursor-help rounded bg-amber-200 px-1 text-amber-800"
                        title={`${col.dirtyCount} 个值无法转为${TYPE_LABEL[col.type]}，已按缺失处理`}
                      >
                        脏 {col.dirtyCount}
                      </span>
                    )}
                    {col.missingCount > 0 && (
                      <span className="rounded bg-slate-100 px-1 text-slate-400">
                        缺失 {col.missingCount}
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dataRows.map((cells, i) => {
              const rowIdx = h + 1 + i;
              const excluded = excludedRowIdx.has(rowIdx);
              const rawName = String(header[i] ?? '').trim();
              return (
                <tr key={rowIdx} className={excluded ? 'opacity-40' : ''}>
                  <td className="px-1 py-0.5 align-top">
                    <input
                      type="checkbox"
                      checked={excluded}
                      onChange={() => toggleExcludeRow(rowIdx)}
                      title="勾选排除该行"
                    />
                  </td>
                  {rawTable.columns.map((col, c) => {
                    const raw = cellText(cells[c] ?? null);
                    const isDirty = dirtySet.has(`${col.key}:${rowIdx}`);
                    const cleanedVal = isDirty
                      ? (() => {
                          const row = cleanedRowMap.get(rowIdx);
                          if (!row) return '缺失';
                          const v = getVal(row, col.key);
                          return v === null ? '缺失' : String(v);
                        })()
                      : '';
                    return (
                      <td
                        key={col.key}
                        className={`max-w-[120px] truncate px-1 py-0.5 align-top ${
                          isDirty ? 'cursor-help bg-amber-100 text-amber-900' : 'text-slate-700'
                        }`}
                        title={
                          isDirty
                            ? `清洗前：${raw}（${rawName || col.rawName}）\n清洗后：${cleanedVal}`
                            : raw
                        }
                      >
                        {raw}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rawTable.cells.length - h - 1 > 20 && (
        <div className="text-slate-400">仅预览前 20 行，共 {rawTable.cells.length - h - 1} 行数据</div>
      )}
    </div>
  );
}

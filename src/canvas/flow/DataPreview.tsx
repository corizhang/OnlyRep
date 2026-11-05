import type { CleanedTable } from '../../parser/clean';
import { getVal } from '../../parser/clean';

/** 中间结果预览：任意表节点可展开看前 N 行，用来核对"这一步筛对没有" */
export default function DataPreview({ table, limit = 10 }: { table: CleanedTable; limit?: number }) {
  const rows = table.rows.slice(0, limit);
  const cols = table.columns;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11.5px] text-slate-500">
        <span>
          共 <b>{table.rows.length}</b> 行 × {cols.length} 列
        </span>
        {table.rows.length > limit && <span>仅预览前 {limit} 行</span>}
      </div>
      <div className="max-h-[280px] overflow-auto rounded border border-slate-200">
        <table className="w-full border-collapse text-[11.5px]">
          <thead className="sticky top-0 bg-slate-100">
            <tr>
              {cols.map((c) => (
                <th key={c.key} className="whitespace-nowrap border-b border-slate-200 px-1.5 py-1 text-left font-medium text-slate-600">
                  {c.rawName || c.key}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className={i % 2 ? 'bg-slate-50/70' : 'bg-white'}>
                {cols.map((c) => {
                  const v = getVal(r, c.key);
                  return (
                    <td key={c.key} className="whitespace-nowrap border-b border-slate-100 px-1.5 py-0.5 text-slate-700">
                      {v === null ? '' : typeof v === 'number' ? v.toLocaleString('zh-CN') : String(v)}
                    </td>
                  );
                })}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={Math.max(1, cols.length)} className="px-2 py-3 text-center text-slate-400">
                  没有数据行（可能是上一步筛选条件过严）
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

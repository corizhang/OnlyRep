import type { CleanedTable } from '../../parser/clean';
import { getVal } from '../../parser/clean';

/** 中间结果预览：任意表节点可展开看前 N 行，用来核对"这一步筛对没有" */
export default function DataPreview({ table, limit = 10 }: { table: CleanedTable; limit?: number }) {
  const rows = table.rows.slice(0, limit);
  const cols = table.columns;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11.5px] text-ink-dim">
        <span>
          共 <b>{table.rows.length}</b> 行 × {cols.length} 列
        </span>
        {table.rows.length > limit && <span>仅预览前 {limit} 行</span>}
      </div>
      <div className="max-h-[280px] overflow-auto rounded border border-line">
        <table className="w-full border-collapse text-[11.5px]">
          <thead className="sticky top-0 bg-hover">
            <tr>
              {cols.map((c) => (
                <th key={c.key} className="whitespace-nowrap border-b border-line px-1.5 py-1 text-left font-medium text-ink-dim">
                  {c.rawName || c.key}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className={i % 2 ? 'bg-soft/70' : 'bg-panel'}>
                {cols.map((c) => {
                  const v = getVal(r, c.key);
                  return (
                    <td key={c.key} className="whitespace-nowrap border-b border-line px-1.5 py-0.5 text-ink">
                      {v === null ? '' : typeof v === 'number' ? v.toLocaleString('zh-CN') : String(v)}
                    </td>
                  );
                })}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={Math.max(1, cols.length)} className="px-2 py-3 text-center text-ink-faint">
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

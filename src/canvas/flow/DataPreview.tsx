import type { CleanedTable } from '../../parser/clean';
import { getVal } from '../../parser/clean';

function formatPreviewValue(value: unknown, column: CleanedTable['columns'][number]): string {
  if (value === null || value === undefined) return '';
  const raw = String(value);
  const dateLike = column.type === 'date' || /日期|时间|date|time/i.test(column.rawName);
  if (dateLike && /^\d{8}$/.test(raw)) {
    const year = Number(raw.slice(0, 4));
    const month = Number(raw.slice(4, 6));
    const day = Number(raw.slice(6, 8));
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day) {
      return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
    }
  }
  if (typeof value === 'number' && column.type !== 'date' && !dateLike) return value.toLocaleString('zh-CN');
  return raw;
}

/** 中间结果预览：任意表节点可展开看前 N 行，用来核对"这一步筛对没有" */
export default function DataPreview({
  table,
  limit = 10,
  onCellEdit,
}: {
  table: CleanedTable;
  limit?: number;
  /** 提供后单元格可双击编辑（修数节点的定点编辑入口） */
  onCellEdit?: (rowIdx: number, colKey: string, current: string) => void;
}) {
  const rows = table.rows.slice(0, limit);
  const cols = table.columns;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11.5px] text-ink-dim">
        {onCellEdit && <span className="text-brand">✎ 双击单元格可直接修改</span>}
        <span>
          共 <b>{table.rows.length}</b> 行 × {cols.length} 列
        </span>
        {table.rows.length > limit && <span>仅预览前 {limit} 行</span>}
      </div>
      <div className="max-h-[280px] overflow-auto rounded border border-line">
        <table className="w-full border-collapse text-[12px] tabular-nums">
          <thead className="sticky top-0 z-10 bg-soft">
            <tr>
              {cols.map((c) => (
                <th key={c.key} className="whitespace-nowrap border-b border-line px-2 py-2 text-left font-medium text-ink-dim">
                  {c.rawName || c.key}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className={i % 2 ? 'bg-soft hover:bg-hover' : 'bg-panel hover:bg-hover'}>
                {cols.map((c) => {
                  const v = getVal(r, c.key);
                  const raw = formatPreviewValue(v, c);
                  return (
                    <td
                      key={c.key}
                      className={`whitespace-nowrap border-b border-line px-2 py-1.5 text-ink ${onCellEdit ? 'cursor-text hover:bg-brand-soft/60' : ''}`}
                      title={onCellEdit ? '双击修改此格' : undefined}
                      onDoubleClick={onCellEdit ? () => onCellEdit(r.__idx, c.key, raw) : undefined}
                    >
                      {raw}
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

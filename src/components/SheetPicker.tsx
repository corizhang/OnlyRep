import { useRankStore } from '../store/useRankStore';

/** 多 Sheet 列表选择（R1-03）：名称 + 行×列；单 Sheet 时隐藏 */
export default function SheetPicker() {
  const rawTable = useRankStore((s) => s.rawTable);
  const selectSheet = useRankStore((s) => s.selectSheet);
  if (!rawTable || rawTable.sheets.length < 2) return null;

  return (
    <div className="space-y-1">
      {rawTable.sheets.map((sh) => {
        const active = sh.name === rawTable.sheetName;
        return (
          <button
            key={sh.name}
            type="button"
            onClick={() => void selectSheet(sh.name)}
            className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm ${
              active
                ? 'border-brand bg-brand-soft font-medium text-brand'
                : 'border-line bg-panel text-ink-dim hover:border-brand-line'
            }`}
          >
            <span className="truncate">{sh.name}</span>
            <span className="ml-2 shrink-0 text-xs text-ink-faint">
              {sh.rows} 行 × {sh.cols} 列
            </span>
          </button>
        );
      })}
    </div>
  );
}

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
                ? 'border-blue-500 bg-blue-50 font-medium text-blue-700'
                : 'border-slate-200 bg-white text-slate-600 hover:border-blue-300'
            }`}
          >
            <span className="truncate">{sh.name}</span>
            <span className="ml-2 shrink-0 text-xs text-slate-400">
              {sh.rows} 行 × {sh.cols} 列
            </span>
          </button>
        );
      })}
    </div>
  );
}

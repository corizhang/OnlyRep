import { useRankStore } from '../store/useRankStore';
import { TOP_N_CANDIDATES } from '../constants/defaults';
import type { AggMethod, TieStrategy } from '../types';

const AGG_LABEL: Record<AggMethod, string> = {
  sum: '求和',
  avg: '平均',
  count: '计数',
  countDistinct: '去重计数',
  max: '最大',
  min: '最小',
};

const TIE_LABEL: Record<TieStrategy, string> = {
  competition: '同值同名次（2,2,4）',
  ordinal: '严格顺序（2,3,4）',
  secondary: '按次要指标打破并列',
};

const btn = 'rounded border px-2 py-1 text-xs';
const btnOn = 'border-blue-500 bg-blue-50 font-medium text-blue-700';
const btnOff = 'border-slate-200 bg-white text-slate-600 hover:border-blue-300';

const TYPE_LABEL: Record<string, string> = {
  number: '数值',
  percent: '百分比',
  date: '日期',
  text: '文本',
};

/**
 * 排行规则（R2 系列）：必填仅 3 项（指标列/升降序/展示人数），其余折叠进「高级」。
 */
export default function RulePanel() {
  const config = useRankStore((s) => s.config);
  const patchConfig = useRankStore((s) => s.patchConfig);
  const resetConfig = useRankStore((s) => s.resetConfig);
  const rawTable = useRankStore((s) => s.rawTable);

  if (!rawTable) return null;
  const columns = rawTable.columns;
  const numericCols = columns.filter((c) => c.type === 'number' || c.type === 'percent');
  const textCols = columns.filter((c) => c.type === 'text' || c.type === 'date');

  return (
    <div className="space-y-3 text-xs">
      {/* ① 指标列（R2-02） */}
      <label className="block">
        <span className="mb-1 block font-medium text-slate-600">指标列</span>
        <select
          value={config.metricKey}
          onChange={(e) => patchConfig({ metricKey: e.target.value })}
          className="w-full rounded border border-slate-300 px-2 py-1"
        >
          <option value="">请选择</option>
          {numericCols.map((c) => (
            <option key={c.key} value={c.key}>
              {c.rawName}
              {c.unitHint ? `（${c.unitHint}）` : ''}
            </option>
          ))}
        </select>
      </label>

      {/* ② 名称列（R3-04，用户明确确认；默认自动取第一个文本列，可选任意列——含员工号等数字列） */}
      <label className="block">
        <span className="mb-1 block font-medium text-slate-600">名称列（榜单显示谁）</span>
        <select
          value={config.nameKey}
          onChange={(e) => patchConfig({ nameKey: e.target.value })}
          className="w-full rounded border border-slate-300 px-2 py-1"
        >
          <option value="">自动（第一个文本列）</option>
          {columns.map((c) => (
            <option key={c.key} value={c.key}>
              {c.rawName}（{TYPE_LABEL[c.type] ?? c.type}）
            </option>
          ))}
        </select>
      </label>

      {/* ③ 排序方向（R2-03） */}
      <div>
        <span className="mb-1 block font-medium text-slate-600">排序方向</span>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => patchConfig({ sortDirection: 'desc' })}
            className={`${btn} ${config.sortDirection === 'desc' ? btnOn : btnOff}`}
          >
            降序（值大在前）
          </button>
          <button
            type="button"
            onClick={() => patchConfig({ sortDirection: 'asc' })}
            className={`${btn} ${config.sortDirection === 'asc' ? btnOn : btnOff}`}
          >
            升序（值小在前）
          </button>
        </div>
      </div>

      {/* ③ 展示人数（R2-08） */}
      <div>
        <span className="mb-1 block font-medium text-slate-600">展示人数</span>
        <div className="flex flex-wrap items-center gap-1">
          {TOP_N_CANDIDATES.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => patchConfig({ topN: n })}
              className={`${btn} ${config.topN === n ? btnOn : btnOff}`}
            >
              {n}
            </button>
          ))}
          <input
            type="number"
            min={1}
            max={200}
            value={config.topN}
            onChange={(e) => {
              const v = Math.round(Number(e.target.value));
              if (Number.isFinite(v)) patchConfig({ topN: Math.min(200, Math.max(1, v)) });
            }}
            className="w-16 rounded border border-slate-300 px-2 py-1"
            title="自定义（1~200）"
          />
        </div>
      </div>

      {/* 模式切换（R2-01） */}
      <div>
        <span className="mb-1 block font-medium text-slate-600">排行模式</span>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => patchConfig({ mode: 'direct' })}
            className={`${btn} ${config.mode === 'direct' ? btnOn : btnOff}`}
          >
            直接排序
          </button>
          <button
            type="button"
            onClick={() => patchConfig({ mode: 'grouped' })}
            className={`${btn} ${config.mode === 'grouped' ? btnOn : btnOff}`}
          >
            分组聚合
          </button>
        </div>
      </div>

      {config.mode === 'grouped' && (
        <>
          <label className="block">
            <span className="mb-1 block font-medium text-slate-600">分组维度列</span>
            <select
              value={config.dimensionKey}
              onChange={(e) => patchConfig({ dimensionKey: e.target.value })}
              className="w-full rounded border border-slate-300 px-2 py-1"
            >
              <option value="">请选择</option>
              {textCols.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.rawName}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block font-medium text-slate-600">聚合方式</span>
            <select
              value={config.aggMethod}
              onChange={(e) => patchConfig({ aggMethod: e.target.value as AggMethod })}
              className="w-full rounded border border-slate-300 px-2 py-1"
            >
              {(Object.keys(AGG_LABEL) as AggMethod[]).map((m) => (
                <option key={m} value={m}>
                  {AGG_LABEL[m]}
                </option>
              ))}
            </select>
          </label>
        </>
      )}

      {/* 高级设置（渐进式配置，PRD 原则 2） */}
      <details className="rounded border border-slate-200 bg-slate-50 p-2">
        <summary className="cursor-pointer font-medium text-slate-600">高级设置</summary>
        <div className="mt-2 space-y-3">
          {/* 并列策略（R2-07） */}
          <div>
            <span className="mb-1 block font-medium text-slate-600">并列名次策略</span>
            <div className="space-y-1">
              {(Object.keys(TIE_LABEL) as TieStrategy[]).map((t) => (
                <label key={t} className="flex cursor-pointer items-center gap-2">
                  <input
                    type="radio"
                    name="tieStrategy"
                    checked={config.tieStrategy === t}
                    onChange={() => patchConfig({ tieStrategy: t })}
                  />
                  {TIE_LABEL[t]}
                </label>
              ))}
            </div>
            {config.tieStrategy === 'secondary' && (
              <select
                value={config.secondarySortKey}
                onChange={(e) => patchConfig({ secondarySortKey: e.target.value })}
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1"
              >
                <option value="">选择次要排序列</option>
                {columns.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.rawName}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* 展示人数编号注释顺延：③名称列已在上方；此处为 ④ 过滤（R2-06） */}          {/* 过滤（R2-06） */}
          <div>
            <span className="mb-1 block font-medium text-slate-600">过滤条件</span>
            <div className="flex items-center gap-2">
              <span className="text-slate-500">最少样本数</span>
              <input
                type="number"
                min={1}
                value={config.filters.minSamples}
                onChange={(e) => {
                  const v = Math.round(Number(e.target.value));
                  if (Number.isFinite(v) && v >= 1) {
                    patchConfig({ filters: { ...config.filters, minSamples: v } });
                  }
                }}
                className="w-16 rounded border border-slate-300 px-2 py-1"
              />
              <span className="text-slate-500">最小值</span>
              <input
                type="number"
                value={config.filters.minValue ?? ''}
                onChange={(e) => {
                  const raw = e.target.value.trim();
                  patchConfig({
                    filters: { ...config.filters, minValue: raw === '' ? null : Number(raw) },
                  });
                }}
                placeholder="不启用"
                className="w-20 rounded border border-slate-300 px-2 py-1"
              />
            </div>
            <div className="mt-1 text-slate-400">最少样本数仅分组聚合模式生效</div>
          </div>

          {/* 「其他」合并（R2-08） */}
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={config.showOthers}
              onChange={(e) => patchConfig({ showOthers: e.target.checked })}
            />
            TopN 外合并为「其他」行
          </label>

          <button
            type="button"
            onClick={resetConfig}
            className="rounded border border-slate-300 bg-white px-2 py-1 text-slate-500 hover:border-red-300 hover:text-red-600"
          >
            恢复默认配置
          </button>
        </div>
      </details>
    </div>
  );
}

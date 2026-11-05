import { useEffect, useRef, useState } from 'react';
import { useCanvasStore } from '../../store/useCanvasStore';
import { supportsFileSystemAccess } from '../datasource/sourceCache';
import { AGG_LABELS, NODE_TYPE_LABELS } from './NodeFields';
import FormulaInput, { useFormulaVariables } from '../formula/FormulaInput';
import { ManualEditor } from '../components/DataSourcePanel';
import { getVal } from '../../parser/clean';
import { NODE_W } from './layout';
import type { AggMethod, ConstantDataSource, DataSource, FormDataSource, ImportDataSource, NodeOutput, PipelineNode, SourceRuntime } from '../types';

/**
 * ComfyUI 风格节点卡片（数据节点视图）：
 * - 深色外壳，头部为拖拽手柄 + 类型徽标 + 名称
 * - 配置项直接内嵌在节点体内（原右侧属性栏的表单下沉到节点）
 * - 底部固定「结果预览」区：表格前几行 / 数值 / 错误信息
 * - 高度随内容自适应，经 onHeight 上报给 FlowSheet 用于连线与布局
 * - 交互规则：表单控件区域不触发节点拖拽（可正常输入），其余区域按住拖动
 */

interface FlowNodeCardProps {
  node: PipelineNode;
  output: NodeOutput | undefined;
  srcDef?: DataSource;
  srcRt?: SourceRuntime;
  x: number;
  y: number;
  selected: boolean;
  dragging: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
  onHeight: (id: string, h: number) => void;
}

/** 类型徽标配色 */
function accentOf(node: PipelineNode, bad: boolean): string {
  if (bad) return 'bg-red-500/90 text-white';
  if (node.type === 'source') return 'bg-blue-500/90 text-white';
  if (node.type === 'scalarOut' || node.type === 'formula') return 'bg-emerald-500/90 text-white';
  return 'bg-slate-500/70 text-slate-100';
}

// ---- 深色紧凑控件（仅节点内使用；画布内日报组件无关） ----

const CTR =
  'w-full min-w-0 rounded border border-[#46536a] bg-[#333d4e] px-1.5 py-[3px] text-[11px] leading-tight text-slate-200 outline-none focus:border-blue-500 disabled:opacity-50';

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[54px_1fr] items-center gap-1.5">
      <span className="truncate text-[10.5px] text-slate-400" title={label}>
        {label}
      </span>
      {children}
    </div>
  );
}

function DarkSelect({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
}) {
  const merged = placeholder !== undefined ? [{ value: '', label: placeholder }, ...options] : options;
  return (
    <select className={CTR} value={value} onChange={(e) => onChange(e.target.value)}>
      {merged.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function DarkInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <input className={CTR} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />;
}

function DarkNum({ value, min = 0, onChange }: { value: number; min?: number; onChange: (v: number) => void }) {
  return (
    <input
      type="number"
      className={CTR}
      value={Number.isFinite(value) ? value : 0}
      min={min}
      onChange={(e) => onChange(Math.max(min, Number(e.target.value) || 0))}
    />
  );
}

function DarkCheck({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-1.5 text-[10.5px] text-slate-300">
      <input type="checkbox" className="accent-blue-500" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

function DarkBtn({
  children,
  onClick,
  tone = 'default',
  title,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  tone?: 'default' | 'primary' | 'danger';
  title?: string;
  disabled?: boolean;
}) {
  const cls =
    tone === 'primary'
      ? 'border-blue-500/70 bg-blue-600/80 text-white hover:bg-blue-600'
      : tone === 'danger'
        ? 'border-red-500/50 bg-red-500/15 text-red-300 hover:bg-red-500/25'
        : 'border-[#46536a] bg-[#333d4e] text-slate-200 hover:bg-[#3d495c]';
  return (
    <button type="button" title={title} disabled={disabled} onClick={onClick} className={`rounded border px-2 py-[3px] text-[10.5px] transition-colors disabled:opacity-50 ${cls}`}>
      {children}
    </button>
  );
}

// ---- 数据源内嵌编辑器（深色紧凑版，逻辑与 DataSourcePanel 同一套 store 动作） ----

function ImportInline({ srcDef, srcRt }: { srcDef: ImportDataSource; srcRt?: SourceRuntime }) {
  const loadFileForSource = useCanvasStore((s) => s.loadFileForSource);
  const pickFileForSource = useCanvasStore((s) => s.pickFileForSource);
  const rereadSourceFile = useCanvasStore((s) => s.rereadSourceFile);
  const setSourceSheet = useCanvasStore((s) => s.setSourceSheet);
  const setSourceCacheEnabled = useCanvasStore((s) => s.setSourceCacheEnabled);
  const clearSourceCache = useCanvasStore((s) => s.clearSourceCache);
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const fsAccess = supportsFileSystemAccess();
  const cacheData = srcDef.cacheData !== false;
  const sheets = srcRt?.sheets ?? [];

  return (
    <div className="no-drag space-y-1.5">
      <input
        ref={ref}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          setBusy(true);
          await loadFileForSource(srcDef.id, f);
          setBusy(false);
          e.target.value = '';
        }}
      />
      <div className="flex gap-1.5">
        <DarkBtn
          tone="primary"
          disabled={busy}
          onClick={() => {
            if (fsAccess) {
              setBusy(true);
              void pickFileForSource(srcDef.id).finally(() => setBusy(false));
            } else {
              ref.current?.click();
            }
          }}
        >
          {busy ? '解析中…' : '⇪ 选择文件'}
        </DarkBtn>
        {srcRt?.hasHandle && (
          <DarkBtn
            disabled={busy}
            title="从磁盘重新读取已记住的文件（获取最新数据）"
            onClick={() => {
              setBusy(true);
              void rereadSourceFile(srcDef.id).finally(() => setBusy(false));
            }}
          >
            ↻ 重读文件
          </DarkBtn>
        )}
      </div>
      <div className="flex items-center justify-between gap-2">
        <DarkCheck checked={cacheData} label="自动恢复数据" onChange={(v) => setSourceCacheEnabled(srcDef.id, v)} />
        {cacheData && <DarkBtn onClick={() => void clearSourceCache(srcDef.id)} title="删除本地缓存的数据快照">清除缓存</DarkBtn>}
      </div>
      {sheets.length > 1 && (
        <FieldRow label="工作表">
          <DarkSelect value={srcDef.sheetName} options={sheets.map((s) => ({ value: s.name, label: s.name }))} onChange={(v) => void setSourceSheet(srcDef.id, v)} />
        </FieldRow>
      )}
      <p className="text-[10px] leading-snug text-slate-500">xlsx / csv 数据只在本地解析{fsAccess ? '，刷新后可一键重读' : ''}。</p>
    </div>
  );
}

function FormInline({ srcDef }: { srcDef: FormDataSource }) {
  const updateSource = useCanvasStore((s) => s.updateSource);
  const entries = srcDef.entries;
  return (
    <div className="no-drag space-y-1">
      {entries.map((e, i) => (
        <div key={i} className="flex gap-1">
          <input
            className="w-[42%] rounded border border-[#46536a] bg-[#333d4e] px-1 py-[3px] text-[10.5px] text-slate-200 outline-none focus:border-blue-500"
            value={e.key}
            placeholder="名称"
            onChange={(ev) => updateSource(srcDef.id, { entries: entries.map((x, j) => (j === i ? { ...x, key: ev.target.value } : x)) })}
          />
          <input
            className="min-w-0 flex-1 rounded border border-[#46536a] bg-[#333d4e] px-1 py-[3px] text-[10.5px] text-slate-200 outline-none focus:border-blue-500"
            value={e.value}
            placeholder="数值"
            onChange={(ev) => updateSource(srcDef.id, { entries: entries.map((x, j) => (j === i ? { ...x, value: ev.target.value } : x)) })}
          />
          <button type="button" className="px-0.5 text-[11px] text-slate-500 hover:text-red-400" onClick={() => updateSource(srcDef.id, { entries: entries.filter((_, j) => j !== i) })}>
            ×
          </button>
        </div>
      ))}
      <DarkBtn onClick={() => updateSource(srcDef.id, { entries: [...entries, { key: '', value: '' }] })}>+ 添加参数</DarkBtn>
      <p className="text-[10px] leading-snug text-slate-500">参数名即公式变量名，如「已完成/全年目标」。</p>
    </div>
  );
}

function ConstantInline({ srcDef }: { srcDef: ConstantDataSource }) {
  const updateSource = useCanvasStore((s) => s.updateSource);
  return (
    <div className="no-drag">
      <FieldRow label="常量值">
        <DarkInput value={srcDef.value} onChange={(v) => updateSource(srcDef.id, { value: v })} />
      </FieldRow>
    </div>
  );
}

// ---- 处理节点内嵌配置（与 NodeFields 同一套字段逻辑，深色紧凑版） ----

function StepFields({ node }: { node: PipelineNode }) {
  const updateNode = useCanvasStore((s) => s.updateNode);
  const outputs = useCanvasStore((s) => s.outputs);
  const set = (patch: Partial<PipelineNode>): void => updateNode(node.id, patch);
  const setParam = (patch: Record<string, unknown>): void => set({ params: { ...node.params, ...patch } });

  const upOutput = node.inputs[0] ? outputs[node.inputs[0]] : undefined;
  const cols = upOutput && upOutput.kind === 'table' ? upOutput.table.columns.map((c) => ({ value: c.key, label: c.rawName || c.key })) : [];
  const rowColumns = cols.map((c) => ({ key: c.value, label: c.label }));
  const variables = useFormulaVariables(node.type === 'derive' ? rowColumns : undefined);
  const rowSample = upOutput && upOutput.kind === 'table' ? upOutput.table.rows[0] : undefined;

  if (node.type !== 'formula' && cols.length === 0) {
    return <p className="text-[10.5px] leading-snug text-amber-400/90">尚未连上表格节点：先把本节点接到数据源或上游表格之后，再配置列。</p>;
  }

  return (
    <div className="no-drag space-y-1.5">
      {node.type === 'filter' && (
        <>
          <FieldRow label="列"><DarkSelect value={String(node.params.col ?? '')} placeholder="选择列" options={cols} onChange={(v) => setParam({ col: v })} /></FieldRow>
          <FieldRow label="条件">
            <DarkSelect
              value={String(node.params.op ?? 'contains')}
              options={[
                { value: 'contains', label: '包含' },
                { value: 'eq', label: '等于' },
                { value: 'ne', label: '不等于' },
                { value: 'gt', label: '大于' },
                { value: 'gte', label: '大于等于' },
                { value: 'lt', label: '小于' },
                { value: 'lte', label: '小于等于' },
                { value: 'notEmpty', label: '非空' },
                { value: 'empty', label: '为空' },
              ]}
              onChange={(v) => setParam({ op: v })}
            />
          </FieldRow>
          <FieldRow label="值"><DarkInput value={String(node.params.value ?? '')} onChange={(v) => setParam({ value: v })} /></FieldRow>
        </>
      )}

      {node.type === 'pickRows' && (
        <>
          <FieldRow label="取行">
            <DarkSelect
              value={String(node.params.mode ?? 'latestDate')}
              options={[
                { value: 'latestDate', label: '最新日期全部行' },
                { value: 'firstN', label: '前 N 行' },
                { value: 'lastN', label: '后 N 行' },
                { value: 'all', label: '全部行' },
              ]}
              onChange={(v) => setParam({ mode: v })}
            />
          </FieldRow>
          <FieldRow label="日期列"><DarkSelect value={String(node.params.dateCol ?? '')} placeholder="选择列" options={cols} onChange={(v) => setParam({ dateCol: v })} /></FieldRow>
          {node.params.mode === 'firstN' || node.params.mode === 'lastN' ? (
            <FieldRow label="N"><DarkNum value={Number(node.params.n ?? 1)} min={1} onChange={(v) => setParam({ n: v })} /></FieldRow>
          ) : null}
        </>
      )}

      {node.type === 'sortTopN' && (
        <>
          <FieldRow label="排序列"><DarkSelect value={String(node.params.col ?? '')} placeholder="选择列" options={cols} onChange={(v) => setParam({ col: v })} /></FieldRow>
          <FieldRow label="方向">
            <DarkSelect
              value={String(node.params.dir ?? 'desc')}
              options={[
                { value: 'desc', label: '降序' },
                { value: 'asc', label: '升序' },
              ]}
              onChange={(v) => setParam({ dir: v })}
            />
          </FieldRow>
          <FieldRow label="前 N 行"><DarkNum value={Number(node.params.n ?? 0)} min={0} onChange={(v) => setParam({ n: v })} /></FieldRow>
          <DarkCheck checked={node.params.asDate === true} label="按日期排序" onChange={(v) => setParam({ asDate: v })} />
        </>
      )}

      {node.type === 'derive' && (
        <>
          <FieldRow label="新列名"><DarkInput value={String(node.params.name ?? '')} onChange={(v) => setParam({ name: v })} /></FieldRow>
          <FieldRow label="行公式">
            <FormulaInput value={String(node.params.expr ?? '')} onChange={(v) => setParam({ expr: v })} variables={variables} rowSample={rowSample as Record<string, unknown> | undefined} />
          </FieldRow>
        </>
      )}

      {node.type === 'groupAgg' && (
        <>
          <FieldRow label="分组列"><DarkSelect value={String(node.params.groupCol ?? '')} placeholder="选择列" options={cols} onChange={(v) => setParam({ groupCol: v })} /></FieldRow>
          <AggInline node={node} cols={cols} />
        </>
      )}

      {node.type === 'scalarOut' && (
        <>
          <FieldRow label="取数列"><DarkSelect value={String(node.params.col ?? '')} placeholder="选择列" options={cols} onChange={(v) => setParam({ col: v })} /></FieldRow>
          <FieldRow label="聚合">
            <DarkSelect
              value={String(node.params.method ?? 'sum')}
              options={(Object.keys(AGG_LABELS) as AggMethod[]).map((m) => ({ value: m, label: AGG_LABELS[m] }))}
              onChange={(v) => setParam({ method: v })}
            />
          </FieldRow>
        </>
      )}

      {node.type === 'formula' && (
        <FieldRow label="公式">
          <FormulaInput value={String(node.params.expr ?? '')} onChange={(v) => setParam({ expr: v })} variables={variables} />
        </FieldRow>
      )}
    </div>
  );
}

function AggInline({ node, cols }: { node: PipelineNode; cols: { value: string; label: string }[] }) {
  const updateNode = useCanvasStore((s) => s.updateNode);
  const aggs = Array.isArray(node.params.aggs) ? (node.params.aggs as { col: string; method: AggMethod; as: string }[]) : [];
  const set = (next: typeof aggs): void => updateNode(node.id, { params: { ...node.params, aggs: next } });

  return (
    <div className="space-y-1">
      <span className="text-[10.5px] text-slate-400">聚合列</span>
      {aggs.map((a, i) => (
        <div key={i} className="flex gap-1">
          <select
            className="min-w-0 flex-1 rounded border border-[#46536a] bg-[#333d4e] px-1 py-[2px] text-[10.5px] text-slate-200 outline-none"
            value={a.col}
            onChange={(e) => set(aggs.map((x, j) => (j === i ? { ...x, col: e.target.value, as: x.as || e.target.value } : x)))}
          >
            <option value="">列</option>
            {cols.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          <select
            className="rounded border border-[#46536a] bg-[#333d4e] px-1 py-[2px] text-[10.5px] text-slate-200 outline-none"
            value={a.method}
            onChange={(e) => set(aggs.map((x, j) => (j === i ? { ...x, method: e.target.value as AggMethod } : x)))}
          >
            {(Object.keys(AGG_LABELS) as AggMethod[]).map((m) => (
              <option key={m} value={m}>
                {AGG_LABELS[m]}
              </option>
            ))}
          </select>
          <input
            className="w-14 rounded border border-[#46536a] bg-[#333d4e] px-1 py-[2px] text-[10.5px] text-slate-200 outline-none"
            value={a.as}
            placeholder="命名"
            onChange={(e) => set(aggs.map((x, j) => (j === i ? { ...x, as: e.target.value } : x)))}
          />
          <button type="button" className="text-[11px] text-slate-500 hover:text-red-400" onClick={() => set(aggs.filter((_, j) => j !== i))}>
            ×
          </button>
        </div>
      ))}
      <DarkBtn onClick={() => set([...aggs, { col: '', method: 'sum', as: '' }])}>+ 聚合列</DarkBtn>
    </div>
  );
}

// ---- 结果预览（节点底部） ----

function DarkPreview({ node, output, srcRt }: { node: PipelineNode; output: NodeOutput | undefined; srcRt?: SourceRuntime }) {
  if (output?.kind === 'error') {
    return <div className="text-[10.5px] leading-snug text-red-400">{output.message}</div>;
  }
  if (output?.kind === 'table') {
    const rows = output.table.rows.slice(0, 4);
    const cols = output.table.columns;
    return (
      <div>
        <div className="mb-1 text-[10px] text-slate-400">
          共 <b className="text-slate-300">{output.table.rows.length}</b> 行 × {cols.length} 列
          {output.table.rows.length > 4 && '（预览前 4 行）'}
        </div>
        <div className="max-h-[96px] overflow-auto rounded border border-[#3b4757] bg-[#222b39]">
          <table className="w-full border-collapse text-[10.5px]">
            <thead>
              <tr>
                {cols.map((c) => (
                  <th key={c.key} className="whitespace-nowrap border-b border-[#313c4d] px-1.5 py-0.5 text-left font-medium text-slate-300">
                    {c.rawName || c.key}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  {cols.map((c) => {
                    const v = getVal(r, c.key);
                    return (
                      <td key={c.key} className="max-w-[110px] truncate whitespace-nowrap border-b border-[#2b3546] px-1.5 py-0.5 text-slate-200">
                        {v === null ? '' : typeof v === 'number' ? v.toLocaleString('zh-CN') : String(v)}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={Math.max(1, cols.length)} className="px-2 py-2 text-center text-slate-500">
                    没有数据行（可能是筛选条件过严）
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }
  if (output?.kind === 'scalar') {
    return (
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10px] text-slate-400">结果</span>
        <span className="text-[16px] font-semibold text-emerald-400">{output.value === null ? '空值' : output.value.toLocaleString('zh-CN')}</span>
      </div>
    );
  }
  if (output?.kind === 'scalars') {
    const list = Object.entries(output.values);
    return (
      <div className="space-y-0.5">
        <div className="text-[10px] text-slate-400">{list.length} 个参数</div>
        {list.slice(0, 4).map(([k, v]) => (
          <div key={k} className="flex justify-between gap-2 text-[10.5px]">
            <span className="truncate text-slate-400">{k}</span>
            <span className="font-medium text-slate-200">{String(v ?? '')}</span>
          </div>
        ))}
      </div>
    );
  }
  // 未执行：数据源给导入状态提示
  if (node.type === 'source' && srcRt?.status === 'error') {
    return <div className="text-[10.5px] text-red-400">{srcRt.message}</div>;
  }
  if (node.type === 'source' && srcRt?.status !== 'ready') {
    return <div className="text-[10.5px] text-amber-400/90">待选择文件</div>;
  }
  return <div className="text-[10.5px] text-slate-500">未执行</div>;
}

// ---- 节点卡片主体 ----

export default function FlowNodeCard({ node, output, srcDef, srcRt, x, y, selected, dragging, onPointerDown, onHeight }: FlowNodeCardProps) {
  const ref = useRef<HTMLDivElement>(null);

  // 高度自适应：上报给 FlowSheet 供连线锚点与自动布局使用
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => onHeight(node.id, el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [node.id, onHeight]);

  /** 表单控件区域不触发节点拖拽 */
  const onShellDown = (e: React.PointerEvent): void => {
    const t = e.target as HTMLElement | null;
    if (t?.closest('input, textarea, select, button, a, label, .ant-select, .ant-collapse, .no-drag')) {
      e.stopPropagation();
      return;
    }
    onPointerDown(e);
  };

  const bad = output?.kind === 'error';

  return (
    <div
      ref={ref}
      onPointerDown={onShellDown}
      style={{ left: x, top: y, width: NODE_W }}
      className={`absolute cursor-grab select-none overflow-visible rounded-lg border bg-[#232b38] shadow-md transition-shadow ${
        selected ? 'border-blue-500 ring-2 ring-blue-500/60' : 'border-[#3a4557]'
      } ${bad && !selected ? 'border-red-500/70' : ''} ${dragging ? 'cursor-grabbing shadow-lg' : ''} ${node.enabled ? '' : 'opacity-60'}`}
    >
      {/* 头部：拖拽手柄 */}
      <div className="flex items-center gap-1.5 rounded-t-lg border-b border-black/40 bg-[#151b26] px-2 py-1.5">
        <span className={`rounded px-1 py-px text-[9px] leading-tight ${accentOf(node, bad)}`}>{NODE_TYPE_LABELS[node.type]}</span>
        <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-slate-100" title={node.name}>
          {node.name}
        </span>
        {node.inputs.length > 1 && <span className="text-[9px] text-slate-400">{node.inputs.length} 入</span>}
        {!node.enabled && <span className="text-[9px] text-amber-400/90">已停用</span>}
      </div>

      {/* 主体：内嵌配置项 */}
      <div className="space-y-2 px-2.5 py-2">
        {node.type === 'source' && srcDef ? (
          srcDef.kind === 'import' ? (
            <ImportInline srcDef={srcDef} srcRt={srcRt} />
          ) : srcDef.kind === 'form' ? (
            <FormInline srcDef={srcDef} />
          ) : srcDef.kind === 'constant' ? (
            <ConstantInline srcDef={srcDef} />
          ) : (
            <div className="no-drag rounded bg-white/95 p-1.5">
              <ManualEditor sourceId={srcDef.id} columns={srcDef.columns} rows={srcDef.rows} />
            </div>
          )
        ) : (
          <StepFields node={node} />
        )}
      </div>

      {/* 底部：结果预览 */}
      <div className="rounded-b-lg border-t border-black/40 bg-[#1a212d] px-2.5 py-1.5">
        <DarkPreview node={node} output={output} srcRt={srcRt} />
        {(node.type === 'scalarOut' || node.type === 'formula') && (
          <div className="mt-1 truncate text-[10px] text-slate-500">
            变量名 <code className="rounded bg-black/30 px-1 text-slate-400">{node.name}</code>
          </div>
        )}
      </div>
    </div>
  );
}

import { useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useCanvasStore } from '../../store/useCanvasStore';
import type {
  CanvasBlock,
  ChartConfig,
  ChartMetric,
  DataTableConfig,
  GoalProgressConfig,
  HighlightRule,
  KpiCardConfig,
  NumberFormat,
  RankBlockConfig,
  RowBlockConfig,
  TableColumnConfig,
  TextBlockConfig,
} from '../types';
import { createBlock, defaultNumberFormat } from '../defaults';
import { resolveTable } from '../binding/resolve';
import { useFormulaVariables } from '../formula/FormulaInput';
import { groupVariables } from '../formula/variableEnv';
import { matchQuery } from '../formula/pinyin';
import { insertVarIntoText } from '../formula/varInsert';
import { InputNumber } from 'antd';
import { DisconnectOutlined, LinkOutlined } from '@ant-design/icons';
import BindingPicker from './BindingPicker';
import { Btn, Check, ColorInput, Field, NumberInput, Section, Select, SliderBar, Textarea, TextInput } from './ui';

/** 选中区块的属性面板：所有数值槽位均可绑定（PRD R3-01） */
export default function BlockInspector({ block }: { block: CanvasBlock }) {
  const config = useCanvasStore((s) => s.config);
  const outputs = useCanvasStore((s) => s.outputs);
  const env = useCanvasStore((s) => s.env);
  const update = useCanvasStore((s) => s.updateBlock);
  const remove = useCanvasStore((s) => s.removeBlock);
  const move = useCanvasStore((s) => s.moveBlock);

  const tableNodes = config.pipeline.nodes.filter((n) => outputs[n.id]?.kind === 'table');
  const graphNodes = config.pipeline.nodes.map((n) => ({ id: n.id, name: n.name, type: n.type }));
  const tableOptions = tableNodes.map((n) => ({ value: n.id, label: `${n.name}（${rowsOf(outputs[n.id])}）` }));

  const currentTable = (() => {
    const cfg = block.config as { table?: { nodeRef: string } };
    if (!cfg.table?.nodeRef) return null;
    const res = resolveTable(cfg.table, { outputs, env, sources: config.dataSources });
    return 'table' in res ? res.table : null;
  })();
  const colOptions = (currentTable?.columns ?? []).map((c) => ({ value: c.key, label: c.rawName || c.key }));

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-slate-700">{typeName(block.type)}</span>
        <div className="ml-auto flex gap-1">
          {isTopLevel(config.blocks, block.id) && (
            <>
              <Btn size="xs" tone="ghost" onClick={() => move(block.id, -1)} title="上移">
                ↑
              </Btn>
              <Btn size="xs" tone="ghost" onClick={() => move(block.id, 1)} title="下移">
                ↓
              </Btn>
            </>
          )}
          <Btn size="xs" tone="danger" onClick={() => remove(block.id)}>
            删除
          </Btn>
        </div>
      </div>

      {block.type === 'text' && <TextInspector cfg={block.config} onChange={(p) => update(block.id, p)} />}

      {block.type === 'image' && <ImageInspector block={block} onChange={(p) => update(block.id, p)} />}

      {block.type === 'divider' && (
        <>
          <Field label="粗细">
            <NumberInput value={block.config.thickness} min={1} max={8} onChange={(v) => update(block.id, { thickness: v })} />
          </Field>
          <Field label="上下留白">
            <NumberInput value={block.config.marginY} min={0} max={64} onChange={(v) => update(block.id, { marginY: v })} />
          </Field>
          <Field label="颜色">
            <ColorInput value={block.config.customColor} onChange={(v) => update(block.id, { customColor: v, colorMode: v ? 'custom' : 'theme' })} />
          </Field>
        </>
      )}

      {block.type === 'kpiCard' && (
        <KpiInspector
          cfg={block.config}
          onChange={(p) => update(block.id, p)}
          sources={config.dataSources}
          graphNodes={graphNodes}
          outputs={outputs}
          env={env}
        />
      )}

      {block.type === 'goalProgress' && (
        <GoalInspector
          cfg={block.config}
          onChange={(p) => update(block.id, p)}
          sources={config.dataSources}
          graphNodes={graphNodes}
          outputs={outputs}
          env={env}
        />
      )}

      {block.type === 'chart' && (
        <ChartInspector
          cfg={block.config}
          onChange={(p) => update(block.id, p)}
          tableOptions={tableOptions}
          colOptions={colOptions}
          tableCols={currentTable?.columns.map((c) => c.key) ?? []}
        />
      )}

      {block.type === 'dataTable' && (
        <TableInspector
          cfg={block.config}
          onChange={(p) => update(block.id, p)}
          tableOptions={tableOptions}
          colOptions={colOptions}
          tableCols={currentTable?.columns.map((c) => ({ key: c.key, label: c.rawName || c.key })) ?? []}
        />
      )}

      {block.type === 'rankList' && (
        <RankInspector cfg={block.config} onChange={(p) => update(block.id, p)} tableOptions={tableOptions} colOptions={colOptions} />
      )}

      {block.type === 'row' && <RowInspector block={block} onChange={(p) => update(block.id, p)} />}

      <ShellInspector block={block} />
    </div>
  );
}

function rowsOf(out: unknown): string {
  const o = out as { kind?: string; table?: { rows: unknown[] } };
  return o?.kind === 'table' ? `${o.table?.rows.length ?? 0} 行` : '';
}

/** 是否为顶层区块（行容器子块的移动需先拖出行，隐藏上下移按钮） */
function isTopLevel(blocks: CanvasBlock[], id: string): boolean {
  return blocks.some((b) => b.id === id);
}

function typeName(t: CanvasBlock['type']): string {
  return {
    text: '文本',
    image: '图片',
    divider: '分隔线',
    kpiCard: 'KPI 指标卡',
    goalProgress: '目标完成率',
    chart: '图表',
    dataTable: '数据表格',
    rankList: '排行榜',
    row: '行容器',
  }[t];
}

// ---------- 文本 ----------
function TextInspector({ cfg, onChange }: { cfg: TextBlockConfig; onChange: (p: Partial<TextBlockConfig>) => void }) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const [showVars, setShowVars] = useState(false);
  const [query, setQuery] = useState('');
  const variables = useFormulaVariables();

  /** 在光标处插入变量：{{ 外插完整 {{变量}}，未闭合的 {{ 内只插裸名（上下文感知） */
  const insertVar = (name: string): void => {
    const ta = taRef.current;
    const content = cfg.content;
    let pos = content.length;
    let end = content.length;
    if (ta) {
      pos = ta.selectionStart ?? content.length;
      end = ta.selectionEnd ?? pos;
    }
    const res = insertVarIntoText(content, pos, end, name, 'template');
    onChange({ content: res.value });
    // 恢复焦点并把光标移到插入内容之后
    requestAnimationFrame(() => {
      if (ta) {
        ta.focus();
        ta.setSelectionRange(res.caret, res.caret);
      }
    });
  };

  /** 富文本：把选中文本用标记包裹；未选中则插入占位示例 */
  const wrapMark = (mark: string, placeholder: string): void => {
    const ta = taRef.current;
    const content = cfg.content;
    let s = content.length;
    let e = content.length;
    if (ta) {
      s = ta.selectionStart ?? s;
      e = ta.selectionEnd ?? s;
    }
    const sel = content.slice(s, e) || placeholder;
    const next = content.slice(0, s) + mark + sel + mark + content.slice(e);
    onChange({ content: next });
    requestAnimationFrame(() => {
      if (ta) {
        ta.focus();
        const innerStart = s + mark.length;
        ta.setSelectionRange(innerStart, innerStart + sel.length);
      }
    });
  };

  const q = query.trim().toLowerCase();
  const filtered = variables.filter(
    (v) => q === '' || v.name.toLowerCase().includes(q) || matchQuery(q, v.name) || (v.hint ?? '').toLowerCase().includes(q),
  );
  const grouped = groupVariables(filtered);

  return (
    <>
      <Field
        label="内容"
        hint="支持 {{表达式}}，格式后缀：|pct(1) 转百分比并保留 1 位、|num(2) 千分位+2 位、|text 原样；富文本：**加粗** ==高亮== ~~次要~~ !!涨色!! ??跌色??（可嵌套）"
      >
        <div className="mb-1 flex flex-wrap gap-1">
          {(
            [
              ['**', '粗体', 'B'],
              ['==', '高亮', '亮'],
              ['~~', '次要', '灰'],
              ['!!', '涨色', '涨'],
              ['??', '跌色', '跌'],
            ] as const
          ).map(([mark, title, label]) => (
            <button
              key={mark}
              type="button"
              title={`包裹选中文本：${mark}文字${mark}`}
              className="rounded border border-slate-300 px-1.5 py-0.5 text-[11.5px] text-slate-600 hover:border-blue-400 hover:text-blue-600"
              onClick={() => wrapMark(mark, title)}
            >
              {label}
            </button>
          ))}
        </div>
        <Textarea value={cfg.content} rows={4} onChange={(v) => onChange({ content: v })} inputRef={taRef} />
      </Field>
      <div>
        <Btn size="xs" onClick={() => setShowVars((s) => !s)}>
          ƒx 插入变量
        </Btn>
        {showVars && (
          <div className="mt-1.5 rounded border border-slate-200 bg-white p-2">
            <input
              className="mb-1.5 w-full rounded border border-slate-300 px-2 py-1 text-[12px]"
              placeholder="搜索变量（支持拼音首字母，如 wcl → 完成率）"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {grouped.length === 0 && <p className="text-[11.5px] text-slate-400">没有匹配的变量——先在数据源或管道中创建</p>}
            {grouped.map((g) => (
              <div key={g.group} className="mb-1.5">
                <p className="text-[11.5px] font-semibold text-slate-400">{g.group}</p>
                <div className="flex flex-wrap gap-1">
                  {g.items.map((v) => (
                    <button
                      key={v.name}
                      type="button"
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData('text/variable', v.name);
                        e.dataTransfer.effectAllowed = 'copy';
                      }}
                      title={v.value !== undefined ? `当前值：${String(v.value)}` : v.hint}
                      className="cursor-grab rounded bg-slate-100 px-1.5 py-0.5 text-[11.5px] text-slate-600 hover:bg-blue-100 hover:text-blue-700 active:cursor-grabbing"
                      onClick={() => insertVar(v.name)}
                    >
                      {v.name}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="角色">
          <Select
            value={cfg.role}
            options={[
              { value: 'title', label: '标题' },
              { value: 'subtitle', label: '小标题' },
              { value: 'body', label: '正文' },
              { value: 'note', label: '注释' },
              { value: 'signature', label: '落款' },
            ]}
            onChange={(v) => onChange({ role: v as TextBlockConfig['role'] })}
          />
        </Field>
        <Field label="字号倍数">
          <NumberInput value={cfg.fontSizeScale} min={0.5} max={3} step={0.05} onChange={(v) => onChange({ fontSizeScale: v })} />
        </Field>
        <Field label="对齐">
          <Select
            value={cfg.align}
            options={[
              { value: 'left', label: '左' },
              { value: 'center', label: '中' },
              { value: 'right', label: '右' },
            ]}
            onChange={(v) => onChange({ align: v as TextBlockConfig['align'] })}
          />
        </Field>
        <div className="flex items-end pb-1">
          <Check checked={cfg.bold} label="加粗" onChange={(v) => onChange({ bold: v })} />
        </div>
      </div>
      <Field label="颜色">
        <ColorInput value={cfg.customColor} onChange={(v) => onChange({ customColor: v, colorMode: v ? 'custom' : 'theme' })} />
      </Field>
    </>
  );
}

// ---------- 图片 ----------
function ImageInspector({ block, onChange }: { block: Extract<CanvasBlock, { type: 'image' }>; onChange: (p: Record<string, unknown>) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const cfg = block.config;
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          const reader = new FileReader();
          reader.onload = () => onChange({ src: String(reader.result) });
          reader.readAsDataURL(f);
          e.target.value = '';
        }}
      />
      <div className="flex gap-2">
        <Btn size="xs" tone="primary" onClick={() => ref.current?.click()}>
          上传图片
        </Btn>
        {cfg.src && (
          <Btn size="xs" tone="danger" onClick={() => onChange({ src: null })}>
            移除
          </Btn>
        )}
      </div>
      <Field label="宽度 %">
        <NumberInput value={cfg.widthPct} min={10} max={100} onChange={(v) => onChange({ widthPct: v })} />
      </Field>
      <Field label="对齐">
        <Select
          value={cfg.align}
          options={[
            { value: 'left', label: '左' },
            { value: 'center', label: '中' },
            { value: 'right', label: '右' },
          ]}
          onChange={(v) => onChange({ align: v })}
        />
      </Field>
      <Field label="圆角">
        <NumberInput value={cfg.borderRadius} min={0} max={48} onChange={(v) => onChange({ borderRadius: v })} />
      </Field>
      <p className="text-[11.5px] text-slate-400">图片会随模板保存，建议使用小图，避免模板体积过大。</p>
    </>
  );
}

// ---------- KPI ----------
function KpiInspector({
  cfg,
  onChange,
  sources,
  graphNodes,
  outputs,
  env,
}: {
  cfg: KpiCardConfig;
  onChange: (p: Partial<KpiCardConfig>) => void;
  sources: Parameters<typeof BindingPicker>[0]['sources'];
  graphNodes: { id: string; name: string; type: string }[];
  outputs: Parameters<typeof BindingPicker>[0]['outputs'];
  env: Parameters<typeof BindingPicker>[0]['env'];
}) {
  return (
    <>
      <Field label="指标名">
        <TextInput value={cfg.label} onChange={(v) => onChange({ label: v })} />
      </Field>
      <BindingPicker
        value={cfg.value}
        onChange={(b) => onChange({ value: b })}
        sources={sources}
        graphNodes={graphNodes}
        outputs={outputs}
        env={env}
      />
      <div className="grid grid-cols-2 gap-2">
        <Field label="单位">
          <TextInput value={cfg.unit} onChange={(v) => onChange({ unit: v })} />
        </Field>
        <Field label="小数位（auto=自动）">
          <Select
            value={String(cfg.format.decimals)}
            options={[
              { value: 'auto', label: '自动' },
              { value: '0', label: '0' },
              { value: '1', label: '1' },
              { value: '2', label: '2' },
            ]}
            onChange={(v) => onChange({ format: { ...cfg.format, decimals: v === 'auto' ? 'auto' : Number(v) } })}
          />
        </Field>
      </div>
      <div className="flex flex-wrap gap-3">
        <Check checked={cfg.format.thousands} label="千分位" onChange={(v) => onChange({ format: { ...cfg.format, thousands: v } })} />
        <Check checked={cfg.format.percent} label="百分比" onChange={(v) => onChange({ format: { ...cfg.format, percent: v } })} />
      </div>
      <Field label="注释行" hint="支持 {{表达式}}，格式后缀 |pct(1) / |num(2) 控制百分比与小数位；标记：**粗** ==亮== !!涨!! ??跌??">
        <Textarea value={cfg.note} rows={2} onChange={(v) => onChange({ note: v })} />
      </Field>
      <Field label="注释语气">
        <Select
          value={cfg.noteTone}
          options={[
            { value: 'secondary', label: '次要文字' },
            { value: 'rise', label: '涨（红）' },
            { value: 'fall', label: '跌（绿）' },
            { value: 'custom', label: '自定义' },
          ]}
          onChange={(v) => onChange({ noteTone: v as KpiCardConfig['noteTone'] })}
        />
      </Field>
      {cfg.noteTone === 'custom' && (
        <Field label="注释颜色">
          <ColorInput value={cfg.customNoteColor} onChange={(v) => onChange({ customNoteColor: v })} />
        </Field>
      )}
      <Field label="数值强调色">
        <ColorInput value={cfg.accent} onChange={(v) => onChange({ accent: v })} />
      </Field>
    </>
  );
}

// ---------- 目标进度 ----------
function GoalInspector({
  cfg,
  onChange,
  sources,
  graphNodes,
  outputs,
  env,
}: {
  cfg: GoalProgressConfig;
  onChange: (p: Partial<GoalProgressConfig>) => void;
  sources: Parameters<typeof BindingPicker>[0]['sources'];
  graphNodes: { id: string; name: string; type: string }[];
  outputs: Parameters<typeof BindingPicker>[0]['outputs'];
  env: Parameters<typeof BindingPicker>[0]['env'];
}) {
  return (
    <>
      <Field label="标题">
        <TextInput value={cfg.label} onChange={(v) => onChange({ label: v })} />
      </Field>
      <BindingPicker
        label="完成率绑定（0~1）"
        value={cfg.ratio}
        onChange={(b) => onChange({ ratio: b })}
        sources={sources}
        graphNodes={graphNodes}
        outputs={outputs}
        env={env}
      />
      <Field label="百分比小数位">
        <NumberInput value={cfg.decimals} min={0} max={2} onChange={(v) => onChange({ decimals: v })} />
      </Field>
      <Field label="第一行信息" hint="支持 {{表达式}}，格式后缀 |pct(1) / |num(2) 控制百分比与小数位；标记：**粗** ==亮== !!涨!! ??跌??">
        <Textarea value={cfg.metaLeft} rows={2} onChange={(v) => onChange({ metaLeft: v })} />
      </Field>
      <Field label="第二行信息" hint="同上：{{表达式}} + |pct(1) / |num(2) 后缀 + 富文本标记">
        <Textarea value={cfg.metaRight} rows={2} onChange={(v) => onChange({ metaRight: v })} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="进度条颜色">
          <ColorInput value={cfg.barColor} onChange={(v) => onChange({ barColor: v })} />
        </Field>
        <Field label="轨道颜色">
          <ColorInput value={cfg.trackColor} onChange={(v) => onChange({ trackColor: v })} />
        </Field>
      </div>
      <Check checked={cfg.showPct} label="显示大百分比" onChange={(v) => onChange({ showPct: v })} />
    </>
  );
}

// ---------- 图表 ----------
function ChartInspector({
  cfg,
  onChange,
  tableOptions,
  colOptions,
  tableCols,
}: {
  cfg: ChartConfig;
  onChange: (p: Partial<ChartConfig>) => void;
  tableOptions: { value: string; label: string }[];
  colOptions: { value: string; label: string }[];
  tableCols: string[];
}) {
  const metrics = cfg.metrics;
  const setMetrics = (next: ChartMetric[]) => onChange({ metrics: next });

  return (
    <>
      <Field label="标题">
        <TextInput value={cfg.title} onChange={(v) => onChange({ title: v })} />
      </Field>
      <Field label="表格数据">
        <Select value={cfg.table.nodeRef} placeholder="选择表格节点" options={tableOptions} onChange={(v) => onChange({ table: { nodeRef: v }, dimension: '', metrics: [] })} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="图表类型">
          <Select
            value={cfg.chartType}
            options={[
              { value: 'bar', label: '条形图' },
              { value: 'line', label: '折线图' },
              { value: 'pie', label: '环形图' },
              { value: 'gauge', label: '仪表盘' },
            ]}
            onChange={(v) => onChange({ chartType: v as ChartConfig['chartType'] })}
          />
        </Field>
        <Field label="维度列">
          <Select value={cfg.dimension} placeholder="选择列" options={colOptions} onChange={(v) => onChange({ dimension: v })} />
        </Field>
      </div>

      <div className="space-y-1">
        <span className="text-[12px] font-medium text-slate-500">数值列</span>
        {metrics.map((m, i) => (
          <div key={i} className="flex gap-1">
            <select
              className="min-w-0 flex-1 rounded border border-slate-300 px-1 py-0.5 text-[11.5px]"
              value={m.col}
              onChange={(e) => setMetrics(metrics.map((x, j) => (j === i ? { ...x, col: e.target.value, label: x.label || e.target.value } : x)))}
            >
              <option value="">列</option>
              {colOptions.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
            <input
              className="w-16 rounded border border-slate-300 px-1 py-0.5 text-[11.5px]"
              value={m.label}
              placeholder="图例名"
              onChange={(e) => setMetrics(metrics.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
            />
            <button type="button" className="text-slate-400 hover:text-red-500" onClick={() => setMetrics(metrics.filter((_, j) => j !== i))}>
              ×
            </button>
          </div>
        ))}
        <Btn size="xs" onClick={() => setMetrics([...metrics, { col: tableCols[0] ?? '', label: '', color: '' }])}>
          + 数值列
        </Btn>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Field label="排序依据">
          <Select
            value={cfg.sortBy}
            options={[
              { value: 'dimension', label: '维度（时间）' },
              { value: 'value', label: '数值' },
            ]}
            onChange={(v) => onChange({ sortBy: v as ChartConfig['sortBy'] })}
          />
        </Field>
        <Field label="方向">
          <Select
            value={cfg.sort}
            options={[
              { value: 'asc', label: '升序' },
              { value: 'desc', label: '降序' },
              { value: 'none', label: '原序' },
            ]}
            onChange={(v) => onChange({ sort: v as ChartConfig['sort'] })}
          />
        </Field>
        <Field label="行数上限（0=全部）">
          <NumberInput value={cfg.maxRows} min={0} onChange={(v) => onChange({ maxRows: v })} />
        </Field>
        <Field label="高度 px">
          <NumberInput value={cfg.height} min={80} max={800} onChange={(v) => onChange({ height: v })} />
        </Field>
      </div>

      <div className="flex flex-wrap gap-3">
        <Check checked={cfg.showValueLabel} label="数值标签" onChange={(v) => onChange({ showValueLabel: v })} />
        <Check checked={cfg.highlightLast} label="末位高亮" onChange={(v) => onChange({ highlightLast: v })} />
        <Check checked={cfg.horizontal} label="横向条形" onChange={(v) => onChange({ horizontal: v })} />
        <Check checked={cfg.showLegend} label="图例" onChange={(v) => onChange({ showLegend: v })} />
        <Check checked={cfg.showGrid} label="网格线" onChange={(v) => onChange({ showGrid: v })} />
      </div>
    </>
  );
}

// ---------- 表格 ----------
function TableInspector({
  cfg,
  onChange,
  tableOptions,
  colOptions,
  tableCols,
}: {
  cfg: DataTableConfig;
  onChange: (p: Partial<DataTableConfig>) => void;
  tableOptions: { value: string; label: string }[];
  colOptions: { value: string; label: string }[];
  tableCols: { key: string; label: string }[];
}) {
  const cols = cfg.columns;
  const setCols = (next: TableColumnConfig[]) => onChange({ columns: next });

  return (
    <>
      <Field label="标题（可空）">
        <TextInput value={cfg.title} onChange={(v) => onChange({ title: v })} />
      </Field>
      <Field label="表格数据">
        <Select value={cfg.table.nodeRef} placeholder="选择表格节点" options={tableOptions} onChange={(v) => onChange({ table: { nodeRef: v } })} />
      </Field>

      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-[12px] font-medium text-slate-500">列</span>
          {cols.length === 0 && (
            <Btn size="xs" onClick={() => setCols(tableCols.slice(0, 8).map((c) => ({ col: c.key, label: c.label, align: 'right', format: 'number', decimals: 'auto' })))}>
              用全部列
            </Btn>
          )}
        </div>
        {cols.map((c, i) => (
          <div key={i} className="rounded border border-slate-200 p-1.5">
            <div className="flex gap-1">
              <select
                className="min-w-0 flex-1 rounded border border-slate-300 px-1 py-0.5 text-[11.5px]"
                value={c.col}
                onChange={(e) => setCols(cols.map((x, j) => (j === i ? { ...x, col: e.target.value } : x)))}
              >
                <option value="">列</option>
                {colOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <input
                className="w-16 rounded border border-slate-300 px-1 py-0.5 text-[11.5px]"
                value={c.label}
                placeholder="表头"
                onChange={(e) => setCols(cols.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
              />
              <button type="button" className="text-slate-400 hover:text-red-500" onClick={() => setCols(cols.filter((_, j) => j !== i))}>
                ×
              </button>
            </div>
            <div className="mt-1 flex gap-1">
              <select
                className="rounded border border-slate-300 px-1 py-0.5 text-[11.5px]"
                value={c.format}
                onChange={(e) => setCols(cols.map((x, j) => (j === i ? { ...x, format: e.target.value as TableColumnConfig['format'] } : x)))}
              >
                <option value="text">文本</option>
                <option value="number">数值</option>
                <option value="percent">百分比</option>
                <option value="ratio">比率（两列）</option>
              </select>
              <select
                className="rounded border border-slate-300 px-1 py-0.5 text-[11.5px]"
                value={c.align}
                onChange={(e) => setCols(cols.map((x, j) => (j === i ? { ...x, align: e.target.value as TableColumnConfig['align'] } : x)))}
              >
                <option value="left">左</option>
                <option value="center">中</option>
                <option value="right">右</option>
              </select>
              {(c.format === 'ratio' || c.totalAgg === 'weighted') && (
                <>
                  <select
                    className="min-w-0 flex-1 rounded border border-slate-300 px-1 py-0.5 text-[11.5px]"
                    value={c.ratioNum ?? ''}
                    onChange={(e) => setCols(cols.map((x, j) => (j === i ? { ...x, ratioNum: e.target.value } : x)))}
                  >
                    <option value="">分子</option>
                    {colOptions.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <select
                    className="min-w-0 flex-1 rounded border border-slate-300 px-1 py-0.5 text-[11.5px]"
                    value={c.ratioDen ?? ''}
                    onChange={(e) => setCols(cols.map((x, j) => (j === i ? { ...x, ratioDen: e.target.value } : x)))}
                  >
                    <option value="">分母</option>
                    {colOptions.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </>
              )}
            </div>
            {cfg.totalRow && c.format !== 'text' && (
              <div className="mt-1 flex items-center gap-1">
                <span className="shrink-0 text-[11.5px] text-slate-400">合计</span>
                <select
                  className="min-w-0 flex-1 rounded border border-slate-300 px-1 py-0.5 text-[11.5px]"
                  value={c.totalAgg ?? 'auto'}
                  onChange={(e) =>
                    setCols(cols.map((x, j) => (j === i ? { ...x, totalAgg: e.target.value as TableColumnConfig['totalAgg'] } : x)))
                  }
                >
                  <option value="auto">智能（数值求和 / 百分比平均）</option>
                  <option value="sum">求和</option>
                  <option value="avg">平均</option>
                  {c.format === 'percent' && <option value="weighted">加权平均（分子合计÷分母合计）</option>}
                  <option value="max">最大</option>
                  <option value="min">最小</option>
                  <option value="none">不参与合计</option>
                </select>
              </div>
            )}
          </div>
        ))}
        <Btn size="xs" onClick={() => setCols([...cols, { col: '', label: '', align: 'right', format: 'number', decimals: 'auto' }])}>
          + 列
        </Btn>
      </div>

      <div className="flex flex-wrap gap-3">
        <Check checked={cfg.zebra} label="斑马纹" onChange={(v) => onChange({ zebra: v })} />
        <Check checked={cfg.showHeader} label="表头" onChange={(v) => onChange({ showHeader: v })} />
        <Check checked={cfg.headerBold} label="表头加粗" onChange={(v) => onChange({ headerBold: v })} />
        <Check checked={cfg.totalRow} label="合计行" onChange={(v) => onChange({ totalRow: v })} />
        <Check checked={cfg.showIndex} label="序号列" onChange={(v) => onChange({ showIndex: v })} />
      </div>
      {cfg.totalRow && (
        <Field
          label="合计行文案"
          hint={`说明文字可用 {{${cfg.title || '表格'}_列名}} 引用合计值；多个表格标题相同时按先后顺序加序号（表格2_列名…），建议给每个表格起不同标题`}
        >
          <TextInput value={cfg.totalLabel} onChange={(v) => onChange({ totalLabel: v })} />
        </Field>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Field label="行数上限（0=全部）">
          <NumberInput value={cfg.maxRows} min={0} onChange={(v) => onChange({ maxRows: v })} />
        </Field>
        <Field label="字号倍数">
          <NumberInput value={cfg.fontSizeScale} min={0.6} max={1.4} step={0.02} onChange={(v) => onChange({ fontSizeScale: v })} />
        </Field>
      </div>

      <div className="space-y-1">
        <span className="text-[12px] font-medium text-slate-500">整行高亮规则</span>
        {cfg.highlightRules.map((r, i) => (
          <div key={i} className="flex gap-1">
            <select
              className="min-w-0 flex-1 rounded border border-slate-300 px-1 py-0.5 text-[11.5px]"
              value={r.col}
              onChange={(e) => onChange({ highlightRules: cfg.highlightRules.map((x, j) => (j === i ? { ...x, col: e.target.value } : x)) })}
            >
              <option value="">列</option>
              {colOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <select
              className="rounded border border-slate-300 px-1 py-0.5 text-[11.5px]"
              value={r.op}
              onChange={(e) => onChange({ highlightRules: cfg.highlightRules.map((x, j) => (j === i ? { ...x, op: e.target.value as HighlightRule['op'] } : x)) })}
            >
              <option value=">">大于</option>
              <option value=">=">≥</option>
              <option value="<">小于</option>
              <option value="<=">≤</option>
              <option value="=">等于</option>
              <option value="!=">≠</option>
              <option value="nonEmpty">非空</option>
            </select>
            <input
              type="number"
              className="w-12 rounded border border-slate-300 px-1 py-0.5 text-[11.5px]"
              value={r.value}
              onChange={(e) => onChange({ highlightRules: cfg.highlightRules.map((x, j) => (j === i ? { ...x, value: Number(e.target.value) } : x)) })}
            />
            <input
              type="color"
              className="h-6 w-6 rounded border border-slate-300 p-0"
              value={r.color || '#F59E0B'}
              onChange={(e) => onChange({ highlightRules: cfg.highlightRules.map((x, j) => (j === i ? { ...x, color: e.target.value } : x)) })}
            />
            <button type="button" className="text-slate-400 hover:text-red-500" onClick={() => onChange({ highlightRules: cfg.highlightRules.filter((_, j) => j !== i) })}>
              ×
            </button>
          </div>
        ))}
        <Btn size="xs" onClick={() => onChange({ highlightRules: [...cfg.highlightRules, { col: '', op: '>', value: 0, color: '#F59E0B' }] })}>
          + 规则
        </Btn>
      </div>
    </>
  );
}

// ---------- 排行榜 ----------
function RankInspector({
  cfg,
  onChange,
  tableOptions,
  colOptions,
}: {
  cfg: RankBlockConfig;
  onChange: (p: Partial<RankBlockConfig>) => void;
  tableOptions: { value: string; label: string }[];
  colOptions: { value: string; label: string }[];
}) {
  return (
    <>
      <Field label="表格数据">
        <Select value={cfg.table.nodeRef} placeholder="选择表格节点" options={tableOptions} onChange={(v) => onChange({ table: { nodeRef: v } })} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="名称列">
          <Select value={cfg.nameCol} placeholder="选择列" options={colOptions} onChange={(v) => onChange({ nameCol: v })} />
        </Field>
        <Field label="指标列">
          <Select value={cfg.metricCol} placeholder="选择列" options={colOptions} onChange={(v) => onChange({ metricCol: v })} />
        </Field>
        <Field label="分组列（可空）">
          <Select value={cfg.groupCol} placeholder="不分组" options={colOptions} onChange={(v) => onChange({ groupCol: v })} />
        </Field>
        <Field label="聚合方式">
          <Select
            value={cfg.aggMethod}
            options={[
              { value: 'sum', label: '求和' },
              { value: 'avg', label: '平均' },
              { value: 'count', label: '计数' },
              { value: 'countDistinct', label: '去重计数' },
              { value: 'max', label: '最大' },
              { value: 'min', label: '最小' },
            ]}
            onChange={(v) => onChange({ aggMethod: v as RankBlockConfig['aggMethod'] })}
          />
        </Field>
        <Field label="排序">
          <Select
            value={cfg.sortDir}
            options={[
              { value: 'desc', label: '降序' },
              { value: 'asc', label: '升序' },
            ]}
            onChange={(v) => onChange({ sortDir: v as 'asc' | 'desc' })}
          />
        </Field>
        <Field label="展示人数">
          <NumberInput value={cfg.topN} min={1} max={200} onChange={(v) => onChange({ topN: v })} />
        </Field>
        <Field label="样式">
          <Select
            value={cfg.variant}
            options={[
              { value: 'long', label: '长图' },
              { value: 'twoColumn', label: '双列' },
              { value: 'table', label: '表格' },
            ]}
            onChange={(v) => onChange({ variant: v as RankBlockConfig['variant'] })}
          />
        </Field>
      </div>
      <Check checked={cfg.showProgress} label="显示进度条" onChange={(v) => onChange({ showProgress: v })} />
    </>
  );
}

// ---------- 行容器 ----------
const ROW_CHILD_TYPES: { value: CanvasBlock['type']; label: string }[] = [
  { value: 'kpiCard', label: 'KPI 指标卡' },
  { value: 'goalProgress', label: '目标完成率' },
  { value: 'chart', label: '图表' },
  { value: 'dataTable', label: '数据表格' },
  { value: 'rankList', label: '排行榜' },
  { value: 'text', label: '文本' },
  { value: 'divider', label: '分隔线' },
  { value: 'image', label: '图片' },
];

function RowInspector({ block, onChange }: { block: Extract<CanvasBlock, { type: 'row' }>; onChange: (p: Partial<RowBlockConfig>) => void }) {
  const cfg = block.config;
  const selectBlock = useCanvasStore((s) => s.selectBlock);
  const removeBlock = useCanvasStore((s) => s.removeBlock);
  const addBlockToRow = useCanvasStore((s) => s.addBlockToRow);
  const [newType, setNewType] = useState<CanvasBlock['type']>('kpiCard');

  return (
    <>
      <p className="text-[11.5px] text-slate-400">
        一行内并排 1~3 个区块；宽度按比例分配。点击画布中的子块可直接编辑与绑定数据。
      </p>
      {cfg.children.map((c, i) => (
        <div key={c.id} className="flex items-center gap-1 rounded border border-slate-200 px-1.5 py-1">
          <span className="w-4 text-[11.5px] text-slate-400">{i + 1}</span>
          <button type="button" className="flex-1 truncate text-left text-[12px] text-slate-600 hover:text-blue-600" onClick={() => selectBlock(c.id)}>
            {typeName(c.type)}
          </button>
          <input
            type="number"
            className="w-12 rounded border border-slate-300 px-1 py-0.5 text-[11.5px]"
            value={cfg.widths[i] ?? 0}
            min={5}
            onChange={(e) => onChange({ widths: cfg.widths.map((w, j) => (j === i ? Number(e.target.value) : w)) })}
          />
          <span className="text-[10.5px] text-slate-400">
            {Math.round(((cfg.widths[i] ?? 0) / cfg.widths.reduce((a, b) => a + b, 0)) * 100)}%
          </span>
          <button type="button" className="text-slate-400 hover:text-red-500" onClick={() => removeBlock(c.id)}>
            ×
          </button>
        </div>
      ))}
      {cfg.children.length < 3 && (
        <div className="flex items-center gap-1">
          <Select value={newType} options={ROW_CHILD_TYPES} onChange={(v) => setNewType(v as CanvasBlock['type'])} />
          <Btn size="xs" tone="primary" onClick={() => addBlockToRow(block.id, createBlock(newType))}>
            + 加入
          </Btn>
        </div>
      )}
    </>
  );
}

// ---------- 通用设置（外壳边距 / 圆角） ----------
const RADIUS_PRESETS: { v: number; label: string }[] = [
  { v: 0, label: '直角' },
  { v: 4, label: '默认' },
  { v: 8, label: '圆润' },
  { v: 12, label: '大圆角' },
];

function ShellInspector({ block }: { block: CanvasBlock }) {
  const updateShell = useCanvasStore((s) => s.updateBlockShell);
  const m = block.shellMargin ?? [0, 0, 0, 0];
  const radius = block.radius ?? 4;
  const [linked, setLinked] = useState(m[0] === m[1] && m[1] === m[2] && m[2] === m[3]);

  const setMargin = (idx: 0 | 1 | 2 | 3, v: number): void => {
    const next: [number, number, number, number] = linked ? [v, v, v, v] : ([...m] as [number, number, number, number]);
    if (!linked) next[idx] = v;
    updateShell(block.id, { shellMargin: next });
  };
  const setRadius = (v: number): void => {
    const clamped = Math.max(0, Math.min(24, Math.round(v) || 0));
    updateShell(block.id, { radius: clamped });
  };

  return (
    // 无卡片外框：仅用上分隔线与上方检查器内容区隔，避免双层框体挤压
    <div className="space-y-2.5 border-t border-slate-100 pt-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-medium tracking-wide text-slate-500">通用设置</span>
        <span className="text-[11px] text-slate-300">作用于区块外壳</span>
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[12px] font-medium text-slate-500">边距</span>
          <button
            type="button"
            title={linked ? '四向联动中，点击解除可单边微调' : '点击开启四向联动'}
            onClick={() => {
              if (!linked) setMargin(0, m[0] || 0);
              setLinked(!linked);
            }}
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[12px] transition-colors ${
              linked ? 'border-blue-200 bg-blue-50 text-blue-600' : 'border-slate-200 text-slate-400 hover:text-slate-600'
            }`}
          >
            {linked ? <LinkOutlined /> : <DisconnectOutlined />}
            {linked ? '四向联动' : '已解除'}
          </button>
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          {(['上', '右', '下', '左'] as const).map((dir, i) => (
            <InputNumber
              key={dir}
              className="w-full"
              value={m[i] ?? 0}
              min={0}
              max={64}
              controls={false}
              prefix={<span className="text-slate-400">{dir}</span>}
              suffix={<span className="text-slate-300">px</span>}
              onChange={(v) => setMargin(i as 0 | 1 | 2 | 3, Math.max(0, Math.min(64, typeof v === 'number' ? v : 0)))}
            />
          ))}
        </div>
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[12px] font-medium text-slate-500">圆角</span>
          <div className="flex items-center gap-1.5">
            {RADIUS_PRESETS.map((p) => (
              <button
                key={p.v}
                type="button"
                onClick={() => setRadius(p.v)}
                className={`rounded-full border px-2 py-0.5 text-[12px] transition-colors ${
                  radius === p.v ? 'border-blue-300 bg-blue-50 text-blue-600' : 'border-slate-200 text-slate-400 hover:text-slate-600'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <SliderBar value={radius} onChange={setRadius} min={0} max={24} />
          <InputNumber
            className="w-20"
            value={radius}
            min={0}
            max={24}
            controls={false}
            suffix={<span className="text-slate-300">px</span>}
            onChange={(v) => setRadius(typeof v === 'number' ? v : 0)}
          />
        </div>
      </div>
    </div>
  );
}

export type { NumberFormat, CSSProperties };

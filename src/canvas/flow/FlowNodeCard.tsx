import { useEffect, useMemo, useRef, useState } from 'react';
import { ConfigProvider, theme as antdTheme } from 'antd';
import { useCanvasStore } from '../../store/useCanvasStore';
import { NODE_W } from './layout';
import { NODE_TOKENS } from './nodeTheme';
import { NoTableHint } from './nodes/controls';
import { NODE_TYPE_LABELS, SOURCE_DEFS, stepDef } from './nodes';
import type { NodeOutput, PipelineNode, DataSource, SourceRuntime } from '../types';

/**
 * ComfyUI 风格节点卡片（数据节点视图）：
 * - 深色/浅色外壳（--nb-* token），头部为拖拽手柄 + 类型徽标 + 可改名
 * - 配置区按注册表渲染：处理节点查 STEP_DEFS、数据源查 SOURCE_DEFS，
 *   新增节点类型无需改本文件
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
  if (bad) return 'bg-red-500/15 text-red-600 dark:text-red-300';
  if (node.type === 'source') return 'bg-brand-soft text-brand';
  if (node.type === 'scalarOut' || node.type === 'formula') return 'bg-[var(--nb-chip-bg)] text-[var(--nb-ok)]';
  return 'bg-[var(--nb-chip-bg)] text-[var(--nb-header-dim)]';
}

function configSummary(node: PipelineNode): string {
  const p = node.params;
  const v = (key: string, fallback = '未设置'): string => String(p[key] ?? fallback);
  switch (node.type) {
    case 'source': return '数据输入';
    case 'filter': return `${v('col', '选择列')} · ${v('op', '选择条件')} · ${v('value', '输入值')}`;
    case 'pickRows': return `${v('mode', '取行方式')} · ${v('dateCol', '未指定日期列')}`;
    case 'sortTopN': return `${v('col', '未指定排序列')} · ${p.dir === 'asc' ? '升序' : '降序'} · ${Number(p.n ?? 0) || '全部'} 行`;
    case 'groupAgg': return `按 ${v('groupCol', '未指定分组列')} 分组 · ${(Array.isArray(p.aggs) ? p.aggs.length : 0)} 个聚合`;
    case 'derive': return `新列：${v('name', '未命名')}`;
    case 'diff': return `${p.mode === 'rate' ? '变化率' : '差值'} · ${v('col', '未指定数值列')} · ${v('dateCol', '按当前行顺序')}`;
    case 'union': return `${node.inputs.length} 个输入`;
    case 'scalarOut': return `${v('col', '未指定数值列')} · ${v('method', '求和')}`;
    case 'formula': return '公式计算';
    default: return '处理节点';
  }
}

function OutputSummary({ output, srcRt }: { output: NodeOutput | undefined; srcRt?: SourceRuntime }) {
  if (output?.kind === 'error') return <span className="truncate text-[11px] text-[var(--nb-err)]">运行失败 · {output.message}</span>;
  if (output?.kind === 'table') return <span className="text-[11px] text-[var(--nb-text-dim)]">{output.table.rows.length.toLocaleString()} 行 · {output.table.columns.length} 列</span>;
  if (output?.kind === 'scalar') return <span className="text-[12px] font-semibold text-[var(--nb-ok)]">结果 {output.value === null ? '空值' : output.value.toLocaleString('zh-CN')}</span>;
  if (output?.kind === 'scalars') return <span className="text-[11px] text-[var(--nb-text-dim)]">{Object.keys(output.values).length} 个变量</span>;
  if (srcRt?.status === 'error') return <span className="truncate text-[11px] text-[var(--nb-err)]">数据源错误 · {srcRt.message}</span>;
  if (srcRt && srcRt.status !== 'ready') return <span className="text-[11px] text-[var(--nb-warn)]">等待数据</span>;
  return <span className="text-[11px] text-[var(--nb-text-faint)]">尚无输出</span>;
}

/** 嵌套 ConfigProvider 的 antd 主题：dark→darkAlgorithm，light→默认算法；token 与 nodeTheme.ts 对齐 */
function useNodeAntdTheme() {
  const nodeTheme = useCanvasStore((s) => s.uiTheme);
  return useMemo(() => {
    const t = NODE_TOKENS[nodeTheme];
    return {
      algorithm: nodeTheme === 'dark' ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
      token: {
        colorPrimary: nodeTheme === 'dark' ? '#77a7cc' : '#4b80ad',
        colorBgContainer: t.controlBg,
        colorBgElevated: nodeTheme === 'dark' ? '#303030' : '#ffffff',
        colorBorder: t.controlBorder,
        colorText: t.text,
        colorTextSecondary: t.textDim,
        colorTextPlaceholder: t.textFaint,
        fontSize: 12,
        controlHeight: 26,
        controlHeightSM: 26,
        borderRadius: 4,
      },
    };
  }, [nodeTheme]);
}

/** 处理节点配置区：查注册表渲染；needsTableInput 且未接表格上游时给通用提示 */
function StepConfig({ node }: { node: PipelineNode }) {
  const updateNode = useCanvasStore((s) => s.updateNode);
  const outputs = useCanvasStore((s) => s.outputs);
  const setParam = (patch: Record<string, unknown>): void => updateNode(node.id, { params: { ...node.params, ...patch } });

  const upOutput = node.inputs[0] ? outputs[node.inputs[0]] : undefined;
  const cols = upOutput && upOutput.kind === 'table' ? upOutput.table.columns.map((c) => ({ value: c.key, label: c.rawName || c.key })) : [];
  const rowColumns = cols.map((c) => ({ key: c.value, label: c.label }));
  const rowSample = upOutput && upOutput.kind === 'table' ? (upOutput.table.rows[0] as Record<string, unknown> | undefined) : undefined;

  const def = stepDef(node.type);
  if (!def) return null;
  if (def.needsTableInput && cols.length === 0) return <NoTableHint />;
  return (
    <div className="no-drag space-y-1.5">
      <def.Config node={node} cols={cols} rowColumns={rowColumns} rowSample={rowSample} setParam={setParam} />
    </div>
  );
}

/** 头部名称：点击进入行内编辑，Enter/失焦提交，Esc 取消 */
function NodeName({ node }: { node: PipelineNode }) {
  const updateNode = useCanvasStore((s) => s.updateNode);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(node.name);

  useEffect(() => {
    if (!editing) setDraft(node.name);
  }, [node.name, editing]);

  const commit = (): void => {
    setEditing(false);
    const n = draft.trim();
    if (n && n !== node.name) updateNode(node.id, { name: n });
  };

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') {
            setDraft(node.name);
            setEditing(false);
          }
        }}
        onFocus={(e) => e.target.select()}
        className="min-w-0 flex-1 rounded border border-brand bg-[var(--nb-input-bg)] px-1 py-px text-[12px] text-[var(--nb-text)] outline-none"
      />
    );
  }
  return (
    <span
      className="min-w-0 flex-1 cursor-text truncate rounded px-0.5 text-[12px] font-medium text-[var(--nb-header-text)] hover:bg-panel/10"
      title="点击修改名称"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={() => setEditing(true)}
    >
      {node.name}
    </span>
  );
}

// ---- 节点卡片主体 ----

export default function FlowNodeCard({ node, output, srcDef, srcRt, x, y, selected, dragging, onPointerDown, onHeight }: FlowNodeCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const antdThemeCfg = useNodeAntdTheme();

  // 高度自适应：上报给 FlowSheet 供连线锚点与自动布局使用
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => onHeight(node.id, el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [node.id, onHeight]);

  /** 表单控件区域不触发节点拖拽（antd 各控件容器与弹层类名一并排除：弹层经 React portal 冒泡） */
  const onShellDown = (e: React.PointerEvent): void => {
    const t = e.target as HTMLElement | null;
    if (t?.closest('input, textarea, select, button, a, label, summary, details, .ant-select, .ant-input, .ant-input-number, .ant-input-number-handler-wrap, .ant-btn, .ant-checkbox-wrapper, .ant-collapse, .ant-select-dropdown, .ant-dropdown, .ant-picker-dropdown, .no-drag')) {
      e.stopPropagation();
      return;
    }
    onPointerDown(e);
  };

  const bad = output?.kind === 'error';
  const SrcConfig = node.type === 'source' && srcDef ? SOURCE_DEFS[srcDef.kind]?.Config : undefined;

  return (
    <ConfigProvider theme={antdThemeCfg}>
      <div
        ref={ref}
        onPointerDown={onShellDown}
        style={{ left: x, top: y, width: NODE_W }}
        className={`absolute cursor-grab select-none overflow-visible rounded-md border bg-[var(--nb-surface)] shadow-sm transition-shadow ${
          selected ? 'border-brand ring-1 ring-brand/45 shadow-sm' : 'border-[var(--nb-border)] hover:border-brand-line'
        } ${bad && !selected ? 'border-red-500/70' : ''} ${dragging ? 'cursor-grabbing shadow-lg' : ''} ${node.enabled ? '' : 'opacity-60'}`}
      >
        {/* 头部：拖拽手柄 */}
        <div className="flex min-h-9 items-center gap-2 rounded-t-md border-b border-[var(--nb-header-line)] bg-[var(--nb-header)] px-2.5 py-1.5">
          <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium leading-tight ${accentOf(node, bad)}`}>{NODE_TYPE_LABELS[node.type]}</span>
          <NodeName node={node} />
          {node.inputs.length > 1 && <span className="shrink-0 text-[10px] text-[var(--nb-header-dim)]">{node.inputs.length} 入</span>}
          {!node.enabled && <span className="shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-[var(--nb-header-warn)]">已停用</span>}
        </div>

        {selected ? (
          <div className="space-y-2.5 px-3 py-2.5">
            {node.type === 'source' ? (
              srcDef && SrcConfig ? (
                srcDef.kind === 'manualTable' ? (
                  <details className="rounded-md border border-[var(--nb-border)] bg-[var(--nb-preview-bg)] px-2.5 py-2">
                    <summary className="cursor-pointer text-[11px] font-medium text-[var(--nb-text)]">编辑手填表（{srcDef.rows.length} 行 × {srcDef.columns.length} 列）</summary>
                    <div className="mt-2"><SrcConfig srcDef={srcDef} srcRt={srcRt} /></div>
                  </details>
                ) : <SrcConfig srcDef={srcDef} srcRt={srcRt} />
              ) : null
            ) : <StepConfig node={node} />}
            <div className="border-t border-[var(--nb-header-line)] pt-2">
              <OutputSummary output={output} srcRt={srcRt} />
              {(node.type === 'scalarOut' || node.type === 'formula') && <div className="mt-1 truncate text-[10.5px] text-[var(--nb-text-faint)]">变量名 <code className="rounded bg-[var(--nb-chip-bg)] px-1 text-[var(--nb-text-dim)]">{node.name}</code></div>}
            </div>
          </div>
        ) : (
          <div className="flex min-h-9 items-center justify-between gap-2 rounded-b-md px-2.5 py-1.5">
            <span className="min-w-0 truncate text-[11px] text-[var(--nb-text-dim)]" title={configSummary(node)}>{configSummary(node)}</span>
            <OutputSummary output={output} srcRt={srcRt} />
          </div>
        )}
      </div>
    </ConfigProvider>
  );
}

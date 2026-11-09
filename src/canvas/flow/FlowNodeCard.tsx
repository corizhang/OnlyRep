import { useEffect, useMemo, useRef, useState } from 'react';
import { ConfigProvider, theme as antdTheme } from 'antd';
import { useCanvasStore } from '../../store/useCanvasStore';
import { getVal } from '../../parser/clean';
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
  if (bad) return 'bg-red-500/90 text-white';
  if (node.type === 'source') return 'bg-blue-500/90 text-white';
  if (node.type === 'scalarOut' || node.type === 'formula') return 'bg-emerald-500/90 text-white';
  return 'bg-slate-500/70 text-[var(--nb-header-text)]';
}

/** 嵌套 ConfigProvider 的 antd 主题：dark→darkAlgorithm，light→默认算法；token 与 nodeTheme.ts 对齐 */
function useNodeAntdTheme() {
  const nodeTheme = useCanvasStore((s) => s.nodeTheme);
  return useMemo(() => {
    const t = NODE_TOKENS[nodeTheme];
    return {
      algorithm: nodeTheme === 'dark' ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
      token: {
        colorPrimary: '#2563eb',
        colorBgContainer: t.controlBg,
        colorBgElevated: nodeTheme === 'dark' ? '#2b3444' : '#ffffff',
        colorBorder: t.controlBorder,
        colorText: t.text,
        colorTextSecondary: t.textDim,
        colorTextPlaceholder: t.textFaint,
        fontSize: 11,
        controlHeight: 26,
        controlHeightSM: 22,
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

// ---- 结果预览（节点底部） ----

function DarkPreview({ node, output, srcRt }: { node: PipelineNode; output: NodeOutput | undefined; srcRt?: SourceRuntime }) {
  if (output?.kind === 'error') {
    return <div className="text-[10.5px] leading-snug text-[var(--nb-err)]">{output.message}</div>;
  }
  if (output?.kind === 'table') {
    const rows = output.table.rows.slice(0, 6);
    const cols = output.table.columns;
    return (
      <div>
        <div className="mb-1 text-[10px] text-[var(--nb-text-dim)]">
          共 <b className="text-[var(--nb-text)]">{output.table.rows.length}</b> 行 × {cols.length} 列
          {output.table.rows.length > 6 && '（预览前 6 行）'}
        </div>
        <div className="max-h-[150px] overflow-auto rounded border border-[var(--nb-preview-border)] bg-[var(--nb-preview-table)]">
          <table className="w-full border-collapse text-[10.5px]">
            <thead>
              <tr>
                {cols.map((c) => (
                  <th key={c.key} className="whitespace-nowrap border-b border-[var(--nb-preview-head-line)] px-1.5 py-0.5 text-left font-medium text-[var(--nb-text)]">
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
                      <td key={c.key} className="max-w-[150px] truncate whitespace-nowrap border-b border-[var(--nb-preview-row-line)] px-1.5 py-0.5 text-[var(--nb-text)]">
                        {v === null ? '' : typeof v === 'number' ? v.toLocaleString('zh-CN') : String(v)}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={Math.max(1, cols.length)} className="px-2 py-2 text-center text-[var(--nb-text-faint)]">
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
        <span className="text-[10px] text-[var(--nb-text-dim)]">结果</span>
        <span className="text-[16px] font-semibold text-[var(--nb-ok)]">{output.value === null ? '空值' : output.value.toLocaleString('zh-CN')}</span>
      </div>
    );
  }
  if (output?.kind === 'scalars') {
    const list = Object.entries(output.values);
    return (
      <div className="space-y-0.5">
        <div className="text-[10px] text-[var(--nb-text-dim)]">{list.length} 个参数</div>
        {list.slice(0, 4).map(([k, v]) => (
          <div key={k} className="flex justify-between gap-2 text-[10.5px]">
            <span className="truncate text-[var(--nb-text-dim)]">{k}</span>
            <span className="font-medium text-[var(--nb-text)]">{String(v ?? '')}</span>
          </div>
        ))}
      </div>
    );
  }
  // 未执行：数据源给导入状态提示
  if (node.type === 'source' && srcRt?.status === 'error') {
    return <div className="text-[10.5px] text-[var(--nb-err)]">{srcRt.message}</div>;
  }
  if (node.type === 'source' && srcRt?.status !== 'ready') {
    return <div className="text-[10.5px] text-[var(--nb-warn)]">待选择文件</div>;
  }
  return <div className="text-[10.5px] text-[var(--nb-text-faint)]">未执行</div>;
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
        className="min-w-0 flex-1 rounded border border-blue-500 bg-[var(--nb-input-bg)] px-1 py-px text-[12px] text-[var(--nb-text)] outline-none"
      />
    );
  }
  return (
    <span
      className="min-w-0 flex-1 cursor-text truncate rounded px-0.5 text-[12px] font-medium text-[var(--nb-header-text)] hover:bg-white/10"
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
    if (t?.closest('input, textarea, select, button, a, label, .ant-select, .ant-input, .ant-input-number, .ant-input-number-handler-wrap, .ant-btn, .ant-checkbox-wrapper, .ant-collapse, .ant-select-dropdown, .ant-dropdown, .ant-picker-dropdown, .no-drag')) {
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
        className={`absolute cursor-grab select-none overflow-visible rounded-lg border bg-[var(--nb-surface)] shadow-md transition-shadow ${
          selected ? 'border-blue-500 ring-2 ring-blue-500/60' : 'border-[var(--nb-border)]'
        } ${bad && !selected ? 'border-red-500/70' : ''} ${dragging ? 'cursor-grabbing shadow-lg' : ''} ${node.enabled ? '' : 'opacity-60'}`}
      >
        {/* 头部：拖拽手柄 */}
        <div className="flex items-center gap-1.5 rounded-t-lg border-b border-[var(--nb-header-line)] bg-[var(--nb-header)] px-2 py-1.5">
          <span className={`rounded px-1 py-px text-[9px] leading-tight ${accentOf(node, bad)}`}>{NODE_TYPE_LABELS[node.type]}</span>
          <NodeName node={node} />
          {node.inputs.length > 1 && <span className="text-[9px] text-[var(--nb-header-dim)]">{node.inputs.length} 入</span>}
          {!node.enabled && <span className="text-[9px] text-[var(--nb-header-warn)]">已停用</span>}
        </div>

        {/* 主体：配置区（注册表渲染） */}
        <div className="space-y-2 px-3 py-2.5">
          {node.type === 'source' ? (
            srcDef && SrcConfig ? (
              <SrcConfig srcDef={srcDef} srcRt={srcRt} />
            ) : null
          ) : (
            <StepConfig node={node} />
          )}
        </div>

        {/* 底部：结果预览 */}
        <div className="rounded-b-lg border-t border-[var(--nb-header-line)] bg-[var(--nb-preview-bg)] px-2.5 py-1.5">
          <DarkPreview node={node} output={output} srcRt={srcRt} />
          {(node.type === 'scalarOut' || node.type === 'formula') && (
            <div className="mt-1 truncate text-[10px] text-[var(--nb-text-faint)]">
              变量名 <code className="rounded bg-[var(--nb-chip-bg)] px-1 text-[var(--nb-text-dim)]">{node.name}</code>
            </div>
          )}
        </div>
      </div>
    </ConfigProvider>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { Dropdown } from 'antd';
import type { MenuProps } from 'antd';
import { useCanvasStore } from '../../store/useCanvasStore';
import type { NodeOutput, NodeType, PipelineNode } from '../types';
import { computeFlowLayout, edgePath, NODE_H, NODE_W, type FlowPos } from './layout';
import NodeFields, { NODE_TYPE_LABELS } from './NodeFields';
import DataPreview from './DataPreview';
import { STEP_TYPES, defaultParams } from '../components/StepChainPanel';
import { ImportEditor, FormEditor, ManualEditor } from '../components/DataSourcePanel';
import { createImportSource, createManualTableSource, newId, uniqueName } from '../datasource/registry';
import type { DataSource } from '../types';
import { Btn, Check, Field, TextInput } from '../components/ui';

/**
 * 流程视图（PRD P2.1）：把 DAG 画成横向流程图。
 * - 自动分层布局 + 手动拖动微调（位置存入 config.flowPos，随模板保存）
 * - 节点上直接显示实时结果（行数/数值/错误），选中节点后右侧属性栏改配置并看中间数据
 * - embedded 模式：嵌入主界面「数据节点」视图（无头部/无 Esc 关闭/无内嵌详情抽屉，选中态走 store）
 */

interface DragState {
  id: string;
  startX: number;
  startY: number;
  origin: FlowPos;
  moved: boolean;
}

export default function FlowSheet({ embedded = false }: { embedded?: boolean }) {
  const config = useCanvasStore((s) => s.config);
  const outputs = useCanvasStore((s) => s.outputs);
  const setShowFlow = useCanvasStore((s) => s.setShowFlow);
  const setFlowPos = useCanvasStore((s) => s.setFlowPos);
  const resetFlowPos = useCanvasStore((s) => s.resetFlowPos);
  const addNodeToStore = useCanvasStore((s) => s.addNode);
  const updateNodeInStore = useCanvasStore((s) => s.updateNode);
  const addSource = useCanvasStore((s) => s.addSource);
  const removeSource = useCanvasStore((s) => s.removeSource);
  const sourcesRt = useCanvasStore((s) => s.sources);
  const flowSelectedId = useCanvasStore((s) => s.flowSelectedId);
  const setFlowSelectedId = useCanvasStore((s) => s.setFlowSelectedId);

  const [zoom, setZoom] = useState(0.85);
  const [pan, setPan] = useState<FlowPos>({ x: 28, y: 28 });
  const [delta, setDelta] = useState<{ id: string; dx: number; dy: number } | null>(null);
  const [hint, setHint] = useState('');
  const selectedId = flowSelectedId;

  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const panRef = useRef<{ startX: number; startY: number; ox: number; oy: number } | null>(null);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  const layout = useMemo(
    () => computeFlowLayout(config.pipeline.nodes, config.flowPos ?? {}),
    [config.pipeline.nodes, config.flowPos],
  );

  const nodeById = useMemo(() => new Map(config.pipeline.nodes.map((n) => [n.id, n])), [config.pipeline.nodes]);
  const selected = selectedId ? nodeById.get(selectedId) ?? null : null;

  /** 该节点的输出是否为表格（source 未执行时也按表格对待，便于先连线后导数据） */
  const isTableOut = (id: string): boolean => {
    const n = nodeById.get(id);
    if (!n) return false;
    if (n.type === 'source') return true;
    return outputs[id]?.kind === 'table';
  };

  /** 添加节点：表格类步骤需指定上游表格节点；formula（计算字段）无需输入 */
  const addNodeOfType = (type: NodeType, inputId: string | null): void => {
    if (type !== 'formula' && (!inputId || !isTableOut(inputId))) {
      setHint('请先点选一个表格节点（数据源或处理步骤），再添加下游节点');
      setTimeout(() => setHint(''), 3500);
      return;
    }
    const label = type === 'formula' ? '计算字段' : STEP_TYPES.find((s) => s.type === type)?.label ?? '步骤';
    const dup = config.pipeline.nodes.filter((n) => n.name === label || n.name.startsWith(`${label} `)).length;
    const node: PipelineNode = {
      id: newId('n'),
      type,
      name: dup > 0 ? `${label} ${dup + 1}` : label,
      inputs: type === 'formula' ? [] : [inputId as string],
      params: defaultParams(type),
      enabled: true,
    };
    addNodeToStore(node);
    setFlowSelectedId(node.id);
  };

  /** 上游候选：所有表格输出节点，排除自己与自己的下游（防成环） */
  const upstreamCandidates = useMemo(() => {
    if (!selected) return [];
    return config.pipeline.nodes.filter((n) => n.id !== selected.id && isTableOut(n.id) && !dependsOn(config.pipeline.nodes, n.id, selected.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.pipeline.nodes, outputs, selected]);

  /** 添加数据源（与左侧面板同一套创建逻辑）；节点 id 约定为 n_<sourceId> */
  const addSourceOfKind = (kind: DataSource['kind']): void => {
    const base = { import: '导入数据', manualTable: '手填表格', form: '口径参数', constant: '常量' }[kind];
    const name = uniqueName(config.dataSources, base);
    let source: DataSource;
    if (kind === 'import') source = createImportSource(name);
    else if (kind === 'manualTable') source = createManualTableSource(name);
    else if (kind === 'form') source = { id: newId('ds'), name, kind: 'form', entries: [{ key: '参数1', value: '0' }] };
    else source = { id: newId('ds'), name, kind: 'constant', value: '0' };
    addSource(source);
    setFlowSelectedId(`n_${source.id}`);
  };

  /** 适应视图：按容器大小算缩放与居中偏移 */
  const fit = (): void => {
    const el = containerRef.current;
    const w = el?.clientWidth ?? 1000;
    const h = el?.clientHeight ?? 700;
    const z = Math.min(1, (w - 56) / Math.max(1, layout.width), (h - 56) / Math.max(1, layout.height));
    const nz = Math.max(0.35, Math.min(1.2, z));
    setZoom(nz);
    setPan({ x: (w - layout.width * nz) / 2, y: Math.max(20, (h - layout.height * nz) / 2) });
  };

  // 首次进入自动适应
  useEffect(() => {
    const fxnode = new URLSearchParams(window.location.search).get('fxnode');
    if (fxnode) setFlowSelectedId(fxnode);
    const t = setTimeout(fit, 30);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Esc 关闭（仅独立全屏模式；嵌入数据节点视图时无「关闭」概念）
  useEffect(() => {
    if (embedded) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setShowFlow(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setShowFlow, embedded]);

  // 滚轮缩放（以指针为锚点）
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const z = zoomRef.current;
      const next = Math.max(0.35, Math.min(1.8, z * (e.deltaY < 0 ? 1.1 : 0.9)));
      setPan((p) => ({ x: px - ((px - p.x) * next) / z, y: py - ((py - p.y) * next) / z }));
      setZoom(next);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const onBackgroundDown = (e: React.PointerEvent): void => {
    if (e.button !== 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    panRef.current = { startX: e.clientX, startY: e.clientY, ox: pan.x, oy: pan.y };
    setFlowSelectedId(null);
  };

  const onNodeDown = (e: React.PointerEvent, nodeId: string, node: FlowPos): void => {
    e.stopPropagation();
    if (e.button !== 0) return;
    containerRef.current?.setPointerCapture(e.pointerId);
    dragRef.current = { id: nodeId, startX: e.clientX, startY: e.clientY, origin: { x: node.x, y: node.y }, moved: false };
  };

  const onMove = (e: React.PointerEvent): void => {
    const d = dragRef.current;
    if (d) {
      const dx = (e.clientX - d.startX) / zoom;
      const dy = (e.clientY - d.startY) / zoom;
      if (Math.abs(dx) + Math.abs(dy) > 2) d.moved = true;
      setDelta({ id: d.id, dx, dy });
      return;
    }
    const p = panRef.current;
    if (p) setPan({ x: p.ox + (e.clientX - p.startX), y: p.oy + (e.clientY - p.startY) });
  };

  const onUp = (): void => {
    const d = dragRef.current;
    if (d) {
      if (d.moved && delta) setFlowPos(d.id, { x: Math.round(d.origin.x + delta.dx), y: Math.round(d.origin.y + delta.dy) });
      else setFlowSelectedId(d.id);
      dragRef.current = null;
      setDelta(null);
    }
    panRef.current = null;
  };

  return (
    <div className={embedded ? 'flex h-full min-w-0 flex-1 flex-col bg-[#f7f9fc]' : 'fixed inset-0 z-50 flex flex-col bg-[#f7f9fc]'}>
      {!embedded && (
        <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-5 py-2.5">
          <div className="flex items-baseline gap-2">
            <h2 className="text-sm font-semibold text-slate-800">数据流视图</h2>
            <span className="text-[11px] text-slate-400">
              {config.pipeline.nodes.length} 个节点 · 点选节点后可加下游 · 拖动微调 · 滚轮缩放
            </span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {!embedded && (
              <AddNodeMenu
                selected={selected}
                isTableOut={isTableOut}
                onAddSource={addSourceOfKind}
                onAddNode={addNodeOfType}
              />
            )}
            <Btn size="xs" onClick={fit}>
              适应视图
            </Btn>
            <Btn size="xs" onClick={() => { resetFlowPos(); setDelta(null); setTimeout(fit, 20); }}>
              自动排列
            </Btn>
            <Btn size="xs" onClick={() => setShowFlow(false)}>
              关闭
            </Btn>
          </div>
        </div>
      )}

      {hint && (
        <div className="border-b border-amber-200 bg-amber-50 px-5 py-1.5 text-[11px] text-amber-800">{hint}</div>
      )}

      {embedded && (
        <div className="flex items-center gap-2 border-b border-slate-200 bg-white px-3 py-2">
          <span className="text-[11.5px] text-slate-400">
            {config.pipeline.nodes.length} 个节点 · 点选节点后在右侧修改配置 · 拖动微调 · 滚轮缩放
          </span>
          <div className="ml-auto flex items-center gap-2">
            <AddNodeMenu selected={selected} isTableOut={isTableOut} onAddSource={addSourceOfKind} onAddNode={addNodeOfType} />
            <Btn size="xs" onClick={fit}>
              适应视图
            </Btn>
            <Btn size="xs" onClick={() => { resetFlowPos(); setDelta(null); setTimeout(fit, 20); }}>
              自动排列
            </Btn>
          </div>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <div
          ref={containerRef}
          className="relative min-w-0 flex-1 cursor-default overflow-hidden"
          style={{
            backgroundImage: 'radial-gradient(#cbd5e1 1px, transparent 1px)',
            backgroundSize: '22px 22px',
          }}
          onPointerDown={onBackgroundDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        >
          <div
            className="absolute left-0 top-0"
            style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: '0 0', width: layout.width, height: layout.height }}
          >
            <svg width={layout.width} height={layout.height} className="pointer-events-none absolute left-0 top-0 overflow-visible">
              {layout.edges.map((e) => {
                const from = layout.byId[e.from];
                const to = layout.byId[e.to];
                if (!from || !to) return null;
                const bad = outputs[e.to]?.kind === 'error';
                return (
                  <path
                    key={`${e.from}->${e.to}`}
                    d={edgePath(withDelta(from, delta), withDelta(to, delta))}
                    fill="none"
                    stroke={bad ? '#f87171' : '#94a3b8'}
                    strokeWidth={1.5}
                  />
                );
              })}
            </svg>

            {layout.nodes.map((n) => {
              const node = nodeById.get(n.id);
              if (!node) return null;
              const out = outputs[n.id];
              const pos = withDelta(n, delta);
              return (
                <NodeCard
                  key={n.id}
                  node={node}
                  x={pos.x}
                  y={pos.y}
                  summary={summarize(out)}
                  bad={out?.kind === 'error'}
                  selected={selectedId === n.id}
                  dragging={delta?.id === n.id}
                  onPointerDown={(e) => onNodeDown(e, n.id, { x: n.x, y: n.y })}
                />
              );
            })}
          </div>

          <Legend />
        </div>

        {!embedded && selected && (
          <Drawer
            node={selected}
            output={outputs[selected.id]}
            upstreamCandidates={selected.inputs.length <= 1 && selected.type !== 'source' && selected.type !== 'formula' ? upstreamCandidates : []}
            onAddDownstream={(type) => addNodeOfType(type, selected.id)}
            onChangeUpstream={(upstreamId) => updateNodeInStore(selected.id, { inputs: [upstreamId] })}
            onClose={() => setFlowSelectedId(null)}
          />
        )}
      </div>
    </div>
  );
}

/** 节点属性栏（数据节点视图右栏）：选中态来自 store，空态给引导文案 */
export function NodeInspector() {
  const config = useCanvasStore((s) => s.config);
  const outputs = useCanvasStore((s) => s.outputs);
  const flowSelectedId = useCanvasStore((s) => s.flowSelectedId);
  const setFlowSelectedId = useCanvasStore((s) => s.setFlowSelectedId);
  const addNodeToStore = useCanvasStore((s) => s.addNode);
  const updateNodeInStore = useCanvasStore((s) => s.updateNode);

  const node = flowSelectedId ? config.pipeline.nodes.find((n) => n.id === flowSelectedId) ?? null : null;

  const isTableOut = (id: string): boolean => {
    const n = config.pipeline.nodes.find((x) => x.id === id);
    if (!n) return false;
    if (n.type === 'source') return true;
    return outputs[id]?.kind === 'table';
  };

  const addDownstream = (type: NodeType): void => {
    if (!node || (type !== 'formula' && !isTableOut(node.id))) return;
    const label = type === 'formula' ? '计算字段' : STEP_TYPES.find((s) => s.type === type)?.label ?? '步骤';
    const dup = config.pipeline.nodes.filter((n) => n.name === label || n.name.startsWith(`${label} `)).length;
    const next: PipelineNode = {
      id: newId('n'),
      type,
      name: dup > 0 ? `${label} ${dup + 1}` : label,
      inputs: type === 'formula' ? [] : [node.id],
      params: defaultParams(type),
      enabled: true,
    };
    addNodeToStore(next);
    setFlowSelectedId(next.id);
  };

  const upstreamCandidates = useMemo(() => {
    if (!node) return [];
    return config.pipeline.nodes.filter(
      (n) => n.id !== node.id && isTableOut(n.id) && !dependsOn(config.pipeline.nodes, n.id, node.id),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.pipeline.nodes, outputs, node]);

  if (!node) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
        <span className="text-[13px] font-medium text-slate-500">未选中节点</span>
        <p className="text-[12px] leading-relaxed text-slate-400">
          在中间流程图中点击一个节点，即可在这里查看实时结果、修改配置或添加下游节点。
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full min-w-0">
      <Drawer
        node={node}
        output={outputs[node.id]}
        upstreamCandidates={node.inputs.length <= 1 && node.type !== 'source' && node.type !== 'formula' ? upstreamCandidates : []}
        onAddDownstream={addDownstream}
        onChangeUpstream={(upstreamId) => updateNodeInStore(node.id, { inputs: [upstreamId] })}
        onClose={() => setFlowSelectedId(null)}
      />
    </div>
  );
}

/** 添加节点下拉菜单（数据源 / 处理节点 / 计算字段），独立头部与嵌入工具条共用 */
function AddNodeMenu({
  selected,
  isTableOut,
  onAddSource,
  onAddNode,
}: {
  selected: PipelineNode | null;
  isTableOut: (id: string) => boolean;
  onAddSource: (kind: DataSource['kind']) => void;
  onAddNode: (type: NodeType, inputId: string | null) => void;
}) {
  const items: MenuProps['items'] = [
    { key: 'g-src', type: 'group', label: '数据源（无上游，流程的起点）', children: (
      [
        ['import', '文件', '导入 xlsx / csv'],
        ['form', '表单', '名称 + 数值口径参数'],
        ['manualTable', '手填表', '可编辑网格'],
        ['constant', '常量', '单个数值'],
      ] as [DataSource['kind'], string, string][]
    ).map(([kind, label, hint]) => ({ key: `src-${kind}`, label: <span className="flex w-full items-center justify-between gap-3"><span>+ {label}</span><span className="text-[10.5px] text-slate-400">{hint}</span></span> })) },
    { type: 'divider' },
    { key: 'g-step', type: 'group', label: selected && isTableOut(selected.id) ? `处理节点：将接到「${selected.name}」之后` : '处理节点需先点选一个表格节点', children: (
      STEP_TYPES.map((s) => ({ key: `step-${s.type}`, label: <span className="flex w-full items-center justify-between gap-3"><span>{s.label}</span><span className="text-[10.5px] text-slate-400">{s.hint}</span></span> }))
    ) },
    { type: 'divider' },
    { key: 'step-formula', label: <span className="flex w-full items-center justify-between gap-3"><span>计算字段</span><span className="text-[10.5px] text-slate-400">公式产出新变量</span></span> },
  ];

  const onMenuClick: MenuProps['onClick'] = ({ key }) => {
    if (key === 'step-formula') return onAddNode('formula', null);
    if (key.startsWith('src-')) return onAddSource(key.slice(4) as DataSource['kind']);
    if (key.startsWith('step-')) {
      const type = key.slice(5) as NodeType;
      return onAddNode(type, selected && isTableOut(selected.id) ? selected.id : null);
    }
  };

  return (
    <Dropdown
      menu={{ items, onClick: onMenuClick, style: { minWidth: 240 } }}
      trigger={['click']}
      placement="bottomRight"
    >
      <Btn size="xs" tone="primary">添加节点 ▾</Btn>
    </Dropdown>
  );
}

function withDelta(pos: FlowPos & { id?: string }, delta: { id: string; dx: number; dy: number } | null): FlowPos {
  if (delta && pos.id === delta.id) return { x: pos.x + delta.dx, y: pos.y + delta.dy };
  return { x: pos.x, y: pos.y };
}

function toneOf(node: PipelineNode, bad: boolean): string {
  if (bad) return 'border-red-300 bg-red-50';
  if (!node.enabled) return 'border-slate-200 bg-slate-100';
  switch (node.type) {
    case 'source':
      return 'border-blue-300 bg-blue-50/80';
    case 'scalarOut':
    case 'formula':
      return 'border-emerald-300 bg-emerald-50/70';
    default:
      return 'border-slate-300 bg-white';
  }
}

function NodeCard({
  node,
  x,
  y,
  summary,
  bad,
  selected,
  dragging,
  onPointerDown,
}: {
  node: PipelineNode;
  x: number;
  y: number;
  summary: string;
  bad: boolean;
  selected: boolean;
  dragging: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
}) {
  return (
    <div
      onPointerDown={onPointerDown}
      style={{ left: x, top: y, width: NODE_W, height: NODE_H }}
      className={`absolute select-none rounded-lg border px-2.5 py-1.5 shadow-sm transition-shadow ${toneOf(node, bad)} ${
        selected ? 'ring-2 ring-blue-500' : ''
      } ${dragging ? 'cursor-grabbing shadow-lg' : 'cursor-grab'} ${node.enabled ? '' : 'opacity-70'}`}
    >
      <div className="flex items-center gap-1">
        <span className="rounded border border-slate-200 bg-white/80 px-1 text-[9px] text-slate-500">
          {NODE_TYPE_LABELS[node.type]}
        </span>
        {!node.enabled && <span className="text-[9px] text-slate-400">已停用</span>}
        <span className={`ml-auto text-[9px] ${bad ? 'text-red-600' : 'text-slate-400'}`}>
          {node.inputs.length > 1 ? `${node.inputs.length} 入` : ''}
        </span>
      </div>
      <div className="mt-0.5 truncate text-[12px] font-medium text-slate-800" title={node.name}>
        {node.name}
      </div>
      <div className={`truncate text-[10px] ${bad ? 'text-red-600' : 'text-slate-500'}`} title={summary}>
        {summary}
      </div>
    </div>
  );
}

function summarize(out: NodeOutput | undefined): string {
  if (!out) return '未执行';
  if (out.kind === 'table') return `${out.table.rows.length} 行 × ${out.table.columns.length} 列`;
  if (out.kind === 'scalar') return out.value === null ? '空值' : String(out.value);
  if (out.kind === 'scalars') return `${Object.keys(out.values).length} 个参数`;
  return out.message;
}

function Legend() {
  return (
    <div className="pointer-events-none absolute bottom-3 left-3 flex flex-wrap gap-3 rounded-md bg-white/90 px-2.5 py-1.5 text-[10px] text-slate-500 shadow-sm">
      <span className="flex items-center gap-1">
        <i className="inline-block h-2 w-2 rounded-sm border border-blue-300 bg-blue-50" />
        数据源
      </span>
      <span className="flex items-center gap-1">
        <i className="inline-block h-2 w-2 rounded-sm border border-slate-300 bg-white" />
        表格处理
      </span>
      <span className="flex items-center gap-1">
        <i className="inline-block h-2 w-2 rounded-sm border border-emerald-300 bg-emerald-50" />
        数值 / 公式
      </span>
      <span className="flex items-center gap-1">
        <i className="inline-block h-2 w-2 rounded-sm border border-red-300 bg-red-50" />
        错误
      </span>
    </div>
  );
}

function Drawer({
  node,
  output,
  upstreamCandidates,
  onAddDownstream,
  onChangeUpstream,
  onClose,
}: {
  node: PipelineNode;
  output: NodeOutput | undefined;
  upstreamCandidates: PipelineNode[];
  onAddDownstream: (type: NodeType) => void;
  onChangeUpstream: (upstreamId: string) => void;
  onClose: () => void;
}) {
  const config = useCanvasStore((s) => s.config);
  const outputs = useCanvasStore((s) => s.outputs);
  const sourcesRt = useCanvasStore((s) => s.sources);
  const updateNode = useCanvasStore((s) => s.updateNode);
  const removeNode = useCanvasStore((s) => s.removeNode);
  const removeSource = useCanvasStore((s) => s.removeSource);

  const upstream = node.inputs[0] ? outputs[node.inputs[0]] : undefined;
  const cols =
    upstream && upstream.kind === 'table' ? upstream.table.columns.map((c) => ({ value: c.key, label: c.rawName || c.key })) : [];
  const refs = countBlockRefs(config, node.id);
  const outIsTable = node.type === 'source' || output?.kind === 'table';
  const srcDef = node.type === 'source' ? config.dataSources.find((d) => d.id === String(node.params.sourceId ?? '')) : undefined;
  const srcRt = srcDef ? sourcesRt[srcDef.id] : undefined;
  const deleteNode = (): void => {
    if (node.type === 'source' && srcDef) removeSource(srcDef.id);
    else removeNode(node.id);
    onClose();
  };

  return (
    <aside className="flex w-[380px] shrink-0 flex-col overflow-y-auto border-l border-slate-200 bg-white p-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0">
          <div className="text-[10px] text-slate-400">{NODE_TYPE_LABELS[node.type]}</div>
          <div className="truncate text-sm font-semibold text-slate-800">{node.name}</div>
        </div>
        <button type="button" className="ml-auto text-slate-400 hover:text-slate-700" onClick={onClose} title="关闭详情">
          ✕
        </button>
      </div>

      <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 p-2">
        <div className="mb-1 text-[10px] font-medium text-slate-500">实时结果</div>
        {output?.kind === 'table' ? (
          <DataPreview table={output.table} />
        ) : output?.kind === 'scalar' ? (
          <div className="text-lg font-semibold text-emerald-600">{output.value === null ? '空值' : String(output.value)}</div>
        ) : output?.kind === 'scalars' ? (
          <div className="space-y-0.5">
            {Object.entries(output.values).map(([k, v]) => (
              <div key={k} className="flex justify-between text-[11px]">
                <span className="text-slate-500">{k}</span>
                <span className="font-medium text-slate-700">{String(v ?? '')}</span>
              </div>
            ))}
          </div>
        ) : output?.kind === 'error' ? (
          <div className="text-[11px] text-red-600">{output.message}</div>
        ) : (
          <div className="text-[11px] text-slate-400">未执行</div>
        )}
      </div>

      {upstreamCandidates.length > 0 && (
        <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 p-2">
          <div className="mb-1 text-[10px] font-medium text-slate-500">上游数据来源（改接即重跑）</div>
          <select
            className="w-full rounded border border-slate-300 bg-white px-1.5 py-1 text-[11px] text-slate-700"
            value={node.inputs[0] ?? ''}
            onChange={(e) => onChangeUpstream(e.target.value)}
          >
            {upstreamCandidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {outIsTable && (
        <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 p-2">
          <div className="mb-1 text-[10px] font-medium text-slate-500">添加下游节点（自动接到本节点之后）</div>
          <div className="flex flex-wrap gap-1">
            {STEP_TYPES.map((s) => (
              <Btn key={s.type} size="xs" onClick={() => onAddDownstream(s.type)} title={s.hint}>
                {s.label}
              </Btn>
            ))}
          </div>
        </div>
      )}

      {srcDef && (
        <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 p-2">
          <div className="mb-1 text-[10px] font-medium text-slate-500">
            数据源配置
            <span className="ml-1 font-normal text-slate-400">
              {srcDef.kind === 'import'
                ? srcRt?.status === 'ready'
                  ? `已载入 ${srcRt.table?.rows.length ?? 0} 行`
                  : '尚未选择文件'
                : srcDef.kind === 'form'
                  ? '参数名即公式变量名'
                  : srcDef.kind === 'manualTable'
                    ? '数据随模板保存'
                    : '单个常量值'}
            </span>
          </div>
          {srcDef.kind === 'import' && (
            <ImportEditor
              sourceId={srcDef.id}
              sheetName={srcDef.sheetName}
              sheets={srcRt?.sheets ?? []}
              rt={srcRt}
              cacheData={srcDef.cacheData !== false}
            />
          )}
          {srcDef.kind === 'form' && <FormEditor sourceId={srcDef.id} entries={srcDef.entries} />}
          {srcDef.kind === 'constant' && (
            <Field label="常量值">
              <SourceValueInput sourceId={srcDef.id} value={srcDef.value} />
            </Field>
          )}
          {srcDef.kind === 'manualTable' && <ManualEditor sourceId={srcDef.id} columns={srcDef.columns} rows={srcDef.rows} />}
        </div>
      )}

      {(node.type === 'scalarOut' || node.type === 'formula') && (
        <p className="mt-2 text-[10px] text-slate-500">
          变量名：<code className="rounded bg-slate-100 px-1">{node.name}</code>，被 {refs} 个组件引用
        </p>
      )}

      <div className="mt-3 border-t border-slate-100 pt-2">
        <NodeFields node={node} cols={cols} />
      </div>

      <div className="mt-3 flex items-center gap-3 border-t border-slate-100 pt-2">
        <Check checked={node.enabled} label="启用该节点" onChange={() => updateNode(node.id, { enabled: !node.enabled })} />
        <Btn size="xs" tone="danger" onClick={deleteNode}>
          删除节点
        </Btn>
      </div>
      <p className="mt-2 text-[10px] leading-relaxed text-slate-400">
        提示：删除节点会连带清除下游节点的输入连线和绑定
        {node.type === 'source' ? '；数据源节点会连同数据源定义一起删除' : ''}
        ，操作前可先截图或在「导出模板」留档。
      </p>
    </aside>
  );
}

/** 常量源数值编辑（抽屉内） */
function SourceValueInput({ sourceId, value }: { sourceId: string; value: string }) {
  const updateSource = useCanvasStore((s) => s.updateSource);
  return <TextInput value={value} onChange={(v) => updateSource(sourceId, { value: v })} />;
}

/** 判断 from 节点是否（直接或间接）依赖 target —— 改接上游时防成环 */
function dependsOn(nodes: PipelineNode[], from: string, target: string): boolean {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const seen = new Set<string>();
  const stack = [from];
  while (stack.length > 0) {
    const id = stack.pop() as string;
    if (id === target) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    const n = byId.get(id);
    if (n) stack.push(...n.inputs);
  }
  return false;
}

/** 统计直接引用该节点的区块数（表格/数值/完成率绑定） */
function countBlockRefs(config: { blocks: unknown[] }, nodeId: string): number {
  let n = 0;
  const walk = (blocks: unknown[]): void => {
    for (const b of blocks) {
      if (!b || typeof b !== 'object') continue;
      const cfg = (b as { config?: Record<string, unknown> }).config;
      if (!cfg) continue;
      const table = cfg.table as { nodeRef?: string } | undefined;
      const value = cfg.value as { nodeRef?: string } | undefined;
      const ratio = cfg.ratio as { nodeRef?: string } | undefined;
      if (table?.nodeRef === nodeId) n += 1;
      if (value?.nodeRef === nodeId) n += 1;
      if (ratio?.nodeRef === nodeId) n += 1;
      if (Array.isArray(cfg.children)) walk(cfg.children);
    }
  };
  walk(config.blocks);
  return n;
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dropdown } from 'antd';
import { DeleteOutlined, MoonOutlined, PlusOutlined, PoweroffOutlined, SunOutlined } from '@ant-design/icons';
import type { MenuProps } from 'antd';
import { useCanvasStore } from '../../store/useCanvasStore';
import type { NodeOutput, NodeType, PipelineNode } from '../types';
import { computeFlowLayout, edgePath, NODE_H, NODE_W, type FlowPos } from './layout';
import FlowNodeCard from './FlowNodeCard';
import { nodeThemeVars, type NodeTheme } from './nodeTheme';
import { stepDef } from './nodes';
import NodeFields, { NODE_TYPE_LABELS } from './NodeFields';
import DataPreview from './DataPreview';
import { STEP_TYPES, defaultParams } from '../components/StepChainPanel';
import { createSourceOfKind, createStepNode, spotRightOf } from './nodeOps';
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
  const removeNode = useCanvasStore((s) => s.removeNode);
  const sourcesRt = useCanvasStore((s) => s.sources);
  const flowSelectedId = useCanvasStore((s) => s.flowSelectedId);
  const setFlowSelectedId = useCanvasStore((s) => s.setFlowSelectedId);
  const nodeTheme = useCanvasStore((s) => s.nodeTheme);
  const setNodeTheme = useCanvasStore((s) => s.setNodeTheme);

  const [zoom, setZoom] = useState(0.85);
  const [pan, setPan] = useState<FlowPos>({ x: 28, y: 28 });
  const [delta, setDelta] = useState<{ id: string; dx: number; dy: number } | null>(null);
  const [hint, setHint] = useState('');
  const [dropHover, setDropHover] = useState(false);
  const [heights, setHeights] = useState<Record<string, number>>({});
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  /** 端口连线拖拽：from=源节点，start=输出端口坐标，cur=指针画布坐标，hover=命中的合法目标 */
  const [connect, setConnect] = useState<{ from: string; start: FlowPos; cur: FlowPos; hover: string | null } | null>(null);
  const selectedId = flowSelectedId;

  /** 节点高度上报（ResizeObserver 测量）：连线锚点与自动布局按实际高度计算 */
  const handleHeight = useCallback((id: string, h: number): void => {
    setHeights((prev) => (Math.abs((prev[id] ?? 0) - h) < 1 ? prev : { ...prev, [id]: h }));
  }, []);

  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const panRef = useRef<{ startX: number; startY: number; ox: number; oy: number } | null>(null);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  const layout = useMemo(
    () => computeFlowLayout(config.pipeline.nodes, config.flowPos ?? {}, heights),
    [config.pipeline.nodes, config.flowPos, heights],
  );

  const nodeById = useMemo(() => new Map(config.pipeline.nodes.map((n) => [n.id, n])), [config.pipeline.nodes]);
  const selected = selectedId ? nodeById.get(selectedId) ?? null : null;

  // 切换选中节点时收起「添加下游」浮层
  useEffect(() => {
    setAddMenuOpen(false);
  }, [selectedId]);

  const toggleSelectedEnabled = (): void => {
    if (selected) updateNodeInStore(selected.id, { enabled: !selected.enabled });
  };

  const deleteSelectedNode = (): void => {
    if (!selected) return;
    if (selected.type === 'source') {
      const srcDef = config.dataSources.find((d) => d.id === String(selected.params.sourceId ?? ''));
      if (srcDef) removeSource(srcDef.id);
      else removeNode(selected.id);
    } else {
      removeNode(selected.id);
    }
    setFlowSelectedId(null);
  };

  const addDownstream = (type: NodeType): void => {
    if (!selectedId) return;
    addNodeOfType(type, selectedId);
    setAddMenuOpen(false);
  };

  /** 该节点的输出是否为表格（source 未执行时也按表格对待，便于先连线后导数据） */
  const isTableOut = (id: string): boolean => {
    const n = nodeById.get(id);
    if (!n) return false;
    if (n.type === 'source') return true;
    return outputs[id]?.kind === 'table';
  };

  /** 是否显示左侧输入端口（需要表格上游的步骤节点） */
  const acceptsInput = (n: PipelineNode): boolean => stepDef(n.type)?.needsTableInput === true;
  /** 是否显示右侧输出端口（取数/计算字段产出标量，不能作表格上游） */
  const hasOutPort = (n: PipelineNode): boolean => n.type !== 'formula' && n.type !== 'scalarOut';

  /** 连线校验：返回 null 表示可连，否则为不可连原因 */
  const connectError = (from: string, to: string): string | null => {
    if (from === to) return '不能连接到自己';
    const tn = nodeById.get(to);
    if (!tn || !acceptsInput(tn)) return '该节点没有表格输入端口';
    if (dependsOn(config.pipeline.nodes, from, to)) return '会形成循环依赖';
    return null;
  };

  /** 输出端口按下：开始连线拖拽 */
  const onPortDown = (e: React.PointerEvent, id: string): void => {
    e.stopPropagation();
    if (e.button !== 0) return;
    const pos = layout.byId[id];
    if (!pos) return;
    const p = withDelta(pos, delta);
    const h = heights[id] ?? NODE_H;
    const start = { x: p.x + NODE_W, y: p.y + h / 2 };
    containerRef.current?.setPointerCapture(e.pointerId);
    setConnect({ from: id, start, cur: start, hover: null });
  };

  // Esc 取消连线
  useEffect(() => {
    if (!connect) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setConnect(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [connect]);

  /** 添加节点：表格类步骤需指定上游表格节点；formula（计算字段）无需输入 */
  const addNodeOfType = (type: NodeType, inputId: string | null): void => {
    if (type !== 'formula' && (!inputId || !isTableOut(inputId))) {
      setHint('请先点选一个表格节点（数据源或处理步骤），再添加下游节点');
      setTimeout(() => setHint(''), 3500);
      return;
    }
    const node = createStepNode(config.pipeline.nodes, type, inputId);
    addNodeToStore(node);
    // 落点：优先放在上游节点右侧空位（重叠自动下移）；落点在视口外时平移画布显露
    const spot = spotRightOf(config.pipeline.nodes, config.flowPos ?? {}, heights, inputId);
    if (spot) {
      setFlowPos(node.id, spot);
      reveal(spot);
    }
    setFlowSelectedId(node.id);
  };

  /** 落点在视口外时做「最小平移」：只补足缺口让新节点进入视野，不居中、尽量保住上游节点可见 */
  const reveal = (pos: FlowPos): void => {
    const el = containerRef.current;
    if (!el) return;
    const vw = el.clientWidth;
    const vh = el.clientHeight;
    const m = 24;
    const sx = pos.x * zoom + pan.x;
    const sy = pos.y * zoom + pan.y;
    let dx = 0;
    let dy = 0;
    if (sx < m) dx = m - sx;
    else if (sx + NODE_W * zoom > vw - m) dx = vw - m - (sx + NODE_W * zoom);
    if (sy < m) dy = m - sy;
    else if (sy + NODE_H * zoom > vh - m) dy = vh - m - (sy + NODE_H * zoom);
    if (dx !== 0 || dy !== 0) setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
  };

  /** 上游候选：所有表格输出节点，排除自己与自己的下游（防成环） */
  const upstreamCandidates = useMemo(() => {
    if (!selected) return [];
    return config.pipeline.nodes.filter((n) => n.id !== selected.id && isTableOut(n.id) && !dependsOn(config.pipeline.nodes, n.id, selected.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.pipeline.nodes, outputs, selected]);

  /** 添加数据源（与左侧面板同一套创建逻辑）；节点 id 约定为 n_<sourceId> */
  const addSourceOfKind = (kind: DataSource['kind']): void => {
    const source = createSourceOfKind(config.dataSources, kind);
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
    // antd 弹层（Select 下拉/Dropdown/日期面板等）经 React portal 冒泡到本容器：
    // 不做指针捕获（否则弹层选项的 click 被重定向丢失）、不取消选中
    const t = e.target as HTMLElement | null;
    if (t?.closest('.ant-select-dropdown, .ant-dropdown, .ant-picker-dropdown, .ant-cascader-dropdown, .ant-modal-wrap, .ant-message, .ant-notification')) return;
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
    if (connect) {
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        const px = (e.clientX - rect.left - pan.x) / zoom;
        const py = (e.clientY - rect.top - pan.y) / zoom;
        const hit = hitNodeAt(px, py);
        setConnect({ ...connect, cur: { x: px, y: py }, hover: hit !== null && connectError(connect.from, hit) === null ? hit : null });
      }
      return;
    }
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
    if (connect) {
      if (connect.hover) {
        // 建立连线：默认替换上游；maxInputs>1 的节点（如合并）按追加处理（去重、超限时挤掉最旧）
        const tn = nodeById.get(connect.hover);
        const max = tn ? (stepDef(tn.type)?.maxInputs ?? 1) : 1;
        const prevInputs = tn?.inputs ?? [];
        const nextInputs =
          max > 1 && prevInputs.length > 0 && !prevInputs.includes(connect.from)
            ? [...prevInputs, connect.from].slice(-max)
            : [connect.from];
        updateNodeInStore(connect.hover, { inputs: nextInputs });
        setFlowSelectedId(connect.hover);
      } else {
        const hit = hitNodeAt(connect.cur.x, connect.cur.y);
        if (hit && hit !== connect.from) showHint(`无法连接：${connectError(connect.from, hit) ?? '目标不可用'}`);
      }
      setConnect(null);
      dragRef.current = null;
      panRef.current = null;
      setDelta(null);
      return;
    }
    const d = dragRef.current;
    if (d) {
      if (d.moved && delta) setFlowPos(d.id, { x: Math.round(d.origin.x + delta.dx), y: Math.round(d.origin.y + delta.dy) });
      else setFlowSelectedId(d.id);
      dragRef.current = null;
      setDelta(null);
    }
    panRef.current = null;
  };

  // ---- 节点库拖放：数据源落任意位置；处理节点落到表格节点上自动连为下游 ----
  const isLibDrag = (e: React.DragEvent): boolean =>
    e.dataTransfer.types.includes('text/x-new-source') || e.dataTransfer.types.includes('text/x-new-node');

  const onLibDragOver = (e: React.DragEvent): void => {
    if (!isLibDrag(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    if (!dropHover) setDropHover(true);
  };

  /** 指针位置命中的节点（用于处理节点建立连线），高度用实测值 */
  const hitNodeAt = (px: number, py: number): string | null => {
    for (const [id, pos] of Object.entries(layout.byId)) {
      const h = heights[id] ?? NODE_H;
      if (px >= pos.x && px <= pos.x + NODE_W && py >= pos.y && py <= pos.y + h) return id;
    }
    return null;
  };

  const showHint = (text: string): void => {
    setHint(text);
    setTimeout(() => setHint(''), 3500);
  };

  const onLibDrop = (e: React.DragEvent): void => {
    const srcKind = e.dataTransfer.getData('text/x-new-source');
    const nodeType = e.dataTransfer.getData('text/x-new-node');
    setDropHover(false);
    if (!srcKind && !nodeType) return;
    e.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const px = (e.clientX - rect.left - pan.x) / zoom;
    const py = (e.clientY - rect.top - pan.y) / zoom;

    if (srcKind) {
      const source = createSourceOfKind(config.dataSources, srcKind as DataSource['kind']);
      addSource(source);
      setFlowPos(`n_${source.id}`, { x: Math.round(px - NODE_W / 2), y: Math.round(py - NODE_H / 2) });
      setFlowSelectedId(`n_${source.id}`);
      return;
    }

    const type = nodeType as NodeType;
    const hitId = hitNodeAt(px, py);
    const hitOk = hitId && isTableOut(hitId) ? hitId : null;
    const inputId = type === 'formula' ? null : hitOk ?? (flowSelectedId && isTableOut(flowSelectedId) ? flowSelectedId : null);
    if (type !== 'formula' && !inputId) {
      showHint('处理节点请拖到表格节点上（自动连为下游），或先点选一个表格节点');
      return;
    }
    const node = createStepNode(config.pipeline.nodes, type, inputId);
    addNodeToStore(node);
    // 命中节点时放在其右侧下游位；否则放在落点居中
    const pos = hitOk
      ? { x: Math.round((layout.byId[hitOk]?.x ?? px) + NODE_W + 48), y: Math.round(layout.byId[hitOk]?.y ?? py) }
      : { x: Math.round(px - NODE_W / 2), y: Math.round(py - NODE_H / 2) };
    setFlowPos(node.id, pos);
    setFlowSelectedId(node.id);
  };

  return (
    <div
      className={embedded ? 'flex h-full min-w-0 flex-1 flex-col bg-[#f7f9fc]' : 'fixed inset-0 z-50 flex flex-col bg-[#f7f9fc]'}
      style={nodeThemeVars(nodeTheme)}
    >
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
            <Btn
              size="xs"
              title={nodeTheme === 'dark' ? '切换为浅色节点（浅灰卡+深灰头）' : '切换为深色节点（ComfyUI 深色）'}
              onClick={() => setNodeTheme((nodeTheme === 'dark' ? 'light' : 'dark') as NodeTheme)}
            >
              {nodeTheme === 'dark' ? <SunOutlined /> : <MoonOutlined />}
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
            {config.pipeline.nodes.length} 个节点 · 从左侧节点库拖入 · 点选节点后在右侧修改配置 · 滚轮缩放
          </span>
          <div className="ml-auto flex items-center gap-2">
            <AddNodeMenu selected={selected} isTableOut={isTableOut} onAddSource={addSourceOfKind} onAddNode={addNodeOfType} />
            <Btn size="xs" onClick={fit}>
              适应视图
            </Btn>
            <Btn size="xs" onClick={() => { resetFlowPos(); setDelta(null); setTimeout(fit, 20); }}>
              自动排列
            </Btn>
            <Btn
              size="xs"
              title={nodeTheme === 'dark' ? '切换为浅色节点（浅灰卡+深灰头）' : '切换为深色节点（ComfyUI 深色）'}
              onClick={() => setNodeTheme((nodeTheme === 'dark' ? 'light' : 'dark') as NodeTheme)}
            >
              {nodeTheme === 'dark' ? <SunOutlined /> : <MoonOutlined />}
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
          onDragOver={onLibDragOver}
          onDragLeave={(e) => {
            if (isLibDrag(e) && e.target === containerRef.current) setDropHover(false);
          }}
          onDrop={onLibDrop}
          data-drop-hover={dropHover ? '1' : undefined}
        >
          {dropHover && <div className="pointer-events-none absolute inset-2 rounded-lg border-2 border-dashed border-blue-400 bg-blue-50/30" />}

          <div
            className="absolute left-0 top-0"
            style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: '0 0', width: layout.width, height: layout.height }}
          >
            <svg width={layout.width} height={layout.height} className="pointer-events-none absolute left-0 top-0 overflow-visible">
              <defs>
                <marker id="nb-arrow" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto">
                  <path d="M0,0 L9,4.5 L0,9 z" style={{ fill: 'var(--nb-edge)' }} />
                </marker>
                <marker id="nb-arrow-bad" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto">
                  <path d="M0,0 L9,4.5 L0,9 z" style={{ fill: 'var(--nb-edge-bad)' }} />
                </marker>
                <marker id="nb-arrow-active" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto">
                  <path d="M0,0 L9,4.5 L0,9 z" fill="#2563eb" />
                </marker>
              </defs>
              {layout.edges.map((e) => {
                const from = layout.byId[e.from];
                const to = layout.byId[e.to];
                if (!from || !to) return null;
                const bad = outputs[e.to]?.kind === 'error';
                // 选中节点时高亮其上下游连线，其余淡出
                const active = selectedId !== null && (e.from === selectedId || e.to === selectedId);
                return (
                  <path
                    key={`${e.from}->${e.to}`}
                    d={edgePath(withDelta(from, delta), withDelta(to, delta), heights[e.from] ?? NODE_H, heights[e.to] ?? NODE_H)}
                    fill="none"
                    stroke={bad ? 'var(--nb-edge-bad)' : active ? '#2563eb' : 'var(--nb-edge)'}
                    strokeWidth={active ? 2.5 : 2}
                    opacity={selectedId !== null && !active ? 0.35 : 1}
                    markerEnd={bad ? 'url(#nb-arrow-bad)' : active ? 'url(#nb-arrow-active)' : 'url(#nb-arrow)'}
                  />
                );
              })}
              {/* 连线拖拽的 ghost 虚线 */}
              {connect && (
                <path d={ghostPath(connect.start, connect.cur)} fill="none" stroke="#2563eb" strokeWidth={2} strokeDasharray="6 4" />
              )}
            </svg>

            {layout.nodes.map((n) => {
              const node = nodeById.get(n.id);
              if (!node) return null;
              const pos = withDelta(n, delta);
              const srcId = node.type === 'source' ? String(node.params.sourceId ?? '') : '';
              return (
                <FlowNodeCard
                  key={n.id}
                  node={node}
                  output={outputs[n.id]}
                  srcDef={srcId ? config.dataSources.find((d) => d.id === srcId) : undefined}
                  srcRt={srcId ? sourcesRt[srcId] : undefined}
                  x={pos.x}
                  y={pos.y}
                  selected={selectedId === n.id}
                  dragging={delta?.id === n.id}
                  onPointerDown={(e) => onNodeDown(e, n.id, { x: n.x, y: n.y })}
                  onHeight={handleHeight}
                />
              );
            })}

            {/* 连接端口：右侧输出点（可拖到下游建立连线）、左侧输入点（放置目标高亮） */}
            {layout.nodes.map((n) => {
              const node = nodeById.get(n.id);
              if (!node) return null;
              const pos = withDelta(n, delta);
              const h = heights[n.id] ?? NODE_H;
              const cy = pos.y + h / 2;
              const canIn = acceptsInput(node);
              const canOut = hasOutPort(node);
              if (!canIn && !canOut) return null;
              const isHoverTarget = connect?.hover === n.id;
              // 连线拖拽中：不可连目标的输入端口淡出
              const inDimmed = connect !== null && connect.from !== n.id && canIn && connectError(connect.from, n.id) !== null;
              return (
                <div key={`ports-${n.id}`} className="pointer-events-none absolute left-0 top-0">
                  {canOut && (
                    <div
                      onPointerDown={(e) => onPortDown(e, n.id)}
                      title="按住拖到下游节点建立连线"
                      className="pointer-events-auto absolute h-3 w-3 cursor-crosshair rounded-full border-2 bg-[var(--nb-surface)] transition-transform hover:scale-125"
                      style={{ left: pos.x + NODE_W - 6, top: cy - 6, borderColor: connect?.from === n.id ? '#2563eb' : 'var(--nb-edge)' }}
                    />
                  )}
                  {canIn && (
                    <div
                      className={`pointer-events-auto absolute h-3 w-3 rounded-full border-2 bg-[var(--nb-surface)] transition-transform ${isHoverTarget ? 'scale-150' : ''}`}
                      style={{
                        left: pos.x - 6,
                        top: cy - 6,
                        borderColor: isHoverTarget ? '#2563eb' : 'var(--nb-edge)',
                        opacity: inDimmed ? 0.3 : 1,
                        boxShadow: isHoverTarget ? '0 0 0 5px rgba(37,99,235,0.25)' : undefined,
                      }}
                    />
                  )}
                </div>
              );
            })}

            {/* 选中节点浮动工具条：添加下游 / 启用停用 / 删除（随缩放反向缩放保持可点面积） */}
            {selected && layout.byId[selected.id] && (
              <SelectionToolbar
                anchor={withDelta(layout.byId[selected.id], delta)}
                zoom={zoom}
                node={selected}
                outIsTable={selected.type === 'source' || outputs[selected.id]?.kind === 'table'}
                addMenuOpen={addMenuOpen}
                onToggleAddMenu={() => {
                  if (selected.type === 'source' || outputs[selected.id]?.kind === 'table') setAddMenuOpen((v) => !v);
                  else showHint('该节点的输出不是表格，无法再接处理节点');
                }}
                onAddDownstream={addDownstream}
                onToggleEnabled={toggleSelectedEnabled}
                onDelete={deleteSelectedNode}
              />
            )}
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

/** 连线拖拽 ghost 线的贝塞尔路径（从输出端口到指针） */
function ghostPath(from: FlowPos, to: FlowPos): string {
  const dx = Math.max(30, Math.abs(to.x - from.x) * 0.45);
  return `M ${from.x} ${from.y} C ${from.x + dx} ${from.y}, ${to.x - dx} ${to.y}, ${to.x} ${to.y}`;
}

/** 选中节点的浮动工具条：锚在节点顶部居中上方，随缩放反向缩放 */
function SelectionToolbar({
  anchor,
  zoom,
  node,
  outIsTable,
  addMenuOpen,
  onToggleAddMenu,
  onAddDownstream,
  onToggleEnabled,
  onDelete,
}: {
  anchor: FlowPos;
  zoom: number;
  node: PipelineNode;
  outIsTable: boolean;
  addMenuOpen: boolean;
  onToggleAddMenu: () => void;
  onAddDownstream: (type: NodeType) => void;
  onToggleEnabled: () => void;
  onDelete: () => void;
}) {
  const inv = 1 / Math.max(0.5, Math.min(1.8, zoom));
  return (
    <div className="absolute" style={{ left: anchor.x + NODE_W / 2, top: anchor.y, width: 0, height: 0 }}>
      {/* 添加下游浮层：列出全部处理节点类型 */}
      {addMenuOpen && outIsTable && (
        <div
          className="absolute flex items-center gap-1 whitespace-nowrap rounded-full border border-[var(--nb-pop-border)] bg-[var(--nb-pop-surface)] px-2 py-1.5 shadow-lg backdrop-blur"
          style={{ bottom: 44, transform: `translateX(-50%) scale(${inv})`, transformOrigin: 'bottom center' }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <span className="pr-0.5 text-[10px] text-[var(--nb-text-faint)]">添加下游</span>
          {STEP_TYPES.map((s) => (
            <button
              key={s.type}
              type="button"
              title={s.hint}
              onClick={() => onAddDownstream(s.type)}
              className="rounded-full border border-[var(--nb-control-border)] bg-[var(--nb-control-bg)] px-2 py-[3px] text-[10.5px] text-[var(--nb-pop-text)] transition-colors hover:border-blue-500/70 hover:bg-[var(--nb-control-hover)] hover:text-blue-500"
            >
              {s.label}
            </button>
          ))}
          <button
            type="button"
            title="公式产出新变量"
            onClick={() => onAddDownstream('formula')}
            className="rounded-full border border-emerald-500/50 bg-emerald-500/15 px-2 py-[3px] text-[10.5px] text-emerald-300 transition-colors hover:bg-emerald-500/25"
          >
            ƒ 计算字段
          </button>
        </div>
      )}

      <div
        className="absolute flex items-center gap-1 whitespace-nowrap rounded-full border border-[var(--nb-pop-border)] bg-[var(--nb-pop-surface)] px-1.5 py-1 shadow-lg backdrop-blur"
        style={{ bottom: 10, transform: `translateX(-50%) scale(${inv})`, transformOrigin: 'bottom center' }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          title={outIsTable ? '添加下游节点' : '该节点输出不是表格'}
          onClick={onToggleAddMenu}
          className="flex h-6 w-6 items-center justify-center rounded-full text-blue-400 transition-colors hover:bg-blue-500/20"
        >
          <PlusOutlined style={{ fontSize: 13 }} />
        </button>
        <button
          type="button"
          title={node.enabled ? '停用该节点' : '启用该节点'}
          onClick={onToggleEnabled}
          className={`flex h-6 w-6 items-center justify-center rounded-full transition-colors ${
            node.enabled ? 'text-emerald-400 hover:bg-emerald-500/20' : 'text-slate-500 hover:bg-slate-500/20'
          }`}
        >
          <PoweroffOutlined style={{ fontSize: 13 }} />
        </button>
        <button
          type="button"
          title="删除节点"
          onClick={onDelete}
          className="flex h-6 w-6 items-center justify-center rounded-full text-red-400 transition-colors hover:bg-red-500/20"
        >
          <DeleteOutlined style={{ fontSize: 13 }} />
        </button>
      </div>
    </div>
  );
}

function Legend() {
  return (
    <div className="pointer-events-none absolute bottom-3 left-3 flex flex-wrap gap-3 rounded-md bg-white/90 px-2.5 py-1.5 text-[10px] text-slate-500 shadow-sm">
      <span className="flex items-center gap-1">
        <i className="inline-block h-2 w-2 rounded-sm bg-blue-500" />
        数据源
      </span>
      <span className="flex items-center gap-1">
        <i className="inline-block h-2 w-2 rounded-sm bg-slate-500" />
        表格处理
      </span>
      <span className="flex items-center gap-1">
        <i className="inline-block h-2 w-2 rounded-sm bg-emerald-500" />
        数值 / 公式
      </span>
      <span className="flex items-center gap-1">
        <i className="inline-block h-2 w-2 rounded-sm bg-red-500" />
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

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Dropdown } from 'antd';
import { DeleteOutlined, MoonOutlined, PauseCircleOutlined, PlayCircleOutlined, PlusOutlined, PoweroffOutlined, SearchOutlined, SunOutlined } from '@ant-design/icons';
import type { MenuProps } from 'antd';
import { useCanvasStore } from '../../store/useCanvasStore';
import type { NodeOutput, NodeType, PipelineNode , CanvasBlock } from '../types';
import { computeFlowLayout, edgeMid, edgePath, NODE_H, NODE_W, rectsIntersect, type FlowPos } from './layout';
import FlowNodeCard from './FlowNodeCard';
import { nodeThemeVars, type NodeTheme } from './nodeTheme';
import { NODE_TYPE_META, stepDef } from './nodes';
import EmptyGuide from '../components/EmptyGuide';
import NodeFields, { NODE_TYPE_LABELS } from './NodeFields';
import DataPreview from './DataPreview';
import { getVal } from '../../parser/clean';
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
  /** 被拖动的全部节点（多选群移；单选时长度为 1） */
  ids: string[];
  startX: number;
  startY: number;
  /** 各节点拖动前位置 */
  origins: Record<string, FlowPos>;
  moved: boolean;
  /** Ctrl/Shift+点击：抬起时切换选中而非拖动 */
  toggleOnUp?: string;
}

interface ScreenRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export default function FlowSheet({ embedded = false }: { embedded?: boolean }) {
  const config = useCanvasStore((s) => s.config);
  const outputs = useCanvasStore((s) => s.outputs);
  const setShowFlow = useCanvasStore((s) => s.setShowFlow);
  const setFlowPos = useCanvasStore((s) => s.setFlowPos);
  const setFlowPosMany = useCanvasStore((s) => s.setFlowPosMany);
  const transact = useCanvasStore((s) => s.transact);
  const resetFlowPos = useCanvasStore((s) => s.resetFlowPos);
  const addNodeToStore = useCanvasStore((s) => s.addNode);
  const updateNodeInStore = useCanvasStore((s) => s.updateNode);
  const addSource = useCanvasStore((s) => s.addSource);
  const removeSource = useCanvasStore((s) => s.removeSource);
  const removeNode = useCanvasStore((s) => s.removeNode);
  const sourcesRt = useCanvasStore((s) => s.sources);
  const flowSelectedId = useCanvasStore((s) => s.flowSelectedId);
  const setFlowSelectedId = useCanvasStore((s) => s.setFlowSelectedId);
  const flowSelectedIds = useCanvasStore((s) => s.flowSelectedIds);
  const setFlowSelectedIds = useCanvasStore((s) => s.setFlowSelectedIds);
  const toggleFlowSelected = useCanvasStore((s) => s.toggleFlowSelected);
  const nodeTheme = useCanvasStore((s) => s.uiTheme); // 节点主题跟随编辑器全局主题（统一观感）
  const setNodeTheme = useCanvasStore((s) => s.setNodeTheme);

  const [zoom, setZoom] = useState(0.85);
  const [pan, setPan] = useState<FlowPos>({ x: 28, y: 28 });
  const [delta, setDelta] = useState<{ ids: string[]; dx: number; dy: number } | null>(null);
  const [hint, setHint] = useState('');
  const [dropHover, setDropHover] = useState(false);
  const [heights, setHeights] = useState<Record<string, number>>({});
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [nodeDataOpen, setNodeDataOpen] = useState(true);
  /** 端口连线拖拽：from=源节点，start=输出端口坐标，cur=指针画布坐标，hover=命中的合法目标 */
  const [connect, setConnect] = useState<{ from: string; start: FlowPos; cur: FlowPos; hover: string | null } | null>(null);
  /** 框选（Shift+背景拖拽）：画布坐标起止点 */
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number; additive: boolean } | null>(null);
  /** 选中的连线（点击选中后 Delete 或中点 ✕ 删除；与节点选择互斥） */
  const [edgeSel, setEdgeSel] = useState<{ from: string; to: string } | null>(null);
  const [edgeInsertOpen, setEdgeInsertOpen] = useState(false);
  const selectedId = flowSelectedId;

  /** 节点高度上报（ResizeObserver 测量）：连线锚点与自动布局按实际高度计算 */
  const handleHeight = useCallback((id: string, h: number): void => {
    setHeights((prev) => (Math.abs((prev[id] ?? 0) - h) < 1 ? prev : { ...prev, [id]: h }));
  }, []);

  const containerRef = useRef<HTMLDivElement>(null);
  const [canvasBounds, setCanvasBounds] = useState<ScreenRect | null>(null);
  const initialFitDoneRef = useRef(false);
  const dragRef = useRef<DragState | null>(null);
  const panRef = useRef<{ startX: number; startY: number; ox: number; oy: number } | null>(null);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = (): void => {
      const r = el.getBoundingClientRect();
      const next = { left: r.left, top: r.top, width: r.width, height: r.height };
      setCanvasBounds((prev) => prev && Math.abs(prev.left - next.left) < 1 && Math.abs(prev.top - next.top) < 1 && Math.abs(prev.width - next.width) < 1 && Math.abs(prev.height - next.height) < 1 ? prev : next);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  const layout = useMemo(
    () => computeFlowLayout(config.pipeline.nodes, config.flowPos ?? {}, heights, flowSelectedIds.length === 1 ? flowSelectedIds[0] : undefined),
    [config.pipeline.nodes, config.flowPos, heights, flowSelectedIds],
  );
  const screenNodeRects = useMemo(() => {
    if (!canvasBounds) return {} as Record<string, ScreenRect>;
    return Object.fromEntries(layout.nodes.map((n) => {
      const pos = withDelta(n, delta);
      return [n.id, {
        left: canvasBounds.left + pan.x + zoom * pos.x,
        top: canvasBounds.top + pan.y + zoom * pos.y,
        width: NODE_W * zoom,
        height: (heights[n.id] ?? NODE_H) * zoom,
      }];
    }));
  }, [layout.nodes, canvasBounds, pan, zoom, delta, heights]);
  const miniScale = Math.min(160 / Math.max(1, layout.width), 92 / Math.max(1, layout.height));

  const nodeById = useMemo(() => new Map(config.pipeline.nodes.map((n) => [n.id, n])), [config.pipeline.nodes]);
  const selectedIds = flowSelectedIds;
  /** 恰好单选时才有单节点上下文（工具条/抽屉） */
  const selected = selectedIds.length === 1 ? nodeById.get(selectedIds[0]) ?? null : null;
  const isSel = (id: string): boolean => selectedIds.includes(id);

  // 切换选中节点时收起「添加下游」浮层
  useEffect(() => {
    setAddMenuOpen(false);
  }, [selectedId]);

  useEffect(() => {
    if (selectedId) setNodeDataOpen(true);
    else setNodeDataOpen(false);
  }, [selectedId]);

  /** 批量启用/停用（ids 为空时无操作） */
  const setEnabledBulk = (ids: string[], enabled: boolean): void => {
    for (const id of ids) updateNodeInStore(id, { enabled });
  };

  /** 批量删除（source 节点连同数据源一并删除；引擎侧会自动清下游 inputs 引用；一次事务=一步撤销） */
  const deleteNodes = (ids: string[]): void => {
    transact('del-nodes', () => {
      for (const id of ids) {
        const n = nodeById.get(id);
        if (!n) continue;
        if (n.type === 'source') {
          const srcDef = config.dataSources.find((d) => d.id === String(n.params.sourceId ?? ''));
          if (srcDef) removeSource(srcDef.id);
          else removeNode(id);
        } else {
          removeNode(id);
        }
      }
    });
    setFlowSelectedIds([]);
  };

  const toggleSelectedEnabled = (): void => {
    if (selected) updateNodeInStore(selected.id, { enabled: !selected.enabled });
  };

  const deleteSelectedNode = (): void => {
    deleteNodes(selectedIds.slice());
  };

  /** 删除连线：断开目标节点的该上游（union 等多输入节点的其余输入保留） */
  const removeEdge = (from: string, to: string): void => {
    const tn = nodeById.get(to);
    if (!tn) return;
    transact('del-edge', () => {
      updateNodeInStore(to, { inputs: tn.inputs.filter((i) => i !== from) });
    });
    setEdgeSel(null);
    showHint('已删除连线');
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
  const acceptsInput = (n: PipelineNode): boolean => stepDef(n.type)?.needsTableInput === true || n.type === 'formula';
  /** 公式节点无上游时产出标量；接入表格后产出逐行计算表 */
  const hasOutPort = (n: PipelineNode): boolean => n.type !== 'scalarOut' && (n.type !== 'formula' || n.inputs.length > 0);

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
      if ((e.target as HTMLElement | null)?.closest('[role="dialog"]')) return;
      if (e.key === 'Escape') setConnect(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [connect]);

  // 多选快捷键：Delete/Backspace 删除选中、Ctrl/Cmd+A 全选、Esc 清空选择（输入控件内不响应）
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.target as HTMLElement | null)?.closest('[role="dialog"]')) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (e.key === 'Escape' && !connect) {
        if (edgeSel) {
          setEdgeSel(null);
          return;
        }
        if (selectedIds.length > 0) {
          setFlowSelectedIds([]);
          return;
        }
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && edgeSel) {
        e.preventDefault();
        removeEdge(edgeSel.from, edgeSel.to);
        return;
      }
      if (selectedIds.length === 0) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteNodes(selectedIds.slice());
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
        setFlowSelectedIds(config.pipeline.nodes.map((n) => n.id));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds, config.pipeline.nodes, connect, edgeSel]);

  /** 添加节点：表格类步骤需指定上游表格节点；formula（计算字段）无需输入 */
  const addNodeOfType = (type: NodeType, inputId: string | null): void => {
    if (type !== 'formula' && (!inputId || !isTableOut(inputId))) {
      setHint('请先点选一个表格节点（数据源或处理步骤），再添加下游节点');
      setTimeout(() => setHint(''), 3500);
      return;
    }
    const node = createStepNode(config.pipeline.nodes, type, inputId);
    // 落点：优先放在上游节点右侧空位（重叠自动下移）；落点在视口外时平移画布显露
    const spot = spotRightOf(config.pipeline.nodes, config.flowPos ?? {}, heights, inputId);
    // 添加+落点合并为一步撤销
    transact('add-node', () => {
      addNodeToStore(node);
      if (spot) setFlowPos(node.id, spot);
    });
    if (spot) reveal(spot);
    setFlowSelectedId(node.id);
  };

  /** 连线上插入新节点：新建节点接上 from，to 的输入重定向到新节点（单步撤销） */
  const insertNodeOnEdge = (type: NodeType): void => {
    if (!edgeSel) return;
    const { from, to } = edgeSel;
    const toNode = nodeById.get(to);
    if (!toNode) return;
    const node = createStepNode(config.pipeline.nodes, type, from);
    const pf = layout.byId[from];
    const pt = layout.byId[to];
    const spot = pf && pt ? { x: (pf.x + pt.x) / 2 - NODE_W / 2, y: (pf.y + pt.y) / 2 } : null;
    transact('insert-node', () => {
      addNodeToStore(node);
      if (spot) setFlowPos(node.id, spot);
      // 重连：to 的输入 from → 新节点
      updateNodeInStore(to, { inputs: toNode.inputs.map((i) => (i === from ? node.id : i)) });
    });
    setFlowSelectedId(node.id);
    setEdgeSel(null);
    setEdgeInsertOpen(false);
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
    const nz = Math.max(0.18, Math.min(1.2, z));
    setZoom(nz);
    setPan({ x: (w - layout.width * nz) / 2, y: Math.max(20, (h - layout.height * nz) / 2) });
  };

  useEffect(() => {
    const onQuickAdd = (e: KeyboardEvent): void => {
      if ((e.target as HTMLElement | null)?.closest('[role="dialog"]')) return;
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'k') return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      e.preventDefault();
      setQuickAddOpen(true);
    };
    window.addEventListener('keydown', onQuickAdd);
    return () => window.removeEventListener('keydown', onQuickAdd);
  }, []);

  // 首次进入：等所有卡片报告真实高度后再适应视图，避免按占位尺寸缩放造成大片空白。
  useEffect(() => {
    const fxnode = new URLSearchParams(window.location.search).get('fxnode');
    if (fxnode) setFlowSelectedId(fxnode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (initialFitDoneRef.current || config.pipeline.nodes.length === 0 || Object.keys(heights).length < config.pipeline.nodes.length) return;
    initialFitDoneRef.current = true;
    requestAnimationFrame(fit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heights, config.pipeline.nodes.length]);

  // Esc 关闭（仅独立全屏模式；嵌入数据节点视图时无「关闭」概念）
  useEffect(() => {
    if (embedded) return;
    const onKey = (e: KeyboardEvent): void => {
      if ((e.target as HTMLElement | null)?.closest('[role="dialog"]')) return;
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
    // Shift+背景拖拽 = 框选（不平移画布；Ctrl/Cmd 同按时为追加模式）
    if (e.shiftKey) {
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        const px = (e.clientX - rect.left - pan.x) / zoom;
        const py = (e.clientY - rect.top - pan.y) / zoom;
        setMarquee({ x0: px, y0: py, x1: px, y1: py, additive: e.ctrlKey || e.metaKey });
      }
      return;
    }
    panRef.current = { startX: e.clientX, startY: e.clientY, ox: pan.x, oy: pan.y };
    setFlowSelectedIds([]);
    setEdgeSel(null);
  };

  const onNodeDown = (e: React.PointerEvent, nodeId: string, node: FlowPos): void => {
    e.stopPropagation();
    if (e.button !== 0) return;
    setNodeDataOpen(true);
    setEdgeSel(null);
    containerRef.current?.setPointerCapture(e.pointerId);
    // Ctrl/Shift+点击：抬起时切换选中（不进入拖动）
    if (e.ctrlKey || e.metaKey || e.shiftKey) {
      dragRef.current = { ids: [nodeId], startX: e.clientX, startY: e.clientY, origins: { [nodeId]: { x: node.x, y: node.y } }, moved: false, toggleOnUp: nodeId };
      return;
    }
    // 点在已选中的节点上：整组群移；否则单选它并拖动
    const ids = isSel(nodeId) ? selectedIds.slice() : [nodeId];
    if (!isSel(nodeId)) setFlowSelectedId(nodeId);
    const origins: Record<string, FlowPos> = {};
    for (const id of ids) {
      const p = layout.byId[id];
      origins[id] = id === nodeId ? { x: node.x, y: node.y } : { x: p?.x ?? node.x, y: p?.y ?? node.y };
    }
    dragRef.current = { ids, startX: e.clientX, startY: e.clientY, origins, moved: false };
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
    if (marquee) {
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        const px = (e.clientX - rect.left - pan.x) / zoom;
        const py = (e.clientY - rect.top - pan.y) / zoom;
        setMarquee({ ...marquee, x1: px, y1: py });
      }
      return;
    }
    const d = dragRef.current;
    if (d) {
      const dx = (e.clientX - d.startX) / zoom;
      const dy = (e.clientY - d.startY) / zoom;
      if (Math.abs(dx) + Math.abs(dy) > 2) d.moved = true;
      setDelta({ ids: d.ids, dx, dy });
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
    // 框选提交：命中矩形内所有节点（additive 时并入既有选择）
    if (marquee) {
      const rx = Math.min(marquee.x0, marquee.x1);
      const ry = Math.min(marquee.y0, marquee.y1);
      const rw = Math.abs(marquee.x1 - marquee.x0);
      const rh = Math.abs(marquee.y1 - marquee.y0);
      if (rw > 4 || rh > 4) {
        const hitIds = layout.nodes
          .filter((n) => rectsIntersect({ x: rx, y: ry, w: rw, h: rh }, { x: n.x, y: n.y, w: NODE_W, h: heights[n.id] ?? NODE_H }))
          .map((n) => n.id);
        const next = marquee.additive ? Array.from(new Set([...selectedIds, ...hitIds])) : hitIds;
        setFlowSelectedIds(next);
      } else if (!marquee.additive) {
        setFlowSelectedIds([]);
      }
      setMarquee(null);
      panRef.current = null;
      dragRef.current = null;
      setDelta(null);
      return;
    }
    const d = dragRef.current;
    if (d) {
      if (d.toggleOnUp && !d.moved) {
        // Ctrl/Shift+点击：切换选中
        toggleFlowSelected(d.toggleOnUp);
      } else if (d.moved && delta) {
        // 群移提交：整组按各自原始位置 + 同一 delta 落点（一次事务=一步撤销）
        const entries = d.ids
          .map((id) => {
            const o = d.origins[id];
            return o ? { id, pos: { x: Math.round(o.x + delta.dx), y: Math.round(o.y + delta.dy) } } : null;
          })
          .filter((x): x is { id: string; pos: FlowPos } => x !== null);
        if (entries.length === 1) setFlowPos(entries[0].id, entries[0].pos);
        else if (entries.length > 1) setFlowPosMany(entries);
      } else if (!d.toggleOnUp) {
        setFlowSelectedId(d.ids[0]);
      }
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
    const inputId = type === 'formula' ? hitOk : hitOk ?? (flowSelectedId && isTableOut(flowSelectedId) ? flowSelectedId : null);
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
      className={embedded ? 'flex h-full min-w-0 flex-1 flex-col bg-base' : 'fixed inset-0 z-50 flex flex-col bg-base'}
      style={nodeThemeVars(nodeTheme)}
    >
      {!embedded && (
        <div className="flex items-center gap-3 border-b border-line bg-panel px-5 py-2.5">
          <div className="flex items-baseline gap-2">
            <h2 className="text-sm font-semibold text-ink">数据流视图</h2>
            <span className="text-[11px] text-ink-faint">
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
                open={quickAddOpen}
                onOpenChange={setQuickAddOpen}
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
        <div className="border-b border-warn/30 bg-warn-soft px-5 py-1.5 text-[11px] text-warn">{hint}</div>
      )}

      {embedded && (
        <div className="flex items-center gap-2 border-b border-line bg-panel px-3 py-2">
          <span className="text-[11.5px] text-ink-faint">
            {config.pipeline.nodes.length} 个节点 · 选中节点可直接配置 · 滚轮缩放，拖动画布平移
          </span>
          <div className="ml-auto flex items-center gap-2">
            <AddNodeMenu selected={selected} isTableOut={isTableOut} onAddSource={addSourceOfKind} onAddNode={addNodeOfType} open={quickAddOpen} onOpenChange={setQuickAddOpen} />
            <Btn size="xs" onClick={fit}>
              适应视图
            </Btn>
            <Btn size="xs" onClick={() => { resetFlowPos(); setDelta(null); setTimeout(fit, 20); }}>
              自动排列
            </Btn>
          </div>
        </div>
      )}

      <div className="relative flex min-h-0 flex-1">
        <div
          ref={containerRef}
          className="relative min-w-0 flex-1 cursor-default overflow-hidden"
          style={{
            backgroundImage: 'radial-gradient(var(--ui-grid-dot) 0.7px, transparent 0.7px)',
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
          {dropHover && <div className="pointer-events-none absolute inset-2 rounded-lg border-2 border-dashed border-brand-line bg-brand-soft/30" />}

          {/* 空态引导：没有任何节点时给出最短上手路径 */}
          {config.pipeline.nodes.length === 0 && <EmptyGuide variant="node" />}

          <div
            className="absolute left-0 top-0"
            style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: '0 0', width: layout.width, height: layout.height }}
          >
            <svg width={layout.width} height={layout.height} className="pointer-events-none absolute left-0 top-0 overflow-visible">
              <defs>
                <marker id="nb-arrow" markerWidth="9" markerHeight="8" viewBox="0 0 9 8" refX="9" refY="4" markerUnits="userSpaceOnUse" orient="auto">
                  <path d="M0,0 L9,4 L0,8 z" style={{ fill: 'var(--nb-edge)' }} />
                </marker>
                <marker id="nb-arrow-bad" markerWidth="9" markerHeight="8" viewBox="0 0 9 8" refX="9" refY="4" markerUnits="userSpaceOnUse" orient="auto">
                  <path d="M0,0 L9,4 L0,8 z" style={{ fill: 'var(--nb-edge-bad)' }} />
                </marker>
                <marker id="nb-arrow-active" markerWidth="9" markerHeight="8" viewBox="0 0 9 8" refX="9" refY="4" markerUnits="userSpaceOnUse" orient="auto">
                  <path d="M0,0 L9,4 L0,8 z" fill="var(--ui-brand)" />
                </marker>
                <marker id="nb-arrow-del" markerWidth="9" markerHeight="8" viewBox="0 0 9 8" refX="9" refY="4" markerUnits="userSpaceOnUse" orient="auto">
                  <path d="M0,0 L9,4 L0,8 z" fill="#dc2626" />
                </marker>
              </defs>
              {layout.edges.map((e) => {
                const from = layout.byId[e.from];
                const to = layout.byId[e.to];
                if (!from || !to) return null;
                const bad = outputs[e.to]?.kind === 'error';
                // 选中（含多选）节点时高亮其上下游连线，其余淡出
                const active = isSel(e.from) || isSel(e.to);
                const selEdge = edgeSel !== null && edgeSel.from === e.from && edgeSel.to === e.to;
                const d = edgePath(withDelta(from, delta), withDelta(to, delta), heights[e.from] ?? NODE_H, heights[e.to] ?? NODE_H, e.lane);
                return (
                  <g key={`${e.from}->${e.to}`}>
                    {/* 加宽的隐形命中层：让细线易于点选 */}
                    <path
                      d={d}
                      fill="none"
                      stroke="transparent"
                      strokeWidth={14}
                      style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                      onPointerDown={(ev) => {
                        ev.stopPropagation();
                        setEdgeSel(selEdge ? null : { from: e.from, to: e.to });
                        setFlowSelectedIds([]);
                      }}
                    >
                      <title>点击选中连线，按 Delete 删除</title>
                    </path>
                    <path
                      d={d}
                      fill="none"
                      stroke={selEdge ? '#dc2626' : bad ? 'var(--nb-edge-bad)' : active ? 'var(--ui-brand)' : 'var(--nb-edge)'}
                      strokeWidth={selEdge ? 2.5 : active ? 2 : 1.5}
                      opacity={selectedIds.length > 0 && !active && !selEdge ? 0.22 : active || selEdge || bad ? 1 : 0.65}
                      markerEnd={selEdge ? 'url(#nb-arrow-del)' : bad ? 'url(#nb-arrow-bad)' : active ? 'url(#nb-arrow-active)' : 'url(#nb-arrow)'}
                    />
                  </g>
                );
              })}
              {/* 连线拖拽的 ghost 虚线 */}
              {connect && (
                <path d={ghostPath(connect.start, connect.cur)} fill="none" stroke="var(--ui-brand)" strokeWidth={2} strokeDasharray="6 4" />
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
                  selected={isSel(n.id)}
                  dragging={delta?.ids.includes(n.id) ?? false}
                  onPointerDown={(e) => onNodeDown(e, n.id, { x: n.x, y: n.y })}
                  onHeight={handleHeight}
                />
              );
            })}

            {/* 选中连线：中点「⊕」插入新节点（A→X→B 一步完成） */}
            {edgeSel && (() => {
              const pf = layout.byId[edgeSel.from];
              const pt = layout.byId[edgeSel.to];
              if (!pf || !pt) return null;
              const h1 = heights[edgeSel.from] ?? NODE_H;
              const h2 = heights[edgeSel.to] ?? NODE_H;
              const midX = (pf.x + NODE_W + pt.x) / 2;
              const midY = (pf.y + h1 / 2 + pt.y + h2 / 2) / 2;
              const types = NODE_TYPE_META.filter((m) => m.type !== 'scalarOut' && m.type !== 'formula');
              return (
                <div
                  style={{ position: 'absolute', left: midX, top: midY, transform: 'translate(-50%, -50%)', zIndex: 30 }}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    title="在此连线上插入节点"
                    onClick={() => setEdgeInsertOpen((v) => !v)}
                    className="flex h-6 w-6 items-center justify-center rounded-full border border-[var(--ui-brand)] bg-[var(--nb-panel)] text-[13px] font-bold text-[var(--ui-brand)] shadow-md hover:bg-[var(--ui-brand)] hover:text-white"
                  >
                    +
                  </button>
                  {edgeInsertOpen && (
                    <div
                      className="absolute left-1/2 top-7 z-40 w-[220px] -translate-x-1/2 rounded-lg border border-[var(--nb-border)] bg-[var(--nb-panel)] p-1.5 shadow-xl"
                      style={{ maxHeight: 260, overflowY: 'auto' }}
                    >
                      <div className="grid grid-cols-2 gap-1">
                        {types.map((m) => (
                          <button
                            key={m.type}
                            type="button"
                            onClick={() => insertNodeOnEdge(m.type)}
                            className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-[11.5px] text-[var(--nb-text)] hover:bg-[var(--nb-hover)]"
                          >
                            <span className="text-[12px]">{m.icon}</span>
                            {m.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

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

            {/* 选中连线的中点删除按钮 */}
            {edgeSel &&
              (() => {
                const from = layout.byId[edgeSel.from];
                const to = layout.byId[edgeSel.to];
                if (!from || !to) return null;
                const mid = edgeMid(withDelta(from, delta), withDelta(to, delta), heights[edgeSel.from] ?? NODE_H, heights[edgeSel.to] ?? NODE_H, layout.edges.find((e) => e.from === edgeSel.from && e.to === edgeSel.to)?.lane);
                return (
                  <button
                    type="button"
                    title="删除此连线（或按 Delete）"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => removeEdge(edgeSel.from, edgeSel.to)}
                    className="absolute flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-red-500 text-[10px] font-bold text-white shadow-md transition-transform hover:scale-110"
                    style={{ left: mid.x - 10, top: mid.y - 10 }}
                  >
                    ✕
                  </button>
                );
              })()}

            {/* 选中节点浮动工具条：添加下游 / 启用停用 / 删除（随缩放反向缩放保持可点面积） */}
            {selected && layout.byId[selected.id] && (
              <SelectionToolbar
                theme={nodeTheme}
                screenAnchor={screenNodeRects[selected.id] ? { x: screenNodeRects[selected.id].left + screenNodeRects[selected.id].width / 2, y: screenNodeRects[selected.id].top } : null}
                nodeRect={screenNodeRects[selected.id] ?? null}
                occupiedRects={Object.values(screenNodeRects)}
                viewportRect={canvasBounds}
                node={selected}
                outIsTable={selected.type === 'source' || outputs[selected.id]?.kind === 'table'}
                addMenuOpen={addMenuOpen}
                onToggleAddMenu={() => {
                  if (selected.type === 'source' || outputs[selected.id]?.kind === 'table') {
                    setNodeDataOpen(false);
                    setAddMenuOpen((v) => !v);
                  }
                  else showHint('该节点的输出不是表格，无法再接处理节点');
                }}
                onAddDownstream={addDownstream}
                onToggleEnabled={toggleSelectedEnabled}
                onDelete={deleteSelectedNode}
              />
            )}

            {/* 多选工具条：整组启用/停用/删除（锚在选择集包围盒顶部居中） */}
            {selectedIds.length > 1 &&
              (() => {
                const boxes = selectedIds.map((id) => layout.byId[id]).filter(Boolean);
                if (boxes.length === 0) return null;
                const minX = Math.min(...boxes.map((b) => b.x));
                const minY = Math.min(...boxes.map((b) => b.y));
                const anchor = { x: minX + (Math.max(...boxes.map((b) => b.x + NODE_W)) - minX) / 2 - NODE_W / 2, y: minY };
                return (
                  <MultiToolbar
                    count={selectedIds.length}
                    screenAnchor={canvasBounds ? { x: canvasBounds.left + pan.x + zoom * (anchor.x + NODE_W / 2), y: canvasBounds.top + pan.y + zoom * anchor.y } : null}
                    onEnable={() => setEnabledBulk(selectedIds, true)}
                    onDisable={() => setEnabledBulk(selectedIds, false)}
                    onDelete={() => deleteNodes(selectedIds.slice())}
                  />
                );
              })()}

            {/* 框选矩形（Shift+背景拖拽） */}
            {marquee && (
              <div
                className="pointer-events-none absolute border border-brand bg-brand/10"
                style={{
                  left: Math.min(marquee.x0, marquee.x1),
                  top: Math.min(marquee.y0, marquee.y1),
                  width: Math.abs(marquee.x1 - marquee.x0),
                  height: Math.abs(marquee.y1 - marquee.y0),
                }}
              />
            )}
          </div>

          {layout.nodes.length > 1 && (
            <div
              className="absolute bottom-3 right-3 z-10 rounded-lg border border-line bg-panel p-2 shadow-md backdrop-blur"
              title="点击缩略图定位到流程区域"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                const rect = e.currentTarget.querySelector('[data-minimap]')?.getBoundingClientRect();
                if (!rect) return;
                const worldX = Math.max(0, Math.min(layout.width, (e.clientX - rect.left) / miniScale));
                const worldY = Math.max(0, Math.min(layout.height, (e.clientY - rect.top) / miniScale));
                const view = containerRef.current;
                if (!view) return;
                setPan({ x: view.clientWidth / 2 - worldX * zoom, y: view.clientHeight / 2 - worldY * zoom });
              }}
              role="button"
              aria-label="流程小地图，点击定位"
              tabIndex={0}
            >
              <div className="mb-1 text-[9.5px] font-medium text-ink-faint">流程概览 · {layout.nodes.length} 个节点</div>
              <div data-minimap className="relative overflow-hidden rounded bg-soft" style={{ width: 164, height: 96 }}>
                {layout.nodes.map((item) => (
                  <span key={item.id} className={`absolute rounded-[1px] ${isSel(item.id) ? 'bg-brand' : nodeById.get(item.id)?.type === 'source' ? 'bg-blue-400' : 'bg-slate-400'}`} style={{ left: 2 + item.x * miniScale, top: 2 + item.y * miniScale, width: Math.max(3, NODE_W * miniScale), height: Math.max(2, (heights[item.id] ?? NODE_H) * miniScale) }} />
                ))}
              </div>
            </div>
          )}
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
        {embedded && selected && nodeDataOpen && <NodeDataDrawer node={selected} output={outputs[selected.id]} onClose={() => setNodeDataOpen(false)} />}
      </div>
    </div>
  );
}

/** 选中节点的数据检查抽屉：参数留在节点内，输入和输出在此按需查看。 */
function NodeDataDrawer({ node, output, onClose }: { node: PipelineNode; output: NodeOutput | undefined; onClose: () => void }) {
  const outputs = useCanvasStore((s) => s.outputs);
  const [tab, setTab] = useState<'input' | 'output'>('output');
  const input = node.inputs[0] ? outputs[node.inputs[0]] : undefined;
  const active = tab === 'input' ? input : output;

  return (
    <aside className="absolute inset-y-0 right-0 z-30 flex w-[min(420px,48vw)] max-w-full flex-col border-l border-line bg-panel">
      <header className="flex items-center gap-2 border-b border-line px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="text-[10.5px] text-ink-faint">{NODE_TYPE_LABELS[node.type]}</div>
          <div className="truncate text-[13px] font-semibold text-ink">{node.name}</div>
        </div>
        <button type="button" className="rounded p-1.5 text-ink-faint hover:bg-hover hover:text-ink" onClick={onClose} title="关闭数据检查" aria-label="关闭数据检查">✕</button>
      </header>
      <nav className="flex border-b border-line px-3" aria-label="节点数据视图">
        {(['input', 'output'] as const).map((key) => (
          <button key={key} type="button" onClick={() => setTab(key)} className={`border-b-2 px-3 py-2.5 text-[12px] ${tab === key ? 'border-brand font-medium text-brand' : 'border-transparent text-ink-dim hover:text-ink'}`}>
            {key === 'input' ? '输入数据' : '输出结果'}
          </button>
        ))}
      </nav>
      <div className="min-h-0 flex-1 overflow-auto p-3">
        {!active ? (
          <div className="rounded-md border border-dashed border-line-strong bg-soft px-4 py-6 text-center text-[12px] leading-relaxed text-ink-faint">
            {tab === 'input' ? '此节点没有已连接的上游输入。' : '节点尚未产生输出。'}
          </div>
        ) : active.kind === 'table' ? (
          <DataPreview table={active.table} limit={50} />
        ) : active.kind === 'scalar' ? (
          <div className="rounded-md border border-line bg-soft p-4"><div className="text-[11px] text-ink-faint">计算结果</div><div className="mt-1 text-2xl font-semibold text-ok">{active.value === null ? '空值' : String(active.value)}</div></div>
        ) : active.kind === 'scalars' ? (
          <div className="divide-y divide-line rounded-md border border-line bg-panel">{Object.entries(active.values).map(([key, value]) => <div key={key} className="flex justify-between gap-4 px-3 py-2 text-[12px]"><span className="text-ink-dim">{key}</span><span className="font-medium text-ink">{String(value ?? '')}</span></div>)}</div>
        ) : (
          <div className="rounded-md border border-danger/30 bg-danger-soft p-3 text-[12px] leading-relaxed text-danger">{active.message}</div>
        )}
      </div>
      <footer className="border-t border-line px-4 py-2 text-[10.5px] text-ink-faint">数据检查 · 配置项在画布节点中编辑</footer>
    </aside>
  );
}

/** 添加节点下拉菜单（数据源 / 处理节点 / 计算字段），独立头部与嵌入工具条共用 */
function AddNodeMenu({
  selected,
  isTableOut,
  onAddSource,
  onAddNode,
  open,
  onOpenChange,
}: {
  selected: PipelineNode | null;
  isTableOut: (id: string) => boolean;
  onAddSource: (kind: DataSource['kind']) => void;
  onAddNode: (type: NodeType, inputId: string | null) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const canAddSteps = Boolean(selected && isTableOut(selected.id));
  const items: MenuProps['items'] = [
    { key: 'g-src', type: 'group', label: '数据源（无上游，流程的起点）', children: (
      [
        ['import', '文件', '导入 xlsx / csv'],
        ['form', '表单', '名称 + 数值口径参数'],
        ['manualTable', '手填表', '可编辑网格'],
        ['constant', '常量', '单个数值'],
      ] as [DataSource['kind'], string, string][]
    ).map(([kind, label, hint]) => ({ key: `src-${kind}`, label: <span className="flex w-full items-center justify-between gap-3"><span>+ {label}</span><span className="text-[10.5px] text-ink-faint">{hint}</span></span> })) },
    { type: 'divider' },
    { key: 'g-step', type: 'group', label: canAddSteps ? `处理节点：将接到「${selected?.name}」之后` : '处理节点（先选中表格节点）', children: (
      STEP_TYPES.map((s) => ({ key: `step-${s.type}`, disabled: !canAddSteps, label: <span className="flex w-full items-center justify-between gap-3"><span>{s.label}</span><span className="text-[10.5px] text-ink-faint">{s.hint}</span></span> }))
    ) },
    { type: 'divider' },
    { key: 'step-formula', label: <span className="flex w-full items-center justify-between gap-3"><span>计算字段</span><span className="text-[10.5px] text-ink-faint">标量公式 / 可接表格逐行计算</span></span> },
  ];

  const onMenuClick: MenuProps['onClick'] = ({ key }) => {
    if (key === 'step-formula') return onAddNode('formula', selected && isTableOut(selected.id) ? selected.id : null);
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
      open={open}
      onOpenChange={onOpenChange}
    >
      <span title="添加节点（Ctrl+K）"><Btn size="xs" tone="primary">添加节点 · Ctrl+K</Btn></span>
    </Dropdown>
  );
}

function withDelta(pos: FlowPos & { id?: string }, delta: { ids: string[]; dx: number; dy: number } | null): FlowPos {
  if (delta && pos.id !== undefined && delta.ids.includes(pos.id)) return { x: pos.x + delta.dx, y: pos.y + delta.dy };
  return { x: pos.x, y: pos.y };
}

/** 多选工具条：锚在选择集包围盒顶部居中，随缩放反向缩放 */
function MultiToolbar({
  count,
  screenAnchor,
  onEnable,
  onDisable,
  onDelete,
}: {
  count: number;
  screenAnchor: { x: number; y: number } | null;
  onEnable: () => void;
  onDisable: () => void;
  onDelete: () => void;
}) {
  const [viewport, setViewport] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }));
  useEffect(() => {
    const resize = (): void => setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  if (!screenAnchor) return null;
  const width = 180;
  const height = 42;
  const left = Math.max(8, Math.min(viewport.width - width - 8, screenAnchor.x - width / 2));
  const above = screenAnchor.y - height - 10;
  const top = Math.max(8, Math.min(viewport.height - height - 8, above >= 8 ? above : screenAnchor.y + 8));
  return (
    <div className="fixed z-[1001]" style={{ left, top }}>
      <div
        className="flex items-center gap-1 whitespace-nowrap rounded-md bg-[var(--nb-pop-surface)] px-1.5 py-1 shadow-pop"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <span className="px-2 text-[11px] font-medium text-[var(--nb-pop-text)]">{count} 个节点</span>
        <button
          type="button"
          title="全部启用"
          onClick={onEnable}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-emerald-500 transition-colors hover:bg-emerald-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
        >
          <PlayCircleOutlined style={{ fontSize: 13 }} />
        </button>
        <button
          type="button"
          title="全部停用"
          onClick={onDisable}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--nb-text-dim)] transition-colors hover:bg-slate-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
        >
          <PauseCircleOutlined style={{ fontSize: 13 }} />
        </button>
        <button
          type="button"
          title="删除选中节点（Delete）"
          onClick={onDelete}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-red-500 transition-colors hover:bg-red-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/50"
        >
          <DeleteOutlined style={{ fontSize: 13 }} />
        </button>
      </div>
    </div>
  );
}

/** 连线拖拽 ghost 线的贝塞尔路径（从输出端口到指针） */
function ghostPath(from: FlowPos, to: FlowPos): string {
  const dx = Math.max(30, Math.abs(to.x - from.x) * 0.45);
  return `M ${from.x} ${from.y} C ${from.x + dx} ${from.y}, ${to.x - dx} ${to.y}, ${to.x} ${to.y}`;
}

/** 选中节点的浮动操作条与添加下游选择器：使用视口坐标，自动避让画布边缘。 */
function SelectionToolbar({
  theme,
  screenAnchor,
  nodeRect,
  occupiedRects,
  viewportRect,
  node,
  outIsTable,
  addMenuOpen,
  onToggleAddMenu,
  onAddDownstream,
  onToggleEnabled,
  onDelete,
}: {
  theme: NodeTheme;
  screenAnchor: { x: number; y: number } | null;
  nodeRect: ScreenRect | null;
  occupiedRects: ScreenRect[];
  viewportRect: ScreenRect | null;
  node: PipelineNode;
  outIsTable: boolean;
  addMenuOpen: boolean;
  onToggleAddMenu: () => void;
  onAddDownstream: (type: NodeType) => void;
  onToggleEnabled: () => void;
  onDelete: () => void;
}) {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [toolbarSize, setToolbarSize] = useState({ width: 174, height: 42 });
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('筛选与整理');

  useLayoutEffect(() => {
    const el = toolbarRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setToolbarSize({ width: el.offsetWidth, height: el.offsetHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useLayoutEffect(() => {
    if (!addMenuOpen) {
      setQuery('');
      return;
    }
    searchRef.current?.focus();
  }, [addMenuOpen]);

  useEffect(() => {
    if (!addMenuOpen) return;
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target as Node;
      if (!toolbarRef.current?.contains(target) && !menuRef.current?.contains(target)) onToggleAddMenu();
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onToggleAddMenu();
      }
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [addMenuOpen, onToggleAddMenu]);

  const items = useMemo(() => {
    const byType = new Map(STEP_TYPES.map((item) => [item.type, item]));
    const list = [
      { type: 'pickRows' as NodeType, category: '筛选与整理' },
      { type: 'filter' as NodeType, category: '筛选与整理' },
      { type: 'cellEdit' as NodeType, category: '筛选与整理' },
      { type: 'sortTopN' as NodeType, category: '筛选与整理' },
      { type: 'derive' as NodeType, category: '计算与合并' },
      { type: 'groupAgg' as NodeType, category: '计算与合并' },
      { type: 'diff' as NodeType, category: '计算与合并' },
      { type: 'union' as NodeType, category: '计算与合并' },
      { type: 'scalarOut' as NodeType, category: '取数与公式' },
      { type: 'formula' as NodeType, category: '取数与公式' },
    ].map((entry) => {
      const meta = NODE_TYPE_META.find((item) => item.type === entry.type);
      const step = byType.get(entry.type);
      return { ...entry, label: meta?.label ?? '计算字段', icon: meta?.icon ?? 'ƒ', hint: step?.hint ?? '公式产出新变量' };
    });
    const q = query.trim().toLocaleLowerCase();
    return list.filter((item) => !q || `${item.label} ${item.hint} ${item.category}`.toLocaleLowerCase().includes(q));
  }, [query]);
  const categories = ['筛选与整理', '计算与合并', '取数与公式'];
  const bounds = viewportRect ?? { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
  const activeNodeRect = nodeRect ?? { left: (screenAnchor?.x ?? 0) - NODE_W / 2, top: screenAnchor?.y ?? 0, width: NODE_W, height: NODE_H };
  const menuWidth = Math.max(160, Math.min(320, bounds.width - 16));
  const menuMaxHeight = Math.max(120, Math.min(320, bounds.height - 24));
  const effectiveMenuHeight = menuMaxHeight;
  const clampX = (x: number, width: number): number => Math.max(bounds.left + 8, Math.min(bounds.left + bounds.width - width - 8, x));
  const clampY = (y: number, height: number): number => Math.max(bounds.top + 8, Math.min(bounds.top + bounds.height - height - 8, y));
  const left = screenAnchor ? clampX(screenAnchor.x - toolbarSize.width / 2, toolbarSize.width) : bounds.left + 8;
  const toolbarAboveTop = screenAnchor ? activeNodeRect.top - toolbarSize.height - 10 : bounds.top + 8;
  const toolbarBelowTop = screenAnchor ? activeNodeRect.top + activeNodeRect.height + 8 : bounds.top + 8;
  const toolbarTop = screenAnchor
    ? clampY(toolbarAboveTop >= bounds.top + 8 ? toolbarAboveTop : toolbarBelowTop, toolbarSize.height)
    : bounds.top + 8;

  const menuPosition = useMemo(() => {
    if (!screenAnchor) return { left: bounds.left + 8, top: bounds.top + 8 };
    const maxLeft = bounds.left + bounds.width - menuWidth - 8;
    const maxTop = bounds.top + bounds.height - effectiveMenuHeight - 8;
    const positions = new Map<string, { left: number; top: number }>();
    const addPosition = (left: number, top: number): void => {
      const x = Math.max(bounds.left + 8, Math.min(maxLeft, left));
      const y = Math.max(bounds.top + 8, Math.min(maxTop, top));
      positions.set(`${Math.round(x)}:${Math.round(y)}`, { left: x, top: y });
    };
    // Scan the canvas, with corner anchors and finer spacing so the chooser can
    // fit into narrow empty areas without grazing a nearby node.
    addPosition(bounds.left + 8, bounds.top + 8);
    addPosition(maxLeft, bounds.top + 8);
    addPosition(bounds.left + 8, maxTop);
    addPosition(maxLeft, maxTop);
    for (let y = bounds.top + 8; y <= maxTop; y += 16) {
      for (let x = bounds.left + 8; x <= maxLeft; x += 16) addPosition(x, y);
    }
    for (const r of occupiedRects) {
      addPosition(r.left, r.top - effectiveMenuHeight - 12);
      addPosition(r.left, r.top + r.height + 12);
      addPosition(r.left - menuWidth - 12, r.top);
      addPosition(r.left + r.width + 12, r.top);
    }
    const area = (a: ScreenRect, b: ScreenRect): number => {
      const gap = 12;
      const w = Math.max(0, Math.min(a.left + a.width, b.left + b.width + gap) - Math.max(a.left, b.left - gap));
      const h = Math.max(0, Math.min(a.top + a.height, b.top + b.height + gap) - Math.max(a.top, b.top - gap));
      return w * h;
    };
    const scored = Array.from(positions.values()).map((pos) => {
      const rect = { ...pos, width: menuWidth, height: effectiveMenuHeight };
      const overlap = occupiedRects.reduce((sum, other) => sum + area(rect, other), 0);
      const selectedOverlap = area(rect, activeNodeRect);
      const toolbarOverlap = area(rect, { left, top: toolbarTop, width: toolbarSize.width, height: toolbarSize.height });
      const distance = Math.hypot(rect.left + menuWidth / 2 - screenAnchor.x, rect.top + effectiveMenuHeight / 2 - activeNodeRect.top - activeNodeRect.height / 2);
      return { left: rect.left, top: rect.top, score: (selectedOverlap + toolbarOverlap) * 1_000_000 + overlap * 100 + distance };
    });
    return scored.sort((a, b) => a.score - b.score)[0];
  }, [screenAnchor, activeNodeRect, effectiveMenuHeight, bounds, occupiedRects, menuWidth, left, toolbarTop, toolbarSize]);

  if (!screenAnchor) return null;
  return createPortal(
    <>
      {addMenuOpen && outIsTable && (
        <div
          ref={menuRef}
          className="fixed z-[1000] flex flex-col overflow-hidden rounded-md bg-[var(--nb-pop-surface)] text-[var(--nb-pop-text)] shadow-pop"
          style={{ ...nodeThemeVars(theme), background: theme === 'dark' ? '#292929' : '#ffffff', left: menuPosition.left, top: menuPosition.top, width: menuWidth, height: menuMaxHeight }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-2 border-b border-[var(--nb-pop-border)] px-3 py-2">
            <SearchOutlined className="text-[var(--nb-text-faint)]" />
            <input
              ref={searchRef}
              type="search"
              role="searchbox"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索节点名称或用途"
              aria-label="搜索下游节点"
              className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-[var(--nb-text-faint)]"
            />
            <kbd className="rounded border border-[var(--nb-pop-border)] px-1 py-0.5 text-[9px] text-[var(--nb-text-faint)]">Esc</kbd>
          </div>
          {!query.trim() && <div className="flex shrink-0 gap-1 border-b border-[var(--nb-pop-border)] px-2 py-2" role="tablist" aria-label="节点分类">
            {categories.map((category) => <button key={category} type="button" role="tab" aria-selected={activeCategory === category} onClick={() => setActiveCategory(category)} className={`flex-1 rounded-md px-1 py-1.5 text-[11px] transition-colors ${activeCategory === category ? 'bg-brand/15 text-brand' : 'text-[var(--nb-text-dim)] hover:bg-[var(--nb-control-hover)]'}`}>{category}</button>)}
          </div>}
          <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
            {(query.trim() ? categories : [activeCategory]).map((category) => {
              const group = items.filter((item) => item.category === category);
              if (group.length === 0) return null;
              return (
                <section key={category} className="mb-1.5 last:mb-0">
                  <h3 className="px-2 pb-0.5 text-[10px] font-semibold leading-3 tracking-wide text-[var(--nb-text-faint)]">{category}</h3>
                  <div className="space-y-px">
                    {group.map((item) => (
                      <button
                        key={item.type}
                        type="button"
                        title={item.hint}
                        onClick={() => onAddDownstream(item.type)}
                        className="flex min-h-9 w-full min-w-0 items-center gap-2 rounded-md border border-transparent px-2 py-1 text-left transition-colors hover:border-brand/25 hover:bg-brand/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
                      >
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-[var(--nb-control-bg)] text-[12px] font-semibold text-brand">{item.icon}</span>
                        <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
                          <span className="truncate text-[12px] font-medium">{item.label}</span>
                          <span className="truncate text-[10px] text-[var(--nb-text-faint)]">{item.hint}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
              );
            })}
            {items.length === 0 && <p className="px-2 py-6 text-center text-xs text-[var(--nb-text-faint)]">没有匹配的节点</p>}
          </div>
          <div className="shrink-0 truncate border-t border-[var(--nb-pop-border)] px-3 py-2 text-[10px] text-[var(--nb-text-dim)]" title={node.name}>添加后自动连接到「{node.name}」</div>
        </div>
      )}

      <div
        ref={toolbarRef}
        className="fixed z-[1001] flex items-center gap-1 rounded-lg bg-[var(--nb-pop-surface)] px-1 py-0.5 shadow-md"
        style={{ ...nodeThemeVars(theme), left, top: toolbarTop }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          aria-label={outIsTable ? '添加下游节点' : '该节点输出不是表格'}
          title={outIsTable ? '添加下游节点' : '该节点输出不是表格'}
          onClick={onToggleAddMenu}
          disabled={!outIsTable}
          className={`flex h-8 items-center gap-1 rounded-lg px-2 text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 ${outIsTable ? 'text-brand hover:bg-brand/15' : 'cursor-not-allowed text-[var(--nb-text-faint)] opacity-45'}`}
        >
          <PlusOutlined style={{ fontSize: 13 }} /> 添加
        </button>
        <span aria-hidden className="mx-0.5 h-5 w-px bg-[var(--nb-pop-border)]" />
        <button type="button" aria-label={node.enabled ? '停用该节点' : '启用该节点'} title={node.enabled ? '停用该节点' : '启用该节点'} onClick={onToggleEnabled} className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 ${node.enabled ? 'text-emerald-500 hover:bg-emerald-500/15' : 'text-[var(--nb-text-dim)] hover:bg-slate-500/15'}`}>
          <PoweroffOutlined style={{ fontSize: 14 }} />
        </button>
        <span aria-hidden className="mx-0.5 h-5 w-px bg-[var(--nb-pop-border)]" />
        <button type="button" aria-label="删除节点" title="删除节点（可撤销）" onClick={onDelete} className="flex h-8 w-8 items-center justify-center rounded-lg text-red-500 transition-colors hover:bg-red-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/50">
          <DeleteOutlined style={{ fontSize: 14 }} />
        </button>
      </div>
    </>,
    document.body,
  );
}

function Legend() {
  return (
    <div className="pointer-events-none absolute bottom-3 left-3 flex flex-wrap gap-3 rounded-md bg-panel px-2.5 py-1.5 text-[10px] text-ink-dim shadow-sm">
      <span className="flex items-center gap-1">
        <i className="inline-block h-2 w-2 rounded-sm bg-brand" />
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
    <aside className="flex w-[380px] shrink-0 flex-col overflow-y-auto border-l border-line bg-panel p-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0">
          <div className="text-[10px] text-ink-faint">{NODE_TYPE_LABELS[node.type]}</div>
          <div className="truncate text-sm font-semibold text-ink">{node.name}</div>
        </div>
        <button type="button" className="ml-auto text-ink-faint hover:text-ink" onClick={onClose} title="关闭详情">
          ✕
        </button>
      </div>

      <div className="mt-2 rounded-md border border-line bg-soft p-2">
        <div className="mb-1 text-[10px] font-medium text-ink-dim">实时结果</div>
        {output?.kind === 'table' ? (
          <DataPreview
            table={output.table}
            onCellEdit={
              node.type === 'cellEdit'
                ? (rowIdx, colKey, current) => {
                    // 定点编辑：主键列定位行（无主键列时按行号兜底），追加 pointEdit 并重算
                    const tbl = output.kind === 'table' ? output.table : null;
                    if (!tbl) return;
                    const keyCol = String(node.params.keyCol ?? '');
                    const row = tbl.rows.find((r) => r.__idx === rowIdx);
                    if (!row) return;
                    const key = keyCol ? String(getVal(row, keyCol) ?? '') : String(rowIdx);
                    const next = window.prompt(`修改「${keyCol ? `${key} 的 ` : ''}${colKey}」`, current);
                    if (next === null) return;
                    const points = (Array.isArray(node.params.pointEdits) ? node.params.pointEdits : []) as { keyCol: string; key: string; col: string; value: string }[];
                    updateNode(node.id, { params: { ...node.params, pointEdits: [...points, { keyCol: keyCol || '__idx', key, col: colKey, value: next }] } });
                  }
                : undefined
            }
          />
        ) : output?.kind === 'scalar' ? (
          <div className="text-lg font-semibold text-ok">{output.value === null ? '空值' : String(output.value)}</div>
        ) : output?.kind === 'scalars' ? (
          <div className="space-y-0.5">
            {Object.entries(output.values).map(([k, v]) => (
              <div key={k} className="flex justify-between text-[11px]">
                <span className="text-ink-dim">{k}</span>
                <span className="font-medium text-ink">{String(v ?? '')}</span>
              </div>
            ))}
          </div>
        ) : output?.kind === 'error' ? (
          <div className="text-[11px] text-danger">{output.message}</div>
        ) : (
          <div className="text-[11px] text-ink-faint">未执行</div>
        )}
      </div>

      {upstreamCandidates.length > 0 && (
        <div className="mt-2 rounded-md border border-line bg-soft p-2">
          <div className="mb-1 text-[10px] font-medium text-ink-dim">上游数据来源（改接即重跑）</div>
          <select
            className="w-full rounded border border-line-strong bg-panel px-1.5 py-1 text-[11px] text-ink"
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
        <div className="mt-2 rounded-md border border-line bg-soft p-2">
          <div className="mb-1 text-[10px] font-medium text-ink-dim">添加下游节点（自动接到本节点之后）</div>
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
        <div className="mt-2 rounded-md border border-line bg-soft p-2">
          <div className="mb-1 text-[10px] font-medium text-ink-dim">
            数据源配置
            <span className="ml-1 font-normal text-ink-faint">
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
        <p className="mt-2 text-[10px] text-ink-dim">
          变量名：<code className="rounded bg-hover px-1">{node.name}</code>，被 {refs} 个组件引用
        </p>
      )}

      <div className="mt-3 border-t border-line pt-2">
        <NodeFields node={node} cols={cols} />
      </div>

      <div className="mt-3 flex items-center gap-3 border-t border-line pt-2">
        <Check checked={node.enabled} label="启用该节点" onChange={() => updateNode(node.id, { enabled: !node.enabled })} />
        <Btn size="xs" tone="danger" onClick={deleteNode}>
          删除节点
        </Btn>
      </div>
      <p className="mt-2 text-[10px] leading-relaxed text-ink-faint">
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
      // 注意：dataTable 的 config 也有 columns（列定义，无 blocks）——只有容器（type==='row'）的列才可递归
      if ((b as { type?: string }).type === 'row' && Array.isArray((cfg as { columns?: { blocks?: CanvasBlock[] }[] }).columns)) {
        for (const col of (cfg as { columns: { blocks?: CanvasBlock[] }[] }).columns) walk(col.blocks ?? []);
      }
    }
  };
  walk(config.blocks);
  return n;
}

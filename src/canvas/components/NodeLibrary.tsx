import { useState } from 'react';
import { message } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { useCanvasStore } from '../../store/useCanvasStore';
import { createSourceOfKind, createStepNode, spotRightOf, NODE_TYPE_META, SOURCE_KIND_META } from '../flow/nodeOps';
import type { DataSource, NodeType } from '../types';

/**
 * 节点库（数据节点视图左栏）：只展示「可添加」的数据源与处理节点类型，
 * 点击添加 / 拖拽到流程画布指定位置（处理节点需拖到表格节点上建立连线）。
 * 与日报画布的 BlockLibrary 同一套视觉与交互语言。
 */

export default function NodeLibrary() {
  const config = useCanvasStore((s) => s.config);
  const outputs = useCanvasStore((s) => s.outputs);
  const addSource = useCanvasStore((s) => s.addSource);
  const addNode = useCanvasStore((s) => s.addNode);
  const flowSelectedId = useCanvasStore((s) => s.flowSelectedId);
  const setFlowSelectedId = useCanvasStore((s) => s.setFlowSelectedId);
  const setFlowPos = useCanvasStore((s) => s.setFlowPos);
  const transact = useCanvasStore((s) => s.transact);

  /** 该节点输出是否为表格（source 未执行时也按表格对待） */
  const isTableOut = (id: string): boolean => {
    const n = config.pipeline.nodes.find((x) => x.id === id);
    if (!n) return false;
    if (n.type === 'source') return true;
    return outputs[id]?.kind === 'table';
  };

  const dragStart = (e: React.DragEvent, data: { kind: 'source'; value: DataSource['kind'] } | { kind: 'node'; value: NodeType }) => {
    e.dataTransfer.setData(data.kind === 'source' ? 'text/x-new-source' : 'text/x-new-node', data.value);
    e.dataTransfer.effectAllowed = 'copy';
  };

  const clickSource = (kind: DataSource['kind']): void => {
    const source = createSourceOfKind(config.dataSources, kind);
    addSource(source);
    setFlowSelectedId(`n_${source.id}`);
  };

  const clickNode = (type: NodeType): void => {
    if (type !== 'formula' && (!flowSelectedId || !isTableOut(flowSelectedId))) {
      message.info('请先在画布点选一个表格节点（数据源或处理步骤），再添加下游');
      return;
    }
    const node = createStepNode(config.pipeline.nodes, type, flowSelectedId);
    // 落点跟随上游节点（右侧空位），避免新节点跑到画布远处找不到；添加+落点合并为一步撤销
    const spot = spotRightOf(config.pipeline.nodes, config.flowPos ?? {}, {}, flowSelectedId);
    transact('add-node', () => {
      addNode(node);
      if (spot) setFlowPos(node.id, spot);
    });
    setFlowSelectedId(node.id);
  };

  const GROUPS = [
    { title: '数据源', items: SOURCE_KIND_META.map((m) => ({ key: m.kind, ...m, onDrag: (e: React.DragEvent) => dragStart(e, { kind: 'source', value: m.kind }), onClick: () => clickSource(m.kind) })) },
    { title: '处理节点', items: NODE_TYPE_META.map((m) => ({ key: m.type, ...m, onDrag: (e: React.DragEvent) => dragStart(e, { kind: 'node', value: m.type }), onClick: () => clickNode(m.type) })) },
  ];
  const total = GROUPS.reduce((n, g) => n + g.items.length, 0);
  const [query, setQuery] = useState('');
  const [closedGroups, setClosedGroups] = useState<Record<string, boolean>>({});
  const [collapsed, setCollapsed] = useState(false);

  const q = query.trim().toLowerCase();
  const groups = GROUPS.map((g) => ({
    ...g,
    items: q ? g.items.filter((it) => it.label.toLowerCase().includes(q) || it.desc.toLowerCase().includes(q)) : g.items,
  })).filter((g) => g.items.length > 0);

  // 收起态：左缘品牌色竖条
  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        title="展开节点库"
        className="flex h-full w-7 shrink-0 flex-col items-center justify-center gap-2 border-r border-line bg-soft py-3 text-ink-dim transition-colors hover:bg-brand-hover"
      >
        <span className="text-[12px] leading-none">»</span>
        <span style={{ writingMode: 'vertical-lr', letterSpacing: 3 }} className="text-[11px] font-medium">
          节点库
        </span>
      </button>
    );
  }

  return (
    <aside className="relative flex h-full w-[220px] shrink-0 flex-col border-r border-line bg-soft">
      {/* 右缘收起条 */}
      <button
        type="button"
        onClick={() => setCollapsed(true)}
        title="收起节点库"
        className="absolute -right-[14px] top-1/2 z-20 flex h-[72px] w-[16px] -translate-y-1/2 items-center justify-center rounded-r-md border-y border-r border-brand-line bg-brand-soft text-[11px] font-medium text-brand shadow-sm transition-colors hover:bg-brand hover:text-white"
      >
        «
      </button>

      <header className="px-3 pb-1.5 pt-3">
        <div className="relative">
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] text-ink-faint"><SearchOutlined /></span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索节点…"
            className="w-full rounded-md bg-panel py-1.5 pl-7 pr-2 text-[12px] text-ink outline-none transition-shadow placeholder:text-ink-faint focus:ring-2 focus:ring-brand-line"
          />
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-3 pt-1">
        {groups.length === 0 && <p className="py-8 text-center text-[11.5px] text-ink-faint">没有匹配「{query}」的节点</p>}
        {groups.map((g) => {
          const closed = Boolean(closedGroups[g.title]);
          return (
            <div key={g.title} className="mb-2">
              <button
                type="button"
                onClick={() => setClosedGroups((prev) => ({ ...prev, [g.title]: !prev[g.title] }))}
                className="mb-1.5 flex w-full items-center gap-1 rounded px-1 py-0.5 text-left hover:bg-hover"
              >
                <span className={`text-[9px] text-ink-faint transition-transform ${closed ? '-rotate-90' : ''}`}>▼</span>
                <span className="text-[11.5px] font-semibold text-ink-dim">{g.title}</span>
                <span className="text-[10.5px] text-ink-faint">({g.items.length})</span>
              </button>
              {!closed && (
                <div className="grid grid-cols-2 gap-1.5">
                  {g.items.map((it) => (
                    <button
                      key={it.key}
                      type="button"
                      draggable
                      onDragStart={it.onDrag}
                      onClick={it.onClick}
                      title="点击添加，或拖到画布指定位置"
                      className="group flex flex-col items-center gap-1.5 rounded-lg border border-transparent bg-panel px-1 py-3 text-center transition-all hover:-translate-y-px hover:border-brand-line hover:shadow-card"
                    >
                      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-hover text-[16px] text-ink-dim transition-colors group-hover:bg-brand-soft group-hover:text-brand">
                        {it.icon}
                      </span>
                      <span className="text-[11.5px] font-medium leading-tight text-ink">{it.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        <p className="mt-2 rounded-md bg-hover px-2 py-1.5 text-[11px] leading-relaxed text-ink-faint">
          提示：数据源可拖到画布任意位置；处理节点请拖到某个表格节点上（自动连为下游），或先点选节点再点击添加。共 {total} 种。
        </p>
      </div>
    </aside>
  );
}

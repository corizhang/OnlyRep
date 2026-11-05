import { message } from 'antd';
import { useCanvasStore } from '../../store/useCanvasStore';
import { createSourceOfKind, createStepNode, NODE_TYPE_META, SOURCE_KIND_META } from '../flow/nodeOps';
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
    addNode(node);
    setFlowSelectedId(node.id);
  };

  const GROUPS = [
    { title: '数据源', items: SOURCE_KIND_META.map((m) => ({ key: m.kind, ...m, onDrag: (e: React.DragEvent) => dragStart(e, { kind: 'source', value: m.kind }), onClick: () => clickSource(m.kind) })) },
    { title: '处理节点', items: NODE_TYPE_META.map((m) => ({ key: m.type, ...m, onDrag: (e: React.DragEvent) => dragStart(e, { kind: 'node', value: m.type }), onClick: () => clickNode(m.type) })) },
  ];
  const total = GROUPS.reduce((n, g) => n + g.items.length, 0);

  return (
    <aside className="flex h-full w-[220px] shrink-0 flex-col border-r border-slate-200 bg-slate-50">
      <header className="px-3 py-2.5">
        <h2 className="text-[13px] font-semibold text-slate-700">节点库</h2>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-3">
        {GROUPS.map((g) => (
          <div key={g.title} className="mb-3">
            <div className="mb-1.5 flex items-center gap-2">
              <span className="text-[11.5px] font-medium text-slate-400">{g.title}</span>
              <span className="h-px flex-1 bg-slate-200" />
              <span className="text-[10.5px] text-slate-300">{g.items.length}</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {g.items.map((it) => (
                <button
                  key={it.key}
                  type="button"
                  draggable
                  onDragStart={it.onDrag}
                  onClick={it.onClick}
                  title="点击添加，或拖到画布指定位置"
                  className="group flex flex-col gap-1 rounded-lg border border-slate-200 bg-white p-2 text-left transition-colors hover:border-blue-400 hover:bg-blue-50/60"
                >
                  <span className="flex h-[34px] w-[34px] items-center justify-center rounded-md bg-slate-100 text-[15px] text-slate-500 transition-colors group-hover:bg-blue-100 group-hover:text-blue-600">
                    {it.icon}
                  </span>
                  <span className="text-[12.5px] font-medium leading-tight text-slate-700">{it.label}</span>
                  <span className="text-[11px] leading-tight text-slate-400">{it.desc}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
        <p className="rounded-md bg-slate-100 px-2 py-1.5 text-[11px] leading-relaxed text-slate-400">
          提示：数据源可拖到画布任意位置；处理节点请拖到某个表格节点上（会自动连为下游），或先点选节点再点击添加。
        </p>
      </div>
    </aside>
  );
}

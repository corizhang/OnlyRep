import type { CanvasBlockType } from '../types';
import { createBlock } from '../defaults';
import { useCanvasStore } from '../../store/useCanvasStore';

/** 组件库（PRD R4）：点击或拖到画布添加区块；分「基础组件 / 复合组件」两组 */
const GROUPS: { title: string; items: { type: CanvasBlockType; label: string; desc: string; icon: string }[] }[] = [
  {
    title: '基础组件',
    items: [
      { type: 'text', label: '文本', desc: '支持 {{}} 插值', icon: 'T' },
      { type: 'divider', label: '分隔线', desc: '章节分隔', icon: '≡' },
      { type: 'image', label: '图片', desc: 'Logo / 插图', icon: '▢' },
      { type: 'kpiCard', label: 'KPI 指标卡', desc: '标签+主值+注释', icon: '％' },
    ],
  },
  {
    title: '复合组件',
    items: [
      { type: 'dataTable', label: '数据表格', desc: '表头/合计/高亮', icon: '▦' },
      { type: 'chart', label: '图表', desc: '条形/折线/环形/仪表', icon: '▤' },
      { type: 'rankList', label: '排行榜', desc: '名次/进度条/双列', icon: '☰' },
      { type: 'goalProgress', label: '目标完成率', desc: '大百分比+进度条', icon: '◎' },
      { type: 'row', label: '行容器', desc: '一行并排 1~3 块', icon: '▭' },
    ],
  },
];

export default function BlockLibrary() {
  const addBlock = useCanvasStore((s) => s.addBlock);
  const addBlockToRow = useCanvasStore((s) => s.addBlockToRow);
  const selectedId = useCanvasStore((s) => s.selectedId);
  const config = useCanvasStore((s) => s.config);
  const collapsed = useCanvasStore((s) => s.libCollapsed);
  const setCollapsed = useCanvasStore((s) => s.setLibCollapsed);

  const selectedRow = (() => {
    if (!selectedId) return null;
    const b = config.blocks.find((x) => x.id === selectedId);
    return b && b.type === 'row' ? b : null;
  })();

  const total = GROUPS.reduce((n, g) => n + g.items.length, 0);

  // 收起态：细竖条（竖排字），点击展开
  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        title="展开组件库"
        className="flex h-full w-10 shrink-0 flex-col items-center gap-2 border-r border-slate-200 bg-slate-50 py-3 text-slate-400 transition-colors hover:bg-blue-50 hover:text-blue-600"
      >
        <span className="text-[11px]">»</span>
        <span style={{ writingMode: 'vertical-lr', letterSpacing: 2 }} className="text-[12px] font-medium">
          组件库 · {total}
        </span>
      </button>
    );
  }

  return (
    <aside className="flex h-full w-[220px] shrink-0 flex-col border-r border-slate-200 bg-slate-50">
      <header className="flex items-center justify-between px-3 py-2.5">
        <h2 className="text-[13px] font-semibold text-slate-700">组件库</h2>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          title="收起组件库"
          className="rounded p-1 text-[12px] leading-none text-slate-400 hover:bg-slate-200 hover:text-slate-600"
        >
          «
        </button>
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
                  key={it.type}
                  type="button"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/new-block', it.type);
                    e.dataTransfer.effectAllowed = 'copy';
                  }}
                  onClick={() => {
                    const block = createBlock(it.type);
                    if (selectedRow && it.type !== 'row' && selectedRow.config.children.length < 3) {
                      addBlockToRow(selectedRow.id, block);
                    } else {
                      addBlock(block);
                    }
                  }}
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
          提示：选中行容器后点击组件，会直接放进该行；也可以把组件拖到画布上。
        </p>
      </div>
    </aside>
  );
}

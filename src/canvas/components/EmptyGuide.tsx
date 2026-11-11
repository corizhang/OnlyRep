import { useCanvasStore } from '../../store/useCanvasStore';

/**
 * 空态引导卡：工作区为空时给一条最短上手路径 + 一键载入示例。
 * 节点视图（缺数据链路）与日报画布（缺区块）文案不同，结构共用。
 */
export default function EmptyGuide({ variant }: { variant: 'node' | 'canvas' }) {
  const applyPreset = useCanvasStore((s) => s.applyPreset);

  const steps =
    variant === 'node'
      ? ['左侧节点库拖入「文件 / 手填表 / 表单」数据源', '选中数据源 →「添加下游」或从右侧端口拖出连线', '切到「日报画布」绑定表格/指标出图']
      : ['左侧组件库拖入「文本 / KPI 卡 / 数据表格」', '到「数据节点」视图连好数据链', '区块绑定变量，换数据自动刷新'];

  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
      <div className="pointer-events-auto w-[380px] rounded-xl border border-slate-200 bg-white/95 p-6 shadow-xl backdrop-blur">
        <div className="text-[24px]">🧩</div>
        <h3 className="mt-2 text-[15px] font-semibold text-slate-800">{variant === 'node' ? '从一份数据开始' : '画布还是空的'}</h3>
        <ol className="mt-2.5 space-y-1.5">
          {steps.map((s, i) => (
            <li key={i} className="flex items-start gap-2 text-[12px] leading-relaxed text-slate-500">
              <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[10px] font-semibold text-blue-600">{i + 1}</span>
              {s}
            </li>
          ))}
        </ol>
        <button
          type="button"
          onClick={() => applyPreset('demo')}
          className="mt-4 w-full rounded-lg bg-blue-600 px-4 py-2 text-[12.5px] font-medium text-white hover:bg-blue-700"
        >
          或者：载入示例数据，先看完整效果 →
        </button>
      </div>
    </div>
  );
}

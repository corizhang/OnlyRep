import { useEffect, useState } from 'react';
import { appStorage } from '../../storage/safeStorage';
import { useCanvasStore } from '../../store/useCanvasStore';

/**
 * 首屏欢迎页（仅首次使用出现一次）：
 * 判定 = 没有 onboarded 标记且没有工作区持久化数据（老用户不打扰）。
 * 「载入示例」一键进入带数据的完整效果；「从空白开始」直接进编辑器。
 */

const ONBOARD_KEY = 'rankboard-onboarded-v1';
const CANVAS_KEY = 'rankboard-canvas-v3';

export default function WelcomeModal() {
  const applyPreset = useCanvasStore((s) => s.applyPreset);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onboarded = appStorage.getItem(ONBOARD_KEY);
    const hasWorkspace = appStorage.getItem(CANVAS_KEY) !== null;
    if (!onboarded && !hasWorkspace) setOpen(true);
  }, []);

  const finish = (preset: 'demo' | null): void => {
    if (preset) applyPreset(preset);
    appStorage.setItem(ONBOARD_KEY, '1');
    setOpen(false);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/40 backdrop-blur-[2px]">
      <div className="w-[440px] rounded-xl border border-slate-200 bg-white p-7 shadow-2xl">
        <div className="text-[26px]">📊</div>
        <h2 className="mt-2 text-[18px] font-semibold text-slate-800">欢迎使用 RankBoard 日报画布</h2>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-slate-500">
          把每天的 Excel 拖进来，节点自动算数，日报一键出图——一次搭好，换数据即用。
        </p>

        <div className="mt-4 space-y-2.5">
          {[
            ['⚡', '节点编排', '筛选/取行/分组/差分/合并…拖拽连线就能搭出计算链'],
            ['📊', '丰富区块', 'KPI 卡、数据表、图表、排行榜，绑定变量自动刷新'],
            ['🔒', '数据不出本地', '全部计算在浏览器内完成，不上传任何服务器'],
          ].map(([icon, title, desc]) => (
            <div key={title} className="flex items-start gap-2.5">
              <span className="text-[15px]">{icon}</span>
              <div>
                <div className="text-[12.5px] font-medium text-slate-700">{title}</div>
                <div className="text-[11.5px] text-slate-400">{desc}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 flex items-center gap-3">
          <button
            type="button"
            onClick={() => finish('demo')}
            className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-[13px] font-medium text-white shadow-sm hover:bg-blue-700"
          >
            载入示例，看看效果 →
          </button>
          <button
            type="button"
            onClick={() => finish(null)}
            className="rounded-lg border border-slate-300 px-4 py-2.5 text-[13px] text-slate-600 hover:bg-slate-50"
          >
            从空白开始
          </button>
        </div>
      </div>
    </div>
  );
}

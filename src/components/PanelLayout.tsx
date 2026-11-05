import type { ReactNode } from 'react';
import { useRankStore } from '../store/useRankStore';
import ImportZone from './ImportZone';
import SheetPicker from './SheetPicker';
import DataPreview from './DataPreview';
import RulePanel from './RulePanel';
import BlockEditorPanel from './BlockEditorPanel';
import VisualPanel from './VisualPanel';
import ExportPanel from './ExportPanel';
import PreviewBoard from './PreviewBoard';

/** 区块卡片外壳（设置面板 UI 用 Tailwind；海报区不用） */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-3">
      <h2 className="mb-2 text-sm font-semibold text-slate-700">{title}</h2>
      {children}
    </section>
  );
}

/** 左设置右预览双栏布局；顶部常驻「数据仅在本地处理」提示（PRD G3）；导入态/配置态切换 */
export default function PanelLayout() {
  const rawTable = useRankStore((s) => s.rawTable);
  const parseError = useRankStore((s) => s.parseError);
  const configRestored = useRankStore((s) => s.configRestored);

  return (
    <div className="flex h-screen flex-col bg-slate-100">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
        <h1 className="text-lg font-semibold text-slate-800">RankBoard 排行榜生成工具</h1>
        <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs text-emerald-700">
          数据仅在本地处理，不会上传服务器
        </span>
      </header>

      {/* E9：刷新后配置已恢复但数据已清空 */}
      {configRestored && !rawTable && (
        <div className="border-b border-amber-200 bg-amber-50 px-6 py-2 text-sm text-amber-800">
          上次配置已恢复，请重新导入数据
        </div>
      )}
      {parseError && rawTable && (
        <div className="border-b border-red-200 bg-red-50 px-6 py-2 text-sm text-red-700">
          {parseError}
        </div>
      )}

      {!rawTable ? (
        <main className="flex flex-1 items-center justify-center overflow-auto p-6">
          <div className="w-full max-w-2xl">
            <ImportZone />
            {parseError && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {parseError}
              </div>
            )}
          </div>
        </main>
      ) : (
        <main className="flex min-h-0 flex-1">
          <aside className="w-[380px] shrink-0 space-y-3 overflow-y-auto border-r border-slate-200 bg-slate-50 p-3">
            <Section title="数据源">
              <SheetPicker />
            </Section>
            <Section title="数据预览">
              <DataPreview />
            </Section>
            <Section title="排行规则">
              <RulePanel />
            </Section>
            <Section title="版式编辑">
              <BlockEditorPanel />
            </Section>
            <Section title="视觉设置">
              <VisualPanel />
            </Section>
            <Section title="导出">
              <ExportPanel />
            </Section>
          </aside>
          <section className="flex flex-1 overflow-auto bg-slate-200 p-6">
            {/* m-auto 替代 justify-center：海报宽于视口时四向均可滚动；海报高度=内容高度，不被拉伸裁切 */}
            <div className="m-auto">
              <PreviewBoard />
            </div>
          </section>
        </main>
      )}
    </div>
  );
}

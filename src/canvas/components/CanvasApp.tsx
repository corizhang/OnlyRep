import { useEffect, useState } from 'react';
import { message, Segmented, Tooltip } from 'antd';
import { FolderOpenOutlined, QuestionCircleOutlined, RedoOutlined, UndoOutlined } from '@ant-design/icons';
import { useCanvasStore, findBlock } from '../../store/useCanvasStore';
import { downloadCanvasTemplate } from '../template';
import { initTemplateLibraryStorage } from '../templateLibrary';
import { isTauri } from '../../storage/tauriKv';
import DataSourcePanel from './DataSourcePanel';
import StepChainPanel from './StepChainPanel';
import BlockLibrary from './BlockLibrary';
import NodeLibrary from './NodeLibrary';
import BlockInspector from './BlockInspector';
import VariablePanel from './VariablePanel';
import CanvasSettings from './CanvasSettings';
import CanvasStage from './CanvasStage';
import FlowSheet, { NodeInspector } from '../flow/FlowSheet';
import TemplateLibraryModal from './TemplateLibraryModal';
import WelcomeModal from './WelcomeModal';
import { Btn } from './ui';

/** 日报画布主界面（v2 双视图）：顶部 Tab 切「日报画布 / 数据节点」，左栏与右栏随视图联动，变量面板共用 */
export default function CanvasApp({ onOpenLegacy }: { onOpenLegacy: () => void }) {
  const config = useCanvasStore((s) => s.config);
  const selectedId = useCanvasStore((s) => s.selectedId);
  const errors = useCanvasStore((s) => s.errors);
  const warnings = useCanvasStore((s) => s.warnings);
  const lastRunMs = useCanvasStore((s) => s.lastRunMs);
  const showFlow = useCanvasStore((s) => s.showFlow);
  const viewMode = useCanvasStore((s) => s.viewMode);
  const setViewMode = useCanvasStore((s) => s.setViewMode);
  const bootstrap = useCanvasStore((s) => s.bootstrap);
  const undo = useCanvasStore((s) => s.undo);
  const redo = useCanvasStore((s) => s.redo);
  const canUndo = useCanvasStore((s) => s.history.past.length > 0);
  const canRedo = useCanvasStore((s) => s.history.future.length > 0);
  const storageError = useCanvasStore((s) => s.storageError);
  const externalUpdate = useCanvasStore((s) => s.externalUpdate);
  const activeTemplateId = useCanvasStore((s) => s.activeTemplateId);
  const templates = useCanvasStore((s) => s.templates);
  const [showTplLib, setShowTplLib] = useState(false);
  const activeTplName = activeTemplateId ? templates.find((t) => t.id === activeTemplateId)?.name : undefined;

  useEffect(() => {
    const start = async (): Promise<void> => {
      // Tauri：persist 为异步 SQLite 后端，先等 rehydrate 与模板库镜像就绪，再 bootstrap
      // （否则会用默认空配置重算，随后配置换入导致结果过期）
      if (isTauri()) {
        await useCanvasStore.persist.rehydrate();
        await initTemplateLibraryStorage();
      }
      // ?preset=demo|daily-report 可直接载入内置模板（用于演示与截图）
      const preset = new URLSearchParams(window.location.search).get('preset');
      if (preset) useCanvasStore.getState().applyPreset(preset);
      else bootstrap();
      // ?flow=1（兼容旧链接）/ ?view=node 直接进入数据节点视图
      const params = new URLSearchParams(window.location.search);
      if (params.get('flow') === '1' || params.get('view') === 'node') {
        useCanvasStore.getState().setViewMode('node');
      }
    };
    void start();

    // 多窗口/标签页互踩检测：storage 事件只在「其他窗口」写入时触发（本窗口写不触发），
    // 且 Tauri 单窗口无此事件——只在浏览器多开时提示，防止旧内存态覆写新数据
    const onStorage = (e: StorageEvent): void => {
      if (e.key !== 'rankboard-canvas-v3' || e.newValue == null) return;
      try {
        const incoming = (JSON.parse(e.newValue) as { state?: { config?: unknown } }).state?.config;
        if (incoming && JSON.stringify(incoming) !== JSON.stringify(useCanvasStore.getState().config)) {
          useCanvasStore.setState({ externalUpdate: true });
        }
      } catch {
        // 解析失败不打扰
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
    // 仅在挂载时跑一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 全局撤销/重做：Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y（输入控件内交给浏览器原生行为）
  useEffect(() => {
    const toast = (name: string | null, verb: string): void => {
      if (name) message.info({ content: `${verb}：${name}`, duration: 1.2 });
    };
    const onKey = (e: KeyboardEvent): void => {
      const t = e.target as HTMLElement | null;
      if (t?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key === 'z' || e.key === 'Z') {
        e.preventDefault();
        if (e.shiftKey) toast(redo(), '已重做');
        else toast(undo(), '已撤销');
      } else if (e.key === 'y' || e.key === 'Y') {
        e.preventDefault();
        toast(redo(), '已重做');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  const selected = selectedId ? findBlock(config.blocks, selectedId) : null;
  const isCanvas = viewMode === 'canvas';

  return (
    <div className="flex h-screen flex-col bg-slate-100">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-2">
        <div className="flex items-center gap-4">
          <h1 className="text-[15px] font-semibold text-slate-800">RankBoard · 日报画布</h1>
          {/* 双视图切换：切换时左栏/画布/右栏三处联动 */}
          <Segmented
            value={viewMode}
            onChange={(v) => setViewMode(v as 'canvas' | 'node')}
            options={[
              { label: '日报画布', value: 'canvas' },
              { label: '数据节点', value: 'node' },
            ]}
          />
          <span className="text-[11.5px] text-slate-400">一次搭好，换数据即出图</span>
          {/* 模板库入口：显示当前模板名（无则"未保存的工作区"） */}
          <Tooltip title="模板库（多模板保存/切换）">
            <button
              type="button"
              onClick={() => setShowTplLib(true)}
              className="flex max-w-[180px] items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11.5px] text-slate-600 shadow-sm hover:border-blue-300 hover:text-blue-600"
            >
              <FolderOpenOutlined style={{ fontSize: 12 }} />
              <span className="truncate">{activeTplName ?? '模板库'}</span>
            </button>
          </Tooltip>
          {/* 撤销/重做（config 级：节点/数据/区块/主题全部覆盖） */}
          <span className="flex items-center gap-0.5">
            <Tooltip title="撤销（Ctrl+Z）">
              <button
                type="button"
                disabled={!canUndo}
                onClick={() => {
                  const name = undo();
                  if (name) message.info({ content: `已撤销：${name}`, duration: 1.2 });
                }}
                className="rounded p-1 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30 disabled:hover:bg-transparent"
              >
                <UndoOutlined style={{ fontSize: 15 }} />
              </button>
            </Tooltip>
            <Tooltip title="重做（Ctrl+Shift+Z / Ctrl+Y）">
              <button
                type="button"
                disabled={!canRedo}
                onClick={() => {
                  const name = redo();
                  if (name) message.info({ content: `已重做：${name}`, duration: 1.2 });
                }}
                className="rounded p-1 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30 disabled:hover:bg-transparent"
              >
                <RedoOutlined style={{ fontSize: 15 }} />
              </button>
            </Tooltip>
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-slate-400">管道 {lastRunMs}ms</span>
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] text-emerald-700">
            数据仅在本地处理，不会上传服务器
          </span>
          <span className="text-[10.5px] text-slate-300" title={`构建时间：${__BUILD_TIME__}`}>
            v{__APP_VERSION__} · {__BUILD_TIME__}
          </span>
          <button type="button" onClick={onOpenLegacy} className="text-[11px] text-slate-400 underline hover:text-slate-600">
            打开旧版排行榜编辑器
          </button>
        </div>
      </header>

      {(errors.length > 0 || warnings.length > 0) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-amber-200 bg-amber-50 px-5 py-1.5 text-[12px] text-amber-800">
          {errors.slice(0, 3).map((e, i) => (
            <span key={`e${i}`}>● {e}</span>
          ))}
          {warnings.filter((w) => !errors.includes(w)).slice(0, 2).map((w, i) => (
            <span key={`w${i}`} className="text-amber-600">
              ○ {w}
            </span>
          ))}
        </div>
      )}

      {/* 存储降级警告：写入 localStorage 失败（配额满/环境禁用），提示立即导出备份 */}
      {storageError && (
        <div className="flex items-center gap-3 border-b border-red-200 bg-red-50 px-5 py-1.5 text-[12px] text-red-700">
          <span className="min-w-0 flex-1">⚠ {storageError}</span>
          <button
            type="button"
            onClick={() => downloadCanvasTemplate(config)}
            className="shrink-0 rounded border border-red-300 bg-white px-2 py-0.5 text-[11px] font-medium text-red-600 hover:bg-red-100"
          >
            立即导出模板备份
          </button>
        </div>
      )}

      {/* 多窗口互踩提示：另一窗口改了工作区，本窗口继续编辑会覆盖对方 */}
      {externalUpdate && (
        <div className="flex items-center gap-3 border-b border-orange-200 bg-orange-50 px-5 py-1.5 text-[12px] text-orange-800">
          <span className="min-w-0 flex-1">⚠ 另一个窗口/标签页修改了工作区。为避免互相覆盖，建议刷新加载最新版本（本窗口未保存的修改请先导出模板备份）。</span>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="shrink-0 rounded border border-orange-300 bg-white px-2 py-0.5 text-[11px] font-medium text-orange-700 hover:bg-orange-100"
          >
            刷新加载最新
          </button>
          <button
            type="button"
            onClick={() => useCanvasStore.getState().dismissExternalUpdate()}
            className="shrink-0 text-orange-400 hover:text-orange-600"
          >
            知道了
          </button>
        </div>
      )}

      <main className="flex min-h-0 flex-1">
        {isCanvas ? (
          <BlockLibrary />
        ) : (
          <NodeLibrary />
        )}

        <section className="flex min-w-0 flex-1 flex-col">
          {isCanvas ? (
            <CanvasStage />
          ) : (
            <FlowSheet embedded />
          )}
        </section>

        <VariablePanel />

        <aside className={`shrink-0 overflow-y-auto border-l border-slate-200 bg-slate-50 p-2.5 ${isCanvas ? 'w-[360px]' : 'w-[380px]'}`}>
          {isCanvas ? (
            <>
              {selected ? (
                <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                  <BlockInspector block={selected} />
                </div>
              ) : (
                <CanvasSettings />
              )}
              {selected && (
                <div className="mt-2 text-center">
                  <Btn size="xs" tone="ghost" onClick={() => useCanvasStore.getState().selectBlock(null)}>
                    返回画布设置
                  </Btn>
                </div>
              )}
            </>
          ) : (
            <NodeInspector />
          )}
        </aside>
      </main>

      {showFlow && <FlowSheet />}

      <TemplateLibraryModal open={showTplLib} onClose={() => setShowTplLib(false)} />

      {/* 首屏欢迎页（仅首次使用出现一次） */}
      <WelcomeModal />

      {/* 快捷键帮助：右下浮动按钮 + 面板（内容随视图切换） */}
      <ShortcutsHelp viewMode={viewMode} />
    </div>
  );
}

/** 快捷键帮助面板：右下 ? 浮动按钮，Esc/点击遮罩关闭 */
function ShortcutsHelp({ viewMode }: { viewMode: 'canvas' | 'node' }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const groups: { title: string; items: [string, string][] }[] =
    viewMode === 'node'
      ? [
          {
            title: '通用',
            items: [
              ['Ctrl+Z', '撤销'],
              ['Ctrl+Shift+Z / Ctrl+Y', '重做'],
              ['滚轮', '缩放画布'],
              ['拖拽空白处', '平移画布'],
            ],
          },
          {
            title: '选择',
            items: [
              ['点击节点', '单选'],
              ['Ctrl/Shift+点击', '切换多选'],
              ['Shift+拖拽空白', '框选（+Ctrl 追加）'],
              ['Ctrl+A', '全选'],
              ['Esc', '取消选择/关闭面板'],
            ],
          },
          {
            title: '节点操作',
            items: [
              ['拖动已选节点', '整组移动'],
              ['单击节点名', '改名'],
              ['Delete', '删除选中节点/连线'],
              ['右侧端口拖出', '建立连线'],
              ['点击连线', '选中（红）→ Delete 或 ✕ 删除'],
            ],
          },
        ]
      : [
          {
            title: '通用',
            items: [
              ['Ctrl+Z', '撤销'],
              ['Ctrl+Shift+Z / Ctrl+Y', '重做'],
              ['拖动区块', '调整顺序/移入行容器'],
            ],
          },
        ];

  return (
    <>
      <button
        type="button"
        title="快捷键帮助"
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-4 right-4 z-40 flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-md transition-colors hover:text-blue-600"
      >
        <QuestionCircleOutlined style={{ fontSize: 16 }} />
      </button>
      {open && (
        <div className="fixed inset-0 z-50" onClick={() => setOpen(false)}>
          <div
            className="absolute bottom-14 right-4 w-[320px] rounded-lg border border-slate-200 bg-white p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[13px] font-semibold text-slate-800">快捷键{viewMode === 'node' ? '（数据节点）' : '（日报画布）'}</span>
              <button type="button" className="text-slate-400 hover:text-slate-600" onClick={() => setOpen(false)}>✕</button>
            </div>
            <div className="space-y-3">
              {groups.map((g) => (
                <div key={g.title}>
                  <div className="mb-1 text-[11px] font-medium text-slate-400">{g.title}</div>
                  <div className="space-y-1">
                    {g.items.map(([k, desc]) => (
                      <div key={k} className="flex items-center justify-between gap-3">
                        <code className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10.5px] text-slate-600">{k}</code>
                        <span className="min-w-0 flex-1 text-right text-[11.5px] text-slate-600">{desc}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

import { useEffect, useState } from 'react';
import { K } from '../../storage/keys';
import { message, Segmented, Tooltip } from 'antd';
import { DatabaseOutlined, SettingOutlined } from '@ant-design/icons';
import { FolderOpenOutlined, QuestionCircleOutlined, RedoOutlined, UndoOutlined } from '@ant-design/icons';
import { useCanvasStore, findBlock } from '../../store/useCanvasStore';
import { downloadCanvasTemplate } from '../template';
import { ensureAppInit } from '../appInit';
import { isTauri } from '../../storage/tauriKv';
import DataSourcePanel from './DataSourcePanel';
import StepChainPanel from './StepChainPanel';
import BlockLibrary from './BlockLibrary';
import NodeLibrary from './NodeLibrary';
import BlockInspector from './BlockInspector';
import VariablePanel from './VariablePanel';
import CanvasStage from './CanvasStage';
import FlowSheet from '../flow/FlowSheet';
import TemplateLibraryModal from './TemplateLibraryModal';
import SettingsModal, { type SettingsSection } from './SettingsModal';
import ProjectLibraryModal from './ProjectLibraryModal';
import SourceGuideModal from './SourceGuideModal';
import { findPath } from '../blocks/rowTree';
import WelcomeModal from './WelcomeModal';
import { Btn } from './ui';

/** 日报画布主界面（v2 双视图）：顶部 Tab 切「日报画布 / 数据节点」，左栏与右栏随视图联动，变量面板共用 */
export default function CanvasApp({ onHome }: { onHome?: () => void }) {
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
  const [showPrjLib, setShowPrjLib] = useState(false);
  const activePrjName = useCanvasStore((s) => s.projects.find((p) => p.id === s.activeProjectId)?.name ?? null);
  const projectDirty = useCanvasStore((s) => s.projectDirty);
  const [settingsSection, setSettingsSection] = useState<SettingsSection | null>(null);
  const activeTplName = activeTemplateId ? templates.find((t) => t.id === activeTemplateId)?.name : undefined;

  useEffect(() => {
    const start = async (): Promise<void> => {
      // 统一走 ensureAppInit（幂等）：启动页先到时也会初始化，项目库不再空
      await ensureAppInit();
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
      if (e.key !== K.canvasPersist || e.newValue == null) return;
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

  useEffect(() => {
    const onSettingsKey = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault(); setSettingsSection('general');
      }
    };
    window.addEventListener('keydown', onSettingsKey);
    return () => window.removeEventListener('keydown', onSettingsKey);
  }, []);

  // 全局撤销/重做：Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y（输入控件内交给浏览器原生行为）
  useEffect(() => {
    const toast = (name: string | null, verb: string): void => {
      if (name) message.info({ content: `${verb}：${name}`, duration: 1.2 });
    };
    const onKey = (e: KeyboardEvent): void => {
      if ((e.target as HTMLElement | null)?.closest('[role="dialog"]')) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key === 's' || e.key === 'S') {
        // Ctrl+S 快捷保存到当前项目（无项目则新建）
        e.preventDefault();
        const st = useCanvasStore.getState();
        const nameBefore = st.projects.find((p) => p.id === st.activeProjectId)?.name;
        const id = st.saveProject();
        const name = st.projects.find((p) => p.id === id)?.name ?? '项目';
        message.success({ content: nameBefore ? `已保存到「${name}」` : `已保存为新项目「${name}」`, duration: 1.5 });
        return;
      }
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

  // Esc 逐级上钻：选中嵌套块→选父容器，顶层块→取消选中（Figma 惯例）
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.target as HTMLElement | null)?.closest('[role="dialog"]')) return;
      if (e.key !== 'Escape') return;
      const t = e.target as HTMLElement | null;
      if (t?.closest('input, textarea, select, [contenteditable="true"]')) return;
      const st = useCanvasStore.getState();
      if (!st.selectedId) return;
      const path = findPath(st.config.blocks, st.selectedId);
      // 路径长度 ≥2 说明在容器内：上钻一级；否则取消选中
      st.selectBlock(path.length >= 2 ? path[path.length - 2].id : null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const selected = selectedId ? findBlock(config.blocks, selectedId) : null;
  const isCanvas = viewMode === 'canvas';

  return (
    <div className="flex h-screen flex-col bg-hover">
      <header className="flex items-center justify-between h-12 shrink-0 border-b border-line bg-panel px-3">
        <div className="flex items-center gap-4">
          <h1 className="text-[15px] font-semibold text-ink">OnlyRep · 日报画布</h1>
          {/* 双视图切换：切换时左栏/画布/右栏三处联动 */}
          <Segmented
            value={viewMode}
            onChange={(v) => setViewMode(v as 'canvas' | 'node')}
            options={[
              { label: '日报画布', value: 'canvas' },
              { label: '数据节点', value: 'node' },
            ]}
          />
          <span className="text-[11.5px] text-ink-faint">一次搭好，换数据即出图</span>
          {onHome && (
            <Tooltip title="返回启动页（项目列表）">
              <button
                type="button"
                onClick={onHome}
                className="flex items-center rounded border border-transparent bg-transparent px-2 py-1 text-[12px] text-ink-dim hover:bg-hover hover:text-ink"
              >
                ⌂
              </button>
            </Tooltip>
          )}
          {/* 保存按钮：有活动项目时常驻，脏时点标记 + Ctrl+S 提示 */}
          {activePrjName && (
            <Tooltip title={projectDirty ? '有未保存修改（Ctrl+S 保存）' : '已保存（Ctrl+S）'}>
              <button
                type="button"
                onClick={() => {
                  const st = useCanvasStore.getState();
                  const id = st.saveProject();
                  const name = st.projects.find((p) => p.id === id)?.name ?? '项目';
                  message.success({ content: `已保存到「${name}」`, duration: 1.5 });
                }}
                className="relative flex items-center rounded border border-transparent bg-transparent px-2 py-1 text-[12px] text-ink-dim hover:bg-hover hover:text-ink"
              >
                💾
                {projectDirty && <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-warn" />}
              </button>
            </Tooltip>
          )}
          {/* 项目库入口：带数据的工作单元 */}
          <Tooltip title="项目库（版式+数据，多项目切换）">
            <button
              type="button"
              onClick={() => setShowPrjLib(true)}
              className="flex max-w-[180px] items-center gap-1 rounded border border-transparent bg-transparent px-2 py-1 text-[11.5px] text-ink-dim hover:bg-hover hover:text-ink"
            >
              <DatabaseOutlined style={{ fontSize: 12 }} />
              <span className="truncate">{activePrjName ?? '项目库'}</span>
            </button>
          </Tooltip>
          {/* 模板库入口：显示当前模板名（无则"未保存的工作区"） */}
          <Tooltip title="模板库（多模板保存/切换）">
            <button
              type="button"
              onClick={() => setShowTplLib(true)}
              className="flex max-w-[180px] items-center gap-1 rounded border border-transparent bg-transparent px-2 py-1 text-[11.5px] text-ink-dim hover:bg-hover hover:text-ink"
            >
              <FolderOpenOutlined style={{ fontSize: 12 }} />
              <span className="truncate">{activeTplName ?? '模板库'}</span>
            </button>
          </Tooltip>
          <Tooltip title="设置（Ctrl+,）">
            <button
              type="button"
              onClick={() => setSettingsSection('general')}
              className="flex items-center rounded border border-transparent bg-transparent px-2 py-1 text-[12px] text-ink-dim hover:bg-hover hover:text-ink"
            >
              <SettingOutlined />
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
                className="rounded p-1 text-ink-dim transition-colors hover:bg-hover hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent"
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
                className="rounded p-1 text-ink-dim transition-colors hover:bg-hover hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent"
              >
                <RedoOutlined style={{ fontSize: 15 }} />
              </button>
            </Tooltip>
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10.5px] text-ink-faint" title={`构建时间：${__BUILD_TIME__}`}>
            v{__APP_VERSION__} · {__BUILD_TIME__}
          </span>
        </div>
      </header>

      {(errors.length > 0 || warnings.length > 0) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-warn/30 bg-warn-soft px-5 py-1.5 text-[12px] text-warn">
          {errors.slice(0, 3).map((e, i) => (
            <span key={`e${i}`}>● {e}</span>
          ))}
          {warnings.filter((w) => !errors.includes(w)).slice(0, 2).map((w, i) => (
            <span key={`w${i}`} className="text-warn">
              ○ {w}
            </span>
          ))}
        </div>
      )}

      {/* 存储降级警告：写入 localStorage 失败（配额满/环境禁用），提示立即导出备份 */}
      {storageError && (
        <div className="flex items-center gap-3 border-b border-danger/30 bg-danger-soft px-5 py-1.5 text-[12px] text-danger">
          <span className="min-w-0 flex-1">⚠ {storageError}</span>
          <button
            type="button"
            onClick={() => downloadCanvasTemplate(config)}
            className="shrink-0 rounded border border-danger/40 bg-panel px-2 py-0.5 text-[11px] font-medium text-danger hover:bg-danger-soft"
          >
            立即导出模板备份
          </button>
        </div>
      )}

      {/* 多窗口互踩提示：另一窗口改了工作区，本窗口继续编辑会覆盖对方 */}
      {externalUpdate && (
        <div className="flex items-center gap-3 border-b border-warn/30 bg-warn-soft px-5 py-1.5 text-[12px] text-warn">
          <span className="min-w-0 flex-1">⚠ 另一个窗口/标签页修改了工作区。为避免互相覆盖，建议刷新加载最新版本（本窗口未保存的修改请先导出模板备份）。</span>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="shrink-0 rounded border border-warn/40 bg-panel px-2 py-0.5 text-[11px] font-medium text-warn hover:bg-warn-soft"
          >
            刷新加载最新
          </button>
          <button
            type="button"
            onClick={() => useCanvasStore.getState().dismissExternalUpdate()}
            className="shrink-0 text-warn hover:text-warn"
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

        {isCanvas && (
          <aside className="w-[360px] shrink-0 overflow-y-auto border-l border-line bg-soft p-2.5">
              {selected ? (
                // Figma 式平面面板：不再套卡片，分区靠留白与细分隔线（ui.Section 已扁平化）
                <BlockInspector block={selected} />
              ) : (
                <div className="space-y-4 p-3"><h2 className="text-sm font-semibold text-ink">当前画布</h2><div className="rounded border border-line bg-panel p-3 text-xs leading-relaxed text-ink-dim"><div className="font-medium text-ink">{config.title || '未命名画布'}</div><div className="mt-2">{config.width}px · 基准字号 {config.baseFontSize}px · 导出 {config.exportScale}x</div></div><Btn onClick={() => setSettingsSection('canvas')}>画布设置</Btn><p className="text-xs leading-relaxed text-ink-faint">尺寸、主题和排版已集中到设置。选中组件后可在此编辑组件属性。</p></div>
              )}
              {selected && (
                <div className="mt-2 text-center">
                  <Btn size="xs" tone="ghost" onClick={() => setSettingsSection('canvas')}>
                    返回画布设置
                  </Btn>
                </div>
              )}
          </aside>
        )}
      </main>

      {showFlow && <FlowSheet />}

      <TemplateLibraryModal open={showTplLib} onClose={() => setShowTplLib(false)} />
      <SettingsModal open={settingsSection !== null} initialSection={settingsSection ?? 'general'} onClose={() => setSettingsSection(null)} />
      <ProjectLibraryModal open={showPrjLib} onClose={() => setShowPrjLib(false)} />
      <SourceGuideModal />

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
      if ((e.target as HTMLElement | null)?.closest('[role="dialog"]')) return;
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
        className="fixed bottom-4 right-4 z-40 flex h-8 w-8 items-center justify-center rounded-full border border-line bg-panel text-ink-dim shadow-md transition-colors hover:text-brand"
      >
        <QuestionCircleOutlined style={{ fontSize: 16 }} />
      </button>
      {open && (
        <div className="fixed inset-0 z-50" onClick={() => setOpen(false)}>
          <div
            className="absolute bottom-14 right-4 w-[320px] rounded-lg border border-line bg-panel p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[13px] font-semibold text-ink">快捷键{viewMode === 'node' ? '（数据节点）' : '（日报画布）'}</span>
              <button type="button" className="text-ink-faint hover:text-ink-dim" onClick={() => setOpen(false)}>✕</button>
            </div>
            <div className="space-y-3">
              {groups.map((g) => (
                <div key={g.title}>
                  <div className="mb-1 text-[11px] font-medium text-ink-faint">{g.title}</div>
                  <div className="space-y-1">
                    {g.items.map(([k, desc]) => (
                      <div key={k} className="flex items-center justify-between gap-3">
                        <code className="shrink-0 rounded bg-hover px-1.5 py-0.5 text-[10.5px] text-ink-dim">{k}</code>
                        <span className="min-w-0 flex-1 text-right text-[11.5px] text-ink-dim">{desc}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 border-t border-line pt-2 text-[10.5px] leading-relaxed text-ink-faint">
              遇到问题：截图 + 设置 → 项目与存储 →「导出全部数据」→ 发给运营管理员
              <br />
              反馈时请附版本号：<span className="text-ink-dim">v{__APP_VERSION__} · {__BUILD_TIME__}</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { appStorage, onStorageError } from '../storage/safeStorage';
import { isTauri, tauriPersistStorage } from '../storage/tauriKv';
import { genTemplateName, loadTemplateLibrary, newTemplateId, saveTemplateLibrary, type SavedTemplate } from '../canvas/templateLibrary';
import { genProjectName, loadProjectLibrary, newProjectId, saveProjectLibrary, type SavedProject } from '../canvas/projectLibrary';
import { buildProjectFile, ingestProjectFile, parseProjectFile } from '../canvas/projectFile';
import { captureCanvasThumb } from '../canvas/captureThumb';
import { invoke } from '@tauri-apps/api/core';

/** 字符串 → base64（unicode 安全） */
function fileToBase64Sync(text: string): string {
  return btoa(unescape(encodeURIComponent(text)));
}
import { downloadJsonFile } from '../canvas/template';
import type {
  AnyBlockConfig,
  CanvasBlock,
  CanvasConfig,
  DataSource,
  ImportDataSource,
  NodeOutput,
  PipelineNode,
  RunResult,
  SourceRuntime,
} from '../canvas/types';
import { CANVAS_PRESETS, createDefaultCanvasConfig, newBlockId } from '../canvas/defaults';
import { runGraph } from '../canvas/pipeline/engine';
import { loadImportFile, manualTableToCleaned, uniqueName } from '../canvas/datasource/registry';
import { collectBlockTotalVars } from '../canvas/binding/blockTotals';
import type { FormulaVariable } from '../canvas/formula/variableEnv';
import {
  fileFingerprint,
  getFileHandle,
  loadSourceSnapshot,
  removeFileHandle,
  removeSourceSnapshot,
  saveFileHandle,
  saveSourceSnapshot,
  clearSourceSnapshots,
  ensureHandlePermission,
  supportsFileSystemAccess,
  base64ToFile,
  fileToBase64,
} from '../canvas/datasource/sourceCache';

/**
 * 画布 store（ARCH §6）。
 * 持久化白名单：仅 config（含手填表格/表单/常量）；导入源的 File 与解析结果只存内存（R10-04）。
 * 增补：导入源解析快照默认缓存 IndexedDB（cacheData 可关，刷新自动恢复）；
 *       Chrome/Edge 下记忆文件句柄，可一键重读磁盘最新文件。
 */

const EMPTY_RUNTIME: SourceRuntime = { status: 'empty', version: 0 };

export interface CanvasStore {
  config: CanvasConfig;
  /** 数据源运行时（不落盘） */
  sources: Record<string, SourceRuntime>;
  /** 管道输出（不落盘） */
  outputs: Record<string, NodeOutput>;
  env: RunResult['env'];
  /** 合计行变量（表格块合计行数值，命名 `标题_列名`；供变量树/文本 {{}} 引用） */
  blockTotalVars: FormulaVariable[];
  errors: string[];
  warnings: string[];
  /** 上次运行耗时 */
  lastRunMs: number;
  /** 选中区块 */
  selectedId: string | null;
  /** 刷新后配置已恢复 */
  restored: boolean;
  /** 本地存储写失败（配额满/环境禁用）：非空时顶部显示导出备份警告条（内存降级中，刷新即丢） */
  storageError: string | null;
  /** 其他窗口/标签页更新了工作区（storage 事件）：提示刷新，避免旧内存态覆写 */
  externalUpdate: boolean;
  dismissExternalUpdate: () => void;
  /** 导入/解析中标记 */
  busy: boolean;
  /** 流程视图是否打开（全屏抽屉，不入持久化） */
  showFlow: boolean;
  /** 主界面视图：日报画布 / 数据节点（顶部 Tab，两视图联动左栏与右栏） */
  viewMode: 'canvas' | 'node';
  setViewMode: (v: 'canvas' | 'node') => void;
  /** 数据节点视图中选中的节点 id（节点属性栏数据源；多选时为主选中=最后点选） */
  flowSelectedId: string | null;
  setFlowSelectedId: (id: string | null) => void;
  /** 多选集合（含主选中；单选时长度为 1） */
  flowSelectedIds: string[];
  setFlowSelectedIds: (ids: string[]) => void;
  /** Ctrl/Shift+点击：切换某节点的选中状态 */
  toggleFlowSelected: (id: string) => void;
  /** 组件库栏是否收起（收起为竖条） */
  libCollapsed: boolean;
  setLibCollapsed: (v: boolean) => void;
  /** 节点画布 UI 主题（dark=ComfyUI 深色 / light=浅灰卡深灰头；仅节点画布域，App 外壳恒浅色） */
  nodeTheme: 'dark' | 'light';
  /** 编辑器外壳主题（--ui-* tokens）；节点画布主题跟随它（统一观感） */
  uiTheme: 'light' | 'dark';
  toggleUiTheme: () => void;
  setNodeTheme: (v: 'dark' | 'light') => void;

  setShowFlow: (v: boolean) => void;
  /** 记录/清除节点在流程视图中的手动位置 */
  setFlowPos: (nodeId: string, pos: { x: number; y: number } | null) => void;
  /** 多节点群移：一次事务写入多个位置（撤销为一步） */
  setFlowPosMany: (entries: { id: string; pos: { x: number; y: number } | null }[]) => void;
  /** 清除全部手动位置（自动排列） */
  resetFlowPos: () => void;

  // 撤销/重做（config 快照历史，内存态不持久化）
  /** 历史栈（past 顶=最近一次可撤销；future 顶=最近一次可重做） */
  history: { past: HistoryEntry[]; future: HistoryEntry[] };
  /** 返回被撤销动作的可读名（无历史时 null），供调用方弹 toast */
  undo: () => string | null;
  /** 返回被重做动作的可读名（无历史时 null） */
  redo: () => string | null;
  /** 内部：恢复目标 config 含未加载的文件导入源时给提示串（undo/redo 用） */
  fileReloadHint: (cfg: CanvasConfig) => string;
  /** 把多次连续修改合并为一步历史（如添加+落点、群移、批量删除） */
  transact: (label: string, fn: () => void) => void;

  // 生命周期
  bootstrap: () => void;

  // 模板库（多模板管理：命名保存/切换/复制/删除，存档点模式保存才回写）
  templates: SavedTemplate[];
  activeTemplateId: string | null;
  /** 保存当前工作区：有当前模板则覆盖，否则以 name 新建（空则自动命名）；返回模板 id */
  /** 当前项目有未保存修改（mutateConfig 任一变更即置位；saveProject/loadProject 清除） */
  projectDirty: boolean;

  /** 模板新建项目后的数据源填充引导（有待填的 import 源时弹） */
  sourceGuideOpen: boolean;
  setSourceGuideOpen: (v: boolean) => void;

  // ---- 项目库（壳+数据；数据快照按源 id 存 IndexedDB，切换自动恢复） ----
  projects: SavedProject[];
  activeProjectId: string | null;
  /** 保存当前工作区为项目（有活动项目则回写，否则新建），返回项目 id */
  saveProject: (name?: string) => string;
  /** 切换项目：当前项目自动回写后载入目标（数据快照自动恢复） */
  loadProjectById: (id: string) => boolean;
  renameProject: (id: string, name: string) => void;
  deleteProject: (id: string) => void;
  duplicateProject: (id: string) => void;
  /** 把项目另存为模板（只存壳，供分享/起始创建） */
  saveProjectAsTemplate: (projectId: string, name?: string) => void;
  /** 导出项目为 .rkb 文件（壳+原始数据文件），返回文件名（无内容返回 null） */
  exportProject: (projectId: string) => Promise<string | null>;
  /** 导入 .rkb 项目文件：入项目库并打开 */
  importProjectFile: (text: string) => Promise<string | null>;

  saveTemplate: (name?: string) => string;
  /** 载入库中模板覆盖当前工作区（清撤销历史，导入文件源需重新选文件） */
  loadTemplateById: (id: string) => boolean;
  renameTemplate: (id: string, name: string) => void;
  duplicateTemplate: (id: string) => void;
  deleteTemplate: (id: string) => void;
  /** 新建空白工作区（脱离模板库当前项） */
  newBlankWorkspace: () => void;
  /** 当前工作区相对当前模板是否有未保存修改（载入前确认用） */
  isTemplateDirty: () => boolean;

  // 画布级配置
  patchConfig: (p: Partial<CanvasConfig>) => void;
  applyPreset: (presetId: string) => void;
  loadTemplate: (config: CanvasConfig) => void;
  resetCanvas: () => void;

  // 区块
  addBlock: (block: CanvasBlock, afterId?: string) => void;
  /** 插入到顶层指定索引（拖入画布时按指针位置落点） */
  insertBlockAt: (block: CanvasBlock, index: number) => void;
  /** 把块插入容器的指定列（atIndex 缺省追加列尾） */
  addBlockToRow: (rowId: string, colIdx: number, block: CanvasBlock, atIndex?: number) => void;
  /** 容器加列（上限 4，宽度等比重算；atIdx 指定插入位置） */
  addRowColumn: (rowId: string, atIdx?: number) => void;
  /** 容器删列（内容并入前一列；至少保留 1 列） */
  removeRowColumn: (rowId: string, colIdx: number) => void;
  /** 解散容器：所有列块平铺到容器原位 */
  dissolveRow: (rowId: string) => void;
  /** 原子移动：从任意位置（顶层/容器列）移到目标堆栈位置（单条撤销记录） */
  moveBlockTo: (dragId: string, target: { rowId: string | null; colIdx: number; index: number }) => void;
  /** 拖到块侧边即分栏：把 target 替换为新容器（target 与 block 各占一列 50/50），side 决定左右 */
  splitBeside: (targetId: string, block: CanvasBlock, side: 'left' | 'right', moveFromId?: string) => void;
  /** 拖到容器左/右边缘：新增一列并把块放入（原子，单撤销步） */
  insertAsNewColumn: (rowId: string, block: CanvasBlock, side: 'left' | 'right', moveFromId?: string) => void;
  updateBlock: (id: string, patch: Record<string, unknown>) => void;
  /** 更新区块外壳通用设置（边距/圆角，块根级字段，不进各 config） */
  updateBlockShell: (id: string, patch: { shellMargin?: [number, number, number, number]; radius?: number }) => void;
  replaceBlock: (id: string, block: CanvasBlock) => void;
  removeBlock: (id: string) => void;
  moveBlock: (id: string, dir: -1 | 1) => void;
  selectBlock: (id: string | null) => void;

  // 数据源
  addSource: (source: DataSource) => void;
  updateSource: (id: string, patch: Partial<DataSource> | Record<string, unknown>) => void;
  removeSource: (id: string) => void;
  loadFileForSource: (sourceId: string, file: File, handle?: FileSystemFileHandle) => Promise<void>;
  setSourceSheet: (sourceId: string, sheetName: string) => Promise<void>;
  /** File System Access API 选文件（记住句柄）；不支持/失败返回 false，UI 降级 input */
  pickFileForSource: (sourceId: string) => Promise<boolean>;
  /** 用已记忆的句柄重新读取磁盘最新文件；无句柄/权限拒绝返回 false */
  rereadSourceFile: (sourceId: string) => Promise<boolean>;
  /** 开关该源的快照缓存；关闭时清除已存快照 */
  setSourceCacheEnabled: (sourceId: string, enabled: boolean) => void;
  /** 清除该源的缓存快照（句柄保留） */
  clearSourceCache: (sourceId: string) => Promise<void>;

  // 管道
  addNode: (node: PipelineNode) => void;
  updateNode: (id: string, patch: Partial<PipelineNode>) => void;
  removeNode: (id: string) => void;
  toggleNode: (id: string) => void;
  moveNode: (id: string, dir: -1 | 1) => void;
  recompute: () => void;
}

type SetState = (partial: Partial<CanvasStore> | ((s: CanvasStore) => Partial<CanvasStore>)) => void;

/** 撤销历史条目（label 用于连续同类修改的时间窗合并） */
export interface HistoryEntry {
  config: CanvasConfig;
  label: string;
  at: number;
}

/** 历史上限（超出丢弃最旧） */
const HISTORY_LIMIT = 50;
/** 同 label 连续修改的合并窗口（如连续输入/微调） */
const HISTORY_MERGE_MS = 900;

/** 历史 label → 动作可读名（undo/redo toast 用；label 是技术标识，这里统一翻译） */
export function historyLabelOf(label: string): string {
  if (label === 'move:nodes') return '移动多个节点';
  if (label.startsWith('move:')) return '移动节点';
  if (label === 'add-node') return '添加节点';
  if (label === 'del-nodes') return '删除节点';
  if (label === 'del-edge') return '删除连线';
  if (label === 'resetFlowPos') return '自动排列';
  if (label.startsWith('node:')) return '修改节点配置';
  if (label.startsWith('source:')) return '修改数据源';
  return '编辑';
}
type GetState = () => CanvasStore;

/** 模块级缓存（不进 store，避免 persist 序列化） */
const engineCache = new Map<string, { fp: string; out: NodeOutput }>();

/** 手动源运行时重建：内容没变则复用（保持表引用稳定 → 引擎指纹缓存命中） */
function syncManualTables(config: CanvasConfig, current: Record<string, SourceRuntime>): Record<string, SourceRuntime> {
  const next: Record<string, SourceRuntime> = {};
  for (const def of config.dataSources) {
    const prev = current[def.id] ?? EMPTY_RUNTIME;
    if (def.kind === 'manualTable') {
      const table = manualTableToCleaned(def);
      const sig = JSON.stringify([def.columns, def.rows]);
      const prevSig = (prev as SourceRuntime & { sig?: string }).sig;
      if (prev.table && prevSig === sig) {
        next[def.id] = prev;
      } else {
        next[def.id] = { ...prev, table, status: 'ready', version: prev.version + 1, sig } as SourceRuntime;
      }
    } else if (def.kind === 'import') {
      next[def.id] = prev;
    }
  }
  return next;
}

export const useCanvasStore = create<CanvasStore>()(
  persist(
    (set, get) => {
      const apply = (patch: Partial<CanvasStore>): void => set(patch);

      // 存储降级通知 → storageError（顶部警告条）。必须在 initializer 首行注册：
      // persist 初始化写入发生在模块尾代码执行之前，晚了会错过首次失败；
      // 守卫 storageError !== msg 防循环（setState→persist 写→失败→本回调）。
      onStorageError((e) => {
        const msg =
          e.kind === 'quota'
            ? '本地存储空间已满，之后的修改不会被保存（当前数据仍在内存中，刷新即丢失）'
            : '本地存储不可用，之后的修改不会被保存（当前数据仍在内存中，刷新即丢失）';
        const st = get();
        if (st.storageError !== msg) set({ storageError: msg });
      });

      const recomputeWith = (config: CanvasConfig, sourcesIn: Record<string, SourceRuntime>): void => {
        const sources = syncManualTables(config, sourcesIn);
        const result = runGraph(
          { nodes: config.pipeline.nodes },
          { sourceDefs: config.dataSources, sources, cache: engineCache },
        );
        // 合计行变量：与渲染同一口径（totalNumberOf），注入 env 供文本 {{}} / 公式引用
        const totals = collectBlockTotalVars(config, {
          outputs: result.outputs,
          env: result.env,
          sources: config.dataSources,
        });
        apply({
          sources,
          outputs: result.outputs,
          env: { ...result.env, ...totals.env },
          blockTotalVars: totals.vars,
          errors: result.errors,
          warnings: result.warnings ?? [],
          lastRunMs: result.ms,
        });
      };

      // ---- 撤销历史：mutateConfig 统一推栈；transact 抑制嵌套推送 ----
      let batchDepth = 0;
      const pushHistory = (label: string): void => {
        if (batchDepth > 0) return;
        const s = get();
        const past = s.history.past.slice();
        const last = past[past.length - 1];
        const now = Date.now();
        // 同类连续修改（连续输入/微调）在时间窗内合并为一步，避免逐字符撤销
        if (last && last.label === label && now - last.at < HISTORY_MERGE_MS) {
          last.at = now;
          set({ history: { past, future: [] } });
          return;
        }
        past.push({ config: s.config, label, at: now });
        if (past.length > HISTORY_LIMIT) past.shift();
        set({ history: { past, future: [] } });
      };

      const mutateConfig = (fn: (c: CanvasConfig) => CanvasConfig, rerun = false, label = `edit:${Date.now()}`): void => {
        pushHistory(label);
        const prev = get().config;
        const config = fn(prev);
        // 有活动项目时标记未保存（Ctrl+S 提示的依据）
        set({ config, projectDirty: get().activeProjectId ? true : get().projectDirty });
        if (rerun) recomputeWith(config, get().sources);
      };

      return {
        config: createDefaultCanvasConfig(),
        storageError: null,
        externalUpdate: false,
        dismissExternalUpdate: () => set({ externalUpdate: false }),
        templates: [],
        projects: [],
        activeProjectId: null,
        sourceGuideOpen: false,
        projectDirty: false,
        setSourceGuideOpen: (v) => set({ sourceGuideOpen: v }),
        activeTemplateId: null,
        sources: {},
        outputs: {},
        env: {},
        blockTotalVars: [],
        errors: [],
        warnings: [],
        lastRunMs: 0,
        selectedId: null,
        restored: false,
        busy: false,
        showFlow: false,
        viewMode: 'canvas',
        setViewMode: (v) => set({ viewMode: v }),
        flowSelectedId: null,
        setFlowSelectedId: (id) => set({ flowSelectedId: id, flowSelectedIds: id ? [id] : [] }),
        flowSelectedIds: [],
        setFlowSelectedIds: (ids) => set({ flowSelectedIds: ids, flowSelectedId: ids.length > 0 ? ids[ids.length - 1] : null }),
        toggleFlowSelected: (id) =>
          set((s) => {
            const has = s.flowSelectedIds.includes(id);
            const ids = has ? s.flowSelectedIds.filter((x) => x !== id) : [...s.flowSelectedIds, id];
            return { flowSelectedIds: ids, flowSelectedId: ids.length > 0 ? ids[ids.length - 1] : null };
          }),
        libCollapsed: false,
        setLibCollapsed: (v) => set({ libCollapsed: v }),
        nodeTheme: 'dark',
        setNodeTheme: (v) => set({ nodeTheme: v }),
        uiTheme: (appStorage.getItem('rankboard-ui-theme') === 'dark' ? 'dark' : 'light') as 'light' | 'dark',
        toggleUiTheme: () => {
          const next = get().uiTheme === 'dark' ? 'light' : 'dark';
          appStorage.setItem('rankboard-ui-theme', next);
          document.documentElement.dataset.theme = next;
          set({ uiTheme: next });
        },

        setShowFlow: (v) => set({ showFlow: v }),

        // ---- 撤销/重做 ----
        history: { past: [], future: [] },
        transact: (label, fn) => {
          pushHistory(label);
          batchDepth += 1;
          try {
            fn();
          } finally {
            batchDepth -= 1;
          }
        },
        // 撤销/重做恢复到的 config 若含「已选文件但运行时未加载」的导入源，附重读提示
        fileReloadHint: (cfg: CanvasConfig): string => {
          const pending = cfg.dataSources.some(
            (d) => d.kind === 'import' && d.fileName && get().sources[d.id]?.status !== 'ready',
          );
          return pending ? '（含文件导入源，如数据缺失请点「重读文件」）' : '';
        },

        undo: () => {
          const s = get();
          const past = s.history.past.slice();
          const entry = past.pop();
          if (!entry) return null;
          const future = [{ config: s.config, label: entry.label, at: Date.now() }, ...s.history.future].slice(0, HISTORY_LIMIT);
          set({ config: entry.config, history: { past, future } });
          recomputeWith(entry.config, get().sources);
          return historyLabelOf(entry.label) + get().fileReloadHint(entry.config);
        },
        redo: () => {
          const s = get();
          const future = s.history.future.slice();
          const entry = future.shift();
          if (!entry) return null;
          const past = [...s.history.past, { config: s.config, label: entry.label, at: Date.now() }].slice(-HISTORY_LIMIT);
          set({ config: entry.config, history: { past, future } });
          recomputeWith(entry.config, get().sources);
          return historyLabelOf(entry.label) + get().fileReloadHint(entry.config);
        },

        setFlowPos: (nodeId, pos) =>
          mutateConfig((c) => {
            const next = { ...(c.flowPos ?? {}) };
            if (pos) next[nodeId] = pos;
            else delete next[nodeId];
            return { ...c, flowPos: next };
          }, false, `move:${nodeId}`),

        setFlowPosMany: (entries) =>
          mutateConfig((c) => {
            const next = { ...(c.flowPos ?? {}) };
            for (const { id, pos } of entries) {
              if (pos) next[id] = pos;
              else delete next[id];
            }
            return { ...c, flowPos: next };
          }, false, 'move:nodes'),

        resetFlowPos: () => mutateConfig((c) => ({ ...c, flowPos: {} }), false, 'resetFlowPos'),

        bootstrap: () => {
          const s = get();
          // 模板库载入（独立于工作区的存档点）
          const lib = loadTemplateLibrary();
          const plib = loadProjectLibrary();
          set({ templates: lib.items, activeTemplateId: lib.activeId, projects: plib.items, activeProjectId: plib.activeId });
          recomputeWith(s.config, s.sources);
          // 异步恢复导入源缓存快照（IndexedDB），完成后重算并更新提示
          void restoreImportCaches(recomputeWith, (store) => {
            if (!store.restored) return null;
            const pending = store.config.dataSources.filter((d) => d.kind === 'import' && !store.sources[d.id]?.table).length;
            if (pending === 0) return null;
            return `上次配置已恢复；${pending} 个导入源待重新选择数据文件（或点击「重读文件」）`;
          });
        },

        patchConfig: (p) => mutateConfig((c) => ({ ...c, ...p })),

        applyPreset: (presetId) => {
          const preset = CANVAS_PRESETS.find((x) => x.id === presetId);
          if (!preset) return;
          const config = preset.create();
          engineCache.clear();
          void clearSourceSnapshots();
          set({ config, sources: {}, selectedId: null, errors: [], history: { past: [], future: [] }, activeTemplateId: null });
          recomputeWith(config, {});
        },

        resetCanvas: () => {
          engineCache.clear();
          void clearSourceSnapshots();
          const config = createDefaultCanvasConfig();
          set({ config, sources: {}, selectedId: null, errors: [], warnings: [], history: { past: [], future: [] }, activeTemplateId: null });
        },

        loadTemplate: (config) => {
          engineCache.clear();
          // 数据快照按源 id 保留（不再清空）：模板/项目切换后自动恢复，切回不丢数据
          set({ config, sources: {}, selectedId: null, errors: [], warnings: [], history: { past: [], future: [] }, activeTemplateId: null });
          recomputeWith(config, {});
          void restoreImportCaches(recomputeWith, (store) => {
            const pending = store.config.dataSources.filter((d) => d.kind === 'import' && !store.sources[d.id]?.table).length;
            if (pending === 0) return null;
            return `已载入；${pending} 个导入源待重新选择数据文件（或点「重读文件」）`;
          });
        },

        // ---- 模板库 ----
        saveProject: (name) => {
          const s = get();
          let id: string;
          if (s.activeProjectId) {
            id = s.activeProjectId;
            const items = s.projects.map((pr) => (pr.id === id ? { ...pr, config: s.config, updatedAt: Date.now() } : pr));
            saveProjectLibrary({ activeId: id, items });
            set({ projects: items });
          } else {
            id = newProjectId();
            const item: SavedProject = { id, name: name?.trim() || genProjectName(s.projects), updatedAt: Date.now(), config: s.config };
            const items = [...s.projects, item];
            saveProjectLibrary({ activeId: id, items });
            set({ projects: items, activeProjectId: id });
          }
          set({ projectDirty: false });
          // 桌面端双写：项目目录自动落一份 .rkb（真实文件可备份可拷走；失败不打扰）
          if (isTauri()) {
            void (async () => {
              try {
                const projName = get().projects.find((pr) => pr.id === id)?.name ?? '项目';
                const rkb = await buildProjectFile(projName, get().config);
                const b64 = fileToBase64Sync(JSON.stringify(rkb));
                await invoke('save_project_file', { name: projName, dataBase64: b64 });
              } catch {
                /* 目录不可写等：静默，下次保存再试 */
              }
            })();
          }
          // 缩略图异步补抓（失败不阻塞保存）
          void captureCanvasThumb().then((thumb) => {
            if (!thumb) return;
            const items2 = get().projects.map((pr) => (pr.id === id ? { ...pr, thumb } : pr));
            saveProjectLibrary({ activeId: get().activeProjectId, items: items2 });
            set({ projects: items2 });
          });
          return id;
        },

        loadProjectById: (id) => {
          const s = get();
          const target = s.projects.find((x) => x.id === id);
          if (!target) return false;
          // 切换前自动回写当前项目（防丢）
          if (s.activeProjectId && s.activeProjectId !== id) {
            const items = s.projects.map((pr) => (pr.id === s.activeProjectId ? { ...pr, config: s.config, updatedAt: Date.now() } : pr));
            saveProjectLibrary({ activeId: id, items });
            set({ projects: items });
          }
          get().loadTemplate(target.config); // 含数据快照恢复（P0 后不再清缓存）
          set({ activeProjectId: id, projectDirty: false });
          saveProjectLibrary({ activeId: id, items: get().projects });
          return true;
        },

        renameProject: (id, name) => {
          const trimmed = name.trim();
          if (!trimmed) return;
          const items = get().projects.map((pr) => (pr.id === id ? { ...pr, name: trimmed, updatedAt: Date.now() } : pr));
          saveProjectLibrary({ activeId: get().activeProjectId, items });
          set({ projects: items });
        },

        deleteProject: (id) => {
          const items = get().projects.filter((pr) => pr.id !== id);
          const activeId = get().activeProjectId === id ? null : get().activeProjectId;
          saveProjectLibrary({ activeId, items });
          set({ projects: items, activeProjectId: activeId });
        },

        duplicateProject: (id) => {
          const s = get();
          const src = s.projects.find((x) => x.id === id);
          if (!src) return;
          const copy: SavedProject = { id: newProjectId(), name: `${src.name} 副本`, updatedAt: Date.now(), config: src.config };
          const items = [...s.projects, copy];
          saveProjectLibrary({ activeId: s.activeProjectId, items });
          set({ projects: items });
        },

        saveProjectAsTemplate: (projectId, name) => {
          const pr = get().projects.find((x) => x.id === projectId);
          if (!pr) return;
          const id = newTemplateId();
          const item: SavedTemplate = { id, name: name?.trim() || `${pr.name}（模板）`, updatedAt: Date.now(), config: pr.config };
          const items = [...get().templates, item];
          saveTemplateLibrary({ activeId: get().activeTemplateId, items });
          set({ templates: items });
        },

        exportProject: async (projectId) => {
          const proj = get().projects.find((x) => x.id === projectId);
          if (!proj) return null;
          const rkb = await buildProjectFile(proj.name, proj.config);
          const fname = `${proj.name}.rkb`;
          downloadJsonFile(fname, rkb);
          return fname;
        },

        importProjectFile: async (text) => {
          const rkb = parseProjectFile(text);
          if (!rkb) return null;
          const config = await ingestProjectFile(rkb);
          const id = newProjectId();
          const item: SavedProject = { id, name: rkb.name || '导入的项目', updatedAt: Date.now(), config };
          const items = [...get().projects, item];
          saveProjectLibrary({ activeId: id, items });
          set({ projects: items });
          get().loadProjectById(id); // 自动回写当前+载入（快照含字节，restore 自动解析）
          return rkb.name;
        },

        saveTemplate: (name) => {
          const s = get();
          if (s.activeTemplateId) {
            const id = s.activeTemplateId;
            const items = s.templates.map((t) => (t.id === id ? { ...t, config: s.config, updatedAt: Date.now() } : t));
            saveTemplateLibrary({ activeId: id, items });
            set({ templates: items });
            return id;
          }
          const id = newTemplateId();
          const item: SavedTemplate = { id, name: name?.trim() || genTemplateName(s.templates), updatedAt: Date.now(), config: s.config };
          const items = [...s.templates, item];
          saveTemplateLibrary({ activeId: id, items });
          set({ templates: items, activeTemplateId: id });
          return id;
        },

        loadTemplateById: (id) => {
          const t = get().templates.find((x) => x.id === id);
          if (!t) return false;
          get().loadTemplate(t.config);
          set({ activeTemplateId: id });
          saveTemplateLibrary({ activeId: id, items: get().templates });
          // 模板→新项目：有待填的 import 源且无快照时弹数据源填充引导
          void (async () => {
            const pending = get().config.dataSources.filter((d) => d.kind === 'import');
            if (pending.length === 0) return;
            for (const d of pending) {
              const snap = await loadSourceSnapshot(d.id);
              if (!snap) {
                set({ sourceGuideOpen: true });
                return;
              }
            }
          })();
          return true;
        },

        renameTemplate: (id, name) => {
          const trimmed = name.trim();
          if (!trimmed) return;
          const items = get().templates.map((t) => (t.id === id ? { ...t, name: trimmed, updatedAt: Date.now() } : t));
          saveTemplateLibrary({ activeId: get().activeTemplateId, items });
          set({ templates: items });
        },

        duplicateTemplate: (id) => {
          const t = get().templates.find((x) => x.id === id);
          if (!t) return;
          const copy: SavedTemplate = { id: newTemplateId(), name: `${t.name} 副本`, updatedAt: Date.now(), config: t.config };
          const items = [...get().templates, copy];
          saveTemplateLibrary({ activeId: get().activeTemplateId, items });
          set({ templates: items });
        },

        deleteTemplate: (id) => {
          const items = get().templates.filter((t) => t.id !== id);
          const activeId = get().activeTemplateId === id ? null : get().activeTemplateId;
          saveTemplateLibrary({ activeId, items });
          set({ templates: items, activeTemplateId: activeId });
        },

        newBlankWorkspace: () => {
          get().resetCanvas();
          set({ activeTemplateId: null });
          saveTemplateLibrary({ activeId: null, items: get().templates });
        },

        isTemplateDirty: () => {
          const s = get();
          const active = s.activeTemplateId ? s.templates.find((t) => t.id === s.activeTemplateId) : undefined;
          if (!active) return false;
          return JSON.stringify(active.config) !== JSON.stringify(s.config);
        },

        // ---- 区块 ----
        addBlock: (block, afterId) =>
          mutateConfig((c) => {
            if (!afterId) return { ...c, blocks: [...c.blocks, block] };
            const idx = c.blocks.findIndex((b) => b.id === afterId);
            const blocks = [...c.blocks];
            blocks.splice(idx < 0 ? blocks.length : idx + 1, 0, block);
            return { ...c, blocks };
          }),

        insertBlockAt: (block, index) =>
          mutateConfig((c) => {
            const blocks = [...c.blocks];
            const i = Math.max(0, Math.min(index, blocks.length));
            blocks.splice(i, 0, block);
            return { ...c, blocks };
          }),

        addBlockToRow: (rowId, colIdx, block, atIndex) =>
          mutateConfig((c) => {
            const applyTo = (blocks: CanvasBlock[]): CanvasBlock[] =>
              blocks.map((b) => {
                if (b.id === rowId && b.type === 'row') {
                  const cols = b.config.columns.map((col, i) => {
                    if (i !== colIdx) return col;
                    const list = [...col.blocks];
                    const at = atIndex === undefined ? list.length : Math.max(0, Math.min(atIndex, list.length));
                    list.splice(at, 0, block);
                    return { blocks: list };
                  });
                  return { ...b, config: { ...b.config, columns: cols } } as CanvasBlock;
                }
                if (b.type === 'row') {
                  return { ...b, config: { ...b.config, columns: b.config.columns.map((c2) => ({ blocks: applyTo(c2.blocks) })) } } as CanvasBlock;
                }
                return b;
              });
            return { ...c, blocks: applyTo(c.blocks) };
          }),

        // 容器加列（≤4）：宽度等比重算；atIdx 指定插入位置（缺省加在末尾）
        addRowColumn: (rowId, atIdx) =>
          mutateConfig((c) => {
            const applyTo = (blocks: CanvasBlock[]): CanvasBlock[] =>
              blocks.map((b) => {
                if (b.id === rowId && b.type === 'row') {
                  if (b.config.columns.length >= 4) return b;
                  const n = b.config.columns.length + 1;
                  const cols = [...b.config.columns];
                  const at = atIdx === undefined ? cols.length : Math.max(0, Math.min(atIdx, cols.length));
                  cols.splice(at, 0, { blocks: [] });
                  return {
                    ...b,
                    config: {
                      ...b.config,
                      columns: cols,
                      widths: Array.from({ length: n }, () => Math.round(100 / n)),
                    },
                  } as CanvasBlock;
                }
                if (b.type === 'row') {
                  return { ...b, config: { ...b.config, columns: b.config.columns.map((c2) => ({ blocks: applyTo(c2.blocks) })) } } as CanvasBlock;
                }
                return b;
              });
            return { ...c, blocks: applyTo(c.blocks) };
          }),

        // 容器删列：内容并入前一列（首列则并入后一列）；至少保留 1 列
        removeRowColumn: (rowId, colIdx) =>
          mutateConfig((c) => {
            const applyTo = (blocks: CanvasBlock[]): CanvasBlock[] =>
              blocks.map((b) => {
                if (b.id === rowId && b.type === 'row') {
                  if (b.config.columns.length <= 1) return b;
                  const cols = b.config.columns.map((col) => ({ blocks: [...col.blocks] }));
                  const removed = cols.splice(colIdx, 1)[0];
                  const target = Math.max(0, colIdx - 1);
                  cols[target].blocks.push(...removed.blocks);
                  return {
                    ...b,
                    config: {
                      ...b.config,
                      columns: cols,
                      widths: Array.from({ length: cols.length }, () => Math.round(100 / cols.length)),
                    },
                  } as CanvasBlock;
                }
                if (b.type === 'row') {
                  return { ...b, config: { ...b.config, columns: b.config.columns.map((c2) => ({ blocks: applyTo(c2.blocks) })) } } as CanvasBlock;
                }
                return b;
              });
            return { ...c, blocks: applyTo(c.blocks) };
          }),

        // 解散容器：所有列的块按列序平铺到容器原位
        dissolveRow: (rowId) =>
          mutateConfig((c) => {
            const applyTo = (blocks: CanvasBlock[]): CanvasBlock[] => {
              const out: CanvasBlock[] = [];
              for (const b of blocks) {
                if (b.id === rowId && b.type === 'row') {
                  for (const col of b.config.columns) out.push(...col.blocks);
                  continue;
                }
                if (b.type === 'row') {
                  out.push({ ...b, config: { ...b.config, columns: b.config.columns.map((c2) => ({ blocks: applyTo(c2.blocks) })) } } as CanvasBlock);
                  continue;
                }
                out.push(b);
              }
              return out;
            };
            return { ...c, blocks: applyTo(c.blocks) };
          }),

        updateBlock: (id, patch) => {
          const applyTo = (blocks: CanvasBlock[]): CanvasBlock[] =>
            blocks.map((b) => {
              if (b.id === id) {
                return { ...b, config: { ...(b.config as object), ...patch } } as unknown as CanvasBlock;
              }
              if (b.type === 'row') {
                return { ...b, config: { ...b.config, columns: b.config.columns.map((c) => ({ blocks: applyTo(c.blocks) })) } } as CanvasBlock;
              }
              return b;
            });
          mutateConfig((c) => ({ ...c, blocks: applyTo(c.blocks) }));
        },

        updateBlockShell: (id, patch) => {
          const applyTo = (blocks: CanvasBlock[]): CanvasBlock[] =>
            blocks.map((b) => {
              if (b.id === id) return { ...b, ...patch } as CanvasBlock;
              if (b.type === 'row') {
                return { ...b, config: { ...b.config, columns: b.config.columns.map((c) => ({ blocks: applyTo(c.blocks) })) } } as CanvasBlock;
              }
              return b;
            });
          mutateConfig((c) => ({ ...c, blocks: applyTo(c.blocks) }));
        },

        replaceBlock: (id, block) => {
          const applyTo = (blocks: CanvasBlock[]): CanvasBlock[] =>
            blocks.map((b) => (b.id === id ? block : b.type === 'row' ? { ...b, config: { ...b.config, columns: b.config.columns.map((c) => ({ blocks: applyTo(c.blocks) })) } } as CanvasBlock : b));
          mutateConfig((c) => ({ ...c, blocks: applyTo(c.blocks) }));
        },

        removeBlock: (id) => {
          const applyTo = (blocks: CanvasBlock[]): CanvasBlock[] =>
            blocks
              .filter((b) => b.id !== id)
              .map((b) => (b.type === 'row' ? ({ ...b, config: { ...b.config, columns: b.config.columns.map((c) => ({ blocks: applyTo(c.blocks) })) } } as CanvasBlock) : b));
          mutateConfig((c) => ({ ...c, blocks: applyTo(c.blocks) }));
          if (get().selectedId === id) set({ selectedId: null });
        },

        moveBlock: (id, dir) => {
          mutateConfig((c) => {
            const idx = c.blocks.findIndex((b) => b.id === id);
            if (idx < 0) return c;
            const target = idx + dir;
            if (target < 0 || target >= c.blocks.length) return c;
            const blocks = [...c.blocks];
            [blocks[idx], blocks[target]] = [blocks[target], blocks[idx]];
            return { ...c, blocks };
          });
        },

        moveBlockTo: (dragId, target) =>
          mutateConfig((c) => {
            // 1) 从原位置摘出（递归，记录来源堆栈）
            let moved: CanvasBlock | null = null;
            let fromRowId: string | null = null;
            let fromCol = -1;
            let fromIdx = -1;
            const detach = (blocks: CanvasBlock[], rowId: string | null, colIdx: number): CanvasBlock[] => {
              const out: CanvasBlock[] = [];
              blocks.forEach((b, i) => {
                if (b.id === dragId && moved === null) {
                  moved = b;
                  fromRowId = rowId;
                  fromCol = colIdx;
                  fromIdx = i;
                  return;
                }
                if (b.type === 'row') {
                  out.push({
                    ...b,
                    config: { ...b.config, columns: b.config.columns.map((col, ci) => ({ blocks: detach(col.blocks, b.id, ci) })) },
                  } as CanvasBlock);
                  return;
                }
                out.push(b);
              });
              return out;
            };
            let blocks = detach(c.blocks, null, -1);
            if (moved === null) return c;
            const movedBlock = moved as CanvasBlock;
            // 2) 同堆栈内移动：摘除后索引前移修正
            let index = target.index;
            if (fromRowId === target.rowId && fromCol === target.colIdx && fromIdx >= 0 && fromIdx < index) index -= 1;
            // 3) 插入目标堆栈
            if (target.rowId === null) {
              const list = [...blocks];
              list.splice(Math.max(0, Math.min(index, list.length)), 0, movedBlock);
              blocks = list;
            } else {
              const insert = (bs: CanvasBlock[]): CanvasBlock[] =>
                bs.map((b) => {
                  if (b.id === target.rowId && b.type === 'row') {
                    const cols = b.config.columns.map((col, ci) => {
                      if (ci !== target.colIdx) return col;
                      const list = [...col.blocks];
                      list.splice(Math.max(0, Math.min(index, list.length)), 0, movedBlock);
                      return { blocks: list };
                    });
                    return { ...b, config: { ...b.config, columns: cols } } as CanvasBlock;
                  }
                  if (b.type === 'row') {
                    return { ...b, config: { ...b.config, columns: b.config.columns.map((col) => ({ blocks: insert(col.blocks) })) } } as CanvasBlock;
                  }
                  return b;
                });
              blocks = insert(blocks);
            }
            return { ...c, blocks };
          }),

        splitBeside: (targetId, block, side, moveFromId) =>
          mutateConfig((c) => {
            let blocks = c.blocks;
            // 已有块移动：先摘除（保 id），目标定位在摘除后进行
            if (moveFromId) {
              const detach = (bs: CanvasBlock[]): CanvasBlock[] => {
                const out: CanvasBlock[] = [];
                for (const b of bs) {
                  if (b.id === moveFromId) continue;
                  if (b.type === 'row') {
                    out.push({ ...b, config: { ...b.config, columns: b.config.columns.map((col) => ({ blocks: detach(col.blocks) })) } } as CanvasBlock);
                    continue;
                  }
                  out.push(b);
                }
                return out;
              };
              blocks = detach(blocks);
            }
            const container: CanvasBlock = {
              id: `cb_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
              type: 'row',
              config: {
                widths: [50, 50],
                align: 'stretch',
                columns: side === 'left' ? [{ blocks: [block] }, { blocks: [] }] : [{ blocks: [] }, { blocks: [block] }],
              },
            };
            // 定位 target 并替换为容器（target 放进空列）
            const place = (bs: CanvasBlock[]): CanvasBlock[] =>
              bs.map((b) => {
                if (b.id === targetId) {
                  const cols = (container.config as { columns: { blocks: CanvasBlock[] }[] }).columns;
                  const targetCol = side === 'left' ? 1 : 0;
                  cols[targetCol] = { blocks: [b] };
                  return container;
                }
                if (b.type === 'row') {
                  return { ...b, config: { ...b.config, columns: b.config.columns.map((col) => ({ blocks: place(col.blocks) })) } } as CanvasBlock;
                }
                return b;
              });
            return { ...c, blocks: place(blocks) };
          }),

        insertAsNewColumn: (rowId, block, side, moveFromId) =>
          mutateConfig((c) => {
            let blocks = c.blocks;
            if (moveFromId) {
              const detach = (bs: CanvasBlock[]): CanvasBlock[] => {
                const out: CanvasBlock[] = [];
                for (const b of bs) {
                  if (b.id === moveFromId) continue;
                  if (b.type === 'row') {
                    out.push({ ...b, config: { ...b.config, columns: b.config.columns.map((col) => ({ blocks: detach(col.blocks) })) } } as CanvasBlock);
                    continue;
                  }
                  out.push(b);
                }
                return out;
              };
              blocks = detach(blocks);
            }
            const insert = (bs: CanvasBlock[]): CanvasBlock[] =>
              bs.map((b) => {
                if (b.id === rowId && b.type === 'row') {
                  if (b.config.columns.length >= 4) return b;
                  const n = b.config.columns.length + 1;
                  const newCol = { blocks: [block] };
                  const columns = side === 'left' ? [newCol, ...b.config.columns] : [...b.config.columns, newCol];
                  return {
                    ...b,
                    config: { ...b.config, columns, widths: Array.from({ length: n }, () => Math.round(100 / n)) },
                  } as CanvasBlock;
                }
                if (b.type === 'row') {
                  return { ...b, config: { ...b.config, columns: b.config.columns.map((col) => ({ blocks: insert(col.blocks) })) } } as CanvasBlock;
                }
                return b;
              });
            return { ...c, blocks: insert(blocks) };
          }),

        selectBlock: (id) => set({ selectedId: id }),

        // ---- 数据源 ----
        addSource: (source) => {
          mutateConfig(
            (c) => ({
              ...c,
              dataSources: [...c.dataSources, source],
              pipeline: {
                nodes: [
                  ...c.pipeline.nodes,
                  {
                    id: `n_${source.id}`,
                    type: 'source',
                    name: source.name,
                    inputs: [],
                    params: { sourceId: source.id },
                    enabled: true,
                  },
                ],
              },
            }),
            true,
          );
          set({ selectedId: null });
        },

        updateSource: (id, patch) => {
          mutateConfig(
            (c) => ({
              ...c,
              dataSources: c.dataSources.map((d) => (d.id === id ? ({ ...d, ...patch } as DataSource) : d)),
            }),
            true,
            `source:${id}`,
          );
        },

        removeSource: (id) => {
          mutateConfig(
            (c) => ({
              ...c,
              dataSources: c.dataSources.filter((d) => d.id !== id),
              pipeline: { nodes: c.pipeline.nodes.filter((n) => String(n.params.sourceId ?? '') !== id) },
            }),
            true,
          );
          void removeSourceSnapshot(id);
          void removeFileHandle(id);
        },

        loadFileForSource: async (sourceId, file, handle) => {
          const def = get().config.dataSources.find((d) => d.id === sourceId);
          if (!def || def.kind !== 'import') return;
          set({
            busy: true,
            sources: {
              ...get().sources,
              [sourceId]: { ...(get().sources[sourceId] ?? EMPTY_RUNTIME), status: 'loading', message: '解析中…' },
            },
          });
          try {
            const loaded = await loadImportFile(file, { sheetName: def.sheetName });
            // 句柄：本次选择有则记忆，无（降级 input 换文件）则清除旧句柄，避免指向过期文件
            if (handle) await saveFileHandle(sourceId, handle);
            else await removeFileHandle(sourceId);
            set({
              busy: false,
              sources: {
                ...get().sources,
                [sourceId]: {
                  table: loaded.table,
                  sheets: loaded.sheets,
                  file,
                  status: 'ready',
                  version: (get().sources[sourceId]?.version ?? 0) + 1,
                  fromCache: false,
                  hasHandle: !!handle || (await getFileHandle(sourceId)) !== null,
                },
              },
            });
            const fp = fileFingerprint(file);
            mutateConfig(
              (c) => ({
                ...c,
                dataSources: c.dataSources.map((d) =>
                  d.id === sourceId ? ({ ...d, fileName: loaded.fileName, sheetName: loaded.sheetName, fileMeta: fp } as DataSource) : d,
                ),
              }),
              true,
            );
            // 快照缓存：开关默认开（cacheData !== false）
            const curDef = get().config.dataSources.find((d): d is ImportDataSource => d.id === sourceId && d.kind === 'import');
            if (curDef?.cacheData !== false) {
              await saveSourceSnapshot(sourceId, {
                fp,
                sheetName: loaded.sheetName,
                table: loaded.table,
                sheets: loaded.sheets,
                savedAt: Date.now(),
              });
            }
          } catch (err) {
            set({
              busy: false,
              sources: {
                ...get().sources,
                [sourceId]: {
                  ...(get().sources[sourceId] ?? EMPTY_RUNTIME),
                  status: 'error',
                  message: err instanceof Error ? err.message : '解析失败',
                },
              },
            });
          }
        },

        setSourceSheet: async (sourceId, sheetName) => {
          const rt = get().sources[sourceId];
          if (!rt?.file) return;
          set({ busy: true });
          try {
            const loaded = await loadImportFile(rt.file, { sheetName });
            set({
              busy: false,
              sources: {
                ...get().sources,
                [sourceId]: { ...rt, table: loaded.table, status: 'ready', version: rt.version + 1 },
              },
            });
            mutateConfig(
              (c) => ({
                ...c,
                dataSources: c.dataSources.map((d) => (d.id === sourceId ? ({ ...d, sheetName } as DataSource) : d)),
              }),
              true,
            );
            // 同步刷新快照缓存（sheet 变了）
            const curDef = get().config.dataSources.find((d): d is ImportDataSource => d.id === sourceId && d.kind === 'import');
            if (curDef && curDef.cacheData !== false && rt.file) {
              await saveSourceSnapshot(sourceId, {
                fp: fileFingerprint(rt.file),
                sheetName,
                table: loaded.table,
                sheets: loaded.sheets,
                savedAt: Date.now(),
              });
            }
          } catch (err) {
            set({ busy: false });
            set({
              sources: {
                ...get().sources,
                [sourceId]: { ...rt, status: 'error', message: err instanceof Error ? err.message : '解析失败' },
              },
            });
          }
        },

        pickFileForSource: async (sourceId) => {
          const picker = typeof window !== 'undefined' ? window.showOpenFilePicker : undefined;
          if (typeof picker !== 'function') return false;
          try {
            const [handle] = await picker.call(window, {
              types: [
                {
                  description: '数据文件',
                  accept: {
                    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
                    'application/vnd.ms-excel': ['.xls'],
                    'text/csv': ['.csv'],
                  },
                },
              ],
            });
            const file = await handle.getFile();
            await get().loadFileForSource(sourceId, file, handle);
            return true;
          } catch {
            return false; // 用户取消或 API 受限，UI 降级 input
          }
        },

        rereadSourceFile: async (sourceId) => {
          const handle = await getFileHandle(sourceId);
          if (!handle) return false;
          const ok = await ensureHandlePermission(handle);
          if (!ok) {
            set({
              sources: {
                ...get().sources,
                [sourceId]: {
                  ...(get().sources[sourceId] ?? EMPTY_RUNTIME),
                  status: 'error',
                  message: '文件访问权限未授予，请重新选择文件',
                },
              },
            });
            return false;
          }
          try {
            const file = await handle.getFile();
            await get().loadFileForSource(sourceId, file, handle);
            return true;
          } catch {
            return false;
          }
        },

        setSourceCacheEnabled: (sourceId, enabled) => {
          get().updateSource(sourceId, { cacheData: enabled });
          if (!enabled) void removeSourceSnapshot(sourceId);
        },

        clearSourceCache: async (sourceId) => {
          await removeSourceSnapshot(sourceId);
          const rt = get().sources[sourceId];
          if (rt?.fromCache) {
            set({
              sources: { ...get().sources, [sourceId]: { ...rt, fromCache: false, cachedAt: undefined } },
            });
          }
        },

        // ---- 管道 ----
        addNode: (node) => mutateConfig((c) => ({ ...c, pipeline: { nodes: [...c.pipeline.nodes, node] } }), true),

        updateNode: (id, patch) =>
          mutateConfig(
            (c) => ({
              ...c,
              pipeline: { nodes: c.pipeline.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) },
            }),
            true,
            `node:${id}`,
          ),

        removeNode: (id) =>
          mutateConfig(
            (c) => {
              const nodes = c.pipeline.nodes
                .filter((n) => n.id !== id)
                .map((n) => ({ ...n, inputs: n.inputs.filter((i) => i !== id) }));
              return { ...c, pipeline: { nodes } };
            },
            true,
          ),

        toggleNode: (id) =>
          mutateConfig(
            (c) => ({
              ...c,
              pipeline: { nodes: c.pipeline.nodes.map((n) => (n.id === id ? { ...n, enabled: !n.enabled } : n)) },
            }),
            true,
          ),

        moveNode: (id, dir) =>
          mutateConfig(
            (c) => {
              const idx = c.pipeline.nodes.findIndex((n) => n.id === id);
              if (idx < 0) return c;
              const target = idx + dir;
              if (target < 0 || target >= c.pipeline.nodes.length) return c;
              const nodes = [...c.pipeline.nodes];
              [nodes[idx], nodes[target]] = [nodes[target], nodes[idx]];
              return { ...c, pipeline: { nodes } };
            },
            true,
          ),

        recompute: () => recomputeWith(get().config, get().sources),
      };
    },
    {
      name: 'rankboard-canvas-v3',
      version: 4,
      // Tauri 桌面壳：config 落 SQLite（无 5MB 配额）；浏览器：safeStorage（探测+内存降级）
      storage: createJSONStorage(() => (isTauri() ? tauriPersistStorage : appStorage)),
      partialize: (state) => ({ config: state.config }),
      /**
       * 老版本数据兜底：版本不匹配时 zustand 默认直接丢弃（静默丢配置）。
       * 这里先整份备份到 backup key，再与默认 config 浅合并尽力沿用；
       * 结构差异过大导致异常时也不会阻断启动。
       */
      migrate: (persisted, version) => {
        try {
          if (persisted && typeof persisted === 'object') {
            appStorage.setItem(`rankboard-canvas-backup-v${version}`, JSON.stringify(persisted));
          }
          const p = persisted as { config?: Partial<CanvasConfig> } | undefined;
          const config = { ...createDefaultCanvasConfig(), ...(p?.config ?? {}) };
          // 容器结构迁移：旧版 row.children（每子块一列）→ columns（列=垂直堆栈）
          config.blocks = (config.blocks ?? []).map((b) => {
            if (b.type !== 'row') return b;
            const cfg = b.config as unknown as { children?: CanvasBlock[]; columns?: { blocks: CanvasBlock[] }[]; widths: number[]; align: 'stretch' | 'top' };
            if (!Array.isArray(cfg.columns)) {
              const children = Array.isArray(cfg.children) ? cfg.children : [];
              return { ...b, config: { widths: cfg.widths, align: cfg.align, columns: children.map((c2) => ({ blocks: [c2] })) } } as CanvasBlock;
            }
            return b;
          });
          return { config };
        } catch {
          return { config: createDefaultCanvasConfig() };
        }
      },
      onRehydrateStorage: () => (state) => {
        if (state) state.restored = true;
      },
    },
  ),
);

/** 刷新后异步恢复导入源缓存快照：命中则重建运行时并重算；完成后由 done 生成提示 */
async function restoreImportCaches(
  recompute: (config: CanvasConfig, sources: Record<string, SourceRuntime>) => void,
  done: (store: CanvasStore) => string | null,
): Promise<void> {
  const s0 = useCanvasStore.getState();
  const importDefs = s0.config.dataSources.filter((d) => d.kind === 'import');
  if (importDefs.length === 0) return;

  const next = { ...s0.sources };
  let hit = 0;
  for (const def of importDefs) {
    if (def.cacheData === false) continue;
    let snap = await loadSourceSnapshot(def.id);
    // 表为空但有原始字节（如 .rkb 导入的项目）：离线重建 File 重新解析
    if (snap && snap.table.rows.length === 0 && snap.fileBytes) {
      try {
        const f = base64ToFile(snap.fileBytes, snap.fp.name);
        const loaded = await loadImportFile(f, { sheetName: def.sheetName || snap.sheetName || undefined });
        snap = { ...snap, table: loaded.table, sheets: loaded.sheets, sheetName: loaded.sheetName };
        await saveSourceSnapshot(def.id, snap);
      } catch {
        continue;
      }
    }
    if (!snap) continue;
    const hasHandle = (await getFileHandle(def.id)) !== null;
    next[def.id] = {
      table: snap.table,
      sheets: snap.sheets,
      file: null,
      status: 'ready',
      version: (next[def.id]?.version ?? 0) + 1,
      fromCache: true,
      cachedAt: snap.savedAt,
      hasHandle,
    };
    hit += 1;
  }

  if (hit > 0) {
    useCanvasStore.setState({ sources: next });
    recompute(useCanvasStore.getState().config, next);
  }
  const warn = done(useCanvasStore.getState());
  useCanvasStore.setState({ warnings: warn ? [warn] : [] });
}

/** 区块 id → 区块（含 row 子块） */
export function findBlock(blocks: CanvasBlock[], id: string): CanvasBlock | null {
  for (const b of blocks) {
    if (b.id === id) return b;
    if (b.type === 'row') {
      for (const col of b.config.columns) {
        const hit = findBlock(col.blocks, id);
        if (hit) return hit;
      }
    }
  }
  return null;
}

/** 遍历全部区块（含 row 子块） */
export function walkBlocks(blocks: CanvasBlock[], fn: (b: CanvasBlock, parent: CanvasBlock | null) => void): void {
  for (const b of blocks) {
    fn(b, null);
    if (b.type === 'row') {
      for (const col of b.config.columns) {
        for (const c of col.blocks) fn(c, b);
      }
    }
  }
}

/** 绑定到某数据源/节点的区块（删除前引用提示，PRD E6） */
export function blocksReferencing(config: CanvasConfig, ref: string): string[] {
  const out: string[] = [];
  walkBlocks(config.blocks, (b) => {
    const cfg = b.config as AnyBlockConfig & Record<string, unknown>;
    const table = (cfg as unknown as { table?: { nodeRef?: string } }).table;
    if (table?.nodeRef === ref) out.push(b.id);
    const value = (cfg as unknown as { value?: { nodeRef?: string } }).value;
    if (value?.nodeRef === ref) out.push(b.id);
  });
  return out;
}

export { newBlockId };


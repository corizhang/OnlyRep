import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { appStorage, onStorageError } from '../storage/safeStorage';
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
  undo: () => void;
  redo: () => void;
  /** 把多次连续修改合并为一步历史（如添加+落点、群移、批量删除） */
  transact: (label: string, fn: () => void) => void;

  // 生命周期
  bootstrap: () => void;

  // 画布级配置
  patchConfig: (p: Partial<CanvasConfig>) => void;
  applyPreset: (presetId: string) => void;
  loadTemplate: (config: CanvasConfig) => void;
  resetCanvas: () => void;

  // 区块
  addBlock: (block: CanvasBlock, afterId?: string) => void;
  /** 插入到顶层指定索引（拖入画布时按指针位置落点） */
  insertBlockAt: (block: CanvasBlock, index: number) => void;
  addBlockToRow: (rowId: string, block: CanvasBlock) => void;
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
        set({ config });
        if (rerun) recomputeWith(config, get().sources);
      };

      return {
        config: createDefaultCanvasConfig(),
        storageError: null,
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
        undo: () => {
          const s = get();
          const past = s.history.past.slice();
          const entry = past.pop();
          if (!entry) return;
          const future = [{ config: s.config, label: entry.label, at: Date.now() }, ...s.history.future].slice(0, HISTORY_LIMIT);
          set({ config: entry.config, history: { past, future } });
          recomputeWith(entry.config, get().sources);
        },
        redo: () => {
          const s = get();
          const future = s.history.future.slice();
          const entry = future.shift();
          if (!entry) return;
          const past = [...s.history.past, { config: s.config, label: entry.label, at: Date.now() }].slice(-HISTORY_LIMIT);
          set({ config: entry.config, history: { past, future } });
          recomputeWith(entry.config, get().sources);
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
          set({ config, sources: {}, selectedId: null, errors: [], history: { past: [], future: [] } });
          recomputeWith(config, {});
        },

        resetCanvas: () => {
          engineCache.clear();
          void clearSourceSnapshots();
          const config = createDefaultCanvasConfig();
          set({ config, sources: {}, selectedId: null, errors: [], warnings: [], history: { past: [], future: [] } });
        },

        loadTemplate: (config) => {
          engineCache.clear();
          void clearSourceSnapshots();
          set({ config, sources: {}, selectedId: null, errors: [], warnings: [], history: { past: [], future: [] } });
          recomputeWith(config, {});
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

        addBlockToRow: (rowId, block) =>
          mutateConfig((c) => ({
            ...c,
            blocks: c.blocks.map((b) => {
              if (b.id !== rowId || b.type !== 'row') return b;
              if (b.config.children.length >= 3) return b;
              const n = b.config.children.length + 1;
              return {
                ...b,
                config: {
                  ...b.config,
                  children: [...b.config.children, block],
                  widths: Array.from({ length: n }, () => Math.round(100 / n)),
                },
              };
            }),
          })),

        updateBlock: (id, patch) => {
          const applyTo = (blocks: CanvasBlock[]): CanvasBlock[] =>
            blocks.map((b) => {
              if (b.id === id) {
                return { ...b, config: { ...(b.config as object), ...patch } } as unknown as CanvasBlock;
              }
              if (b.type === 'row') {
                return { ...b, config: { ...b.config, children: applyTo(b.config.children) } } as CanvasBlock;
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
                return { ...b, config: { ...b.config, children: applyTo(b.config.children) } } as CanvasBlock;
              }
              return b;
            });
          mutateConfig((c) => ({ ...c, blocks: applyTo(c.blocks) }));
        },

        replaceBlock: (id, block) => {
          const applyTo = (blocks: CanvasBlock[]): CanvasBlock[] =>
            blocks.map((b) => (b.id === id ? block : b.type === 'row' ? { ...b, config: { ...b.config, children: applyTo(b.config.children) } } as CanvasBlock : b));
          mutateConfig((c) => ({ ...c, blocks: applyTo(c.blocks) }));
        },

        removeBlock: (id) => {
          const applyTo = (blocks: CanvasBlock[]): CanvasBlock[] =>
            blocks
              .filter((b) => b.id !== id)
              .map((b) => (b.type === 'row' ? ({ ...b, config: { ...b.config, children: applyTo(b.config.children) } } as CanvasBlock) : b));
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
      version: 3,
      storage: createJSONStorage(() => appStorage),
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
          return { config: { ...createDefaultCanvasConfig(), ...(p?.config ?? {}) } };
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
    const snap = await loadSourceSnapshot(def.id);
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
      const hit = findBlock(b.config.children, id);
      if (hit) return hit;
    }
  }
  return null;
}

/** 遍历全部区块（含 row 子块） */
export function walkBlocks(blocks: CanvasBlock[], fn: (b: CanvasBlock, parent: CanvasBlock | null) => void): void {
  for (const b of blocks) {
    fn(b, null);
    if (b.type === 'row') {
      for (const c of b.config.children) fn(c, b);
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


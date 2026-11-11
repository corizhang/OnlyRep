import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { appStorage } from '../storage/safeStorage';
import type { StoreApi } from 'zustand';
import type { BoardResult, RankConfig, RawTable } from '../types';
import { createDefaultConfig } from '../constants/defaults';
import { parseFile, parseTsv, toRawTable } from '../parser/parse';
import { buildColumnMetas, cleanTable, type CleanedTable } from '../parser/clean';
import { fingerprint, runPipeline } from '../compute/pipeline';
import { downloadTemplate, validateTemplate } from '../utils/template';
import { fillV2BlockDefaults, migrateConfigV1toV2 } from '../utils/migrate';

/**
 * 唯一数据源（Zustand + persist）。
 * 铁律：persist 仅持久化 config（partialize 白名单）；
 * rawTable / cleaned / board / 背景图 dataURL 一律不落盘（R7-01 / R9）。
 */

/** 最近一次导入的文件引用（Sheet 切换重解析用；模块级，不进 store、不持久化） */
let lastFileRef: File | null = null;

export interface RankStore {
  // 数据（不持久化）
  rawTable: RawTable | null;
  parseProgress: number; // 0~100
  parseError: string | null;
  excludedRowIdx: Set<number>;
  excludeTotalKeywords: boolean;

  // 配置（持久化）
  config: RankConfig;

  // 派生结果（管线缓存，不持久化）
  cleaned: CleanedTable | null;
  board: BoardResult | null;

  // E9：刷新后配置已恢复标记（rawTable 为空且存在持久化配置时提示重新导入）
  configRestored: boolean;

  // actions
  loadFile: (file: File) => Promise<void>;
  loadClipboardTsv: (text: string) => void;
  selectSheet: (name: string) => Promise<void>;
  setHeaderRow: (i: number) => void;
  toggleExcludeRow: (i: number) => void;
  setExcludeTotalKeywords: (on: boolean) => void;
  patchConfig: (p: Partial<RankConfig>) => void;
  resetConfig: () => void;
  importTemplate: (json: unknown) => void;
  exportTemplate: () => void;
  recompute: () => void;
  markConfigRestored: () => void;
}

type SetState = StoreApi<RankStore>['setState'];
type GetState = StoreApi<RankStore>['getState'];

/** 新表入库：重建清洗结果并跑一次管线（排除规则随新导入重置） */
function ingestTable(set: SetState, get: GetState, table: RawTable): void {
  const { config, excludeTotalKeywords } = get();
  const cleaned = cleanTable(table, {
    excludeTotalKeywords,
    excludedRowIdx: new Set<number>(),
  });
  const board = runPipeline(cleaned, config);
  set({
    rawTable: table,
    cleaned,
    board,
    excludedRowIdx: new Set<number>(),
    parseProgress: 100,
    parseError: null,
  });
}

export const useRankStore = create<RankStore>()(
  persist(
    (set, get) => ({
      rawTable: null,
      parseProgress: 0,
      parseError: null,
      excludedRowIdx: new Set<number>(),
      excludeTotalKeywords: true,
      config: createDefaultConfig(),
      cleaned: null,
      board: null,
      configRestored: false,

      markConfigRestored: () => set({ configRestored: true }),

      loadFile: async (file) => {
        lastFileRef = file;
        set({ parseProgress: 1, parseError: null });
        try {
          const table = await parseFile(file, {
            onProgress: (v) => set({ parseProgress: v }),
          });
          ingestTable(set, get, table);
        } catch (err) {
          set({
            parseError:
              err instanceof Error
                ? err.message
                : '文件损坏或加密，请另存为 xlsx 后重试',
            parseProgress: 0,
          });
        }
      },

      loadClipboardTsv: (text) => {
        set({ parseError: null });
        try {
          const cells = parseTsv(text);
          lastFileRef = null;
          let cols = 0;
          for (const r of cells) cols = Math.max(cols, r.length);
          const table = toRawTable(cells, {
            source: 'tsv',
            fileName: '',
            sheetName: '粘贴数据',
            sheets: [{ name: '粘贴数据', rows: cells.length, cols }],
          });
          ingestTable(set, get, table);
        } catch (err) {
          set({
            parseError:
              err instanceof Error
                ? err.message
                : '剪贴板中未识别到表格数据，请从 Excel 复制单元格区域',
          });
        }
      },

      selectSheet: async (name) => {
        const s = get();
        if (!s.rawTable || !lastFileRef) return;
        const idx = s.rawTable.sheets.findIndex((sh) => sh.name === name);
        if (idx < 0) return;
        set({ parseProgress: 1, parseError: null });
        try {
          const table = await parseFile(lastFileRef, {
            sheetIndex: idx,
            onProgress: (v) => set({ parseProgress: v }),
          });
          ingestTable(set, get, table);
        } catch (err) {
          set({
            parseError:
              err instanceof Error
                ? err.message
                : '文件损坏或加密，请另存为 xlsx 后重试',
          });
        }
      },

      setHeaderRow: (i) => {
        const s = get();
        if (!s.rawTable) return;
        const table: RawTable = {
          ...s.rawTable,
          headerRowIndex: i,
          columns: buildColumnMetas(s.rawTable.cells, i),
        };
        set({ rawTable: table });
        get().recompute();
      },

      toggleExcludeRow: (i) => {
        const next = new Set(get().excludedRowIdx);
        if (next.has(i)) next.delete(i);
        else next.add(i);
        set({ excludedRowIdx: next });
        get().recompute();
      },

      setExcludeTotalKeywords: (on) => {
        set({ excludeTotalKeywords: on });
        get().recompute();
      },

      patchConfig: (p) => {
        const s = get();
        const prevFp = fingerprint(s.config);
        const config: RankConfig = { ...s.config, ...p };
        set({ config });
        // 视觉/文本类字段指纹不变 → 跳过管线（ARCH §6 重算分层）
        if (s.cleaned && fingerprint(config) !== prevFp) {
          set({ board: runPipeline(s.cleaned, config) });
        }
      },

      resetConfig: () => {
        set({ config: createDefaultConfig(), parseError: null });
        get().recompute();
      },

      importTemplate: (json) => {
        try {
          const config = validateTemplate(json);
          set({ config, parseError: null });
          get().recompute();
        } catch (err) {
          set({
            parseError:
              err instanceof Error ? err.message : '模板文件格式不正确',
          });
        }
      },

      exportTemplate: () => {
        downloadTemplate(get().config);
      },

      recompute: () => {
        const s = get();
        if (!s.rawTable) {
          set({ board: null, cleaned: null });
          return;
        }
        const cleaned = cleanTable(s.rawTable, {
          excludeTotalKeywords: s.excludeTotalKeywords,
          excludedRowIdx: s.excludedRowIdx,
        });
        set({ cleaned, board: runPipeline(cleaned, s.config) });
      },
    }),
    {
      // key 沿用 v1 名称以保留用户已有 localStorage；persist version 升至 3，
      // migrate 做 v1→v2 结构迁移 + v2 旧持久化补 P0 样式字段默认值。
      // 注意：zustand persist 仅在存储版本 ≠ 此处 version 时调用 migrate，
      // 因此每新增配置字段必须同步升版本号，否则旧持久化会绕过补默认值（白屏事故根因）。
      name: 'rankboard:config:v1',
      version: 3,
      storage: createJSONStorage(() => appStorage),
      // 白名单只含 config；且背景图 dataURL 绝不落盘（铁律 / R9）
      partialize: (state) => ({
        config: { ...state.config, backgroundImage: null },
      }),
      migrate: (persisted, ver) => {
        const p = (persisted ?? {}) as { config?: unknown };
        if (!p.config || typeof p.config !== 'object') return persisted as RankStore;
        if (ver < 2) {
          return {
            config: migrateConfigV1toV2(p.config as Record<string, unknown>),
          } as unknown as RankStore;
        }
        // ver 2~3：v2 旧持久化，榜单块 P0 样式字段缺省补默认值（旧行为不变）
        return {
          ...p,
          config: fillV2BlockDefaults(p.config as RankConfig),
        } as unknown as RankStore;
      },
      onRehydrateStorage: () => (state) => {
        state?.markConfigRestored();
      },
    },
  ),
);

import type {
  BadgeShape,
  BlockAlign,
  BlockConfig,
  BlockType,
  PosterBlock,
  RankConfig,
  RankListBlockConfig,
  RankListVariant,
  RankRow,
  RowStyle,
  TableColAlign,
  TableColId,
  TextBlockConfig,
  TextRole,
  Top1Icon,
} from '../types';

/**
 * 区块纯函数工具集：id 生成 / 数据切片（分列、分页）/ 标题提取 / 结构清洗。
 * 全部为纯函数，禁止 import React / store；渲染与模板导入共用，保证可测性。
 */

let idCounter = 0;

/** 区块 id 生成（nanoid 风格：时间戳 + 自增 + 随机段，同进程内必然唯一） */
export function newBlockId(): string {
  idCounter += 1;
  return `b_${Date.now().toString(36)}_${idCounter.toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** 文本角色 → 默认字号倍数（相对主题基准字号） */
export const DEFAULT_ROLE_SCALE: Record<TextRole, number> = {
  title: 1.8,
  subtitle: 1.0,
  body: 0.95,
  note: 0.8,
  signature: 0.8,
};

/** 数值收敛：非法（NaN/Infinity）回退 fallback，否则夹到 [min, max] */
export function clampNum(v: number, min: number, max: number, fallback: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** 双列切分：左列先填满（奇数项左列多一行），名次顺序 = 左列自上而下 → 右列自上而下（R4-03） */
export function splitTwoColumn(rows: RankRow[]): [RankRow[], RankRow[]] {
  const half = Math.ceil(rows.length / 2);
  return [rows.slice(0, half), rows.slice(half)];
}

/** 分页切片：每页 size 条，最后一页可不满（paged 变体）；非法 size 回退每页 1 条 */
export function chunkRows<T>(arr: T[], size: number): T[][] {
  const n = Math.floor(Number(size));
  const step = Number.isFinite(n) && n >= 1 ? n : 1;
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += step) out.push(arr.slice(i, i + step));
  return out;
}

/** 取海报标题：第一个 role==='title' 的文本块内容（导出文件名等处使用；无则 ''） */
export function getPosterTitle(config: RankConfig): string {
  const block = config.blocks.find(
    (b) => b.type === 'text' && (b.config as TextBlockConfig).role === 'title',
  );
  return block ? (block.config as TextBlockConfig).content : '';
}

// ---- 榜单块配置（P0 样式配置项：默认值工厂 / 列宽归一化 / 列展开 / 清洗） ----

/** 表格列 id 全集（固定顺序，编辑器展示用） */
export const TABLE_COL_IDS: readonly TableColId[] = ['rank', 'name', 'secondary', 'value'];

/** 表格列对齐默认值（aligns 未指定该列时使用） */
export const TABLE_COL_DEFAULT_ALIGN: Record<TableColId, TableColAlign> = {
  rank: 'center',
  name: 'left',
  secondary: 'left',
  value: 'right',
};

/**
 * 榜单块默认配置工厂（唯一真源）：默认值 = P0 之前的旧行为。
 * templates / BlockEditorPanel 新建区块 / 清洗兜底统一走这里。
 */
export function createRankListBlockConfig(
  variant: RankListVariant = 'long',
  pageSize = 10,
  overrides: Partial<RankListBlockConfig> = {},
): RankListBlockConfig {
  return {
    variant,
    pageSize,
    rowStyle: 'card',
    badgeShape: 'circle',
    top1Icon: 'auto',
    progressBar: { show: true, color: 'accent' },
    table: {
      columns: ['rank', 'name', 'value'],
      colWidthMode: 'auto',
      colWeights: {},
      aligns: {},
      header: { show: true, bold: true, bg: 'theme' },
    },
    ...overrides,
  };
}

/**
 * 表格列宽归一化：按权重归一化为百分比数组（总和恰为 100，保留 1 位小数）。
 * 缺省权重按 1 计；非法值（NaN/非有限/越界）钳制到 [1, 10]；空列返回空数组。
 * 舍入误差补偿到最大权重列，保证总和严格 100。
 */
export function normalizeWeights(
  weights: Partial<Record<TableColId, number>>,
  colIds: readonly TableColId[],
): number[] {
  if (colIds.length === 0) return [];
  const clamped = colIds.map((id) => {
    const n = Number(weights[id]);
    if (!Number.isFinite(n)) return 1;
    return Math.min(10, Math.max(1, n));
  });
  const total = clamped.reduce((sum, w) => sum + w, 0);
  const pcts = clamped.map((w) => Math.round((w / total) * 1000) / 10);
  // 浮点舍入可能使总和偏离 100（如 [1,1,1] → 33.3×3=99.9），差额补到最大权重列
  const diff = Math.round((100 - pcts.reduce((sum, p) => sum + p, 0)) * 10) / 10;
  if (diff !== 0) {
    const maxIdx = clamped.indexOf(Math.max(...clamped));
    pcts[maxIdx] = Math.round((pcts[maxIdx] + diff) * 10) / 10;
  }
  return pcts;
}

/** 展开后的表格列：id + 次要字段序号（id!=='secondary' 时为 -1） */
export interface TableColResolved {
  id: TableColId;
  secIndex: number;
}

/**
 * 表格列展开：'secondary' 展开为每个次要字段一列（secIndex 0..n-1）；
 * 重复/未知列 id 去重过滤，保持首次出现顺序。
 */
export function expandTableCols(
  columns: readonly TableColId[],
  secondaryCount: number,
): TableColResolved[] {
  const out: TableColResolved[] = [];
  const seen = new Set<TableColId>();
  for (const id of columns) {
    if (!(TABLE_COL_IDS as readonly string[]).includes(id) || seen.has(id)) continue;
    seen.add(id);
    if (id === 'secondary') {
      for (let i = 0; i < secondaryCount; i += 1) out.push({ id, secIndex: i });
    } else {
      out.push({ id, secIndex: -1 });
    }
  }
  return out;
}

/** 任意来源（模板 JSON / 旧持久化）的榜单块配置清洗：新字段缺省/非法一律回默认（旧行为不变） */
export function sanitizeRankListBlockConfig(raw: Record<string, unknown>): RankListBlockConfig {
  const base = createRankListBlockConfig(
    oneOf(raw.variant, VARIANTS, 'long'),
    clampNum(Number(raw.pageSize), 1, 200, 10),
  );
  const rowStyle: RowStyle = oneOf(raw.rowStyle, ['card', 'minimal'] as const, 'card');
  const badgeShape: BadgeShape = oneOf(
    raw.badgeShape,
    ['circle', 'pill', 'square', 'plain'] as const,
    'circle',
  );
  const top1Icon: Top1Icon = oneOf(
    raw.top1Icon,
    ['auto', 'crown', 'medal', 'trophy', 'none'] as const,
    'auto',
  );
  const rawPb = isRecord(raw.progressBar) ? raw.progressBar : {};
  const progressBar = {
    show: rawPb.show === false ? false : true,
    color: oneOf(rawPb.color, ['accent', 'tier'] as const, 'accent' as const),
  };

  const rawTable = isRecord(raw.table) ? raw.table : {};
  const colWidthMode = oneOf(rawTable.colWidthMode, ['auto', 'custom'] as const, 'auto' as const);
  const rawWeights = isRecord(rawTable.colWeights) ? rawTable.colWeights : {};
  const colWeights: RankListBlockConfig['table']['colWeights'] = {};
  for (const id of TABLE_COL_IDS) {
    const w = Number(rawWeights[id]);
    if (Number.isFinite(w)) colWeights[id] = clampNum(w, 1, 10, 1);
  }
  const rawAligns = isRecord(rawTable.aligns) ? rawTable.aligns : {};
  const aligns: RankListBlockConfig['table']['aligns'] = {};
  for (const id of TABLE_COL_IDS) {
    const a = rawAligns[id];
    if (typeof a === 'string' && (ALIGNS as readonly string[]).includes(a)) {
      aligns[id] = a as TableColAlign;
    }
  }
  const rawHeader = isRecord(rawTable.header) ? rawTable.header : {};
  const header = {
    show: rawHeader.show === false ? false : true,
    bold: rawHeader.bold === false ? false : true,
    bg: oneOf(rawHeader.bg, ['theme', 'none'] as const, 'theme' as const),
  };

  return {
    ...base,
    rowStyle,
    badgeShape,
    top1Icon,
    progressBar,
    table: {
      columns: sanitizeTableColList(rawTable.columns),
      colWidthMode,
      colWeights,
      aligns,
      header,
    },
  };
}

/** columns 列表清洗：只留合法 id，'secondary' 去重（只保留首次出现），空列表回默认 */
function sanitizeTableColList(v: unknown): TableColId[] {
  if (!Array.isArray(v)) return ['rank', 'name', 'value'];
  const out: TableColId[] = [];
  let hasSecondary = false;
  for (const item of v) {
    if (typeof item !== 'string' || !(TABLE_COL_IDS as readonly string[]).includes(item)) continue;
    if (item === 'secondary') {
      if (hasSecondary) continue;
      hasSecondary = true;
    }
    out.push(item as TableColId);
  }
  return out.length > 0 ? out : ['rank', 'name', 'value'];
}

// ---- 结构清洗（模板导入 / v2 配置校验共用） ----

const BLOCK_TYPES: readonly BlockType[] = ['text', 'image', 'rankList', 'divider'];
const TEXT_ROLES: readonly TextRole[] = ['title', 'subtitle', 'body', 'note', 'signature'];
const ALIGNS: readonly BlockAlign[] = ['left', 'center', 'right'];
const VARIANTS: readonly RankListVariant[] = ['long', 'twoColumn', 'paged', 'table'];

function oneOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

function toStr(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function toBool(v: unknown): boolean {
  return v === true;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

/**
 * 清洗任意来源（模板 JSON / 旧持久化 / 用户输入）的区块数组为合法 PosterBlock[]：
 * 过滤未知类型，逐字段收敛到类型默认值，id 缺失时重新生成。
 */
export function sanitizePosterBlocks(v: unknown): PosterBlock[] {
  if (!Array.isArray(v)) return [];
  const out: PosterBlock[] = [];
  for (const item of v) {
    if (typeof item !== 'object' || item === null) continue;
    const o = item as Record<string, unknown>;
    // 未知类型直接丢弃（不收敛为 text，避免坏数据产生噪音区块）
    if (typeof o.type !== 'string' || !(BLOCK_TYPES as readonly string[]).includes(o.type)) {
      continue;
    }
    const type = o.type as BlockType;
    const raw =
      typeof o.config === 'object' && o.config !== null
        ? (o.config as Record<string, unknown>)
        : {};
    let config: BlockConfig;
    switch (type) {
      case 'text':
        config = {
          content: toStr(raw.content),
          role: oneOf(raw.role, TEXT_ROLES, 'body'),
          fontSizeScale: clampNum(Number(raw.fontSizeScale), 0.1, 6, 1),
          bold: toBool(raw.bold),
          align: oneOf(raw.align, ALIGNS, 'left'),
          colorMode: oneOf(raw.colorMode, ['theme', 'custom'] as const, 'theme'),
          customColor: toStr(raw.customColor),
        };
        break;
      case 'image':
        config = {
          src: typeof raw.src === 'string' && raw.src !== '' ? raw.src : null,
          widthPct: clampNum(Number(raw.widthPct), 10, 100, 50),
          align: oneOf(raw.align, ALIGNS, 'center'),
          borderRadius: clampNum(Number(raw.borderRadius), 0, 48, 8),
        };
        break;
      case 'rankList':
        config = sanitizeRankListBlockConfig(raw);
        break;
      case 'divider':
        config = {
          colorMode: oneOf(raw.colorMode, ['theme', 'custom'] as const, 'theme'),
          customColor: toStr(raw.customColor),
          thickness: clampNum(Number(raw.thickness), 1, 8, 2),
          marginY: clampNum(Number(raw.marginY), 0, 64, 12),
        };
        break;
    }
    out.push({
      id: toStr(o.id) || newBlockId(),
      type,
      config,
      // 悬浮坐标（仅 floats 数组中的元素生效）：undefined = 缺省（渲染器回退 0,0）
      x: o.x === undefined || o.x === null ? undefined : clampNum(Number(o.x), 0, 100, 0),
      y: o.y === undefined || o.y === null ? undefined : clampNum(Number(o.y), 0, 100, 0),
    });
  }
  return out;
}

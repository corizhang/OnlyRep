import type { CanvasBlock, CanvasConfig, CanvasBlockType } from './types';
import { createBlock, createDefaultCanvasConfig, newBlockId } from './defaults';
import type { RankConfig, TextBlockConfig } from '../types';

/**
 * 画布模板：序列化 / 校验 / 旧排行榜模板迁移（ARCH T17）。
 * 模板只存配置（含手填数据），不含导入数据与 File 引用（R10-04）。
 */

export const CANVAS_TEMPLATE_KIND = 'rankboard-canvas';
export const CANVAS_TEMPLATE_VERSION = 3;

export interface CanvasTemplateFile {
  kind: string;
  version: number;
  exportedAt: string;
  config: CanvasConfig;
}

export function serializeCanvasTemplate(config: CanvasConfig): CanvasTemplateFile {
  return {
    kind: CANVAS_TEMPLATE_KIND,
    version: CANVAS_TEMPLATE_VERSION,
    exportedAt: new Date().toISOString(),
    config: {
      ...config,
      // 导入源不携带任何数据/文件名以外信息；图片 dataURL 保留（属用户素材）
      dataSources: config.dataSources.map((d) => (d.kind === 'import' ? { ...d, fileName: d.fileName } : d)),
    },
  };
}

const BLOCK_TYPES: CanvasBlockType[] = [
  'text',
  'image',
  'divider',
  'kpiCard',
  'goalProgress',
  'chart',
  'dataTable',
  'rankList',
  'row',
];

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

/** 区块清洗：未知类型丢弃；缺失字段用同类型默认值补齐；row 递归且最多 3 个子块 */
export function sanitizeCanvasBlock(raw: unknown, depth = 0): CanvasBlock | null {
  if (!isObj(raw) || typeof raw.type !== 'string') return null;
  const type = raw.type as CanvasBlockType;
  if (!BLOCK_TYPES.includes(type)) return null;

  const base = createBlock(type);
  const cfg = isObj(raw.config) ? raw.config : {};
  const merged = { ...(base.config as unknown as Record<string, unknown>), ...cfg };
  const id = typeof raw.id === 'string' && raw.id !== '' ? raw.id : newBlockId();

  if (type === 'row') {
    if (depth >= 1) return null; // v1：row 不允许嵌套
    const children = Array.isArray(merged.children)
      ? merged.children.map((c) => sanitizeCanvasBlock(c, depth + 1)).filter((c): c is CanvasBlock => c !== null).slice(0, 3)
      : [];
    const widths = Array.isArray(merged.widths) ? (merged.widths as unknown[]).map((w) => (Number.isFinite(Number(w)) ? Number(w) : 50)) : [];
    return {
      id,
      type: 'row',
      config: {
        children,
        widths: children.map((_, i) => widths[i] ?? Math.round(100 / Math.max(1, children.length))),
        align: merged.align === 'top' ? 'top' : 'stretch',
      },
    };
  }

  return { id, type, config: merged } as unknown as CanvasBlock;
}

/** 画布配置清洗（模板导入 / 旧持久化兜底） */
export function sanitizeCanvasConfig(raw: unknown): CanvasConfig {
  const base = createDefaultCanvasConfig();
  if (!isObj(raw)) return base;

  const blocks = Array.isArray(raw.blocks)
    ? raw.blocks.map((b) => sanitizeCanvasBlock(b)).filter((b): b is CanvasBlock => b !== null)
    : [];

  const dataSources = Array.isArray(raw.dataSources)
    ? (raw.dataSources.filter((d) => isObj(d) && typeof d.id === 'string' && typeof d.name === 'string') as CanvasConfig['dataSources'])
    : [];

  const nodes = isObj(raw.pipeline) && Array.isArray((raw.pipeline as { nodes?: unknown }).nodes)
    ? ((raw.pipeline as { nodes: unknown[] }).nodes.filter(
        (n) => isObj(n) && typeof n.id === 'string' && typeof n.type === 'string',
      ) as CanvasConfig['pipeline']['nodes'])
    : [];

  return {
    version: 3,
    title: typeof raw.title === 'string' && raw.title ? raw.title : base.title,
    width: clamp(Number(raw.width), 480, 2000, 900),
    themeId: (['businessBlue', 'festiveRed', 'darkGold', 'cleanWhite'] as const).includes(raw.themeId as never)
      ? (raw.themeId as CanvasConfig['themeId'])
      : 'businessBlue',
    accentColor: typeof raw.accentColor === 'string' ? raw.accentColor : '',
    baseFontSize: clamp(Number(raw.baseFontSize), 10, 28, 15),
    riseColor: typeof raw.riseColor === 'string' && raw.riseColor ? raw.riseColor : base.riseColor,
    fallColor: typeof raw.fallColor === 'string' && raw.fallColor ? raw.fallColor : base.fallColor,
    padding: clamp(Number(raw.padding), 0, 120, 32),
    gap: clamp(Number(raw.gap), 0, 80, 14),
    pageBg: typeof raw.pageBg === 'string' ? raw.pageBg : '',
    headerBg: typeof raw.headerBg === 'string' ? raw.headerBg : '',
    headerHeight: raw.headerHeight === undefined ? undefined : clamp(Number(raw.headerHeight), 0, 400, 110),
    dataSources: dataSources.map((d) =>
      d.kind === 'import' ? { ...d, fileName: '', sheetName: d.sheetName ?? '' } : d,
    ),
    pipeline: { nodes: nodes.map((n) => ({ ...n, inputs: Array.isArray(n.inputs) ? n.inputs : [], enabled: n.enabled !== false })) },
    blocks,
    exportScale: raw.exportScale === 1 || raw.exportScale === 4 ? raw.exportScale : 2,
  };
}

function clamp(v: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, v));
}

/** 校验并解析模板 JSON；旧排行榜模板自动迁移（PRD R5-02） */
export function validateCanvasTemplate(json: unknown): CanvasConfig {
  if (!isObj(json)) throw new Error('模板文件格式不正确');
  // 旧排行榜模板
  if (json.kind === 'rankboard-template' || (isObj(json.config) && (json.config as Record<string, unknown>).version === 2 && Array.isArray((json.config as Record<string, unknown>).blocks))) {
    const cfg = isObj(json.config) ? json.config : json;
    return migrateRankConfigToCanvas(cfg as unknown as RankConfig);
  }
  const raw = isObj(json.config) ? json.config : json;
  if (!isObj(raw)) throw new Error('模板文件格式不正确');
  return sanitizeCanvasConfig(raw);
}

/**
 * 旧排行榜模板 → 单块画布（PRD R5-02）：
 * 文本块 1:1 迁移；rankList 降级为「导入源 + 排行榜块」，导入数据后按原角色映射渲染。
 */
export function migrateRankConfigToCanvas(rank: RankConfig): CanvasConfig {
  const base = createDefaultCanvasConfig();
  const sourceId = 'ds_legacy';
  const nodeId = 'n_legacy';

  const blocks: CanvasBlock[] = [];
  for (const b of rank.blocks ?? []) {
    if (b.type === 'text') {
      const t = b.config as TextBlockConfig;
      blocks.push({
        id: newBlockId(),
        type: 'text',
        config: {
          content: t.content,
          role: t.role,
          fontSizeScale: t.fontSizeScale,
          bold: t.bold,
          align: t.align,
          colorMode: t.colorMode,
          customColor: t.customColor,
        },
      });
    } else if (b.type === 'divider') {
      blocks.push({ id: newBlockId(), type: 'divider', config: { colorMode: 'theme', customColor: '', thickness: 2, marginY: 12 } });
    }
  }

  const hasRank = (rank.blocks ?? []).some((b) => b.type === 'rankList');
  if (hasRank) {
    blocks.push({
      id: newBlockId(),
      type: 'rankList',
      config: {
        table: { nodeRef: nodeId },
        nameCol: rank.nameKey,
        metricCol: rank.metricKey,
        groupCol: rank.mode === 'grouped' ? rank.dimensionKey : '',
        aggMethod: rank.aggMethod,
        sortDir: rank.sortDirection,
        topN: rank.topN,
        variant: 'long',
        showProgress: true,
        format: {
          thousands: rank.numberFormat.thousands,
          decimals: rank.numberFormat.decimals,
          unit: rank.numberFormat.unit === 'auto' ? 'auto' : rank.numberFormat.unit,
          percent: rank.numberFormat.percent,
          prefix: rank.numberFormat.prefix,
          suffix: '',
        },
        accent: rank.accentColor,
      },
    });
  }

  return {
    ...base,
    title: rank.blocks?.length ? base.title : '排行榜迁移',
    themeId: rank.themeId ?? 'businessBlue',
    width: 750,
    accentColor: rank.accentColor ?? '',
    exportScale: rank.exportScale ?? 2,
    dataSources: [{ id: sourceId, name: '排行榜数据', kind: 'import', fileName: '', sheetName: '' }],
    pipeline: {
      nodes: [{ id: nodeId, type: 'source', name: '排行榜数据', inputs: [], params: { sourceId }, enabled: true }],
    },
    blocks,
  };
}

/** 模板下载（纯本地 Blob） */
export function downloadCanvasTemplate(config: CanvasConfig): void {
  const tpl = serializeCanvasTemplate(config);
  const blob = new Blob([JSON.stringify(tpl, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${config.title || '日报画布'}_模板.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

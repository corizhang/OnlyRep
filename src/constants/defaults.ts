import type { RankConfig } from '../types';
import { buildClassicStructure } from './templates';

/** 浮点同值判定阈值：Math.abs(a-b) < EPSILON 视为并列（ARCH §5.4） */
export const EPSILON = 1e-9;

/** TopN 展示人数候选（R2-08） */
export const TOP_N_CANDIDATES = [5, 10, 20, 50] as const;

/** TopN 允许范围 */
export const TOP_N_MIN = 1;
export const TOP_N_MAX = 200;

/** 合计行关键词（R1-05：自动排除「合计/总计/小计」行） */
export const TOTAL_ROW_KEYWORDS = ['合计', '总计', '小计', '汇总'] as const;

/** 缺失值标记（匹配时忽略大小写与全角差异） */
export const MISSING_TOKENS: ReadonlySet<string> = new Set([
  '-',
  '—',
  '–',
  'n/a',
  'na',
  '无',
  '',
]);

/** 默认榜单配置工厂（R7-03 恢复默认的唯一真源）：v2 区块化，默认结构 = 经典通报模板 */
export function createDefaultConfig(): RankConfig {
  const structure = buildClassicStructure({
    title: '排行榜',
    subtitle: '',
    caliber: '',
    signature: '',
    variant: 'long',
    pageSize: 10,
  });
  return {
    version: 2,
    blocks: structure.blocks,
    floats: structure.floats,

    // ---- 排行规则 ----
    mode: 'direct',
    metricKey: '',
    aggMethod: 'sum',
    dimensionKey: '',
    sortDirection: 'desc',
    tieStrategy: 'competition',
    secondarySortKey: '',
    topN: 10,
    showOthers: false,
    filters: {
      minSamples: 1,
      minValue: null,
    },

    // ---- 数值格式化 ----
    numberFormat: {
      thousands: true,
      decimals: 'auto',
      unit: 'auto',
      percent: false,
      prefix: '',
    },

    // ---- 字段映射 ----
    nameKey: '',
    secondaryKeys: [],
    prevValueKey: '',

    // ---- 视觉 ----
    themeId: 'businessBlue',
    accentColor: '',
    backgroundImage: null,
    bgFill: 'cover',
    overlayOpacity: 0.6,
    overlayColor: '',
    fontSize: 'medium',
    lineHeight: 'normal',
    borderRadius: 12,
    zebra: false,
    showMedal: true,
    dimTop10Outside: true,

    // ---- 导出 ----
    exportScale: 2,
    exportFileName: '',
    exportFirstScreenOnly: false,
  };
}

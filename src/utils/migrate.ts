import type { RankConfig, RankListVariant } from '../types';
import { createDefaultConfig } from '../constants/defaults';
import { buildClassicStructure } from '../constants/templates';
import { clampNum, sanitizePosterBlocks } from './blocks';

/**
 * v1 → v2 配置迁移：旧展示字段（title/subtitle/caliberText/signature/displayMode/pageSize）
 * 翻译为「经典通报」区块结构；其余字段（排行规则/字段映射/视觉/导出）全部沿用。
 * store persist migrate 与模板 JSON 导入共用同一入口，保证行为一致。
 */

/** v1 配置中将被 blocks 取代的展示字段（结构未知，逐字段窄化读取） */
export interface RankConfigV1DisplayFields {
  title?: unknown;
  subtitle?: unknown;
  caliberText?: unknown;
  signature?: unknown;
  displayMode?: unknown;
  pageSize?: unknown;
}

function toStr(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

/** v1 展示模式 → v2 榜单变体（v1 无 table；未知值回退 long） */
export function displayModeToVariant(v: unknown): RankListVariant {
  if (v === 'twoColumn' || v === 'paged') return v;
  return 'long';
}

/** v1 配置对象 → v2 配置（blocks 用经典通报结构承载旧展示字段） */
export function migrateConfigV1toV2(raw: Record<string, unknown>): RankConfig {
  const base = createDefaultConfig();

  // 沿用 v1 中仍然存活的字段（仅遍历 v2 默认键，天然丢弃 v1 已删除的展示字段）
  const carried = { ...base } as Record<string, unknown>;
  for (const key of Object.keys(base)) {
    if (key === 'version' || key === 'blocks' || key === 'floats') continue;
    const v = raw[key];
    if (v !== undefined && v !== null) carried[key] = v;
  }
  // 嵌套对象逐字段兜底合并（容忍部分字段落缺/类型损坏）
  carried.filters = {
    ...base.filters,
    ...(typeof raw.filters === 'object' && raw.filters !== null ? raw.filters : {}),
  };
  carried.numberFormat = {
    ...base.numberFormat,
    ...(typeof raw.numberFormat === 'object' && raw.numberFormat !== null ? raw.numberFormat : {}),
  };

  const structure = buildClassicStructure({
    title: toStr(raw.title, '排行榜'),
    subtitle: toStr(raw.subtitle),
    caliber: toStr(raw.caliberText),
    signature: toStr(raw.signature),
    variant: displayModeToVariant(raw.displayMode),
    pageSize: clampNum(Number(raw.pageSize), 1, 200, 10),
  });

  return {
    ...(carried as unknown as RankConfig),
    version: 2,
    blocks: structure.blocks,
    floats: structure.floats,
  };
}

/**
 * v2 旧配置补齐（store persist rehydrate / 旧模板 JSON 共用）：
 * 早期 v2 持久化的榜单块只有 variant/pageSize，无 P0 样式字段（rowStyle/badgeShape/
 * top1Icon/progressBar/table）——经区块清洗补齐默认值，保证旧行为完全不变。
 */
export function fillV2BlockDefaults(config: RankConfig): RankConfig {
  return {
    ...config,
    version: 2,
    blocks: sanitizePosterBlocks(config.blocks),
    floats: sanitizePosterBlocks(config.floats),
  };
}

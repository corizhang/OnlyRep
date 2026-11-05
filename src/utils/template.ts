import type { ImageBlockConfig, PosterBlock, RankConfig } from '../types';
import { createDefaultConfig } from '../constants/defaults';
import { getPosterTitle, sanitizePosterBlocks, clampNum } from './blocks';
import { migrateConfigV1toV2 } from './migrate';

/**
 * 模板 JSON 导出 / 导入 / 校验 / version 迁移（R7-02）+ 导出文件名清洗（R6-02）。
 * 模板只携带配置，不含任何业务数据；背景图与图片区块 dataURL 一律不写入模板。
 * v2 起模板携带区块结构（blocks/floats）；导入 v1 模板时自动迁移为经典通报区块。
 */

export const TEMPLATE_KIND = 'rankboard-template';
export const TEMPLATE_VERSION = 2;

/** 模板文件 schema */
export interface TemplateFile {
  kind: string;
  version: number;
  exportedAt: string;
  config: RankConfig;
}

/** 剥离所有图片数据（背景图 + 图片区块 src 置 null）：模板不携带业务图片 */
function stripImageData(config: RankConfig): RankConfig {
  const mapBlocks = (arr: PosterBlock[]): PosterBlock[] =>
    arr.map((b) =>
      b.type === 'image'
        ? { ...b, config: { ...(b.config as ImageBlockConfig), src: null } }
        : b,
    );
  return { ...config, backgroundImage: null, blocks: mapBlocks(config.blocks), floats: mapBlocks(config.floats) };
}

/** 序列化当前配置为模板对象（version 2，剥离图片数据） */
export function serializeTemplate(config: RankConfig): TemplateFile {
  return {
    kind: TEMPLATE_KIND,
    version: TEMPLATE_VERSION,
    exportedAt: new Date().toISOString(),
    config: stripImageData(config),
  };
}

/** 校验并解析模板 JSON；不合法时抛 Error（文案供 UI 直接展示）。接受 v1 模板并自动迁移 */
export function validateTemplate(json: unknown): RankConfig {
  if (typeof json !== 'object' || json === null) {
    throw new Error('模板文件格式不正确');
  }
  const obj = json as Record<string, unknown>;
  if ('kind' in obj && obj.kind !== TEMPLATE_KIND) {
    throw new Error('这不是 RankBoard 模板文件');
  }
  const version = typeof obj.version === 'number' ? obj.version : 0;
  const rawCfg =
    typeof obj.config === 'object' && obj.config !== null
      ? (obj.config as Record<string, unknown>)
      : obj;
  return migrateTemplate(rawCfg, version);
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

/**
 * 版本迁移钩子：将旧版本模板配置迁移为当前 schema。
 * v0/v1 → v2：旧展示字段翻译为「经典通报」区块结构（migrateConfigV1toV2）；
 * v2 → v2：合并默认值 + 区块结构清洗（sanitizePosterBlocks）。
 */
export function migrateTemplate(raw: Record<string, unknown>, version: number): RankConfig {
  if (version < 2) {
    return migrateConfigV1toV2(raw);
  }

  const base = createDefaultConfig();
  const merged: Record<string, unknown> = {};
  for (const key of Object.keys(base)) {
    const v = raw[key];
    if (v !== undefined && v !== null) {
      merged[key] = v;
    } else {
      merged[key] = base[key as keyof RankConfig];
    }
  }

  const config = merged as unknown as RankConfig;
  config.version = 2;
  // 嵌套对象深合并（容忍部分字段落缺）
  config.filters = {
    ...base.filters,
    ...(isObject(raw.filters) ? raw.filters : {}),
  } as RankConfig['filters'];
  config.numberFormat = {
    ...base.numberFormat,
    ...(isObject(raw.numberFormat) ? raw.numberFormat : {}),
  } as RankConfig['numberFormat'];
  // 区块结构清洗：未知类型/坏字段过滤，缺失 id 重生成
  config.blocks = sanitizePosterBlocks(config.blocks);
  config.floats = sanitizePosterBlocks(config.floats);

  // 类型收敛兜底
  config.topN = clampInt(config.topN, 1, 200, 10);
  config.borderRadius = clampInt(config.borderRadius, 0, 24, 12);
  config.overlayOpacity = clampNum(config.overlayOpacity, 0, 1, 0.6);
  config.exportScale = config.exportScale === 1 || config.exportScale === 4 ? config.exportScale : 2;
  if (!Array.isArray(config.secondaryKeys)) config.secondaryKeys = [];
  // 模板不携带背景图数据（铁律：业务数据不落盘）
  config.backgroundImage = null;
  return config;
}

function clampInt(v: number, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** 导出文件名非法字符过滤（R6-02） */
export function sanitizeFileName(name: string): string {
  const cleaned = name
    .replace(/[\\/:*?"<>|\r\n\t]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned !== '' ? cleaned : '排行榜';
}

/** 默认导出文件名（不含扩展名）：「{标题}_{YYYYMMDD}」 */
export function buildExportFileName(title: string, date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${sanitizeFileName(title)}_${y}${m}${d}`;
}

/** 模板 JSON 下载（Blob + a[download]，无网络请求） */
export function downloadTemplate(config: RankConfig): void {
  const tpl = serializeTemplate(config);
  const blob = new Blob([JSON.stringify(tpl, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${sanitizeFileName(getPosterTitle(config) || 'rankboard')}_模板.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

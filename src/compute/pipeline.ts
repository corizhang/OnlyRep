import type { BoardResult, RankConfig } from '../types';
import type { CleanRow, CleanedTable } from '../parser/clean';
import { getVal, getRawText } from '../parser/clean';
import { aggregate, applyFilters } from './aggregate';
import {
  applyTopN,
  computeRanks,
  sortRankItems,
  type RankItem,
  type RankedRow,
} from './rank';

/**
 * 六阶段管线组装（过滤 → 聚合 → 排序 → 排名 → TopN/其他 → 产出）+ 指纹缓存。
 * 纯函数，禁止 import React / store；同指纹且同一 CleanedTable 引用时直接返回缓存。
 */

interface ObjEntry {
  key: string;
  name: string;
  value: number | null;
  samples: number;
}

/** 参与计算（影响指纹）的配置字段：视觉/标题/导出等字段变更不触发重算（ARCH §6） */
const FP_KEYS: (keyof RankConfig)[] = [
  'mode',
  'metricKey',
  'aggMethod',
  'dimensionKey',
  'sortDirection',
  'tieStrategy',
  'secondarySortKey',
  'topN',
  'showOthers',
  'nameKey',
  'secondaryKeys',
  'prevValueKey',
];

/** 计算输入指纹：仅序列化影响计算结果的字段 */
export function fingerprint(config: RankConfig): string {
  return [
    ...FP_KEYS.map((k) => `${k}=${String(config[k])}`),
    `minSamples=${config.filters.minSamples}`,
    `minValue=${config.filters.minValue}`,
  ].join('|');
}

// ---- 阶段缓存（模块级，同指纹直接复用） ----
let cacheFp = '';
let cacheCleaned: CleanedTable | null = null;
let cacheResult: BoardResult | null = null;

/** 运行管线（带指纹缓存） */
export function runPipeline(cleaned: CleanedTable, config: RankConfig): BoardResult {
  const fp = fingerprint(config);
  if (cacheResult !== null && cacheFp === fp && cacheCleaned === cleaned) {
    return cacheResult;
  }
  const result = computeBoard(cleaned, config);
  cacheFp = fp;
  cacheCleaned = cleaned;
  cacheResult = result;
  return result;
}

/** 清空管线缓存（CleanedTable 重建后由 store 依赖引用相等自然失效；保留钩子供测试） */
export function clearPipelineCache(): void {
  cacheFp = '';
  cacheCleaned = null;
  cacheResult = null;
}

function computeBoard(cleaned: CleanedTable, config: RankConfig): BoardResult {
  const warnings: string[] = [];
  if (!config.metricKey) {
    return { rows: [], excludedCount: 0, totalCount: 0, warnings };
  }

  const grouped = config.mode === 'grouped' && config.dimensionKey !== '';
  // R3-04：nameKey 未指定（''）时回退第一个文本列，避免取值恒为空导致全部行名「(空)」
  const effNameKey =
    config.nameKey || cleaned.columns.find((c) => c.type === 'text')?.key || '';
  const groupKey = grouped ? config.dimensionKey : effNameKey;

  // ① 汇总为对象条目（直接排序：一行一对象、同名不合并，E5；分组聚合：按维度列）
  let entries: ObjEntry[];
  if (grouped) {
    entries = [...aggregate(cleaned.rows, groupKey, config.metricKey, config.aggMethod).values()].map(
      (e) => ({ key: e.key, name: e.key, value: e.value, samples: e.samples }),
    );
  } else {
    entries = cleaned.rows.map((r) => {
      const v = getVal(r, config.metricKey);
      return {
        key: `#${r.__idx}`,
        name: String(getVal(r, effNameKey) ?? '(空)'),
        value: typeof v === 'number' ? v : null,
        samples: 1,
      };
    });
  }
  const totalCount = entries.length;

  // E5 同名提醒（直接排序模式，数据未被合并）
  if (!grouped && effNameKey) {
    const nameCount = new Map<string, number>();
    for (const e of entries) nameCount.set(e.name, (nameCount.get(e.name) ?? 0) + 1);
    let dupCount = 0;
    nameCount.forEach((n) => {
      if (n > 1) dupCount += n;
    });
    if (dupCount > 0) {
      warnings.push(`发现 ${dupCount} 个同名条目，如为不同人请增加区分字段`);
    }
  }

  // ② 过滤（minSamples 仅分组模式语义；minValue 两种模式通用）
  const { kept, excluded: filteredOut } = applyFilters(entries, config, {
    applyMinSamples: grouped,
  });

  // ③ 策略③次要列 / 上期列（环比）数值
  const needSecondary = config.tieStrategy === 'secondary' && config.secondarySortKey !== '';
  const secVals = needSecondary ? numericFor(cleaned, config, grouped, groupKey, config.secondarySortKey) : null;
  const prevVals = config.prevValueKey
    ? numericFor(cleaned, config, grouped, groupKey, config.prevValueKey)
    : null;

  // 次要字段文本（0~2 项）
  const secText = secondaryTextMap(cleaned, config, grouped, groupKey);

  // ④ 排序 + ⑤ 排名
  const items: RankItem[] = kept.map((e) => {
    const sv = secVals?.get(e.key);
    return {
      key: e.key,
      value: e.value ?? 0,
      secondaryValue: typeof sv === 'number' ? sv : undefined,
    };
  });
  const sorted = sortRankItems(items, config.sortDirection, config.tieStrategy, config.sortDirection);
  const ranks = computeRanks(items, config.sortDirection, config.tieStrategy, config.sortDirection);
  const entryByKey = new Map(kept.map((e) => [e.key, e]));

  const ranked: RankedRow[] = sorted.map((it, i) => {
    const e = entryByKey.get(it.key);
    const rawValue = e?.value ?? it.value;
    const pv = prevVals?.get(it.key);
    return {
      key: it.key,
      name: e?.name ?? it.key,
      rank: ranks[i].rank,
      displayRank: ranks[i].displayRank,
      rawValue,
      sampleCount: e?.samples ?? 1,
      delta:
        prevVals && typeof pv === 'number' && typeof rawValue === 'number'
          ? rawValue - pv
          : null,
      secondary: secText.get(it.key) ?? [],
    };
  });

  // ⑥ TopN 截断 +「其他」合并
  const topN = Math.max(1, Math.round(config.topN));
  const { rows, othersCount } = applyTopN(ranked, topN, config.showOthers);
  const excludedCount = filteredOut + othersCount;

  // E3：有效分组少于展示人数
  if (kept.length > 0 && kept.length < topN) {
    warnings.push(`有效分组仅 ${kept.length} 个，已按 ${kept.length} 项展示`);
  }
  // E4：指标列全为 0
  if (kept.length > 0 && kept.every((e) => e.value === 0)) {
    warnings.push('该列数值均为 0，请确认是否选错指标列');
  }

  return { rows, excludedCount, totalCount, warnings };
}

/** 取某列的数值 Map（分组：按同法聚合；直接：逐行取值），供次要列/上期列使用 */
function numericFor(
  cleaned: CleanedTable,
  config: RankConfig,
  grouped: boolean,
  groupKey: string,
  key: string,
): Map<string, number | null> {
  const out = new Map<string, number | null>();
  if (grouped) {
    const m = aggregate(cleaned.rows, groupKey, key, config.aggMethod);
    m.forEach((v, k) => out.set(k, v.value));
    return out;
  }
  for (const r of cleaned.rows) {
    const v = getVal(r, key);
    out.set(`#${r.__idx}`, typeof v === 'number' ? v : null);
  }
  return out;
}

/** 次要字段展示文本：直接模式取本行；分组模式取组内首个非空原始文本 */
function secondaryTextMap(
  cleaned: CleanedTable,
  config: RankConfig,
  grouped: boolean,
  groupKey: string,
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  const keys = config.secondaryKeys;
  if (keys.length === 0) return map;

  if (grouped) {
    for (const r of cleaned.rows) {
      const g = String(getVal(r, groupKey) ?? '(空)');
      let arr = map.get(g);
      if (!arr) {
        arr = keys.map(() => '');
        map.set(g, arr);
      }
      keys.forEach((k, i) => {
        if (!arr![i]) {
          const t = displayText(r, k);
          if (t !== '') arr![i] = t;
        }
      });
    }
  } else {
    for (const r of cleaned.rows) {
      map.set(`#${r.__idx}`, keys.map((k) => displayText(r, k)));
    }
  }
  return map;
}

function displayText(row: CleanRow, key: string): string {
  const raw = getRawText(row, key);
  if (raw !== '') return raw;
  const v = getVal(row, key);
  return v === null ? '' : String(v);
}
